import { expect, test, type Page } from '@playwright/test';

/**
 * The Health check on the demo build: findings by severity with evidence and a fix link, filters
 * and a search, "Run again", the export menu, and the dashboard's card.
 */
async function signIn(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

test('lists findings with evidence, filters them, and each opens the screen that fixes it', async ({
  page,
}) => {
  await signIn(page);
  await page.goto('/#/health');
  await expect(page.getByRole('heading', { name: 'Health check' })).toBeVisible();
  await expect(page.getByText(/^\d+ findings$/)).toBeVisible({ timeout: 20_000 });
  const list = page.getByRole('list').filter({ hasText: 'What to do:' });
  await expect(list.getByRole('listitem').first()).toBeVisible();
  const total = await list.getByRole('listitem').count();
  expect(total).toBeGreaterThan(5);
  // The first finding is the most severe.
  await expect(
    list
      .getByRole('listitem')
      .first()
      .getByText(/^(Critical|Warning)$/),
  ).toBeVisible();

  // Search narrows to the seeded UnknownUser finding; its evidence and fix link.
  await page.getByRole('textbox', { name: 'Search' }).fill('UnknownUser is enabled');
  await expect(page.getByText(/^1 of \d+ findings$/)).toBeVisible();
  const item = list.getByRole('listitem').first();
  await expect(item.getByText('UnknownUser is enabled')).toBeVisible();
  await item.getByRole('button', { name: /Show evidence/ }).click();
  await expect(item.getByText('GET /v2/security/users')).toBeVisible();
  await expect(item.getByText('Enabled', { exact: true })).toBeVisible();
  await item.getByRole('link', { name: 'Open UnknownUser' }).click();
  await expect(page.getByRole('heading', { name: 'UnknownUser' })).toBeVisible();

  // Back: the severity filter and the advice-only view.
  await page.goto('/#/health');
  await expect(page.getByText(/^\d+ findings$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('textbox', { name: 'Severity' }).click();
  await page.getByRole('option', { name: 'Advice' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/^\d+ of \d+ findings$/)).toBeVisible();
  await expect(list.getByRole('listitem').first().getByText('Advice', { exact: true })).toBeVisible();

  // Run again (filters cleared by a reload), and the export menu.
  await page.reload();
  await expect(page.getByText(/^\d+ findings$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Run again' }).click();
  await expect(page.getByText(/^\d+ findings$/)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Markdown report' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Every check ran for the demo's administrator but one: a demo session signs in with a JWT, so
  // the log check waits for the reader's password, and says so rather than skipping silently.
  await page.getByRole('button', { name: 'Every check, and what it reads' }).click();
  await expect(page.getByText(/UnknownUser account · 1 finding/)).toBeVisible();
  await expect(
    page.getByText(/Severe entries of messages\.log.*not checked \(needs the password/),
  ).toBeVisible();
  await expect(page.getByText(/^1 not checked/)).toBeVisible();
});

test('the dashboard card counts the findings and leads to the screen', async ({ page }) => {
  await signIn(page);
  await expect(page.getByText(/\d+ critical/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ warnings?/)).toBeVisible();
  await page.getByRole('link', { name: 'All findings' }).click();
  await expect(page.getByRole('heading', { name: 'Health check' })).toBeVisible();
});

test('an operator sees what was not checked and why', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByLabel('Username').fill('operator');
  await page.getByLabel('Password', { exact: true }).fill('SYS');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/#/health');
  await expect(page.getByText(/\d+ not checked/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/needs %Admin_Secure/).first()).toBeVisible();
});
