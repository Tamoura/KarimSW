/**
 * Sandbox Environment Integration Tests
 *
 * Tests for /api/v1/developer/sandbox endpoints:
 * - POST /seed     (generate test data)
 * - GET /status    (sandbox status)
 * - POST /reset    (reset sandbox data)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Sandbox Environment - /api/v1/developer/sandbox', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  const devEmail = 'sandbox-test@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-sandbox';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { email: devEmail } });
    if (existing) {
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
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
    await prisma.credential.deleteMany({
      where: { OR: [{ holderDid: { userId: devUserId } }, { issuerDid: { userId: devUserId } }] },
    });
    await prisma.dIDDocument.deleteMany({ where: { did: { userId: devUserId } } });
    await prisma.dID.deleteMany({ where: { userId: devUserId } });
    await prisma.apiKey.deleteMany({ where: { userId: devUserId } });
    await prisma.session.deleteMany({ where: { userId: devUserId } });
    await prisma.user.delete({ where: { id: devUserId } });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/developer/sandbox/seed', () => {
    it('should generate test DIDs and credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/sandbox/seed',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('testDids');
      expect(body).toHaveProperty('testCredentials');
      expect(body.testDids.length).toBeGreaterThan(0);
      expect(body.testCredentials.length).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/sandbox/seed',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/developer/sandbox/status', () => {
    it('should return sandbox environment status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/developer/sandbox/status',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('environment');
      expect(body).toHaveProperty('didCount');
      expect(body).toHaveProperty('credentialCount');
    });
  });
});
