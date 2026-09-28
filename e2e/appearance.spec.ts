import { expect, test, type Page } from '@playwright/test';

/**
 * The appearance menu and the Pastel theme on the demo build: the choice is a device setting,
 * applied before the bundle runs, and it is a light theme only (dark and high contrast win).
 */
const go = (page: Page, path: string) => page.goto(`/#${path}`);

const PASTEL = { state: { contrast: 'auto', palette: 'pastel' }, version: 0 };
const bg = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor);
const PAGE = { pastel: 'rgb(240, 236, 249)', light: 'rgb(235, 238, 242)', dark: 'rgb(24, 30, 38)' };
const BODY = { pastel: 'rgb(250, 248, 254)', light: 'rgb(249, 250, 251)', dark: 'rgb(31, 38, 48)' };

async function signIn(page: Page) {
  await go(page, '/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function chooseTheme(page: Page, name: string) {
  await page.getByRole('button', { name: 'Appearance' }).click();
  // The theme entries come first; "System" exists in the contrast group too.
  await page
    .getByRole('menuitem', { name: new RegExp(`^${name}( \\(current theme\\))?$`) })
    .first()
    .click();
}

test.describe('appearance menu', () => {
  test('Pastel is chosen from the menu, survives a reload, and Light and System reset it', async ({
    page,
  }) => {
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'default');
    await expect(page.locator('main')).toHaveCSS('background-color', PAGE.light);

    await chooseTheme(page, 'Pastel');
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'pastel');
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');
    await expect(page.locator('main')).toHaveCSS('background-color', PAGE.pastel);
    expect(await bg(page, 'body')).toBe(BODY.pastel);
    await page.getByRole('button', { name: 'Appearance' }).click();
    await expect(page.getByRole('menuitem', { name: 'Pastel (current theme)' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('main')).toHaveCSS('background-color', PAGE.pastel);

    await chooseTheme(page, 'Light');
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'default');
    await expect(page.locator('main')).toHaveCSS('background-color', PAGE.light);

    await chooseTheme(page, 'Pastel');
    await chooseTheme(page, 'System');
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'default');
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'light');
    await expect(page.locator('main')).toHaveCSS('background-color', PAGE.light);
  });

  test('the stored theme styles the splash before the bundle runs', async ({ page }) => {
    // With the bundle blocked, what stays on screen is the splash as color-scheme.js styled it.
    await page.route('**/assets/*.js', (route) => route.abort());
    await page.addInitScript(
      (pastel) => localStorage.setItem('aperture.appearance', JSON.stringify(pastel)),
      PASTEL,
    );
    await go(page, '/login');
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'pastel');
    await expect(page.locator('html')).toHaveAttribute('data-aperture-contrast', 'normal');
    await expect(page.locator('.boot')).toHaveCSS('background-color', PAGE.pastel);
  });
});

test.describe('Pastel yields to dark', () => {
  test.use({ colorScheme: 'dark' });
  test('a stored Pastel is inert while the scheme resolves to dark', async ({ page }) => {
    await page.addInitScript(
      (pastel) => localStorage.setItem('aperture.appearance', JSON.stringify(pastel)),
      PASTEL,
    );
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'pastel');
    await expect(page.locator('html')).toHaveAttribute('data-mantine-color-scheme', 'dark');
    await expect(page.locator('main')).toHaveCSS('background-color', PAGE.dark);
    expect(await bg(page, 'body')).toBe(BODY.dark);
  });
});

test.describe('Pastel yields to high contrast', () => {
  test.use({ contrast: 'more' });
  test('a stored Pastel is inert under high contrast, which keeps its white body', async ({ page }) => {
    await page.addInitScript(
      (pastel) => localStorage.setItem('aperture.appearance', JSON.stringify(pastel)),
      PASTEL,
    );
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-aperture-palette', 'pastel');
    await expect(page.locator('html')).toHaveAttribute('data-aperture-contrast', 'high');
    await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    expect(await bg(page, 'body')).toBe('rgb(255, 255, 255)');
    await expect(page.locator('main')).toHaveCSS('color', 'rgb(0, 0, 0)');
  });
});
