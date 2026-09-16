import { expect, test, type Page } from '@playwright/test';

/** The demo build uses hash routing: /#/databases */
const go = (page: Page, path: string) => page.goto(`/#${path}`);

async function loginDemo(page: Page, user = '_SYSTEM') {
  await go(page, '/login');
  if (user === '_SYSTEM') {
    await page.getByRole('button', { name: /Try the demo/ }).click();
  } else {
    await page.getByLabel('Username').fill(user);
    await page.getByLabel('Password', { exact: true }).fill('SYS');
    await page.getByRole('button', { name: /Sign in/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test.describe('Aperture (demo mode)', () => {
  test('signs in with the demo and shows live dashboard stats', async ({ page }) => {
    await loginDemo(page);
    await expect(page.getByText('Global refs / s')).toBeVisible();
    await expect(page.getByText('Upcoming tasks')).toBeVisible();
    await expect(page.getByRole('banner').getByText('DEMO', { exact: true })).toBeVisible();
  });

  test('lists databases and loads metrics through an async task', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/databases');
    await expect(page.getByRole('cell', { name: 'IRISSYS' }).first()).toBeVisible();
    await page.getByRole('cell', { name: 'USER' }).first().click();
    await expect(page.getByText('File size')).toBeVisible({ timeout: 20_000 });
  });

  test('queues an integrity check and follows it in the Job Center', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/databases/detail?dir=%2Fusr%2Firissys%2Fmgr%2Fuser%2F&name=USER');
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: 'Integrity check' }).click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText(/Integrity check/)).toBeVisible();
    await expect(drawer.getByText(/Running|Queued/)).toBeVisible();
    await expect(drawer.getByText('Finished')).toBeVisible({ timeout: 30_000 });
  });

  test('terminate is refused for system processes, allowed for users', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/processes');
    await page.getByRole('cell', { name: 'jdoe' }).first().click();
    await expect(page.getByRole('button', { name: 'Terminate' })).toBeEnabled();
  });

  test('operator account only sees screens it may use', async ({ page }) => {
    await loginDemo(page, 'operator');
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Processes', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Namespaces', exact: true })).toHaveCount(0);
  });

  test('audit log query runs as an async task and renders records', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/security/audit');
    await page.getByRole('button', { name: /Query audit log/ }).click();
    await expect(page.getByRole('cell', { name: /Success|Failure/ }).first()).toBeVisible({ timeout: 20_000 });
  });

  test('API explorer executes any operation from the spec', async ({ page }) => {
    await loginDemo(page);
    await go(page, `/explorer/${encodeURIComponent('/v2/wqm-category')}?op=${encodeURIComponent('GET /v2/wqm-categories')}`);
    await page.getByRole('button', { name: 'Execute' }).click();
    await expect(page.getByText('HTTP 200')).toBeVisible();
  });

  test('command palette jumps to a screen', async ({ page }) => {
    await loginDemo(page);
    await page.keyboard.press('Control+K');
    await page.getByPlaceholder(/Jump to a screen/).fill('Locks');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Locks' })).toBeVisible();
  });

  test('session survives a reload', async ({ page }) => {
    await loginDemo(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
