import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the demo build (in-browser mock of the SysAdmin API),
 * so they need no IRIS instance and are fully deterministic.
 */
export default defineConfig({
  testDir: './e2e',
  // The live run against a real instance has its own config (playwright.live.config.ts).
  testIgnore: ['live/**'],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build:demo && npm run preview:demo',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
