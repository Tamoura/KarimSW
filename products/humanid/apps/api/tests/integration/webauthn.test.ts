/**
 * FIDO2/WebAuthn Integration Tests
 *
 * Tests for /api/v1/webauthn endpoints:
 * - POST /register/options  (get registration options)
 * - POST /register/verify   (verify registration)
 * - POST /authenticate/options (get authentication options)
 * - POST /authenticate/verify  (verify authentication)
 * - GET /credentials         (list passkeys)
 * - DELETE /credentials/:id  (remove passkey)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('FIDO2/WebAuthn Routes - /api/v1/webauthn', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let userDidId: string;
  const testEmail = 'webauthn-test@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-webauthn';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_RP_NAME = 'HumanID Test';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3117';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { email: testEmail } });
    if (existing) {
      await prisma.biometricBinding.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
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
    userToken = loginRes.json().access_token;

    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${userToken}` },
      payload: {},
    });
    userDidId = didRes.json().id;
  });

  afterAll(async () => {
    await prisma.biometricBinding.deleteMany({ where: { did: { userId } } });
    await prisma.dIDDocument.deleteMany({ where: { did: { userId } } });
    await prisma.dID.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    delete process.env.WEBAUTHN_RP_ID;
    delete process.env.WEBAUTHN_RP_NAME;
    delete process.env.WEBAUTHN_ORIGIN;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== Registration ====================

  describe('POST /api/v1/webauthn/register/options', () => {
    it('should return registration options for authenticated user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { didId: userDidId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('challenge');
      expect(body).toHaveProperty('rp');
      expect(body.rp).toHaveProperty('name');
      expect(body.rp).toHaveProperty('id');
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('id');
      expect(body.user).toHaveProperty('name');
      expect(body).toHaveProperty('pubKeyCredParams');
      expect(body).toHaveProperty('timeout');
      expect(body).toHaveProperty('attestation');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        payload: { didId: userDidId },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should require a valid DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { didId: '00000000-0000-0000-0000-000000000000' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== List & Delete Credentials ====================

  describe('GET /api/v1/webauthn/credentials', () => {
    it('should list passkeys for the authenticated user', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webauthn/credentials',
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.credentials)).toBe(true);
      expect(body).toHaveProperty('total');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webauthn/credentials',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // Note: Full registration/authentication ceremony verification requires
  // browser-level WebAuthn API which cannot be fully tested in integration tests.
  // These tests verify the server-side option generation and credential management.
  describe('POST /api/v1/webauthn/register/verify', () => {
    it('should reject invalid attestation response', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          didId: userDidId,
          credential: {
            id: 'fake-credential-id',
            rawId: 'fake-raw-id',
            type: 'public-key',
            response: {
              clientDataJSON: 'fake-client-data',
              attestationObject: 'fake-attestation',
            },
          },
        },
      });

      // Should fail verification (not crash)
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/webauthn/authenticate/options', () => {
    it('should return authentication options', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/authenticate/options',
        payload: { email: testEmail },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('challenge');
      expect(body).toHaveProperty('timeout');
      expect(body).toHaveProperty('rpId');
    });
  });
});
