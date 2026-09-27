import { expect, test, type Page } from '@playwright/test';

/**
 * Auto-refresh beside the Refresh button: off by default, an interval chosen from the menu is
 * remembered for that screen on this device, and a refresh really happens on that interval.
 */
async function signIn(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('the interval is off by default except on Processes, chosen per screen, remembered, and refreshes the screen', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/#/security/users');
  await expect(page.getByRole('cell', { name: 'jdoe' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auto-refresh off' })).toBeVisible();

  // Processes polls every 5 seconds until told otherwise, as its old switch did.
  await page.goto('/#/processes');
  await expect(page.getByRole('cell', { name: 'jdoe' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Auto-refresh every 5 seconds' })).toBeVisible();
  const requests: number[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/v2/processes')) requests.push(Date.now());
  });
  await expect.poll(() => requests.length, { timeout: 12_000 }).toBeGreaterThanOrEqual(2);

  // Another screen has its own setting; this one keeps its own after a reload.
  await page.getByRole('button', { name: 'Auto-refresh every 5 seconds' }).click();
  await page.getByRole('menuitem', { name: 'Every 15 seconds' }).click();
  await expect(page.getByRole('button', { name: 'Auto-refresh every 15 seconds' })).toBeVisible();
  await page.goto('/#/security/users');
  await expect(page.getByRole('button', { name: 'Auto-refresh off' })).toBeVisible();
  await page.reload();
  await page.goto('/#/processes');
  await expect(page.getByRole('button', { name: 'Auto-refresh every 15 seconds' })).toBeVisible();

  await page.getByRole('button', { name: 'Auto-refresh every 15 seconds' }).click();
  await page.getByRole('menuitem', { name: 'Off' }).click();
  await expect(page.getByRole('button', { name: 'Auto-refresh off' })).toBeVisible();
  const before = requests.length;
  await page.waitForTimeout(6_000);
  expect(requests.length).toBe(before);
  // Off is a choice of its own: it survives a reload on the screen with a default.
  await page.reload();
  await page.goto('/#/processes');
  await expect(page.getByRole('button', { name: 'Auto-refresh off' })).toBeVisible();

  // Refresh by hand still works.
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(before);
});
