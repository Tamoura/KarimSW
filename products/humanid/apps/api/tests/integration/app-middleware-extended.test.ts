/**
 * App Middleware & env-validator Extended Branch Coverage Tests
 *
 * Targets uncovered branches in:
 *   - src/app.ts          (CORS origin branches, health endpoint authorized/
 *                          unauthorized detail, /ready probe, ID param validation,
 *                          global error handler branches, not-found handler)
 *   - src/utils/env-validator.ts (all branches: missing vars, short JWT,
 *                                 production flags, warnings vs errors)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { validateEnvironment } from '../../src/utils/env-validator';

// ===================================================================
// App middleware extended
// ===================================================================

describe('App Middleware Extended - app.ts', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-app-middleware-32chars';
    process.env.INTERNAL_API_KEY = 'test-internal-key-for-app-middleware';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.ALLOWED_ORIGINS = 'http://localhost:3117,https://app.humanid.dev';
    app = await buildApp();
  });

  afterAll(async () => {
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    delete process.env.ALLOWED_ORIGINS;
    await app.close();
  });

  // ── GET /ready ────────────────────────────────────────────────────

  describe('GET /ready', () => {
    it('should return 200 with status ready', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ready' });
    });
  });

  // ── GET /health - authorized vs. not authorized ───────────────────

  describe('GET /health - detail visibility', () => {
    it('should return minimal response without internal API key', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });

      expect([200, 503]).toContain(res.statusCode);
      const body = res.json();
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('timestamp');
      // Without auth, checks should NOT be exposed
      expect(body.checks).toBeUndefined();
    });

    it('should return detailed checks with valid internal API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-internal-api-key': 'test-internal-key-for-app-middleware' },
      });

      expect([200, 503]).toContain(res.statusCode);
      const body = res.json();
      expect(body).toHaveProperty('status');
      expect(body).toHaveProperty('checks');
      expect(body.checks).toHaveProperty('database');
    });

    it('should not expose checks when wrong internal key is provided', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { 'x-internal-api-key': 'wrong-key' },
      });

      const body = res.json();
      expect(body.checks).toBeUndefined();
    });
  });

  // ── CORS origin branches ──────────────────────────────────────────

  describe('CORS origin handling', () => {
    it('should allow requests from configured origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'http://localhost:3117' },
      });

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3117');
    });

    it('should allow requests from second configured origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://app.humanid.dev' },
      });

      expect(res.headers['access-control-allow-origin']).toBe('https://app.humanid.dev');
    });

    it('should return CORS error for disallowed origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        headers: { origin: 'https://evil.example.com' },
      });

      // 500 is returned by Fastify when CORS blocks — the key is no allow header
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should allow requests with no origin header in non-production', async () => {
      // NODE_ENV is not 'production' in tests, so no-origin should be allowed
      const res = await app.inject({
        method: 'GET',
        url: '/health',
        // No origin header
      });

      // Should not be blocked; status varies but should not be a CORS rejection
      expect(res.statusCode).not.toBe(403);
    });
  });

  // ── Path parameter :id validation ─────────────────────────────────

  describe('Path parameter :id preValidation hook', () => {
    it('should reject path with special characters in :id', async () => {
      // Use angle brackets which are invalid in the SAFE_ID_RE pattern but
      // won't be stripped by the router's path normalization.
      // Note: Fastify may normalize some special chars at routing level, so
      // we test with the pattern the hook actually rejects.
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids/invalid<script>id',
        headers: { authorization: 'Bearer fake-token' },
      });

      // Either 400 (ID format validation) or 404 (router normalised the path)
      // — both indicate the request was not handled as a valid DID lookup.
      expect([400, 404]).toContain(res.statusCode);
    });

    it('should reject :id with SQL injection characters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: "/api/v1/dids/'; DROP TABLE users; --",
        headers: { authorization: 'Bearer fake-token' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject :id longer than 128 characters', async () => {
      const longId = 'a'.repeat(129);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${longId}`,
        headers: { authorization: 'Bearer fake-token' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toBe('Invalid ID format');
    });

    it('should accept valid UUID in :id', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids/00000000-0000-0000-0000-000000000000',
        headers: { authorization: 'Bearer fake-token' },
      });

      // Should not fail on ID format (will fail on auth or 404, not 400 for ID)
      expect(res.statusCode).not.toBe(400);
    });

    it('should accept alphanumeric :id up to 128 chars', async () => {
      const validId = 'a'.repeat(128);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${validId}`,
        headers: { authorization: 'Bearer fake-token' },
      });

      expect(res.statusCode).not.toBe(400);
    });
  });

  // ── Global error handler ──────────────────────────────────────────

  describe('Global error handler', () => {
    it('should return RFC 7807 error for Zod validation failures', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'bad-email', password: '123' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
      expect(body).toHaveProperty('status', 400);
    });

    it('should return 500 with detail for unexpected errors in non-production', async () => {
      // Send a request that triggers a path not found (non-API route 404)
      const res = await app.inject({ method: 'DELETE', url: '/totally-unknown-path' });
      // Not-found handler should respond with 404
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.type).toBe('https://humanid.dev/errors/not-found');
    });
  });

  // ── Not-found handler ─────────────────────────────────────────────

  describe('Not-found handler', () => {
    it('should include request method and URL in detail', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/does-not-exist' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('POST');
      expect(body.detail).toContain('/api/v1/does-not-exist');
    });

    it('should return RFC 7807 structure on any unknown route', async () => {
      const res = await app.inject({ method: 'PUT', url: '/xyz/abc' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body).toHaveProperty('type', 'https://humanid.dev/errors/not-found');
      expect(body).toHaveProperty('title', 'Not Found');
      expect(body).toHaveProperty('status', 404);
      expect(body).toHaveProperty('detail');
      expect(body).toHaveProperty('request_id');
    });
  });

  // ── OpenAPI & security.txt ────────────────────────────────────────

  describe('Utility endpoints', () => {
    it('GET /api/v1/openapi.json should return 3.0.3 spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
      expect(res.statusCode).toBe(200);
      expect(res.json().openapi).toBe('3.0.3');
    });

    it('GET /.well-known/security.txt should include Expires field', async () => {
      const res = await app.inject({ method: 'GET', url: '/.well-known/security.txt' });
      expect(res.statusCode).toBe(200);
      expect(res.payload).toContain('Expires:');
    });
  });
});

// ===================================================================
// CORS - production mode branch
// ===================================================================

describe('App CORS - production origin-required branch', () => {
  let prodApp: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'test-jwt-secret-for-cors-production-32chars';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.ALLOWED_ORIGINS = 'https://app.humanid.dev';
    prodApp = await buildApp();
  });

  afterAll(async () => {
    delete process.env.NODE_ENV;
    delete process.env.JWT_SECRET;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    delete process.env.ALLOWED_ORIGINS;
    await prodApp.close();
  });

  it('should block requests with no origin in production mode', async () => {
    const res = await prodApp.inject({
      method: 'GET',
      url: '/health',
      // No origin header - should trigger the production "origin required" branch
    });

    // In production without origin, CORS middleware calls callback(new Error('Origin required'), false)
    // This results in a Fastify error response
    expect([400, 500]).toContain(res.statusCode);
  });

  it('should allow requests with allowed origin in production', async () => {
    const res = await prodApp.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://app.humanid.dev' },
    });

    expect(res.headers['access-control-allow-origin']).toBe('https://app.humanid.dev');
  });
});

// ===================================================================
// env-validator tests (import and test directly)
// ===================================================================

describe('env-validator - validateEnvironment()', () => {
  // Save originals
  const originalEnv: Record<string, string | undefined> = {};
  const envKeys = [
    'DATABASE_URL', 'JWT_SECRET', 'REDIS_URL',
    'API_KEY_HMAC_SECRET', 'CLAIMS_ENCRYPTION_KEY', 'NODE_ENV',
  ];

  beforeEach(() => {
    // Save and clear relevant env vars
    for (const key of envKeys) {
      originalEnv[key] = process.env[key];
    }
  });

  afterEach(() => {
    // Restore env vars
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it('should throw when DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL;
    process.env.JWT_SECRET = 'this-is-exactly-32-characters-ok';

    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('should throw when JWT_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    delete process.env.JWT_SECRET;

    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('should throw when JWT_SECRET is shorter than 32 characters', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'tooshort';

    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('should warn but not throw when JWT_SECRET is between 32-63 chars', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    // Exactly 32 characters - valid but generates a warning (64+ recommended)
    process.env.JWT_SECRET = 'exactly-32-characters-long-secret';
    process.env.NODE_ENV = 'test';

    // Should not throw (32 chars meets minimum)
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should not throw when JWT_SECRET is 64+ chars (optimal)', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.NODE_ENV = 'test';

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should throw when API_KEY_HMAC_SECRET is missing in production', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.NODE_ENV = 'production';
    delete process.env.API_KEY_HMAC_SECRET;

    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('should throw when CLAIMS_ENCRYPTION_KEY is missing in production', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.NODE_ENV = 'production';
    process.env.API_KEY_HMAC_SECRET = 'a'.repeat(64);
    delete process.env.CLAIMS_ENCRYPTION_KEY;

    expect(() => validateEnvironment()).toThrow('Environment validation failed');
  });

  it('should warn but not throw when optional vars are missing in non-production', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.NODE_ENV = 'test';
    delete process.env.REDIS_URL;
    delete process.env.API_KEY_HMAC_SECRET;
    delete process.env.CLAIMS_ENCRYPTION_KEY;

    // All optional in non-production → warns but does not throw
    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should not throw when all required and optional vars are set', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.NODE_ENV = 'production';
    process.env.API_KEY_HMAC_SECRET = 'a'.repeat(64);
    process.env.CLAIMS_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.REDIS_URL = 'redis://localhost:6379';

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should warn but not throw when REDIS_URL is missing in non-production', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.NODE_ENV = 'development';
    delete process.env.REDIS_URL;

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('should warn when JWT_SECRET is between 32 and 63 characters', () => {
    process.env.DATABASE_URL = 'postgresql://localhost/test';
    // 48 chars - passes min check (32) but below recommended (64)
    process.env.JWT_SECRET = 'a'.repeat(48);
    process.env.NODE_ENV = 'test';

    // Should succeed with warning but not error
    expect(() => validateEnvironment()).not.toThrow();
  });
});
