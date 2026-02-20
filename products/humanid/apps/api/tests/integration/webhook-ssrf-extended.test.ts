/**
 * Webhook SSRF / Audit / Issuers / DID Extended Branch Coverage
 *
 * Targets uncovered branches in:
 *   - webhooks.ts: SSRF validation patterns (localhost, private IPs, internal domains)
 *   - webhooks.ts: Zod errors, event validation, pagination
 *   - audit.ts: export format, date filters, integrity check
 *   - issuers.ts: error branches
 *   - dids.ts: status update error branches
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Webhook SSRF & Extended Branch Coverage', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  const devEmail = 'wh-ssrf-ext@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.webhookDelivery.deleteMany({
        where: { webhook: { userId: existing.id } },
      });
      await prisma.webhook.deleteMany({ where: { userId: existing.id } });
      await prisma.credential.deleteMany({ where: { holderDid: { userId: existing.id } } });
      const dids = await prisma.dID.findMany({ where: { userId: existing.id } });
      for (const did of dids) {
        await prisma.dIDDocument.deleteMany({ where: { didId: did.id } });
      }
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-wh-ssrf-ext-32chars';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);

    const user = await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    devUserId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ==================== SSRF Protection ====================

  describe('POST /api/v1/webhooks - SSRF protection', () => {
    const ssrfUrls = [
      { url: 'http://localhost/hook', label: 'localhost' },
      { url: 'http://127.0.0.1/hook', label: '127.x loopback' },
      { url: 'http://127.0.0.99/hook', label: '127.x variant' },
      { url: 'http://10.0.0.1/hook', label: '10.x private' },
      { url: 'http://172.16.0.1/hook', label: '172.16.x private' },
      { url: 'http://172.31.255.1/hook', label: '172.31.x private' },
      { url: 'http://192.168.1.1/hook', label: '192.168.x private' },
      { url: 'http://169.254.169.254/hook', label: '169.254.x link-local' },
      { url: 'http://0.0.0.0/hook', label: '0.0.0.0' },
      { url: 'http://[::1]/hook', label: 'IPv6 loopback' },
      { url: 'http://something.internal/hook', label: '.internal domain' },
      { url: 'http://something.local/hook', label: '.local domain' },
      { url: 'http://something.localhost/hook', label: '.localhost domain' },
    ];

    for (const { url, label } of ssrfUrls) {
      it(`should block ${label} (${url})`, async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/webhooks',
          headers: { authorization: `Bearer ${devToken}` },
          payload: { url, events: ['credential.issued'] },
        });
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.detail).toContain('private or internal');
      });
    }

    it('should reject invalid event types', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          url: 'https://example.com/hook',
          events: ['invalid.event'],
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('Invalid event type');
    });

    it('should reject missing URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { events: ['credential.issued'] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject empty events array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { url: 'https://example.com/hook', events: [] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject non-HTTP protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { url: 'ftp://example.com/hook', events: ['credential.issued'] },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should accept valid public URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          url: 'https://hooks.example.com/humanid',
          events: ['credential.issued', 'did.created'],
          description: 'Test webhook',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.secret).toMatch(/^whsec_/);
      expect(body.events).toEqual(['credential.issued', 'did.created']);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: {
          url: 'https://hooks.example.com/humanid',
          events: ['credential.issued'],
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== Webhook List/Get/Delete ====================

  describe('GET /api/v1/webhooks', () => {
    it('should list webhooks with pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks?page=1&limit=10',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().webhooks).toBeDefined();
    });

    it('should require auth for listing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/webhooks/:id', () => {
    it('should return 404 for non-existent webhook', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/webhooks/${randomUUID()}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('should return 404 for non-existent webhook', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${randomUUID()}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/webhooks/:id/test', () => {
    it('should return 404 for non-existent webhook', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/${randomUUID()}/test`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/webhooks/:id/deliveries', () => {
    it('should return 404 for non-existent webhook deliveries', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/webhooks/${randomUUID()}/deliveries`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== Audit Extended ====================

  describe('GET /api/v1/audit/events', () => {
    it('should filter by date range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events?from=2020-01-01&to=2030-01-01',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('should filter by action', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events?action=LOGIN',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('should filter by entityType', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events?entityType=USER',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('should paginate with page and limit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events?page=2&limit=5',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/audit/events/export', () => {
    it('should export as JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=json',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('should export as CSV', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=csv',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
    });

    it('should filter exports by date', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=json&from=2020-01-01',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/audit/events/verify', () => {
    it('should verify audit event chain', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/verify',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveProperty('intact');
    });
  });

  // ==================== Issuers Extended ====================

  describe('GET /api/v1/issuers/me', () => {
    it('should return 404 when no issuer profile exists', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/me',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/issuers/me', () => {
    it('should return 404 when no issuer profile exists', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/issuers/me',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { name: 'Updated' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/issuers/register', () => {
    it('should reject registration with Zod error - missing organizationName', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { didId: randomUUID() },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject registration with non-existent DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { didId: randomUUID(), organizationName: 'Test Issuer' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== DID Status Updates ====================

  describe('PATCH /api/v1/dids/:id', () => {
    it('should return 404 for non-existent DID', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${randomUUID()}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'SUSPENDED' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/dids/:id', () => {
    it('should return 404 for non-existent DID', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${randomUUID()}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/dids/:id', () => {
    it('should return 404 for non-existent DID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${randomUUID()}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
