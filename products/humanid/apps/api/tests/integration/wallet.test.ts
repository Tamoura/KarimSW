/**
 * Wallet & Verification Routes Integration Tests
 *
 * Wallet: /api/v1/wallet
 * - GET /credentials        (holder's credential list)
 * - POST /credentials/:id/accept (accept an offered credential)
 *
 * Verify: /api/v1/verify
 * - POST /requests          (create verification request)
 * - GET /requests/:id       (get request status)
 * - GET /requests           (list verification requests)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Wallet & Verification Routes', () => {
  let app: FastifyInstance;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  let holderDid: string;
  let credentialId: string;
  const issuerEmail = 'wallet-issuer@example.com';
  const holderEmail = 'wallet-holder@example.com';

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
      await prisma.verificationRequest.deleteMany({ where: { verifierId: existing.id } });
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

    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    const didData = didRes.json();

    return { user, token, didId: didData.id, did: didData.did };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-wallet-tests';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const issuer = await setupUser(issuerEmail, 'ISSUER');
    issuerToken = issuer.token;
    issuerUserId = issuer.user.id;
    issuerDidId = issuer.didId;

    const holder = await setupUser(holderEmail, 'HOLDER');
    holderToken = holder.token;
    holderUserId = holder.user.id;
    holderDidId = holder.didId;
    holderDid = holder.did;

    // Issue a credential for wallet tests
    const credRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'WalletTestCredential',
        claims: { name: 'Wallet Test', level: 'Gold' },
      },
    });
    credentialId = credRes.json().id;
  });

  afterAll(async () => {
    await prisma.verificationRequest.deleteMany({
      where: { verifierId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { issuerDid: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: { did: { userId: { in: [issuerUserId, holderUserId] } } },
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

  // ==================== Wallet Routes ====================

  describe('GET /api/v1/wallet/credentials', () => {
    it('should list credentials in the holder wallet', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/credentials',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.credentials)).toBe(true);
      expect(body.credentials.length).toBeGreaterThan(0);
      expect(body.credentials[0]).toHaveProperty('credentialType');
      expect(body.credentials[0]).toHaveProperty('status');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/credentials',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/wallet/credentials/:id/accept', () => {
    it('should accept an offered credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/wallet/credentials/${credentialId}/accept`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ACTIVE');
      expect(body).toHaveProperty('acceptedAt');
    });

    it('should not allow accepting an already active credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/wallet/credentials/${credentialId}/accept`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should not allow issuer to accept a credential', async () => {
      // Issue another credential
      const credRes = await app.inject({
        method: 'POST',
        url: '/api/v1/credentials',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDidId,
          issuerDidId,
          credentialType: 'IssuerCantAccept',
          claims: { test: true },
        },
      });
      const newCredId = credRes.json().id;

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/wallet/credentials/${newCredId}/accept`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/wallet/credentials/${credentialId}/accept`,
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== Verification Routes ====================

  describe('POST /api/v1/verify/requests', () => {
    it('should create a verification request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/verify/requests',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDid,
          requestedAttributes: ['name', 'level'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('CREATED');
      expect(body.holderDid).toBe(holderDid);
    });

    it('should reject missing holderDid', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/verify/requests',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { requestedAttributes: ['name'] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/verify/requests',
        payload: { holderDid, requestedAttributes: ['name'] },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/verify/requests/:id', () => {
    let requestId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/verify/requests',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          holderDid,
          requestedAttributes: ['degree'],
        },
      });
      requestId = res.json().id;
    });

    it('should return a verification request by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/verify/requests/${requestId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(requestId);
      expect(body.status).toBe('CREATED');
    });

    it('should return 404 for non-existent request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/requests/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/verify/requests/${requestId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/verify/requests', () => {
    it('should list verification requests for the user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/requests',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.requests)).toBe(true);
      expect(body.requests.length).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/requests',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
