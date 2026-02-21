import { test, expect } from '@playwright/test';

/**
 * Smoke — Home page
 *
 * Verifies the public-facing landing page loads correctly,
 * all major sections are present, and key navigation links work.
 */

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/HumanID/i);
  });

  test('hero heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /identity layer/i, level: 1 })).toBeVisible();
  });

  test('primary CTA links to register', async ({ page }) => {
    const cta = page.getByRole('link', { name: /get your wallet/i }).first();
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/register');
  });

  test('navigation renders all main links', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    await expect(nav.getByRole('link', { name: /about/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /docs/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /developers/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('stats row shows platform numbers', async ({ page }) => {
    await expect(page.getByText(/wallet holders/i)).toBeVisible();
    await expect(page.getByText(/credentials issued/i)).toBeVisible();
    await expect(page.getByText(/uptime sla/i)).toBeVisible();
  });

  test('compliance strip shows standards', async ({ page }) => {
    // Scope to the compliance section to avoid matching duplicate text in
    // the open-standards section further down the page.
    const strip = page.getByRole('region', { name: 'Compliance standards' });
    await expect(strip.getByText(/W3C DID Core/i)).toBeVisible();
    await expect(strip.getByText(/GDPR/i)).toBeVisible();
    await expect(strip.getByText(/eIDAS/i)).toBeVisible();
  });

  test('"Who it\'s for" section shows 3 audience cards', async ({ page }) => {
    await expect(page.getByText(/own your identity/i)).toBeVisible();
    await expect(page.getByText(/build on open standards/i)).toBeVisible();
    await expect(page.getByText(/become a trusted issuer/i)).toBeVisible();
  });

  test('"How it works" shows 3 steps', async ({ page }) => {
    await expect(page.getByText(/from credential to verification in 3 steps/i)).toBeVisible();
    await expect(page.getByText(/^Issue$/i)).toBeVisible();
    await expect(page.getByText(/^Hold$/i)).toBeVisible();
    await expect(page.getByText(/^Verify$/i)).toBeVisible();
  });

  test('open standards section shows protocols', async ({ page }) => {
    // Scope to the open-standards section — "W3C Verifiable Credentials" also
    // appears in the compliance strip above.
    const standards = page.getByRole('region', { name: /built on protocols you can trust/i });
    await expect(standards).toBeVisible();
    await expect(standards.getByText(/W3C Verifiable Credentials/i)).toBeVisible();
    await expect(standards.getByText(/Zero-Knowledge Proofs/i)).toBeVisible();
  });

  test('footer renders product and company links', async ({ page }) => {
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: /privacy policy/i })).toBeVisible();
    await expect(footer.getByRole('link', { name: /terms of service/i })).toBeVisible();
  });

  test('credential carousel is visible on desktop', async ({ page, viewport }) => {
    // Only present on lg breakpoint (1024px+)
    if ((viewport?.width ?? 0) >= 1024) {
      await expect(page.getByLabel(/credential examples carousel/i)).toBeVisible();
    }
  });
});
