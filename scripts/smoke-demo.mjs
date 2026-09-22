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
const preview = spawn(
  'npx',
  ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORT), '--strictPort'],
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
const step = async (label, fn) => {
  try {
    await fn();
    console.log(`✔ ${label}`);
  } catch (e) {
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
  await page.goto(url(`/databases`));
  await page.waitForTimeout(1200);
  await shot('15-mobile');
});

console.log('\nconsole errors:', errors.length);
errors.slice(0, 15).forEach((e) => console.log('  -', e));
console.log('failed requests:', failed.length);
failed.slice(0, 15).forEach((e) => console.log('  -', e));
await browser.close();
preview.kill();
process.exit(0);
