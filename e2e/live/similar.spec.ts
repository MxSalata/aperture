import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { account, signIn, writeReport } from './live';

/**
 * Similar entries (IRIS Vector Search) on a real instance: the Messages log through the package's
 * reader, an entry, and the entries worded like it from the wording index. Reads only, apart from
 * the package refreshing its own index when it is behind; nothing of the instance's configuration
 * changes. With LIVE_EVIDENCE set to a folder, the drawer's screenshot and a summary go there.
 */
const admin = account('admin');
test.skip(!admin, 'IRIS_USER / IRIS_PASSWORD are not set');

test('an entry of messages.log leads to the entries worded like it', async ({ page }, testInfo) => {
  await signIn(page, admin!);
  await page.goto('/logs/messages');
  // A JWT session gives the reader its password once (its web application takes a password only).
  const gate = page.getByLabel(/Password for/);
  const rows = page.getByRole('button', { name: /^Log entry / });
  await expect(gate.or(rows.first())).toBeVisible();
  if (await gate.isVisible()) {
    await gate.fill(admin!.password);
    await page.getByRole('button', { name: 'Read the logs' }).click();
  }
  await expect(rows.first()).toBeVisible();

  // A message the System Monitor repeats with other figures, when the log has one; else the newest.
  const filter = page.getByRole('textbox', { name: 'Filter rows' });
  await filter.fill('CPUusage');
  const repeated = await expect(rows.first())
    .toContainText('CPUusage', { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (!repeated) await filter.fill('');
  const entry = (await rows.first().innerText()).replace(/\s+/g, ' ').trim();
  await rows.first().click();

  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: 'Show similar entries' }).click();
  const seen = drawer.getByText(/^Seen /);
  await expect(seen).toBeVisible({ timeout: 60_000 });
  const scores = drawer.getByText(/^\d+ %$/);
  await expect(scores.first()).toBeVisible();
  await expect(drawer.getByText(/Matched by wording with IRIS Vector Search/)).toBeVisible();

  const summary = {
    entry: entry.slice(0, 200),
    seen: (await seen.innerText()).trim(),
    matches: await scores.count(),
    scores: (await scores.allInnerTexts()).slice(0, 10),
  };
  writeReport(testInfo, 'similar', summary);
  const evidence = process.env.LIVE_EVIDENCE;
  if (evidence) {
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/similar-entries-live.png` });
    writeFileSync(`${evidence}/similar-entries-live.json`, `${JSON.stringify(summary, null, 2)}\n`);
  }
});
