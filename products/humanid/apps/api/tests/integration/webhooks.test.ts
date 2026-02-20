/**
 * Webhook Notification System Integration Tests
 *
 * Tests for /api/v1/webhooks endpoints:
 * - POST /           (create webhook)
 * - GET /            (list webhooks)
 * - GET /:id         (get webhook)
 * - DELETE /:id      (delete webhook)
 * - POST /:id/test   (test webhook)
 * - GET /:id/deliveries (delivery log)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Webhooks - /api/v1/webhooks', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let webhookId: string;
  const devEmail = 'webhook-test@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.webhookDelivery.deleteMany({ where: { webhook: { userId: existing.id } } });
      await prisma.webhook.deleteMany({ where: { userId: existing.id } });
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-webhooks';
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
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/webhooks', () => {
    it('should create a webhook', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          url: 'https://example.com/webhook',
          events: ['credential.issued', 'credential.revoked'],
          description: 'Test webhook',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('secret');
      expect(body.url).toBe('https://example.com/webhook');
      expect(body.events).toContain('credential.issued');
      expect(body.status).toBe('ACTIVE');
      webhookId = body.id;
    });

    it('should reject invalid URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { url: 'not-a-url', events: ['credential.issued'] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webhooks',
        payload: { url: 'https://example.com/hook', events: ['did.created'] },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/webhooks', () => {
    it('should list webhooks', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.webhooks.length).toBeGreaterThan(0);
      expect(body).toHaveProperty('total');
    });
  });

  describe('GET /api/v1/webhooks/:id', () => {
    it('should get webhook details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/webhooks/${webhookId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(webhookId);
      expect(body.url).toBe('https://example.com/webhook');
    });
  });

  describe('POST /api/v1/webhooks/:id/test', () => {
    it('should send a test delivery', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/${webhookId}/test`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('deliveryId');
      expect(body).toHaveProperty('status');
    });
  });

  describe('GET /api/v1/webhooks/:id/deliveries', () => {
    it('should list delivery log', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/webhooks/${webhookId}/deliveries`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('deliveries');
      expect(body).toHaveProperty('total');
    });
  });

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('should delete a webhook', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/webhooks/${webhookId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/deleted/i);
    });
  });
});
