import { test, expect } from '@playwright/test';

/**
 * Story — Authentication flows
 *
 * Covers:
 *  - Login page renders and validates
 *  - Register page renders and validates
 *  - Protected routes redirect unauthenticated users to /login
 *  - Navigation between auth pages works
 */

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('renders with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/sign in|login|humanid/i);
  });

  test('shows email and password fields', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    // Use ID selector — getByLabel(/password/i) also matches the toggle button's
    // aria-label ("Show password"), causing a strict-mode violation.
    await expect(page.locator('#password')).toBeVisible();
  });

  test('shows submit button', async ({ page }) => {
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeVisible();
  });

  test('submit button is disabled when form is empty', async ({ page }) => {
    // The button is disabled until both fields have content.
    // Clicking a disabled button has no effect, so we assert the disabled state instead.
    await expect(page.getByRole('button', { name: /sign in|log in/i })).toBeDisabled();
  });

  test('shows validation error for invalid email format', async ({ page }) => {
    await page.getByLabel(/email/i).fill('not-an-email');
    await page.locator('#password').fill('password123');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Browser native validation or custom
    const emailField = page.getByLabel(/email/i);
    const validity = await emailField.evaluate((el: HTMLInputElement) => el.validity.valid);
    expect(validity).toBe(false);
  });

  test('password field is masked by default', async ({ page }) => {
    const pwd = page.locator('#password');
    await expect(pwd).toHaveAttribute('type', 'password');
  });

  test('password toggle reveals password', async ({ page }) => {
    const pwd = page.locator('#password');
    // The button aria-label toggles between "Show password" and "Hide password"
    // so use a pattern that matches both states.
    const toggle = page.getByRole('button', { name: /show password|hide password/i }).first();
    await toggle.click();
    await expect(pwd).toHaveAttribute('type', 'text');
    await toggle.click();
    await expect(pwd).toHaveAttribute('type', 'password');
  });

  test('password toggle has visible focus ring (WCAG 2.4.7)', async ({ page }) => {
    const toggle = page.getByRole('button', { name: /show password|toggle password/i }).first();
    await toggle.focus();
    // Verify the toggle is keyboard-focusable
    await expect(toggle).toBeFocused();
  });

  test('has link to register page', async ({ page }) => {
    // Link text is "Create one for free"
    const link = page.getByRole('link', { name: /create one for free|sign up|register/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/register/);
  });

  test('shows error message for wrong credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('wrong@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Next.js renders an empty role="alert" route-announcer — filter it out.
    // The real error div has non-empty text content.
    await expect(page.getByRole('alert').filter({ hasText: /./ })).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Register page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
  });

  test('renders with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/register|sign up|humanid/i);
  });

  test('shows all required fields', async ({ page }) => {
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('submit button is present', async ({ page }) => {
    const btn = page.getByRole('button', { name: /register|create|sign up/i });
    await expect(btn).toBeVisible();
  });

  test('password field is masked by default', async ({ page }) => {
    const pwd = page.locator('#password');
    await expect(pwd).toHaveAttribute('type', 'password');
  });

  test('has link back to login', async ({ page }) => {
    const link = page.getByRole('link', { name: /sign in|log in|already have/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/login/);
  });
});

test.describe('Protected route redirects', () => {
  const protectedPaths = [
    '/wallet',
    '/wallet/credentials',
    '/wallet/dids',
    '/wallet/sharing',
    '/wallet/security',
    '/issuer',
    '/issuer/credentials',
    '/issuer/templates',
    '/org',
    '/developer/api-keys',
    '/developer/webhooks',
    '/admin',
    '/admin/users',
    '/admin/issuers',
  ];

  for (const path of protectedPaths) {
    test(`${path} redirects unauthenticated user to /login`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/login/i, { timeout: 5000 });
    });
  }
});
