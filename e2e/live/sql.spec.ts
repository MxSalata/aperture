import { expect, test, type Page } from '@playwright/test';
import { account, signIn } from './live';

/**
 * The SQL screen on a real instance. Reads by default; the @mutate test creates a table in
 * APERTURELAB (the namespace of scripts/live/lab.mjs), writes to it, reads it back and drops it.
 * With LIVE_EVIDENCE set to a folder, the read-only test's screenshots go there.
 */
const admin = account('admin');
test.skip(!admin, 'IRIS_USER / IRIS_PASSWORD are not set');
const shot = async (page: Page, name: string) => {
  if (process.env.LIVE_EVIDENCE)
    await page.screenshot({ path: `${process.env.LIVE_EVIDENCE}/${name}.png`, fullPage: true });
};

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
  // Whether IRIS audits what the screen runs, in whichever state the instance is (only read here).
  await expect(page.getByText(/^IRIS SQL audit|^IRIS audits the/).first()).toBeVisible();
  await shot(page, 'sql-audit-notice');
  await statement.fill('SELECT TOP 5 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/^\d+ rows in/)).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /TABLE_NAME VARCHAR\(128\)/ })).toBeVisible();
  await shot(page, 'sql-query');
  await page.getByRole('button', { name: 'Explain' }).click();
  await expect(page.getByText(/Module|Read/).first()).toBeVisible();
  await shot(page, 'sql-plan');
  await statement.fill('SELECT nothing FROM Nowhere.AtAll');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText(/SQLCODE -30/)).toBeVisible();
  await shot(page, 'sql-error');
  await page.getByRole('tab', { name: 'Statement index' }).click();
  await expect(page.getByRole('columnheader', { name: /StatCount/ })).toBeVisible();
  await shot(page, 'sql-statement-index');
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
