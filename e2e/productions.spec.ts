import { expect, test } from '@playwright/test';

/**
 * The production screens on the demo: the list, a production with its failing host first, the
 * host's drawer, and stopping and starting a host with the read-back IRIS gives.
 */
test('a production, its failing host, and stopping and starting a host', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/#/interop/productions');
  const row = page.getByRole('row').filter({ hasText: 'HL7.Production' }).filter({ hasText: 'Running' });
  await expect(row).toContainText('1 Error');
  await row.getByRole('link', { name: 'HL7.Production' }).click();
  await expect(page.getByRole('heading', { name: 'HL7.Production' })).toBeVisible();
  await expect(page.locator('table').locator('[data-row-label^="Open "]').first()).toHaveAttribute(
    'data-row-label',
    'Open HL7.Out.Results.TCP',
  );

  await page.locator('[data-row-label="Open HL7.Out.PAS.TCP"]').click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Stop host' }).click();
  await page.getByRole('dialog', { name: 'Stop host' }).getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('HL7.Out.PAS.TCP: IRIS now reports Stopped.')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Start host' })).toBeVisible();
  await drawer.getByRole('button', { name: 'Start host' }).click();
  await page.getByRole('dialog', { name: 'Start host' }).getByRole('button', { name: 'Start' }).click();
  await expect(page.getByText('HL7.Out.PAS.TCP: IRIS now reports OK.')).toBeVisible();
});
