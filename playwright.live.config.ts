import { defineConfig, devices } from '@playwright/test';
import { homedir } from 'node:os';

/**
 * Opt-in end-to-end run against a real IRIS instance (the default config uses the in-browser
 * mock and needs none). Nothing runs unless IRIS_URL is set. Credentials are read from the
 * environment, normally from an env file outside the repository:
 *
 *   APERTURE_LIVE_ENV=~/.aperture/iris-live.env npx playwright test -c playwright.live.config.ts
 *
 * IRIS_URL, IRIS_USER / IRIS_PASSWORD (administrator), IRIS_OP_USER / IRIS_OP_PASSWORD
 * (%Operator only). The Vite dev server proxies /api/admin and /api/monitor to IRIS_URL, so the
 * instance needs no CORS configuration.
 *
 * The browser runs in America/New_York unless LIVE_TZ says otherwise: an instance-local time
 * mistaken for browser-local only shows when the two zones differ.
 *
 * Specs that change the instance are tagged @mutate and excluded unless LIVE_MUTATE=1.
 */
const envFile = process.env.APERTURE_LIVE_ENV?.replace(/^~(?=$|[\\/])/, homedir());
if (envFile) process.loadEnvFile(envFile);

const PORT = 5199;
const IRIS_URL = process.env.IRIS_URL;

export default defineConfig({
  testDir: './e2e/live',
  outputDir: 'test-results/live',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  grepInvert: process.env.LIVE_MUTATE === '1' ? undefined : /@mutate/,
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: process.env.LIVE_TZ ?? 'America/New_York',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'live', use: { ...devices['Desktop Chrome'] } }],
  webServer: IRIS_URL
    ? {
        // vite itself rather than `npx vite`, so stopping the run stops the server.
        command: `node node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
        env: { VITE_IRIS_URL: IRIS_URL },
        url: `http://localhost:${PORT}`,
        reuseExistingServer: true,
        timeout: 60_000,
      }
    : undefined,
});
