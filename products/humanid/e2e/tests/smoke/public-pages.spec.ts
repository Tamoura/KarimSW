import { test, expect } from '@playwright/test';

/**
 * Smoke — Public pages
 *
 * Verifies every public-facing page loads (HTTP 200, correct title,
 * no crash). Does not test functionality — just "does the page exist
 * and render without throwing".
 */

const publicPages = [
  { path: '/',                   titlePattern: /HumanID/i },
  { path: '/about',              titlePattern: /about/i },
  { path: '/docs',               titlePattern: /doc/i },   // title is "Documentation — HumanID"
  { path: '/docs/organizations', titlePattern: /organization/i },
  { path: '/docs/consumers',     titlePattern: /consumer|docs/i },
  { path: '/developer',          titlePattern: /developer/i },
  { path: '/developer/quickstart', titlePattern: /quickstart|developer/i },
  { path: '/developer/docs',     titlePattern: /api|developer/i },
  { path: '/developer/sandbox',  titlePattern: /sandbox|developer/i },
  { path: '/security',           titlePattern: /security/i },
  { path: '/compliance',         titlePattern: /compliance/i },
];

for (const { path, titlePattern } of publicPages) {
  test(`${path} loads without error`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(500);
    await expect(page).toHaveTitle(titlePattern);
  });
}
