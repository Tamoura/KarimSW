/**
 * API Key Management Integration Tests
 *
 * Tests for /api/v1/developer/keys endpoints:
 * - POST /       (create API key)
 * - GET /        (list API keys)
 * - POST /:id/rotate  (rotate key)
 * - DELETE /:id  (revoke key)
 * - GET /usage   (usage stats)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('API Key Management - /api/v1/developer/keys', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  const devEmail = 'dev-keys@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-api-keys';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { email: devEmail } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email: devEmail } });
    }

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
    await prisma.apiKey.deleteMany({ where: { userId: devUserId } });
    await prisma.session.deleteMany({ where: { userId: devUserId } });
    await prisma.user.delete({ where: { id: devUserId } });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/developer/keys', () => {
    it('should create a new API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          name: 'Test Key',
          environment: 'SANDBOX',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('key');
      expect(body.key).toMatch(/^humanid_sk_/);
      expect(body.name).toBe('Test Key');
      expect(body.environment).toBe('SANDBOX');
      expect(body.status).toBe('ACTIVE');
    });

    it('should create a production API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          name: 'Prod Key',
          environment: 'PRODUCTION',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().key).toMatch(/^humanid_sk_/);
      expect(res.json().environment).toBe('PRODUCTION');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/keys',
        payload: { name: 'No Auth', environment: 'SANDBOX' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/developer/keys', () => {
    it('should list API keys for the user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.keys)).toBe(true);
      expect(body.keys.length).toBeGreaterThan(0);
      expect(body.keys[0]).toHaveProperty('id');
      expect(body.keys[0]).toHaveProperty('keyPrefix');
      expect(body.keys[0]).not.toHaveProperty('keyHash');
    });
  });

  describe('POST /api/v1/developer/keys/:id/rotate', () => {
    let rotateKeyId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { name: 'Rotate Me', environment: 'SANDBOX' },
      });
      rotateKeyId = res.json().id;
    });

    it('should rotate an API key and return a new one', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/developer/keys/${rotateKeyId}/rotate`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('key');
      expect(body.key).toMatch(/^humanid_sk_/);
      // New key should have a different ID (old one revoked, new one created)
      expect(body.id).not.toBe(rotateKeyId);
    });
  });

  describe('DELETE /api/v1/developer/keys/:id', () => {
    let revokeKeyId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { name: 'Revoke Me', environment: 'SANDBOX' },
      });
      revokeKeyId = res.json().id;
    });

    it('should revoke an API key', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/developer/keys/${revokeKeyId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('REVOKED');
    });

    it('should return 404 for non-existent key', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/developer/keys/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('API key authentication', () => {
    let apiKey: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { name: 'Auth Test Key', environment: 'SANDBOX' },
      });
      apiKey = res.json().key;
    });

    it('should authenticate with an API key', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${apiKey}` },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/developer/keys/usage', () => {
    it('should return usage stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/developer/keys/usage',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('totalKeys');
      expect(body).toHaveProperty('activeKeys');
      expect(body).toHaveProperty('totalRequests');
    });
  });
});
