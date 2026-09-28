import { expect, test } from '@playwright/test';

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('the first Tab reaches "Skip to content", which takes the focus past the navigation', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await page.locator('body').focus();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  // The route stays where it was: the link moves the focus, not the hash.
  await expect(page).toHaveURL(/#\/tasks/);
});

test('a table sorts from the keyboard', async ({ page }) => {
  await signIn(page);
  await page.goto('/#/tasks');
  const header = page.getByRole('columnheader', { name: 'Task' });
  await header.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(header).toHaveAttribute('aria-sort', /ascending|descending/);
});
