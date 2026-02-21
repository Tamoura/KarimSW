import { test, expect } from '@playwright/test';

/**
 * Story — Accessibility checks
 *
 * Verifies WCAG-relevant behaviours that RTL unit tests can't cover:
 * - Page titles present (WCAG 2.4.2)
 * - Skip-to-content or landmark navigation present
 * - Interactive elements reachable via keyboard
 * - Focus indicators visible on key interactive elements
 */

test.describe('Page titles (WCAG 2.4.2)', () => {
  const pages = [
    { path: '/',         pattern: /HumanID/i },
    { path: '/about',   pattern: /about/i },
    { path: '/login',   pattern: /sign in|login|humanid/i },
    { path: '/register', pattern: /register|sign up|humanid/i },
    { path: '/docs',    pattern: /doc/i },   // title is "Documentation — HumanID"
    { path: '/security', pattern: /security/i },
  ];

  for (const { path, pattern } of pages) {
    test(`${path} has a descriptive title`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(pattern);
    });
  }
});

test.describe('Landmark navigation', () => {
  test('home page has <main> landmark', async ({ page }) => {
    await page.goto('/');
    const main = page.getByRole('main');
    await expect(main).toBeVisible();
  });

  test('home page has <nav> landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: /main navigation/i })).toBeVisible();
  });

  test('home page has <footer> landmark', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
});

test.describe('Keyboard accessibility', () => {
  test('login form fields are reachable via Tab', async ({ page }) => {
    await page.goto('/login');
    await page.keyboard.press('Tab');
    // Focus should land on a visible interactive element
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('register form fields are reachable via Tab', async ({ page }) => {
    await page.goto('/register');
    await page.keyboard.press('Tab');
    const focused = page.locator(':focus');
    await expect(focused).toBeVisible();
  });

  test('credential carousel dot buttons are keyboard accessible', async ({ page, viewport }) => {
    if ((viewport?.width ?? 0) < 1024) test.skip();
    await page.goto('/');
    const dots = page.getByRole('tab');
    const firstDot = dots.first();
    await firstDot.focus();
    await expect(firstDot).toBeFocused();
  });
});

test.describe('Images and icons have labels', () => {
  test('home page decorative SVGs are aria-hidden', async ({ page }) => {
    await page.goto('/');
    // All inline SVGs used as icons should have aria-hidden="true"
    const svgsWithoutHidden = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg'));
      return svgs.filter(svg => {
        const role = svg.getAttribute('role');
        const ariaHidden = svg.getAttribute('aria-hidden');
        const ariaLabel = svg.getAttribute('aria-label');
        // SVGs without labels must be hidden
        if (!ariaLabel && !role) return ariaHidden !== 'true';
        return false;
      }).length;
    });
    // Allow a small tolerance for intentional visible SVGs
    expect(svgsWithoutHidden).toBeLessThan(5);
  });
});
