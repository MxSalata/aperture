// Visual smoke test of the demo build: walks the main screens in headless Chromium,
// captures screenshots to docs/screenshots and reports console errors.
// Usage: npm run build:demo && node scripts/smoke-demo.mjs
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const PORT = 4174;
const BASE = `http://localhost:${PORT}`;
// The demo build uses hash routing (see .env.demo).
const url = (path) => `${BASE}/#${path}`;
const SHOTS = process.env.SHOTS ?? 'docs/screenshots';
// vite itself rather than `npx vite`: killing the npx wrapper leaves the server holding the port.
const preview = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--outDir',
    'dist-demo',
    '--port',
    String(PORT),
    '--strictPort',
  ],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
);
preview.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));
await new Promise((r) => setTimeout(r, 2500));

// Playwright's bundled browser is used when installed; otherwise fall back to a system Chromium
// (CHROMIUM_PATH, or the Playwright-managed /opt/pw-browsers/chromium symlink).
const fallback =
  process.env.CHROMIUM_PATH ??
  (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
let browser;
try {
  browser = await chromium.launch();
} catch (e) {
  if (!fallback) throw e;
  console.log('bundled browser unavailable, using', fallback);
  browser = await chromium.launch({ executablePath: fallback });
}
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
const failed = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message.slice(0, 300)}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().includes('/login'))
    failed.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '')}`);
});

const shot = async (name) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};
let failedSteps = 0;
const step = async (label, fn) => {
  try {
    await fn();
    console.log(`✔ ${label}`);
  } catch (e) {
    failedSteps++;
    console.log(`✘ ${label}: ${e.message.split('\n')[0]}`);
    await shot(`fail-${label.replace(/\W+/g, '_')}`);
  }
};

await step('login page renders', async () => {
  await page.goto(url(`/login`));
  await page.getByRole('button', { name: /Try the demo/ }).waitFor({ timeout: 15000 });
  await shot('01-login');
});
await step('demo login → dashboard', async () => {
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(7500);
  await shot('02-dashboard');
});
await step('dashboard has chart', async () => {
  await page.locator('svg.recharts-surface, .mantine-LineChart-root svg').first().waitFor({ timeout: 10000 });
});
await step('databases list', async () => {
  await page.goto(url(`/databases`));
  await page.getByRole('cell', { name: 'IRISSYS' }).first().waitFor({ timeout: 15000 });
  await shot('03-databases');
});
await step('database detail + async metrics', async () => {
  await page.getByRole('cell', { name: 'USER' }).first().click();
  await page.getByText('Space').first().waitFor({ timeout: 15000 });
  await page.getByText('File size').waitFor({ timeout: 15000 });
  await shot('04-database-detail');
});
await step('start integrity check → job center', async () => {
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Integrity check' }).click();
  await page.getByText('Job Center').first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(3000);
  await shot('05-job-center');
  await page.keyboard.press('Escape');
});
await step('processes', async () => {
  await page.goto(url(`/processes`));
  await page.getByRole('cell', { name: 'jdoe' }).first().waitFor({ timeout: 15000 });
  await shot('06-processes');
});
await step('process detail', async () => {
  await page.getByRole('cell', { name: 'jdoe' }).first().click();
  await page.getByText('Identity').waitFor({ timeout: 15000 });
});
await step('namespaces + detail', async () => {
  await page.goto(url(`/namespaces`));
  await page.getByRole('cell', { name: 'INTEROP' }).first().click();
  await page.getByRole('tab', { name: 'Package mappings' }).click();
  await page.getByRole('cell', { name: 'EnsLib' }).first().waitFor({ timeout: 15000 });
  await shot('07-namespace');
});
await step('users', async () => {
  await page.goto(url(`/security/users`));
  await page.getByRole('cell', { name: 'jdoe' }).first().waitFor({ timeout: 15000 });
  await shot('08-users');
});
await step('web apps', async () => {
  await page.goto(url(`/security/web-apps`));
  await page.getByRole('cell', { name: '/api/admin' }).first().waitFor({ timeout: 15000 });
});
await step('audit log query (async)', async () => {
  await page.goto(url(`/security/audit`));
  await page.getByRole('button', { name: /Query audit log/ }).click();
  await page
    .getByRole('cell', { name: /Login|Protect|DDL/ })
    .first()
    .waitFor({ timeout: 20000 });
  await shot('09-audit');
});
await step('certificates', async () => {
  await page.goto(url(`/security/ssl`));
  await page.getByRole('tab', { name: 'X.509 credentials' }).click();
  await page.getByRole('cell', { name: 'MirrorMemberCert' }).first().waitFor({ timeout: 15000 });
  await page.getByText(/expired 40 days ago/).waitFor({ timeout: 15000 });
  await shot('20-certificates');
});
await step('logs hub', async () => {
  await page.goto(url(`/logs`));
  await page.getByText('Records written').waitFor({ timeout: 15000 });
  await page.getByText('Runs, last 24 h').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot('21-logs');
});
await step('tasks', async () => {
  await page.goto(url(`/tasks`));
  await page.getByRole('cell', { name: 'Purge Journal Files' }).first().waitFor({ timeout: 15000 });
});
await step('journal', async () => {
  await page.goto(url(`/journal`));
  await page.locator('tbody tr').first().waitFor({ timeout: 15000 });
  await shot('10-journal');
});
await step('host monitor', async () => {
  await page.goto(url(`/monitor`));
  await page.getByText('CPU usage').waitFor({ timeout: 15000 });
  await page.getByRole('cell', { name: 'iris_cpu_usage' }).first().waitFor({ timeout: 15000 });
  await shot('16-monitor');
});
await step('change review dialog', async () => {
  await page.goto(url(`/security/users/jdoe`));
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Comment').fill('Reviewed before applying');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText(/still matches/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot('17-review');
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await page.getByText('User jdoe updated').waitFor({ timeout: 15000 });
});
await step('activity log', async () => {
  await page.goto(url(`/activity`));
  await page
    .getByRole('cell', { name: /security\/user/ })
    .first()
    .waitFor({ timeout: 15000 });
  await shot('18-activity');
  await page.getByRole('button', { name: 'Find audit record' }).first().click();
  await page.getByText('Recorded by IRIS').waitFor({ timeout: 20000 });
  await page.waitForTimeout(400);
  await shot('22-audit-evidence');
  await page.keyboard.press('Escape');
});
await step('who loses what', async () => {
  await page.goto(url(`/security/users/jdoe`));
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.locator('.mantine-Pill-root', { hasText: '%Developer' }).locator('.mantine-Pill-remove').click();
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Who loses what').waitFor({ timeout: 15000 });
  await page.waitForTimeout(600);
  await shot('24-who-loses-what');
  // Close the review, then the edit form (Escape closes the top modal).
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
});
await step('REST services and their routes', async () => {
  await page.goto(url(`/rest-services`));
  // The demo signs in with a JWT, which /api/mgmnt does not take: it asks for the password.
  await page.getByLabel(/Password for/).fill('SYS');
  await page.getByRole('button', { name: 'Read REST services' }).click();
  await page.getByRole('button', { name: 'Routes of /api/admin' }).click();
  await page.getByRole('dialog').getByText('/api/admin/v2/async-results').first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  await shot('23-rest-services');
  await page.keyboard.press('Escape');
});
await step('wallet collections and secrets', async () => {
  await page.goto(url(`/security/secrets`));
  await page.getByRole('cell', { name: 'HL7Interfaces' }).first().waitFor({ timeout: 15000 });
  await page
    .getByRole('row', { name: /HL7Interfaces/ })
    .getByRole('button', { name: 'Open' })
    .click();
  await page.getByRole('dialog').getByRole('cell', { name: 'lab-sftp' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('26-wallet');
  await page.keyboard.press('Escape');
});
await step('OAuth 2.0 roles', async () => {
  await page.goto(url(`/security/secrets?tab=oauth`));
  await page.getByRole('cell', { name: 'aperture-portal' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('27-oauth');
});
await step('devices', async () => {
  await page.goto(url(`/devices`));
  await page.getByRole('cell', { name: '|PRN|' }).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('28-devices');
});
await step('messages log through the reader', async () => {
  await page.goto(url(`/logs/messages`));
  const gate = page.getByLabel(/Password for/);
  if (await gate.isVisible().catch(() => false)) {
    await gate.fill('SYS');
    await page.getByRole('button', { name: 'Read the logs' }).click();
  }
  await page.getByText(/entries from the last/).waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Older lines' }).click();
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await shot('29-messages-log');
});
await step('read-only tab', async () => {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Make this tab read-only' }).click();
  await page.goto(url(`/locks`));
  await page.getByRole('button', { name: 'Remove lock' }).and(page.locator(':enabled')).first().click();
  await page.getByText('This tab is read-only').waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
  await shot('25-read-only');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Allow changes in this tab' }).click();
});
await step('explorer executes GET', async () => {
  await page.goto(
    url(
      `/explorer/${encodeURIComponent('/v2/wallet')}?op=${encodeURIComponent('GET /v2/wallet/collections')}`,
    ),
  );
  await page.getByRole('button', { name: 'Execute' }).click();
  await page.getByText('HTTP 200').waitFor({ timeout: 15000 });
  await shot('11-explorer');
});
await step('command palette', async () => {
  await page.keyboard.press('Control+K');
  await page.getByPlaceholder(/Jump to a screen/).fill('locks');
  await page.waitForTimeout(500);
  await shot('12-palette');
  await page.keyboard.press('Escape');
});
await step('dark mode', async () => {
  await page.goto(url(`/`));
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('menuitem', { name: /^Dark/ }).click();
  await page.waitForTimeout(800);
  await shot('13-dark');
});
await step('high contrast', async () => {
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('menuitem', { name: /^High/ }).click();
  await page.waitForTimeout(600);
  await shot('19-high-contrast');
  await page.getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('menuitem', { name: /^Normal/ }).click();
  await page.waitForTimeout(300);
});
await step('operator (limited privileges) login', async () => {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.getByRole('button', { name: /Sign in/ }).waitFor({ timeout: 10000 });
  await page.getByLabel('Username').fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('SYS');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await shot('14-operator');
  const hasUsers = await page.getByRole('link', { name: 'Users' }).count();
  if (hasUsers) throw new Error('Users nav visible for operator');
});
await step('mobile layout', async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  // The operator is signed in here, and databases need %Admin_Manage on IRIS 2026.2.
  await page.goto(url(`/processes`));
  await page.waitForTimeout(1200);
  await shot('15-mobile');
});

console.log('\nconsole errors:', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  -', e));
console.log('failed requests:', failed.length);
failed.slice(0, 15).forEach((e) => console.log('  -', e));
await browser.close();
preview.kill();
process.exit(failedSteps || errors.length ? 1 : 0);
