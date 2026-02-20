/**
 * DID Routes Integration Tests
 *
 * Tests for /api/v1/dids endpoints:
 * - POST /   (create DID)
 * - GET /:id (resolve DID)
 * - GET /    (list user's DIDs)
 * - PATCH /:id (update DID status)
 * - DELETE /:id (deactivate DID)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('DID Routes - /api/v1/dids', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;
  const testEmail = 'did-test@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-did-tests';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    // Create test user and login
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existing) {
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email: testEmail } });
    }

    const user = await prisma.user.create({
      data: { email: testEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    userId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: TEST_PASSWORD },
    });
    accessToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    // Clean up
    await prisma.dIDDocument.deleteMany({ where: { did: { userId } } });
    await prisma.dID.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST / (create DID) ====================

  describe('POST /api/v1/dids', () => {
    it('should create a new DID for the authenticated user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('did');
      // DID should use base58btc encoding (alphanumeric, no 0OIl)
      expect(body.did).toMatch(/^did:humanid:[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
      expect(body).toHaveProperty('publicKey');
      // Public key should be base58 encoded
      expect(body.publicKey).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
      expect(body.status).toBe('ACTIVE');
      expect(body.method).toBe('humanid');
    });

    it('should store encrypted private key in database', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      const body = res.json();
      const didRecord = await prisma.dID.findUnique({ where: { id: body.id } });
      expect(didRecord).not.toBeNull();
      // Private key should be encrypted (iv:tag:ciphertext format)
      expect(didRecord!.encryptedPrivateKey).toMatch(/^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    });

    it('should create a DID document alongside the DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();

      // Verify DID document was created
      const doc = await prisma.dIDDocument.findFirst({
        where: { didId: body.id },
      });
      expect(doc).not.toBeNull();
      expect(doc!.version).toBe(1);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        payload: {},
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== GET /:id (resolve DID) ====================

  describe('GET /api/v1/dids/:id', () => {
    let createdDidId: string;
    let createdDid: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });
      const body = res.json();
      createdDidId = body.id;
      createdDid = body.did;
    });

    it('should resolve a DID by its internal ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${createdDidId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(createdDidId);
      expect(body.did).toBe(createdDid);
      expect(body).toHaveProperty('document');
    });

    it('should return 404 for a non-existent DID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${createdDidId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== GET / (list user's DIDs) ====================

  describe('GET /api/v1/dids', () => {
    it('should list all DIDs for the authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.dids)).toBe(true);
      expect(body.dids.length).toBeGreaterThan(0);
      expect(body.dids[0]).toHaveProperty('did');
      expect(body.dids[0]).toHaveProperty('status');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dids',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== PATCH /:id (update DID status) ====================

  describe('PATCH /api/v1/dids/:id', () => {
    let suspendDidId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });
      suspendDidId = res.json().id;
    });

    it('should suspend a DID', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${suspendDidId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: 'SUSPENDED' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('SUSPENDED');
    });

    it('should reactivate a suspended DID', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${suspendDidId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: 'ACTIVE' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('ACTIVE');
    });

    it('should reject invalid status values', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${suspendDidId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { status: 'INVALID' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should not allow updating another user\'s DID', async () => {
      // Create another user
      const otherEmail = 'did-other@example.com';
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      const existing = await prisma.user.findUnique({ where: { email: otherEmail } });
      if (existing) {
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        await prisma.dID.deleteMany({ where: { userId: existing.id } });
        await prisma.user.delete({ where: { email: otherEmail } });
      }
      const otherUser = await prisma.user.create({
        data: { email: otherEmail, passwordHash, role: 'HOLDER', emailVerified: true },
      });

      const otherLogin = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: otherEmail, password: TEST_PASSWORD },
      });
      const otherToken = otherLogin.json().access_token;

      // Try to update the first user's DID
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${suspendDidId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { status: 'SUSPENDED' },
      });

      expect(res.statusCode).toBe(404);

      // Cleanup
      await prisma.session.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${suspendDidId}`,
        payload: { status: 'SUSPENDED' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== DELETE /:id (deactivate DID) ====================

  describe('DELETE /api/v1/dids/:id', () => {
    let deactivateDidId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });
      deactivateDidId = res.json().id;
    });

    it('should deactivate a DID (soft delete)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${deactivateDidId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('DEACTIVATED');
    });

    it('should not allow re-deactivating a deactivated DID', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${deactivateDidId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${deactivateDidId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
