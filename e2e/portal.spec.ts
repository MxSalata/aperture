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

  test('an account without %Admin_Operate lands on a screen it can use', async ({ page }) => {
    await go(page, '/login');
    await page.getByLabel('Username').fill('auditor');
    await page.getByLabel('Password', { exact: true }).fill('SYS');
    await page.getByRole('button', { name: /Sign in/ }).click();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(
      page.getByRole('navigation').getByRole('link', { name: 'Dashboard', exact: true }),
    ).toHaveCount(0);
  });

  test('audit log query runs as an async task and renders records', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/security/audit');
    await page.getByRole('button', { name: /Query audit log/ }).click();
    await expect(page.getByRole('cell', { name: /Success|Failure/ }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('API explorer executes any operation from the spec', async ({ page }) => {
    await loginDemo(page);
    await go(
      page,
      `/explorer/${encodeURIComponent('/v2/wqm-category')}?op=${encodeURIComponent('GET /v2/wqm-categories')}`,
    );
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

  test('edits are reviewed field by field before they are applied', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/security/users/jdoe');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Comment').fill('Reviewed by Playwright');
    await page.getByRole('button', { name: 'Save' }).click();
    const review = page.getByRole('dialog', { name: /Review changes/ });
    await expect(review.getByText('Reviewed by Playwright')).toBeVisible();
    await expect(review.getByText(/still matches/)).toBeVisible();
    await review.getByRole('button', { name: 'Apply changes' }).click();
    await expect(page.getByText('User jdoe updated')).toBeVisible();
    await go(page, '/activity');
    await expect(page.getByRole('cell', { name: /\/v2\/security\/user/ }).first()).toBeVisible();
  });

  test('a security change can be matched to the audit record that proves it', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/security/users/jdoe');
    await page.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Comment').fill('Audited by Playwright');
    await page.getByRole('button', { name: 'Save' }).click();
    await page
      .getByRole('dialog', { name: /Review changes/ })
      .getByRole('button', { name: 'Apply changes' })
      .click();
    await expect(page.getByText('User jdoe updated')).toBeVisible();
    await go(page, '/activity');
    await page.getByRole('button', { name: 'Find audit record' }).first().click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByText('Recorded by IRIS')).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText(/UserChange/).first()).toBeVisible();
  });

  test('certificates tab reads each X.509 credential and flags expiry', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/security/ssl');
    await page.getByRole('tab', { name: 'X.509 credentials' }).click();
    await expect(page.getByRole('cell', { name: 'MirrorMemberCert' })).toBeVisible();
    await expect(page.getByText(/1 expired/)).toBeVisible();
    await expect(page.getByText(/expiring within 30 days/)).toBeVisible();
    await expect(page.getByText(/expired 40 days ago/)).toBeVisible();
  });

  test('logs hub lists every log source with counts', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/logs');
    await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByText('Records written')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Journal' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'alerts.log' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Task history' })).toBeVisible();
    await expect(page.getByText('Not reachable through the API')).toBeVisible();
  });

  test('secrets are redacted in raw JSON panels', async ({ page }) => {
    await loginDemo(page);
    await go(
      page,
      `/explorer/${encodeURIComponent('/v2/security/oauth2/server/client')}?op=${encodeURIComponent('GET /v2/security/oauth2/server/clients')}`,
    );
    await page.getByRole('button', { name: 'Execute' }).click();
    await expect(page.getByText('HTTP 200')).toBeVisible();
    await page.getByRole('tab', { name: 'JSON' }).click();
    await expect(page.getByText(/\d+ hidden/).first()).toBeVisible();
  });

  test('host monitor reads native metrics and the header shows LIVE', async ({ page }) => {
    await loginDemo(page);
    await expect(page.getByRole('banner').getByText('DEMO', { exact: true })).toBeVisible();
    await go(page, '/monitor');
    await expect(page.getByText('CPU usage')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'iris_cpu_usage' }).first()).toBeVisible();
  });

  test('session survives a reload', async ({ page }) => {
    await loginDemo(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('a read-only tab shows it, and a change cannot be confirmed', async ({ page }) => {
    await loginDemo(page);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Make this tab read-only' }).click();
    await expect(page.getByRole('banner').getByLabel('Read-only tab')).toBeVisible();
    await go(page, '/locks');
    await page.getByRole('button', { name: 'Remove lock' }).and(page.locator(':enabled')).first().click();
    await expect(page.getByText('This tab is read-only')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeDisabled();
    // A reload of the tab keeps it.
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByRole('banner').getByLabel('Read-only tab')).toBeVisible();
  });

  test('REST services lists the applications and the routes of each', async ({ page }) => {
    await loginDemo(page);
    await go(page, '/rest-services');
    // The demo signs in with a JWT, which /api/mgmnt does not take: it asks for the password.
    await page.getByLabel(/Password for/).fill('SYS');
    await page.getByRole('button', { name: 'Read REST services' }).click();
    await page.getByRole('button', { name: 'Routes of /api/atelier' }).click();
    await expect(
      page.getByRole('dialog').getByText('/api/atelier/v1/{namespace}/doc/{docname}').first(),
    ).toBeVisible();
  });
});
