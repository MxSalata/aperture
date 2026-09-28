import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated accessibility check (axe-core, WCAG 2.1 A and AA) of the sign-in page and the main
 * screens of the demo build, in every appearance: light, pastel, dark, and both high-contrast
 * modes. Serious and critical violations fail the run; the rest are printed.
 */
const go = (page: Page, path: string) => page.goto(`/#${path}`);

async function signIn(page: Page) {
  await go(page, '/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

async function audit(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  for (const v of results.violations)
    for (const n of v.nodes)
      console.log(`[a11y] ${v.impact ?? 'n/a'} ${v.id}: ${n.target.join(' ')} - ${n.any[0]?.message ?? ''}`);
  return blocking.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')}`);
}

const SCREENS: [path: string, heading: string][] = [
  ['/', 'Dashboard'],
  ['/health', 'Health check'],
  ['/databases', 'Databases'],
  ['/processes', 'Processes'],
  ['/tasks', 'Tasks'],
  ['/logs', 'Logs'],
  ['/logs/messages', 'Messages log'],
  ['/monitor', 'Host monitor'],
  ['/security/users', 'Users'],
  ['/security/web-apps', 'Web applications'],
  ['/security/secrets', 'Wallet & OAuth 2.0'],
  ['/devices', 'Devices'],
  ['/rest-services', 'REST services'],
  ['/activity', 'Activity'],
  // Detail screens with a raw JSON panel, and the Explorer and About page, which have one too.
  ['/databases/detail?dir=%2Fusr%2Firissys%2Fmgr%2Fuser%2F', '/usr/irissys/mgr/user/'],
  ['/security/roles/%25Operator', '%Operator'],
  ['/explorer', 'API Explorer'],
  ['/about', 'About Aperture'],
];

const MODES = [
  { colorScheme: 'light', contrast: 'no-preference', palette: 'default' },
  { colorScheme: 'light', contrast: 'no-preference', palette: 'pastel' },
  { colorScheme: 'dark', contrast: 'no-preference', palette: 'default' },
  { colorScheme: 'light', contrast: 'more', palette: 'default' },
  { colorScheme: 'dark', contrast: 'more', palette: 'default' },
] as const;

for (const { colorScheme, contrast, palette } of MODES) {
  const mode = `${palette === 'pastel' ? 'pastel' : colorScheme}${contrast === 'more' ? ', high contrast' : ''}`;
  test.describe(`accessibility (axe-core, WCAG 2.1 A/AA), ${mode}`, () => {
    // Until the user picks otherwise, the app follows prefers-color-scheme and prefers-contrast.
    test.use({ colorScheme, contrast });
    // Pastel has no OS preference: it is the stored device setting, read before the first paint.
    if (palette === 'pastel')
      test.beforeEach(({ page }) =>
        page.addInitScript(() =>
          localStorage.setItem(
            'aperture.appearance',
            JSON.stringify({ state: { contrast: 'auto', palette: 'pastel' }, version: 0 }),
          ),
        ),
      );

    test('sign-in page', async ({ page }) => {
      await go(page, '/login');
      await expect(page.getByRole('button', { name: /Sign in/ })).toBeVisible();
      expect(await audit(page)).toEqual([]);
    });

    for (const [path, heading] of SCREENS) {
      test(heading, async ({ page }) => {
        await signIn(page);
        await go(page, path);
        await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
        expect(await audit(page)).toEqual([]);
      });
    }

    // A drawer, open: its close button and its content are audited too (the theme names the button).
    // Audited once it has settled: mid-transition, axe blends the drawer with its overlay.
    test('Job Center drawer', async ({ page }) => {
      await signIn(page);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.getByRole('button', { name: 'Open Job Center' }).click();
      await expect(page.getByRole('dialog').getByText('Job Center')).toBeVisible();
      await expect
        .poll(() => page.locator('.mantine-Drawer-overlay').evaluate((el) => getComputedStyle(el).opacity))
        .toBe('1');
      expect(await audit(page)).toEqual([]);
    });
  });
}
