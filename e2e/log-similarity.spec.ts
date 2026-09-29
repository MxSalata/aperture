import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * "Similar entries" in the Messages log on the demo build: an opened entry says how often its
 * message was logged (the demo keeps its wording index current, as an instance that has used it)
 * and leads to the entries worded like it; the drawer passes the accessibility audit in every mode.
 */
async function openMessagesLog(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/#/logs/messages');
  await page.getByLabel(/Password for/).fill('SYS');
  await page.getByRole('button', { name: 'Read the logs' }).click();
  await expect(page.getByRole('button', { name: /^Log entry / }).first()).toBeVisible();
}

test('an entry says how often its message was logged and leads to the entries worded like it', async ({
  page,
}) => {
  await openMessagesLog(page);
  // A message the demo's log repeats with other numbers.
  await page.getByRole('textbox', { name: 'Filter rows' }).fill('expanded by');
  const firstRow = page.getByRole('button', { name: /^Log entry / }).first();
  await expect(firstRow).toContainText('expanded by');
  await firstRow.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('Log entry')).toBeVisible();
  // The count shows as the entry opens, before anyone asks for the list.
  await expect(drawer.getByText(/Seen (at least )?\d+ times since/)).toBeVisible({ timeout: 20_000 });
  await expect(drawer.getByText(/Found with IRIS Vector Search/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Show similar entries' }).click();
  await expect(drawer.getByText('Similar entries')).toBeVisible();
  await expect(drawer.getByText(/Seen (at least )?\d+ times since/)).toBeVisible({ timeout: 20_000 });
  const scores = drawer.getByText(/^\d+ %$/);
  expect(await scores.count()).toBeGreaterThan(0);
  await expect(scores.first()).toHaveText(/^(9\d|100) %$/);
  await expect(drawer.getByText(/expanded by/).first()).toBeVisible();
  await expect(drawer.getByText(/Matched by wording with IRIS Vector Search/)).toBeVisible();
  await expect(drawer.getByText(/entries indexed from/)).toBeVisible();
  await drawer.getByRole('button', { name: 'Back to the entry' }).click();
  await expect(drawer.getByRole('button', { name: 'Show similar entries' })).toBeVisible();
});

const MODES = [
  { colorScheme: 'light', contrast: 'no-preference', palette: 'default' },
  { colorScheme: 'light', contrast: 'no-preference', palette: 'pastel' },
  { colorScheme: 'dark', contrast: 'no-preference', palette: 'default' },
  { colorScheme: 'light', contrast: 'more', palette: 'default' },
  { colorScheme: 'dark', contrast: 'more', palette: 'default' },
] as const;

for (const { colorScheme, contrast, palette } of MODES) {
  const mode = `${palette === 'pastel' ? 'pastel' : colorScheme}${contrast === 'more' ? ', high contrast' : ''}`;
  test.describe(`similar entries drawer, ${mode}`, () => {
    test.use({ colorScheme, contrast });
    if (palette === 'pastel')
      test.beforeEach(({ page }) =>
        page.addInitScript(() =>
          localStorage.setItem(
            'aperture.appearance',
            JSON.stringify({ state: { contrast: 'auto', palette: 'pastel' }, version: 0 }),
          ),
        ),
      );
    test('passes the accessibility audit with an entry and its count open', async ({ page }) => {
      await openMessagesLog(page);
      await page
        .getByRole('button', { name: /^Log entry / })
        .first()
        .click();
      await expect(page.getByRole('dialog').getByText(/Found with IRIS Vector Search/)).toBeVisible();
      await expect(page.getByRole('dialog').getByText(/Counting the entries/)).toHaveCount(0, {
        timeout: 20_000,
      });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`),
      ).toEqual([]);
    });

    test('passes the accessibility audit with the list open', async ({ page }) => {
      await openMessagesLog(page);
      await page
        .getByRole('button', { name: /^Log entry / })
        .first()
        .click();
      await page.getByRole('dialog').getByRole('button', { name: 'Show similar entries' }).click();
      await expect(page.getByRole('dialog').getByText(/Matched by wording/)).toBeVisible({ timeout: 20_000 });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations
          .filter((v) => v.impact === 'serious' || v.impact === 'critical')
          .map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`),
      ).toEqual([]);
    });
  });
}
