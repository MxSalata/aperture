import { expect, test } from '@playwright/test';
import { account, signIn, writeReport } from './live';

/**
 * Row limits as the screens meet them. A list that stops at its row limit must say so (the
 * "server limit reached" badge of DataTable), otherwise the operator reads a partial answer as
 * the whole. Read-only: the audit query and the journal read are queued tasks that change nothing.
 */
test.skip(!process.env.IRIS_URL, 'IRIS_URL is not set: the live run is opt-in');

test('screens say when the server stopped at its row limit', async ({ page }, testInfo) => {
  const admin = account('admin');
  test.skip(!admin, 'administrator account not configured');
  await signIn(page, admin!);
  const out: Record<string, unknown> = {};
  const within = (scope = page.locator('body')) => ({
    badges: () => scope.getByText('server limit reached').count(),
    counts: () =>
      scope
        .getByRole('status')
        .filter({ hasText: /^[\d,]+ rows?$/ })
        .allInnerTexts(),
  });

  // Audit: an explicit maxRows well below the number of records.
  await page.goto('/security/audit');
  await page.getByLabel('Max rows').fill('5');
  await page.getByRole('button', { name: 'Query audit log' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /^[\d,]+ rows?$/ })
      .first(),
  ).toBeVisible({ timeout: 60_000 });
  out.audit = { requested: 5, badges: await within().badges(), counts: await within().counts() };
  await page.screenshot({ path: testInfo.outputPath('audit-max5.png'), fullPage: true });

  // Tasks: /v2/task/upcoming stops at 100 unless asked for more (the spec says 1000).
  await page.goto('/tasks');
  await page.waitForTimeout(4_000);
  out.tasks = { badges: await within().badges(), counts: await within().counts() };
  await page.screenshot({ path: testInfo.outputPath('tasks.png'), fullPage: true });

  // Journal: "Browse records (first 200)" against a server that returns maxRows / 2.
  await page.goto('/journal');
  // Clickable rows are buttons (keyboard users open them with Enter), not plain table rows.
  await page
    .getByRole('main')
    .getByText(/\d{8}\.\d{3}$/)
    .first()
    .click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: /Browse records/ }).click();
  await expect(drawer.getByRole('status').filter({ hasText: /^[\d,]+ rows?$/ })).toBeVisible({
    timeout: 60_000,
  });
  out.journal = {
    button: await drawer.getByRole('button', { name: /Browse records/ }).innerText(),
    badges: await within(drawer).badges(),
    counts: await within(drawer).counts(),
  };
  await page.screenshot({ path: testInfo.outputPath('journal-records.png'), fullPage: true });

  const file = writeReport(testInfo, 'limits', out);
  console.log(JSON.stringify(out, null, 1), '→', file);
});
