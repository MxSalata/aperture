import { expect, test } from '@playwright/test';
import { account, signIn } from './live';

/**
 * The production screens on a real instance, read-only. The instance needs a running production;
 * by default that is the test production of scripts/live/lab.mjs (APERTURELAB, Aperture.Lab.Production), which has
 * a host that refuses every other message on purpose (Lab.Flaky) and a disabled one (Lab.Spare).
 * LIVE_PRODUCTION names another (`NAMESPACE/Production.Class`). With LIVE_EVIDENCE set to a folder,
 * the screenshots go there.
 */
const admin = account('admin');
test.skip(!admin, 'IRIS_USER / IRIS_PASSWORD are not set');

const [NS, PRODUCTION] = (process.env.LIVE_PRODUCTION ?? 'APERTURELAB/Aperture.Lab.Production').split('/');
const FAILING = process.env.LIVE_FAILING_HOST ?? 'Lab.Flaky';
const shot = (name: string) =>
  process.env.LIVE_EVIDENCE
    ? { path: `${process.env.LIVE_EVIDENCE}/${name}.png`, fullPage: true }
    : undefined;

test('the productions of the instance, one production, and a failing host', async ({ page }) => {
  await signIn(page, admin!);
  await page.goto('/interop/productions');
  await expect(page.getByRole('heading', { name: 'Productions' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: PRODUCTION });
  await expect(row).toContainText(NS);
  await expect(row).toContainText('Running');
  const opts = shot('productions');
  if (opts) await page.screenshot(opts);

  await row.getByRole('link', { name: PRODUCTION }).click();
  await expect(page.getByRole('heading', { name: PRODUCTION })).toBeVisible();
  // Rows open a drawer, so they are buttons named after their host. The failing host's status is the
  // outcome of its last message, ok or error by turns; its errors come from its event log, and it
  // sorts first.
  const failing = page.getByRole('button', { name: `Open ${FAILING}` });
  await expect(failing.locator('.mantine-Badge-root').filter({ hasText: /^[1-9]\d*$/ })).toBeVisible();
  await expect(
    page
      .locator('table')
      .getByRole('button', { name: /^Open / })
      .first(),
  ).toHaveAccessibleName(`Open ${FAILING}`);
  const p = shot('production');
  if (p) await page.screenshot(p);

  await failing.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText(/refused|ERROR/).first()).toBeVisible();
  const d = shot('host-event-log');
  if (d) await page.screenshot(d);
  await drawer.getByRole('tab', { name: 'Messages' }).click();
  await expect(drawer.getByRole('row').nth(1)).toBeVisible();
  const m = shot('host-messages');
  if (m) await page.screenshot(m);
  await drawer.getByRole('tab', { name: 'Settings' }).click();
  await expect(drawer.getByRole('row').filter({ hasText: 'PoolSize' })).toBeVisible();
  await drawer.getByRole('tab', { name: 'Connections' }).click();
  await expect(drawer.getByText('Hears from')).toBeVisible();
});
