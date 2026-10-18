import { expect, test } from '@playwright/test';

/**
 * The SQL screen on the demo: the password Atelier needs, a query and its column types, a change
 * behind its warning and confirmation, and the catalogue.
 */
test('a query, a change behind its warning, and the catalogue', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/#/sql');
  // A JWT session has no password for /api/atelier: it is asked for once.
  await page.getByRole('button', { name: 'Use it' }).click();

  const statement = page.getByRole('textbox', { name: 'Statement', exact: true });
  await statement.fill("SELECT Name, City FROM Sample.Person WHERE City = 'Leeds' ORDER BY Name");
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('2 rows in')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Grace Hopper' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /City VARCHAR/ })).toBeVisible();

  await statement.fill("UPDATE Sample.Person SET City = 'Hull' WHERE Name = 'Grace Hopper'");
  await expect(page.getByText('This statement changes data')).toBeVisible();
  await page.getByRole('button', { name: 'Run UPDATE' }).click();
  await page
    .getByRole('dialog', { name: 'Run a statement that changes data' })
    .getByRole('button', { name: 'Run UPDATE' })
    .click();
  await expect(page.getByText('UPDATE done')).toBeVisible();

  await statement.fill('SELECT nothing FROM Sample.Nowhere');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/SQLCODE -30/)).toBeVisible();

  await page.getByRole('tab', { name: 'Catalogue' }).click();
  await page.getByRole('button', { name: /^Sample/ }).click();
  await page.getByRole('button', { name: 'Open Person' }).click();
  await expect(
    page.getByRole('cell', { name: 'BirthDate' }).or(page.getByRole('cell', { name: 'DOB' })),
  ).toBeVisible();
  await page.getByRole('button', { name: 'First 100 rows' }).click();
  await expect(page.getByRole('cell', { name: 'Hull' })).toBeVisible();
});
