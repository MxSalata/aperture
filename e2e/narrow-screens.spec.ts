import { expect, test, type Page } from '@playwright/test';

/**
 * Every screen at a phone's width (360 CSS pixels, a small Android phone) and at the narrowest laptop
 * width (1024, where the dashboard's cards are narrowest) on the demo build: nothing makes the page
 * scroll sideways, and nothing spills out of its card. A wide table scrolls inside its card instead
 * (DataTable, CardTable), which this does not count.
 */
const SCREENS = [
  '/',
  '/health',
  '/jobs',
  '/activity',
  '/monitor',
  '/logs',
  '/logs/messages',
  '/databases',
  '/databases/detail?dir=%2Fusr%2Firissys%2Fmgr%2Fuser%2F',
  '/namespaces',
  '/namespaces/USER',
  '/processes',
  '/locks',
  '/devices',
  '/journal',
  '/tasks',
  '/tasks/1',
  '/web-sessions',
  '/license',
  '/security',
  '/security/users',
  '/security/users/_SYSTEM',
  '/security/roles',
  '/security/roles/%25Operator',
  '/security/resources',
  '/security/services',
  '/security/web-apps',
  '/security/web-apps/detail?name=%2Fcsp%2Fuser',
  '/rest-services',
  '/security/audit',
  '/security/ssl',
  '/security/sql',
  '/security/secrets',
  '/explorer',
  '/settings/connections',
  '/about',
];

async function signIn(page: Page) {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

/** Runs in the page: what reaches past the viewport or its card, outside the areas that scroll on purpose. */
function overflow(): string | null {
  const width = document.documentElement.clientWidth;
  const insideScroller = (el: Element) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (/(auto|scroll)/.test(style.overflowX) && e.scrollWidth > e.clientWidth + 1) return true;
    }
    return false;
  };
  const name = (el: Element) => (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const found: string[] = [];
  const page = document.documentElement.scrollWidth - width;
  if (page > 1) found.push(`the page scrolls sideways by ${page}px`);
  for (const card of document.querySelectorAll('main .mantine-Paper-root, main .mantine-Card-root')) {
    const edge = card.getBoundingClientRect().right;
    for (const el of card.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && r.right > edge + 2 && !insideScroller(el)) {
        found.push(`"${name(el)}" spills ${Math.round(r.right - edge)}px out of its card`);
        break;
      }
    }
  }
  return found.length ? found.join('; ') : null;
}

for (const width of [360, 1024]) {
  test.describe(`${width} pixels wide`, () => {
    test.use({ viewport: { width, height: 800 } });
    test('no screen scrolls sideways or spills out of a card', async ({ page }) => {
      test.setTimeout(180_000);
      await signIn(page);
      const found: string[] = [];
      for (const path of SCREENS) {
        await page.goto(`/#${path}`);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('main h2').first()).toBeVisible();
        const problem = await page.evaluate(overflow);
        if (problem) found.push(`${path}: ${problem}`);
      }
      expect(found).toEqual([]);
    });
  });
}
