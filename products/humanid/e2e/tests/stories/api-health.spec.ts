import { test, expect } from '@playwright/test';

/**
 * Story — API health & contract (via fetch from the browser context)
 *
 * Verifies the API is reachable and key public endpoints respond
 * correctly. These are black-box contract tests — no DB access.
 */

// Use 127.0.0.1 explicitly — Playwright resolves 'localhost' to ::1 (IPv6)
// but the API server binds to 127.0.0.1 (IPv4).
const API_BASE = 'http://127.0.0.1:5013';

test.describe('API health', () => {
  test('GET /health returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('status', 'healthy');
  });
});

test.describe('API authentication contract', () => {
  test('protected endpoint returns 401 without token', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/v1/wallet/credentials`);
    expect(res.status()).toBe(401);
  });

  test('POST /api/v1/auth/login returns 400 for missing body', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/login`, {
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test('POST /api/v1/auth/login returns 401 for wrong credentials', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/login`, {
      data: { email: 'nobody@example.com', password: 'wrongpassword' },
    });
    // Rate limiter may return 429 on repeated test runs — both indicate the
    // endpoint correctly rejects the request.
    expect([401, 429]).toContain(res.status());
  });

  test('POST /api/v1/auth/register returns 400 for invalid payload', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/v1/auth/register`, {
      data: { email: 'not-an-email', password: '123' },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('API metrics endpoint', () => {
  test('GET /metrics returns 401 without API key', async ({ request }) => {
    const res = await request.get(`${API_BASE}/metrics`);
    expect(res.status()).toBe(401);
  });

  test('GET /metrics returns 401 with wrong API key', async ({ request }) => {
    const res = await request.get(`${API_BASE}/metrics`, {
      headers: { Authorization: 'Bearer wrong-key' },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe('API pagination contract', () => {
  test('list endpoints return 401 without auth (not 500)', async ({ request }) => {
    const endpoints = [
      '/api/v1/dids/',
      '/api/v1/credentials/',
      '/api/v1/wallet/credentials',
    ];
    for (const ep of endpoints) {
      const res = await request.get(`${API_BASE}${ep}`);
      expect(res.status()).toBe(401);
    }
  });
});
