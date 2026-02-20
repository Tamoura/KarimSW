/**
 * Identity Federation Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/federation endpoints:
 * - POST /links with DID not owned (400)
 * - POST /links with Zod error (400)
 * - POST /links with various protocol types
 * - GET /links returns user's links
 * - POST /resolve with no match returns found:false
 * - POST /resolve with Zod error (400)
 * - DELETE /links/:id not found (404)
 * - DELETE /links/:id owned by different user (404)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Federation Extended - /api/v1/federation error branches', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let didId: string;

  let otherToken: string;
  let otherUserId: string;
  let otherDidId: string;

  const devEmail = 'fed-ext-dev@example.com';
  const otherEmail = 'fed-ext-other@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-fed-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);
    await cleanupUser(otherEmail);

    // Create dev user with DID
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

    // Create other user with DID
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    otherUserId = otherUser.id;
    const otherLoginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: otherEmail, password: TEST_PASSWORD },
    });
    otherToken = otherLoginRes.json().access_token;

    const otherDidRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {},
    });
    otherDidId = otherDidRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    await cleanupUser(otherEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST /links error branches ====================

  describe('POST /api/v1/federation/links', () => {
    it('should return 400 when DID not owned by user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: otherDidId,
          protocol: 'OIDC',
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('DID');
    });

    it('should return 400 for Zod error - missing protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'INVALID',
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing externalIssuer', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'OIDC',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing externalSubject', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'OIDC',
          externalIssuer: 'https://idp.example.com',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - invalid didId format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: 'not-a-uuid',
          protocol: 'OIDC',
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should create link with DID_VC protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'DID_VC',
          externalIssuer: 'did:example:issuer123',
          externalSubject: 'did:example:subject456',
          direction: 'EXPORT',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().protocol).toBe('DID_VC');
      expect(res.json().direction).toBe('EXPORT');
    });

    it('should create link with SAML protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'SAML',
          externalIssuer: 'https://saml-idp.enterprise.com',
          externalSubject: 'saml-user-789',
          direction: 'IMPORT',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().protocol).toBe('SAML');
      expect(res.json().direction).toBe('IMPORT');
    });

    it('should default direction to BIDIRECTIONAL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'OIDC',
          externalIssuer: 'https://default-dir.example.com',
          externalSubject: 'default-dir-user',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().direction).toBe('BIDIRECTIONAL');
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        payload: {
          didId: didId,
          protocol: 'OIDC',
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== GET /links ====================

  describe('GET /api/v1/federation/links', () => {
    it('should list only the authenticated user\'s links', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('links');
      expect(body).toHaveProperty('total');
      expect(body.links.length).toBeGreaterThan(0);
      for (const link of body.links) {
        expect(link).toHaveProperty('id');
        expect(link).toHaveProperty('protocol');
        expect(link).toHaveProperty('direction');
        expect(link).toHaveProperty('isActive');
      }
    });

    it('should return empty links for user with no federation links', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().links).toHaveLength(0);
    });
  });

  // ==================== POST /resolve error branches ====================

  describe('POST /api/v1/federation/resolve', () => {
    it('should return found:false when no match exists', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://nonexistent-idp.example.com',
          externalSubject: 'nonexistent-user',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.found).toBe(false);
      expect(body.didId).toBeNull();
    });

    it('should return found:true when different user resolves same link (global lookup)', async () => {
      // resolve is a global lookup by protocol/issuer/subject — not user-scoped
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${otherToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://default-dir.example.com',
          externalSubject: 'default-dir-user',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().found).toBe(true);
    });

    it('should return 400 for Zod error - missing protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - invalid protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          protocol: 'INVALID',
          externalIssuer: 'https://idp.example.com',
          externalSubject: 'user-123',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should successfully resolve an existing own link', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://default-dir.example.com',
          externalSubject: 'default-dir-user',
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.found).toBe(true);
      expect(body.didId).toBe(didId);
      expect(body.protocol).toBe('OIDC');
      expect(body.direction).toBe('BIDIRECTIONAL');
    });
  });

  // ==================== DELETE /links/:id error branches ====================

  describe('DELETE /api/v1/federation/links/:id', () => {
    it('should return 404 for non-existent link', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/federation/links/${fakeId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 404 when deleting link owned by different user', async () => {
      // Create a link for dev user
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'OIDC',
          externalIssuer: 'https://delete-test.example.com',
          externalSubject: 'delete-test-user',
        },
      });
      const linkId = createRes.json().id;

      // Other user tries to delete it
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/federation/links/${linkId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should successfully delete own link', async () => {
      // Create a link to delete
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: didId,
          protocol: 'OIDC',
          externalIssuer: 'https://deletable.example.com',
          externalSubject: 'deletable-user',
        },
      });
      const linkId = createRes.json().id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/federation/links/${linkId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain('removed');
    });
  });
});
