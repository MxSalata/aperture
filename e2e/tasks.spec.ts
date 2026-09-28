import { expect, test } from '@playwright/test';

/**
 * GET /v2/tasks answers Suspended false for every task, as IRIS 2026.2 does (lib/quirks.ts,
 * task-list-suspended-false); the Tasks screen reads each task's state from /v2/task/info, so the
 * demo's suspended task shows as suspended all the same.
 */
test('the Tasks screen shows a suspended task that the task list reports as active', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/#/tasks');
  const suspended = page.getByRole('button', { name: 'Open task Diagnostic Report' });
  await expect(suspended.getByText('Suspended', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open task Purge Tasks' }).getByText('Active', { exact: true }),
  ).toBeVisible();
});
