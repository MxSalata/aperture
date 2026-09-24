import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Automated accessibility check (axe-core, WCAG 2.1 A and AA) of the sign-in page and the main
 * screens of the demo build. Serious and critical violations fail the run; the rest are printed.
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
];

const MODES = [
  { colorScheme: 'light', contrast: 'no-preference' },
  { colorScheme: 'dark', contrast: 'no-preference' },
  { colorScheme: 'light', contrast: 'more' },
  { colorScheme: 'dark', contrast: 'more' },
] as const;

for (const { colorScheme, contrast } of MODES) {
  const mode = `${colorScheme}${contrast === 'more' ? ', high contrast' : ''}`;
  test.describe(`accessibility (axe-core, WCAG 2.1 A/AA), ${mode}`, () => {
    // Until the user picks otherwise, the app follows prefers-color-scheme and prefers-contrast.
    test.use({ colorScheme, contrast });

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
  });
}
