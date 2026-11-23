import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests for the three core flows. They need the Firebase emulators
 * (started by `npm run e2e`) and the web app in dev mode, which Playwright
 * starts here unless one is already running on port 3000.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Pixel 5'],
    baseURL: 'http://localhost:3000',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev -w @hatod/web',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
