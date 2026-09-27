import { expect, test, type Page } from '@playwright/test';

/**
 * The navigation menu can be rearranged: hold an entry and drag it, or move it with the keyboard.
 * The order is a device setting, so it survives a reload; a short press still navigates.
 */
async function signIn(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

const linkNames = (page: Page) => page.getByRole('navigation').getByRole('link').allInnerTexts();

test('a held entry drags to a new place without navigating, and the order survives a reload', async ({
  page,
}) => {
  await signIn(page);
  const nav = page.getByRole('navigation');
  const devices = nav.getByRole('link', { name: 'Devices', exact: true });
  const journals = nav.getByRole('link', { name: 'Journals', exact: true });
  const from = (await devices.boundingBox())!;
  const target = (await journals.boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(from.x + from.width / 2, target.y + target.height * 0.9, { steps: 15 });
  await page.waitForTimeout(200);
  await page.mouse.up();

  let names = await linkNames(page);
  expect(names.indexOf('Devices')).toBe(names.indexOf('Journals') + 1);
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  names = await linkNames(page);
  expect(names.indexOf('Devices')).toBe(names.indexOf('Journals') + 1);

  // A short press is a click.
  await nav.getByRole('link', { name: 'Devices', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Devices', exact: true }).first()).toBeVisible();
});

test('the keyboard moves an entry or its whole group, announces it, and the order can be reset', async ({
  page,
}) => {
  await signIn(page);
  const nav = page.getByRole('navigation');
  const users = nav.getByRole('link', { name: 'Users', exact: true });
  await users.focus();
  await page.keyboard.press('Alt+ArrowDown');
  let names = await linkNames(page);
  expect(names.indexOf('Users')).toBe(names.indexOf('Roles') + 1);
  await expect(page.getByText('Users moved down, now 2 of')).toBeAttached();
  await expect(users).toBeFocused();

  // Positions, not DOM order: the moved group slides into place, so poll until it has arrived.
  const top = async (label: string) => (await nav.getByText(label, { exact: true }).boundingBox())!.y;
  const securityAboveOperations = async () => (await top('Security')) < (await top('Operations'));
  expect(await securityAboveOperations()).toBe(false);
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect.poll(securityAboveOperations).toBe(true);
  await expect(page.getByText('Security moved up, now group 2 of')).toBeAttached();

  await page.getByRole('button', { name: 'Reset menu order' }).click();
  names = await linkNames(page);
  expect(names.indexOf('Users')).toBe(names.indexOf('Roles') - 1);
  await expect.poll(securityAboveOperations).toBe(false);
  await expect(page.getByRole('button', { name: 'Reset menu order' })).toHaveCount(0);
});
