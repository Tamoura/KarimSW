import { test, expect } from '@playwright/test';

/**
 * Story — Navigation & routing
 *
 * Verifies that links across the site navigate to the correct pages
 * and that the sticky navigation is always reachable.
 */

test.describe('Home navigation links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('About link navigates to /about', async ({ page }) => {
    await page.getByRole('navigation', { name: /main navigation/i })
      .getByRole('link', { name: /about/i }).click();
    await expect(page).toHaveURL(/about/);
    await expect(page).toHaveTitle(/about/i);
  });

  test('Docs link navigates to /docs', async ({ page }) => {
    await page.getByRole('navigation', { name: /main navigation/i })
      .getByRole('link', { name: /docs/i }).click();
    await expect(page).toHaveURL(/docs/);
  });

  test('Sign In link navigates to /login', async ({ page }) => {
    await page.getByRole('link', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/login/);
  });

  test('"Get Your Wallet" CTA navigates to /register', async ({ page }) => {
    await page.getByRole('link', { name: /get your wallet/i }).first().click();
    await expect(page).toHaveURL(/register/);
  });

  test('"For Organizations" link navigates to /docs/organizations', async ({ page }) => {
    await page.getByRole('navigation', { name: /main navigation/i })
      .getByRole('link', { name: /for organizations/i }).click();
    await expect(page).toHaveURL(/docs\/organizations/);
  });

  test('HumanID logo is a link back to home', async ({ page }) => {
    // Navigate away, then use logo. The about page nav uses "HumanID" as the
    // link's accessible name (the home page adds " home" via aria-label, but
    // the shared nav on inner pages just has the text span "HumanID").
    await page.goto('/about');
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    await nav.getByRole('link', { name: /^humanid/i }).first().click();
    await expect(page).toHaveURL('/');
  });
});

test.describe('Docs navigation', () => {
  test('consumer guide link works from docs hub', async ({ page }) => {
    await page.goto('/docs');
    const link = page.getByRole('link', { name: /consumer guide/i }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/docs\/consumers/);
  });

  test('organisation guide link works from docs hub', async ({ page }) => {
    await page.goto('/docs');
    // The docs page uses British spelling: "Organisation Guide"
    const link = page.getByRole('link', { name: /organisation|organization/i }).first();
    await expect(link).toBeVisible();
  });
});

test.describe('Sticky navigation stays visible', () => {
  test('nav remains visible after scrolling', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, 1000));
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    await expect(nav).toBeVisible();
    // Verify it's sticky (top: 0)
    const top = await nav.evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeLessThanOrEqual(1);
  });
});
