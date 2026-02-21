/**
 * Identity Federation Bridge Integration Tests
 *
 * Tests for /api/v1/federation endpoints:
 * - POST /links          (create federation link)
 * - GET /links           (list federation links)
 * - POST /resolve        (resolve federated identity)
 * - DELETE /links/:id    (remove federation link)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Identity Federation - /api/v1/federation', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let didId: string;
  let linkId: string;
  const devEmail = 'federation-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.federationLink.deleteMany({ where: { userId: existing.id } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-federation';
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

    const didRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    didId = didRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/federation/links', () => {
    it('should create a federation link', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId,
          protocol: 'OIDC',
          externalIssuer: 'https://accounts.google.com',
          externalSubject: 'google-user-123',
          direction: 'BIDIRECTIONAL',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.protocol).toBe('OIDC');
      expect(body.externalIssuer).toBe('https://accounts.google.com');
      linkId = body.id;
    });

    it('should create SAML federation link', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId,
          protocol: 'SAML',
          externalIssuer: 'https://idp.enterprise.com',
          externalSubject: 'saml-user-456',
          direction: 'IMPORT',
        },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('GET /api/v1/federation/links', () => {
    it('should list federation links', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('links');
      expect(body.links.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('POST /api/v1/federation/resolve', () => {
    it('should resolve federated identity', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://accounts.google.com',
          externalSubject: 'google-user-123',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('found', true);
      expect(body).toHaveProperty('didId');
      expect(body).not.toHaveProperty('userId');
    });
  });

  describe('DELETE /api/v1/federation/links/:id', () => {
    it('should remove federation link', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/federation/links/${linkId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/removed/i);
    });
  });
});
