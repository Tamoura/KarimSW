import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3213',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'cd apps/api && npx tsx src/index.ts',
      port: 5109,
      reuseExistingServer: true,
      timeout: 15000,
    },
    {
      command: 'cd apps/web && npx vite --port 3213',
      port: 3213,
      reuseExistingServer: true,
      timeout: 15000,
    },
  ],
});
