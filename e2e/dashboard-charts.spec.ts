import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The dashboard's Charts menu: which charts show is a device setting; the interoperability charts
 * name the namespaces whose productions report; every chart passes the accessibility audit.
 */
async function signIn(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

const tick = async (page: Page, title: string) => {
  await page.getByRole('button', { name: 'Charts' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${title} \\(`) }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
};

test('charts are chosen from the menu, remembered, and the interop charts name the namespaces', async ({
  page,
}) => {
  await signIn(page);
  // A fresh device shows the productions' throughput and queues; the demo's two productions
  // report, and the lines need a second reading of /api/monitor (every 9 s).
  await expect(page.getByText('Message throughput per namespace')).toBeVisible();
  await expect(page.getByText('Queued messages per namespace')).toBeVisible();
  await expect(page.getByText('Global references per second')).toHaveCount(0);
  await expect(page.getByText('INTEROP', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('CLINICAL', { exact: true }).first()).toBeVisible();

  await tick(page, 'Global references per second');
  await tick(page, 'Queued messages per namespace');
  await expect(page.getByText('Global references per second')).toBeVisible();
  await expect(page.getByText('Queued messages per namespace')).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText('Global references per second')).toBeVisible();
  await expect(page.getByText('Queued messages per namespace')).toHaveCount(0);

  // Every chart on, then the audit.
  for (const title of [
    'Queued messages per namespace',
    'Cache efficiency',
    'Logical requests per second',
    'Routine references per second',
    'Processes and web sessions',
    'License units in use',
  ])
    await tick(page, title);
  await expect(page.getByText('License units in use')).toBeVisible();
  await page.waitForTimeout(4_000);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
  ).toEqual([]);
});
