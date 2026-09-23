import { test } from '@playwright/test';
import { account, apiGet, recorder, signIn, writeReport, type Account, type ScreenReport } from './live';

/**
 * Every screen of the portal against the real instance, once per account: what each screen
 * complained about (console errors, API errors, error alerts), plus a full-page screenshot.
 * Read-only: it opens screens and never presses an action button.
 */
test.skip(!process.env.IRIS_URL, 'IRIS_URL is not set: the live run is opt-in');

const LIST_ROUTES = [
  '/',
  '/jobs',
  '/activity',
  '/monitor',
  '/logs',
  '/databases',
  '/namespaces',
  '/processes',
  '/locks',
  '/journal',
  '/tasks',
  '/web-sessions',
  '/license',
  '/security/users',
  '/security/roles',
  '/security/resources',
  '/security/services',
  '/security/web-apps',
  '/security/audit',
  '/security/ssl',
  '/security/sql',
  '/explorer',
  '/settings/connections',
  '/about',
];

/** Detail screens, with identifiers taken from the instance's own lists (read as the administrator). */
async function detailRoutes(admin: Account): Promise<string[]> {
  const first = async <T>(path: string, pick: (rows: T[]) => T | undefined) => {
    const r = await apiGet<T[]>(admin, path).catch(() => null);
    return Array.isArray(r?.result) ? pick(r.result) : undefined;
  };
  const dir = await first<{ Directory: string }>('/v2/database-dirs', (rows) =>
    rows.find((d) => /\/user\/?$/i.test(d.Directory)),
  );
  const proc = await first<{ Pid: number }>('/v2/processes', (rows) => rows[0]);
  const task = await first<{ Id: number | string }>('/v2/tasks', (rows) => rows[0]);
  const e = encodeURIComponent;
  return [
    dir && `/databases/detail?dir=${e(dir.Directory)}&name=USER`,
    '/namespaces/USER',
    proc && `/processes/${proc.Pid}`,
    task && `/tasks/${task.Id}`,
    `/security/users/${e(admin.user)}`,
    `/security/roles/${e('%Manager')}`,
    `/security/web-apps/detail?name=${e('/api/admin')}`,
    '/explorer/Databases',
  ].filter((r): r is string => !!r);
}

const admin = account('admin');
for (const acct of [admin, account('op')]) {
  test(`every screen as ${acct?.label ?? 'missing account'}`, async ({ page }, testInfo) => {
    test.skip(!acct || !admin, 'account not configured');
    test.setTimeout(15 * 60_000);
    const rec = recorder(page);
    await signIn(page, acct!);
    const routes = [...LIST_ROUTES, ...(await detailRoutes(admin!))];
    const reports: ScreenReport[] = [];
    for (const route of routes) {
      rec.reset();
      await page.goto(route);
      // Screens poll; give the first round of requests (and async tasks) time to settle.
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(4_000);
      const slug = route.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'dashboard';
      reports.push(await rec.capture(route, testInfo.outputPath(`${acct!.label}`, `${slug}.png`)));
    }
    const file = writeReport(testInfo, `walk-${acct!.label}`, reports);
    const noisy = reports.filter((r) => r.consoleErrors.length || r.failedRequests.length || r.alerts.length);
    console.log(`${acct!.label}: ${reports.length} screens, ${noisy.length} with findings → ${file}`);
    for (const r of noisy)
      console.log(
        `  ${r.route}: ${[...r.failedRequests, ...r.consoleErrors.map((c) => `console: ${c}`), ...r.alerts.map((a) => `alert: ${a}`)].join(' | ').slice(0, 600)}`,
      );
  });
}
