/**
 * Credential Routes Integration Tests
 *
 * Tests for /api/v1/credentials endpoints:
 * - POST /           (issue credential)
 * - GET /            (list credentials)
 * - GET /:id         (get credential)
 * - POST /:id/revoke (revoke credential)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Credential Routes - /api/v1/credentials', () => {
  let app: FastifyInstance;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  const issuerEmail = 'cred-issuer@example.com';
  const holderEmail = 'cred-holder@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-cred-tests';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    // Helper to create user, login, and create DID
    async function setupUser(email: string, role: 'HOLDER' | 'ISSUER') {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        await prisma.credential.deleteMany({
          where: {
            OR: [
              { holderDid: { userId: existing.id } },
              { issuerDid: { userId: existing.id } },
            ],
          },
        });
        await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
        await prisma.dID.deleteMany({ where: { userId: existing.id } });
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        await prisma.user.delete({ where: { email } });
      }

      const user = await prisma.user.create({
        data: { email, passwordHash, role, emailVerified: true },
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: TEST_PASSWORD },
      });
      const token = loginRes.json().access_token;

      // Create a DID
      const didRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      const didId = didRes.json().id;

      return { user, token, didId };
    }

    const issuer = await setupUser(issuerEmail, 'ISSUER');
    issuerToken = issuer.token;
    issuerUserId = issuer.user.id;
    issuerDidId = issuer.didId;

    const holder = await setupUser(holderEmail, 'HOLDER');
    holderToken = holder.token;
    holderUserId = holder.user.id;
    holderDidId = holder.didId;
  });

  afterAll(async () => {
    // Clean up in order
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { issuerDid: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: {
        did: { userId: { in: [issuerUserId, holderUserId] } },
      },
    });
    await prisma.dID.deleteMany({
      where: { userId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [issuerUserId, holderUserId] } },
    });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST / (issue credential) ====================

  describe('POST /api/v1/credentials', () => {
    it('should issue a credential from issuer to holder', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'UniversityDegree',
          claims: {
            degree: 'Bachelor of Science',
            university: 'Test University',
            graduationYear: 2025,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.credentialType).toBe('UniversityDegree');
      expect(body.status).toBe('OFFERED');
      expect(body).toHaveProperty('credentialHash');
      expect(body).toHaveProperty('proof');
    });

    it('should reject when holder DID does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDidId: '00000000-0000-0000-0000-000000000000',
          issuerDidId,
          credentialType: 'UniversityDegree',
          claims: { degree: 'BSc' },
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should reject when issuer DID does not belong to the user', async () => {
      // Holder tries to issue using the issuer's DID
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'FakeCredential',
          claims: { fake: true },
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'TestCred',
          claims: {},
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { holderDidId },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== GET / (list credentials) ====================

  describe('GET /api/v1/credentials', () => {
    it('should list credentials for the authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.credentials)).toBe(true);
      expect(body).toHaveProperty('total');
    });

    it('should return credentials where user is issuer', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credentials?role=issuer',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.credentials.length).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credentials',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== GET /:id (get credential) ====================

  describe('GET /api/v1/credentials/:id', () => {
    let credentialId: string;

    beforeAll(async () => {
      // Issue a credential for this test suite
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'TestCredential',
          claims: { name: 'Test User', score: 95 },
        },
      });
      credentialId = res.json().id;
    });

    it('should return a specific credential', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credentials/${credentialId}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(credentialId);
      expect(body.credentialType).toBe('TestCredential');
    });

    it('should return 404 for non-existent credential', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credentials/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/credentials/${credentialId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== POST /:id/revoke (revoke credential) ====================

  describe('POST /api/v1/credentials/:id/revoke', () => {
    let revokeCredentialId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'RevokableCredential',
          claims: { data: 'to-be-revoked' },
        },
      });
      revokeCredentialId = res.json().id;
    });

    it('should revoke a credential as the issuer', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/credentials/${revokeCredentialId}/revoke`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { reason: 'Testing revocation' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('REVOKED');
      expect(body).toHaveProperty('revokedAt');
    });

    it('should not allow holder to revoke a credential', async () => {
      // Issue another credential for this test
      const issueRes = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'HolderCantRevoke',
          claims: { test: true },
        },
      });
      const credId = issueRes.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/credentials/${credId}/revoke`,
        headers: { authorization: `Bearer ${holderToken}` },
        payload: { reason: 'Holder trying to revoke' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should not allow revoking an already revoked credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/credentials/${revokeCredentialId}/revoke`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { reason: 'Double revocation' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/credentials/${revokeCredentialId}/revoke`,
        payload: { reason: 'No auth' },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
