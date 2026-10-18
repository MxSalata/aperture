import { expect, test, type Page } from '@playwright/test';
import { account, signIn } from './live';

/**
 * The SQL screen on a real instance. Reads by default; the @mutate test creates a table in
 * APERTURELAB (the namespace of scripts/live/lab.mjs), writes to it, reads it back and drops it.
 */
const admin = account('admin');
test.skip(!admin, 'IRIS_USER / IRIS_PASSWORD are not set');

async function open(page: Page, ns: string) {
  await signIn(page, admin!);
  await page.goto(`/sql?ns=${ns}`);
  const gate = page.getByLabel(/Password for/);
  const statement = page.getByRole('textbox', { name: 'Statement', exact: true });
  await expect(gate.or(statement)).toBeVisible();
  if (await gate.isVisible()) {
    await gate.fill(admin!.password);
    await page.getByRole('button', { name: 'Open the SQL explorer' }).click();
  }
  await expect(statement).toBeVisible();
  return statement;
}

test('a query with its column types, a plan, and the catalogue', async ({ page }) => {
  const statement = await open(page, 'USER');
  await statement.fill('SELECT TOP 5 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/^\d+ rows in/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /TABLE_NAME VARCHAR\(128\)/ })).toBeVisible();
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByText(/Module|Read/).first()).toBeVisible();
  await statement.fill('SELECT nothing FROM Nowhere.AtAll');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/SQLCODE -30/)).toBeVisible();
  await page.getByRole('tab', { name: 'Statement index' }).click();
  await expect(page.getByRole('columnheader', { name: /StatCount/ })).toBeVisible();
});

test('a table created, written, read back and dropped @mutate', async ({ page }) => {
  const statement = await open(page, 'APERTURELAB');
  const change = async (sql: string, keyword: string) => {
    await statement.fill(sql);
    await page.getByRole('button', { name: `Run ${keyword}` }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: `Run ${keyword}` })
      .click();
    await expect(page.getByText(`${keyword} done`)).toBeVisible();
  };
  await change('CREATE TABLE ApertureProbe.Note (Body VARCHAR(50), N INTEGER)', 'CREATE');
  await change("INSERT INTO ApertureProbe.Note (Body, N) VALUES ('from the portal', 1)", 'INSERT');
  await statement.fill('SELECT Body, N FROM ApertureProbe.Note');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'from the portal' })).toBeVisible();
  await change('DROP TABLE ApertureProbe.Note', 'DROP');
});
