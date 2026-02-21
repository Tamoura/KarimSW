/**
 * Prometheus Metrics Endpoint Integration Tests (RISK-008)
 *
 * Verifies that GET /metrics exposes metrics in Prometheus text format.
 * A Prometheus server scraping this endpoint persists data externally,
 * making metrics survive API restarts.
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';

const INTERNAL_KEY = 'test-internal-key-prometheus';

describe('Prometheus metrics — GET /metrics', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-prometheus';
    process.env.INTERNAL_API_KEY = INTERNAL_KEY;
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();
  });

  afterAll(async () => {
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with wrong key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with correct internal key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${INTERNAL_KEY}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('responds with Prometheus text content-type', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${INTERNAL_KEY}` },
    });
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it('includes http_requests_total counter', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${INTERNAL_KEY}` },
    });
    expect(res.body).toMatch(/http_requests_total/);
  });

  it('includes http_request_duration_seconds histogram', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${INTERNAL_KEY}` },
    });
    expect(res.body).toMatch(/http_request_duration_seconds/);
  });

  it('includes process and Node.js default metrics', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${INTERNAL_KEY}` },
    });
    // prom-client collectDefaultMetrics emits these
    expect(res.body).toMatch(/process_cpu_seconds_total|nodejs_heap_size_used_bytes/);
  });

  it('increments http_requests_total after a request', async () => {
    // Make a health-check request first
    await app.inject({ method: 'GET', url: '/health' });

    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${INTERNAL_KEY}` },
    });
    // Counter should have at least one recorded request
    expect(res.body).toMatch(/http_requests_total\{[^}]*\} [1-9]/);
  });
});
