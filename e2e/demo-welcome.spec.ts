import { expect, test } from '@playwright/test';

/**
 * The demo names itself: the banner on every page while the in-browser mock answers, and the welcome window once
 * per browser, again from the banner. These specs start with empty storage (the others start past the welcome).
 */
test.use({ storageState: { cookies: [], origins: [] } });

test('a fresh browser gets the welcome once, and the banner stays on every page', async ({ page }) => {
  await page.goto('/#/login');
  // The login page of the demo build already carries the banner.
  await expect(page.getByRole('region', { name: 'Demo environment' })).toBeVisible();
  await page.getByRole('button', { name: /Try the demo/ }).click();

  const welcome = page.getByRole('dialog', { name: /Welcome to Aperture's demo/ });
  await expect(welcome).toBeVisible();
  await expect(welcome.getByText(/mock IRIS instance runs inside your browser/)).toBeVisible();
  await expect(welcome.getByText(/Nothing connects to a real server/)).toBeVisible();
  await welcome.getByRole('button', { name: 'Start exploring' }).click();
  await expect(welcome).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  const banner = page.getByRole('region', { name: 'Demo environment' });
  await expect(banner).toBeVisible();
  await expect(banner.getByText(/Made-up IRIS data: nothing leaves this browser/)).toBeVisible();
  // The demo build here names no home page, so there is no "Back to" link.
  await expect(banner.getByRole('link')).toHaveCount(0);

  await page.goto('/#/health');
  await expect(page.getByRole('heading', { name: 'Health check' })).toBeVisible();
  await expect(banner).toBeVisible();

  // Once closed, the welcome stays closed after a reload (the tab stays signed in); the banner's info button opens it on
  // purpose.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Health check' })).toBeVisible();
  await expect(banner).toBeVisible();
  await expect(welcome).toBeHidden();
  await banner.getByRole('button', { name: 'About this demo' }).click();
  await expect(welcome).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(welcome).toBeHidden();
});

test('on a phone the banner keeps to one row with nothing cut off sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await page
    .getByRole('dialog', { name: /Welcome to Aperture's demo/ })
    .getByRole('button', { name: 'Start exploring' })
    .click();
  const banner = page.getByRole('region', { name: 'Demo environment' });
  await expect(banner.getByText('Demo environment')).toBeVisible();
  await expect(banner.getByRole('button', { name: 'About this demo' })).toBeVisible();
  const box = await banner.boundingBox();
  expect(box?.height).toBeLessThanOrEqual(37);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
