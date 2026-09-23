import { expect, test } from '@playwright/test';
import { account, signIn, writeReport } from './live';

/**
 * What the header says while the instance is down and after it comes back, seen through the
 * nginx portal (docker/Dockerfile), where a stopped IRIS turns into 502 Bad Gateway:
 *
 *   docker run --rm -p 127.0.0.1:8080:80 -e IRIS_UPSTREAM=http://iris.lan:52773 aperture-portal
 *   LIVE_PORTAL_URL=http://localhost:8080 npx playwright test -c playwright.live.config.ts outage
 *
 * The test signs in, then waits (LIVE_OUTAGE_WAIT_MIN, default 20) for someone to stop the
 * instance and start it again, and records the pill, the API statuses and the URL every 2 s.
 * It stops nothing itself.
 */
const PORTAL = process.env.LIVE_PORTAL_URL;
test.skip(!PORTAL, 'LIVE_PORTAL_URL is not set: point it at a running nginx portal');
test.use({ baseURL: PORTAL });

interface Tick {
  at: string;
  pill: string;
  url: string;
  statuses: Record<string, number>;
}

test('the header says OFFLINE while the gateway answers for a stopped instance', async ({
  page,
}, testInfo) => {
  const admin = account('admin');
  test.skip(!admin, 'administrator account not configured');
  const waitMin = Number(process.env.LIVE_OUTAGE_WAIT_MIN ?? 20);
  test.setTimeout((waitMin + 5) * 60_000);

  let window: Record<string, number> = {};
  page.on('response', (r) => {
    if (!r.url().includes('/api/')) return;
    const key = String(r.status());
    window[key] = (window[key] ?? 0) + 1;
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('/api/')) window.network = (window.network ?? 0) + 1;
  });

  await signIn(page, admin!);
  await expect(page.getByRole('banner').getByLabel('Instance reachable')).toBeVisible();

  const pill = async () =>
    (await page.getByRole('banner').getByLabel('Instance unreachable').count())
      ? 'OFFLINE'
      : (await page.getByRole('banner').getByLabel('Instance reachable').count())
        ? 'LIVE'
        : 'none';
  const ticks: Tick[] = [];
  let sawOffline = false;
  let liveSince: number | null = null;
  const deadline = Date.now() + waitMin * 60_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    const state = await pill();
    const url = new URL(page.url()).pathname;
    ticks.push({ at: new Date().toISOString(), pill: state, url, statuses: window });
    window = {};
    if (state === 'OFFLINE' && !sawOffline) {
      sawOffline = true;
      await page.screenshot({ path: testInfo.outputPath('offline.png'), fullPage: true });
      console.log(`OFFLINE at ${ticks.at(-1)!.at} (${JSON.stringify(ticks.at(-1)!.statuses)})`);
    }
    if (url.startsWith('/login')) {
      console.log(`signed out at ${ticks.at(-1)!.at}`);
      await page.screenshot({ path: testInfo.outputPath('signed-out.png'), fullPage: true });
      break;
    }
    if (sawOffline && state === 'LIVE') {
      liveSince ??= Date.now();
      if (Date.now() - liveSince > 60_000) break;
    } else liveSince = null;
  }
  await page.screenshot({ path: testInfo.outputPath('after.png'), fullPage: true });

  // Collapse the timeline into runs of the same state for the report.
  const runs: { from: string; to: string; pill: string; url: string; statuses: Record<string, number> }[] =
    [];
  for (const t of ticks) {
    const last = runs.at(-1);
    if (last && last.pill === t.pill && last.url === t.url) {
      last.to = t.at;
      for (const [k, v] of Object.entries(t.statuses)) last.statuses[k] = (last.statuses[k] ?? 0) + v;
    } else runs.push({ from: t.at, to: t.at, pill: t.pill, url: t.url, statuses: { ...t.statuses } });
  }
  const file = writeReport(testInfo, 'outage', { sawOffline, runs });
  for (const r of runs)
    console.log(`${r.from} → ${r.to}  ${r.pill.padEnd(7)} ${r.url}  ${JSON.stringify(r.statuses)}`);
  console.log(`→ ${file}`);
  expect(sawOffline, 'the pill turned OFFLINE during the outage').toBe(true);
});
