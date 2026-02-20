/**
 * App-level coverage tests
 * Tests /ready endpoint, metrics, global error handler, not-found handler,
 * and CORS behavior to boost app.ts and observability.ts branch coverage.
 */

import { buildApp } from '../../src/app';
import { FastifyInstance } from 'fastify';

describe('App infrastructure', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.INTERNAL_API_KEY = 'test-internal-key';
    app = await buildApp();
  });

  afterAll(async () => {
    delete process.env.INTERNAL_API_KEY;
    await app.close();
  });

  // /ready endpoint
  describe('GET /ready', () => {
    it('should return 200 when database is reachable', async () => {
      const res = await app.inject({ method: 'GET', url: '/ready' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ready' });
    });
  });

  // Not-found handler
  describe('404 handler', () => {
    it('should return RFC 7807 error for unknown routes', async () => {
      const res = await app.inject({ method: 'GET', url: '/nonexistent' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.type).toBe('https://humanid.dev/errors/not-found');
      expect(body.status).toBe(404);
      expect(body.detail).toContain('not found');
    });

    it('should return 404 for unknown API routes', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/nonexistent' });
      expect(res.statusCode).toBe(404);
    });
  });

  // Path parameter validation
  describe('Path parameter validation', () => {
    it('should reject :id with special characters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids/invalid<script>id',
        headers: { authorization: 'Bearer fake' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toBe('Invalid ID format');
    });

    it('should accept valid UUID :id format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids/00000000-0000-0000-0000-000000000000',
        headers: { authorization: 'Bearer fake' },
      });
      // Should not be a 400 for ID format (might be 401 for auth)
      expect(res.statusCode).not.toBe(400);
    });
  });

  // Observability metrics
  describe('GET /internal/metrics', () => {
    it('should return 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/internal/metrics' });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with wrong auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/internal/metrics',
        headers: { authorization: 'Bearer wrong-key' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return metrics with correct auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/internal/metrics',
        headers: { authorization: 'Bearer test-internal-key' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('requests');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('performance');
      expect(body.requests).toHaveProperty('total');
      expect(body.requests).toHaveProperty('by_status');
      expect(body.requests).toHaveProperty('by_method');
      expect(body.performance).toHaveProperty('avg_duration_ms');
      expect(body.performance).toHaveProperty('p50_ms');
      expect(body.performance).toHaveProperty('p95_ms');
      expect(body.performance).toHaveProperty('p99_ms');
    });
  });

  // OpenAPI endpoint
  describe('GET /api/v1/openapi.json', () => {
    it('should return OpenAPI 3.0 spec', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.openapi).toBe('3.0.3');
      expect(body.info.title).toBe('HumanID API');
      expect(body.paths).toBeDefined();
      expect(body.components.securitySchemes.BearerAuth).toBeDefined();
    });
  });

  // Security.txt
  describe('GET /.well-known/security.txt', () => {
    it('should return security contact info', async () => {
      const res = await app.inject({ method: 'GET', url: '/.well-known/security.txt' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      const body = res.payload;
      expect(body).toContain('Contact: security@humanid.dev');
      expect(body).toContain('Policy:');
      expect(body).toContain('Expires:');
    });
  });

  // Global error handler with Zod errors
  describe('Global error handler', () => {
    it('should handle validation errors with RFC 7807 format', async () => {
      // Send invalid body to an endpoint that uses Zod
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { email: 'not-an-email', password: '123' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
      expect(body.status).toBe(400);
    });
  });

  // Auth failure paths
  describe('Auth middleware', () => {
    it('should return 401 without authorization header', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/wallet/credentials' });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid auth format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/credentials',
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 401 with invalid JWT', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/credentials',
        headers: { authorization: 'Bearer invalid.jwt.token' },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
