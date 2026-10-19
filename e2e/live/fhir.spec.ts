import { expect, test, type Page } from '@playwright/test';
import { account, signIn } from './live';

/**
 * The FHIR screens on a real IRIS for Health instance: by default the R4 server of APERTURELAB
 * (made with POST /csp/fhir-management/api/endpoints). The @mutate test disables and enables it.
 * With LIVE_EVIDENCE set to a folder, the read-only test's screenshots go there.
 */
const admin = account('admin');
test.skip(!admin, 'IRIS_USER / IRIS_PASSWORD are not set');
const NAME = process.env.LIVE_FHIR_SERVER ?? 'Aperture lab R4';
const shot = async (page: Page, name: string) => {
  if (process.env.LIVE_EVIDENCE)
    await page.screenshot({ path: `${process.env.LIVE_EVIDENCE}/${name}.png`, fullPage: true });
};

test('the FHIR servers and one of them', async ({ page }) => {
  await signIn(page, admin!);
  await page.goto('/health/fhir');
  const row = page.getByRole('row').filter({ hasText: NAME });
  await expect(row).toContainText('4.0.1');
  await shot(page, 'fhir-servers');
  await row.getByRole('link', { name: NAME }).click();
  await expect(page.getByRole('heading', { name: NAME })).toBeVisible();
  await shot(page, 'fhir-server');
  await page.getByRole('tab', { name: 'Serves' }).click();
  await expect(page.getByText(/FHIR 4\.0\.1, \d+ resource types/)).toBeVisible();
  await shot(page, 'fhir-server-serves');
  await page.getByRole('tab', { name: 'Jobs' }).click();
  // IRIS keeps a server's jobs only for a while (they were gone after a restart).
  await expect(
    page.getByRole('cell', { name: 'AddEndpoint' }).or(page.getByText('No job for this server.')),
  ).toBeVisible();
  await shot(page, 'fhir-server-jobs');
});

test('a FHIR server disabled and enabled again @mutate', async ({ page }) => {
  await signIn(page, admin!);
  await page.goto('/health/fhir');
  await page.getByRole('row').filter({ hasText: NAME }).getByRole('link', { name: NAME }).click();
  await page.getByRole('button', { name: 'Disable' }).click();
  await page
    .getByRole('dialog', { name: 'Disable FHIR server' })
    .getByRole('button', { name: 'Disable' })
    .click();
  await expect(page.getByText(`${NAME}: IRIS now reports it disabled.`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Enable' }).click();
  await page
    .getByRole('dialog', { name: 'Enable FHIR server' })
    .getByRole('button', { name: 'Enable' })
    .click();
  await expect(page.getByText(`${NAME}: IRIS now reports it enabled.`)).toBeVisible({ timeout: 30_000 });
});
