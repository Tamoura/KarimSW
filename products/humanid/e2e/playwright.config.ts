import { defineConfig, devices } from '@playwright/test';
import path from 'path';

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

// Absolute paths from this config file — avoids shell `cd` issues in CI.
const apiDir = path.join(__dirname, '../apps/api');
const webDir = path.join(__dirname, '../apps/web');

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
      // Use tsx directly (no watch mode in CI) with explicit cwd.
      command: 'node_modules/.bin/tsx src/index.ts',
      cwd: apiDir,
      port: 5013,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      cwd: webDir,
      port: 3117,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      // Next.js compilation in CI can be slow — allow up to 3 minutes.
      timeout: 180_000,
    },
  ],
});
