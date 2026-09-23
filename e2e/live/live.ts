import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Accounts of the live run; null when the environment does not name one. */
export interface Account {
  label: string;
  user: string;
  password: string;
}

export const IRIS_URL = process.env.IRIS_URL ?? '';
export const PREFIX = process.env.IRIS_API_PREFIX ?? '/api/admin';

export function account(kind: 'admin' | 'op'): Account | null {
  const user = kind === 'op' ? process.env.IRIS_OP_USER : process.env.IRIS_USER;
  const password = kind === 'op' ? process.env.IRIS_OP_PASSWORD : process.env.IRIS_PASSWORD;
  return user && password !== undefined
    ? { label: kind === 'op' ? 'operator' : 'admin', user, password }
    : null;
}

/** Sign in through the login form, as a person would (same-origin connection, Auto authentication). */
export async function signIn(page: Page, acct: Account, opts: { persist?: boolean; role?: string } = {}) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(acct.user);
  await page.getByLabel('Password', { exact: true }).fill(acct.password);
  if (opts.role) await page.getByLabel('Escalation role').fill(opts.role);
  const keep = page.getByLabel('Keep me signed in for this browser tab');
  if ((await keep.isChecked()) !== (opts.persist ?? true)) await keep.click();
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/** Direct API access for the tests themselves (setup, read-back), with Basic credentials. */
export async function apiGet<T = unknown>(
  acct: Account,
  path: string,
): Promise<{ status: number; result: T }> {
  const auth = Buffer.from(`${acct.user}:${acct.password}`, 'utf8').toString('base64');
  const res = await fetch(`${IRIS_URL}${PREFIX}${path}`, {
    headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' },
  });
  const body = (await res.json().catch(() => null)) as { result?: T } | null;
  return { status: res.status, result: (body?.result ?? body) as T };
}

export interface ScreenReport {
  route: string;
  heading: string | null;
  consoleErrors: string[];
  failedRequests: string[];
  alerts: string[];
  screenshot: string;
}

/**
 * Everything a screen complained about while it was open: console errors, API answers of 400 and
 * above, network failures and visible error alerts. Hosts are not recorded, only paths.
 */
export function recorder(page: Page) {
  let consoleErrors: string[] = [];
  let failed: string[] = [];
  const path = (url: string) => {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  };
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 300)}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400)
      failed.push(`${r.request().method()} ${path(r.url())} → ${r.status()}`);
  });
  page.on('requestfailed', (r) => {
    if (r.url().includes('/api/'))
      failed.push(`${r.method()} ${path(r.url())} → ${r.failure()?.errorText ?? 'failed'}`);
  });
  return {
    reset() {
      consoleErrors = [];
      failed = [];
    },
    async capture(route: string, shot: string): Promise<ScreenReport> {
      const heading = await page
        .getByRole('heading', { level: 2 })
        .first()
        .textContent({ timeout: 2_000 })
        .catch(() => null);
      const alerts = await page
        .getByRole('alert')
        .allTextContents()
        .catch(() => [] as string[]);
      mkdirSync(dirname(shot), { recursive: true });
      await page.screenshot({ path: shot, fullPage: true });
      return {
        route,
        heading,
        consoleErrors: [...new Set(consoleErrors)],
        failedRequests: [...new Set(failed)],
        alerts: [...new Set(alerts.map((a) => a.trim()).filter(Boolean))].map((a) => a.slice(0, 300)),
        screenshot: shot,
      };
    },
  };
}

export function writeReport(testInfo: TestInfo, name: string, data: unknown) {
  const file = testInfo.outputPath(`${name}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  return file;
}
