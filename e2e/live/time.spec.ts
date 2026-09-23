import { expect, test, type Page } from '@playwright/test';
import { account, apiGet, signIn, writeReport, type Account } from './live';

/**
 * Instance-local timestamps read by a browser in another zone. IRIS writes its wall clock with
 * no zone designator; a browser in the same zone as the instance reads it correctly by accident,
 * so this runs the browser in America/New_York (playwright.live.config.ts) and compares the
 * instant each <time dateTime> claims with the instant the instance meant.
 * Read-only apart from the connection profile, which lives in this browser's localStorage.
 */
test.skip(!process.env.IRIS_URL, 'IRIS_URL is not set: the live run is opt-in');

/**
 * The instance's UTC offset right now, in minutes: `LastUpdate` of /v2/monitor/system-usage is
 * the instance's wall clock at (almost) this moment. Real offsets are whole quarter hours.
 */
async function instanceOffset(acct: Account): Promise<number> {
  const r = await apiGet<{ LastUpdate?: string }>(acct, '/v2/monitor/system-usage');
  const wall = Date.parse(`${r.result.LastUpdate!.replace(' ', 'T')}Z`);
  return Math.round((wall - Date.now()) / 900_000) * 15;
}

interface Reading {
  page: string;
  text: string;
  claimedUtc: string;
  errorMinutes: number | null;
}

/** Every <time> on the page: its text, the instant it claims, and how far that is from the truth. */
async function readings(page: Page, route: string, offsetMin: number): Promise<Reading[]> {
  await page.goto(route);
  await page.waitForTimeout(3_000);
  const times = await page
    .locator('time[datetime]')
    .evaluateAll((els) =>
      els.map((e) => ({ text: (e.textContent ?? '').trim(), claimed: e.getAttribute('datetime') ?? '' })),
    );
  return times.map(({ text, claimed }) => {
    // Absolute readings are the instance's wall clock verbatim: the true instant is that wall
    // clock minus the instance's offset. Relative readings ("5 minutes ago") cannot be checked
    // from their text and are reported as they are.
    const wall = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
      ? Date.parse(`${text.replace(' ', 'T')}Z`)
      : NaN;
    const truth = wall - offsetMin * 60_000;
    return {
      page: route,
      text,
      claimedUtc: claimed,
      errorMinutes: Number.isFinite(truth) ? Math.round((Date.parse(claimed) - truth) / 60_000) : null,
    };
  });
}

const ROUTES = ['/tasks', '/logs', '/'];

test('timestamps in a browser five hours from the instance', async ({ page }, testInfo) => {
  const admin = account('admin');
  test.skip(!admin, 'administrator account not configured');
  const offset = await instanceOffset(admin!);
  const browserOffset = await page.evaluate(() => -new Date().getTimezoneOffset());
  await signIn(page, admin!);

  const before: Reading[] = [];
  for (const r of ROUTES) before.push(...(await readings(page, r, offset)));
  await page.goto('/tasks');
  await page.screenshot({ path: testInfo.outputPath('tasks-no-zone.png'), fullPage: true });

  // Name the instance's zone on the connection this session uses, as an operator would.
  const zone = process.env.LIVE_INSTANCE_TZ ?? 'Europe/London';
  await page.goto('/settings/connections');
  await page
    .getByRole('row', { name: /This server/ })
    .getByRole('button', { name: 'Edit' })
    .click();
  const tz = page.getByRole('textbox', { name: 'Instance time zone' });
  await tz.fill(zone);
  await page.getByRole('option', { name: zone, exact: true }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  const after: Reading[] = [];
  for (const r of ROUTES) after.push(...(await readings(page, r, offset)));
  await page.goto('/tasks');
  await page.screenshot({ path: testInfo.outputPath('tasks-zone-named.png'), fullPage: true });

  const file = writeReport(testInfo, 'time-readings', {
    instanceOffset: offset,
    browserOffset,
    zone,
    before,
    after,
  });
  const worst = (rs: Reading[]) => Math.max(0, ...rs.map((r) => Math.abs(r.errorMinutes ?? 0)));
  console.log(
    `instance UTC${offset >= 0 ? '+' : ''}${offset / 60}, browser UTC${browserOffset / 60}: worst error without a zone ${worst(before)} min, with ${zone} ${worst(after)} min → ${file}`,
  );
  for (const r of before.filter((x) => x.errorMinutes === null).slice(0, 8))
    console.log(`  relative, no zone: ${r.page} “${r.text}”`);
  for (const r of after.filter((x) => x.errorMinutes === null).slice(0, 8))
    console.log(`  relative, ${zone}: ${r.page} “${r.text}”`);
  expect(
    worst(after),
    'with the zone named, every absolute timestamp is the instant the instance meant',
  ).toBe(0);
});
