import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * The dashboard's Charts menu: which charts show, and in which order, is a device setting; the
 * charts are listed A to Z until the user rearranges them, by dragging as in the navigation menu
 * or with the keyboard; the interoperability charts name the namespaces whose productions report;
 * every chart, and the open menu, passes the accessibility audit.
 */
async function signIn(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

const tick = async (page: Page, title: string) => {
  await page.getByRole('button', { name: 'Choose charts' }).click();
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

const seriousViolations = async (page: Page) =>
  (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()).violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`);

test('the charts are listed A to Z, rearranged by dragging or with the keyboard, and the dashboard follows', async ({
  page,
}) => {
  await signIn(page);
  const menu = page.getByRole('menu');
  const listed = async () => (await menu.locator('[data-chart-row]').allInnerTexts()).map((t) => t.trim());
  const item = (title: string) => menu.getByRole('menuitem', { name: new RegExp(`^${title} \\(`) });

  await page.getByRole('button', { name: 'Choose charts' }).click();
  await expect(menu.locator('[data-chart-row]')).toHaveCount(9);
  const atoz = await listed();
  expect(atoz).toHaveLength(9);
  expect(atoz).toEqual([...atoz].sort((a, b) => a.localeCompare(b, 'en')));
  await expect(menu.getByRole('menuitem', { name: 'Reset to A-Z' })).toHaveCount(0);
  expect(await seriousViolations(page)).toEqual([]);

  // Hold the queue chart and drag it above the throughput chart; letting go toggles nothing.
  const from = (await item('Queued messages per namespace').boundingBox())!;
  const target = (await item('Message throughput per namespace').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(from.x + from.width / 2, target.y + target.height * 0.1, { steps: 15 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  let names = await listed();
  expect(names.indexOf('Queued messages per namespace')).toBe(
    names.indexOf('Message throughput per namespace') - 1,
  );
  await expect(item('Queued messages per namespace')).toHaveAccessibleName(/\(shown\)$/);
  await expect(item('Message throughput per namespace')).toHaveAccessibleName(/\(shown\)$/);

  // The keyboard: Alt+Down moves the focused chart, says so, and keeps the focus on it.
  await item('Cache efficiency').focus();
  await page.keyboard.press('Alt+ArrowDown');
  names = await listed();
  expect(names[1]).toBe('Cache efficiency');
  await expect(page.getByText('Cache efficiency moved down, now 2 of 9')).toBeAttached();
  await expect(item('Cache efficiency')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  // The dashboard shows its charts in that order, and the order survives a reload.
  const cards = () => page.getByText(/^(Queued messages|Message throughput) per namespace$/).allInnerTexts();
  expect(await cards()).toEqual(['Queued messages per namespace', 'Message throughput per namespace']);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  expect(await cards()).toEqual(['Queued messages per namespace', 'Message throughput per namespace']);

  await page.getByRole('button', { name: 'Choose charts' }).click();
  await expect(menu.locator('[data-chart-row]')).toHaveCount(9);
  expect(await listed()).toEqual(names);
  await menu.getByRole('menuitem', { name: 'Reset to A-Z' }).click();
  expect(await listed()).toEqual(atoz);
  await expect(menu.getByRole('menuitem', { name: 'Reset to A-Z' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  expect(await cards()).toEqual(['Message throughput per namespace', 'Queued messages per namespace']);
});
