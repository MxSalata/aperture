import { expect, test } from '@playwright/test';

/** The FHIR screens on the demo: the servers, one server, and disabling and enabling it. */
test('a FHIR server, what it stores and serves, disabled and enabled again', async ({ page }) => {
  await page.goto('/#/login');
  await page.getByRole('button', { name: /Try the demo/ }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.goto('/#/health/fhir');
  const row = page.getByRole('row').filter({ hasText: 'Clinical R4' });
  await expect(row).toContainText('Enabled');
  await expect(row).toContainText('161');
  await row.getByRole('link', { name: 'Clinical R4' }).click();
  await expect(page.getByRole('heading', { name: 'Clinical R4' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Observation' })).toBeVisible();
  await page.getByRole('tab', { name: 'Serves' }).click();
  await expect(page.getByText('FHIR 4.0.1, 5 resource types')).toBeVisible();
  // Its /metadata answers anyone, but a search without credentials is refused: not open.
  await expect(page.getByText('Open to anyone')).toBeHidden();

  await page.getByRole('button', { name: 'Disable' }).click();
  await page
    .getByRole('dialog', { name: 'Disable FHIR server' })
    .getByRole('button', { name: 'Disable' })
    .click();
  await expect(page.getByText('Clinical R4: IRIS now reports it disabled.')).toBeVisible();
  await page.getByRole('button', { name: 'Enable' }).click();
  await page
    .getByRole('dialog', { name: 'Enable FHIR server' })
    .getByRole('button', { name: 'Enable' })
    .click();
  await expect(page.getByText('Clinical R4: IRIS now reports it enabled.')).toBeVisible();
});
