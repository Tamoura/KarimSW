/**
 * Offline Credential Presentation Integration Tests
 *
 * Tests for /api/v1/offline endpoints:
 * - POST /tokens          (generate offline token for credential)
 * - GET /tokens           (list user's offline tokens)
 * - POST /verify          (verify offline presentation)
 * - POST /sync            (sync offline verification back)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Offline Credentials - /api/v1/offline', () => {
  let app: FastifyInstance;
  let devToken: string;
  let credentialId: string;
  let offlineTokenId: string;
  const devEmail = 'offline-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.offlineToken.deleteMany({ where: { userId: existing.id } });
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-offline';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);

    await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;

    // Seed test data via sandbox
    const seedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/developer/sandbox/seed',
      headers: { authorization: `Bearer ${devToken}` },
    });
    credentialId = seedRes.json().testCredentials[0].id;

    // Accept the credential to make it ACTIVE
    await app.inject({
      method: 'POST',
      url: `/api/v1/wallet/credentials/${credentialId}/accept`,
      headers: { authorization: `Bearer ${devToken}` },
    });
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/offline/tokens', () => {
    it('should generate offline token for credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          credentialId,
          expiresInHours: 48,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('payload');
      expect(body).toHaveProperty('signature');
      expect(body).toHaveProperty('expiresAt');
      expect(body.payload).toHaveProperty('credential');
      expect(body.payload).toHaveProperty('issuerDid');
      offlineTokenId = body.id;
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/offline/tokens',
        payload: { credentialId, expiresInHours: 24 },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/offline/tokens', () => {
    it('should list offline tokens', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('tokens');
      expect(body.tokens.length).toBeGreaterThan(0);
    });
  });

  let savedPayload: Record<string, unknown>;
  let savedSignature: string;

  describe('POST /api/v1/offline/verify', () => {
    it('should verify offline presentation', async () => {
      // First get the token payload from the list
      const tokenRes = await app.inject({
        method: 'GET',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
      });
      const tokens = tokenRes.json().tokens;
      const token = tokens.find((t: { id: string }) => t.id === offlineTokenId);
      savedPayload = token.payload;
      savedSignature = token.signature;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/verify',
        payload: {
          tokenId: offlineTokenId,
          payload: savedPayload,
          signature: savedSignature,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('valid');
      expect(body).toHaveProperty('credential');
      expect(body).toHaveProperty('expiresAt');
    });
  });

  describe('POST /api/v1/offline/sync', () => {
    it('should sync offline verification back', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/sync',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          tokenId: offlineTokenId,
          verifiedAt: new Date().toISOString(),
          verifierInfo: { method: 'NFC', device: 'reader-001' },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toMatch(/synced/i);
    });
  });
});
