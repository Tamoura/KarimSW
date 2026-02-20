/**
 * eIDAS 2.0 Compliance & EUDI Interop Integration Tests
 *
 * Tests for /api/v1/eidas endpoints:
 * - GET /status          (compliance readiness)
 * - POST /convert        (convert credential to SD-JWT-VC)
 * - GET /trust-framework (trust framework info)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('eIDAS 2.0 Compliance - /api/v1/eidas', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let credentialId: string;
  const devEmail = 'eidas-test@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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
    process.env.JWT_SECRET = 'test-jwt-secret-for-eidas';
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

    // Create a test credential for conversion tests
    const seedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/developer/sandbox/seed',
      headers: { authorization: `Bearer ${devToken}` },
    });
    const seedBody = seedRes.json();
    credentialId = seedBody.testCredentials[0].id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/eidas/status', () => {
    it('should return compliance status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/eidas/status',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('eidas2Ready');
      expect(body).toHaveProperty('eudiInterop');
      expect(body).toHaveProperty('supportedFormats');
      expect(body.supportedFormats).toContain('JSON-LD');
      expect(body.supportedFormats).toContain('SD-JWT-VC');
    });
  });

  describe('POST /api/v1/eidas/convert', () => {
    it('should convert credential to SD-JWT-VC format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          credentialId,
          targetFormat: 'SD-JWT-VC',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('originalFormat');
      expect(body).toHaveProperty('targetFormat', 'SD-JWT-VC');
      expect(body).toHaveProperty('converted');
      expect(body.converted).toHaveProperty('header');
      expect(body.converted).toHaveProperty('payload');
      expect(body.converted).toHaveProperty('disclosures');
    });

    it('should reject unknown format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          credentialId,
          targetFormat: 'UNKNOWN',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/eidas/trust-framework', () => {
    it('should return trust framework information', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/eidas/trust-framework',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('framework');
      expect(body).toHaveProperty('supportedCredentialTypes');
      expect(body).toHaveProperty('qualifiedIssuers');
    });
  });
});
