import { test, expect } from '@playwright/test';

/**
 * Story — Wallet pages (unauthenticated behaviour)
 *
 * Full wallet functionality requires an authenticated session.
 * These tests verify the unauthenticated gate, page structure,
 * and any public-facing wallet pages load correctly.
 *
 * Authenticated wallet flows are covered in stories/auth-wallet.spec.ts
 * (requires test user seeding — skipped in environments without a live DB).
 */

test.describe('Wallet — unauthenticated redirects', () => {
  const walletPaths = [
    '/wallet',
    '/wallet/credentials',
    '/wallet/dids',
    '/wallet/sharing',
    '/wallet/security',
  ];

  for (const path of walletPaths) {
    test(`${path} redirects to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/login/, { timeout: 5000 });
    });
  }
});

test.describe('Verify email page', () => {
  test('loads without error', async ({ page }) => {
    const response = await page.goto('/verify-email');
    expect(response?.status()).toBeLessThan(500);
  });
});
