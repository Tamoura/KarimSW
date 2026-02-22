import { defineConfig, devices } from '@playwright/test';

/**
 * HumanID Playwright E2E configuration.
 *
 * Web:  http://localhost:3117  (Next.js)
 * API:  http://localhost:5013  (Fastify)
 *
 * Run:  npm test          — all tests, headless Chromium
 *       npm run test:headed — visible browser
 *       npm run test:smoke  — smoke suite only
 */

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'playwright-report', open: 'never' }], ['list']],

  use: {
    baseURL: 'http://localhost:3117',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: [
    {
      command: 'cd ../apps/api && npm run dev',
      port: 5013,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: 'cd ../apps/web && npm run dev',
      port: 3117,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
