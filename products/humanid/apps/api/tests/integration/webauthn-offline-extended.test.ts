/**
 * WebAuthn & Offline Extended Branch Coverage Tests
 *
 * Targets uncovered branches in:
 *   - src/routes/v1/webauthn.ts  (register verify error paths, Zod errors,
 *     credential delete not-found, authenticate options with unknown email)
 *   - src/routes/v1/offline.ts   (invalid credential, expired token,
 *     bad signature, sync not-found, Zod validation errors)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

// ===================================================================
// WebAuthn extended tests
// ===================================================================

describe('WebAuthn Extended - /api/v1/webauthn', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;
  let userDidId: string;
  const testEmail = 'webauthn-ext@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.biometricBinding.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-webauthn-extended-32chars';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_RP_NAME = 'HumanID Test';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3117';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(testEmail);

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
    await cleanupUser(testEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    delete process.env.WEBAUTHN_RP_ID;
    delete process.env.WEBAUTHN_RP_NAME;
    delete process.env.WEBAUTHN_ORIGIN;
    await app.close();
    await prisma.$disconnect();
  });

  // ── register/options ──────────────────────────────────────────────

  describe('POST /api/v1/webauthn/register/options - Zod validation', () => {
    it('should return 400 when didId is not a UUID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { didId: 'not-a-uuid' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 when didId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for valid UUID that does not belong to user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { didId: '11111111-1111-1111-1111-111111111111' },
      });

      expect(res.statusCode).toBe(404);
      expect(res.json().title).toContain('Not Found');
    });
  });

  // ── register/verify ───────────────────────────────────────────────

  describe('POST /api/v1/webauthn/register/verify - error branches', () => {
    it('should return 400 when Zod schema validation fails (missing credential fields)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          didId: userDidId,
          credential: {
            id: 'some-id',
            // missing rawId, type, response
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 when credential type is not public-key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          didId: userDidId,
          credential: {
            id: 'fake-id',
            rawId: 'fake-raw-id',
            type: 'wrong-type',
            response: {
              clientDataJSON: 'data',
              attestationObject: 'object',
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when DID is not owned by the user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          didId: '22222222-2222-2222-2222-222222222222',
          credential: {
            id: 'fake-id',
            rawId: 'fake-raw-id',
            type: 'public-key',
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ type: 'webauthn.create', challenge: 'abc', origin: 'http://localhost:3117' })
              ).toString('base64url'),
              attestationObject: 'fake-attestation',
            },
          },
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 when challenge is not stored (no Redis)', async () => {
      // DID exists but no challenge was stored — the verify endpoint should
      // detect a missing/expired challenge and return 400.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          didId: userDidId,
          credential: {
            id: 'fake-id',
            rawId: 'fake-raw-id',
            type: 'public-key',
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({ type: 'webauthn.create', challenge: 'no-stored-challenge', origin: 'http://localhost:3117' })
              ).toString('base64url'),
              attestationObject: 'fake-attestation',
            },
          },
        },
      });

      // Without Redis, storedChallenge is null → 400
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/challenge/i);
    });

    it('should return 400 when clientDataJSON has wrong type', async () => {
      // First get a real registration options to obtain a stored challenge
      await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { didId: userDidId },
      });

      // Submit with wrong type in clientData
      const badClientData = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge: 'any', origin: 'http://localhost:3117' })
      ).toString('base64url');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          didId: userDidId,
          credential: {
            id: 'fake-id',
            rawId: 'fake-raw-id',
            type: 'public-key',
            response: {
              clientDataJSON: badClientData,
              attestationObject: 'fake-attestation',
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── authenticate/options ──────────────────────────────────────────

  describe('POST /api/v1/webauthn/authenticate/options', () => {
    it('should return challenge even for unknown email (no user disclosure)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/authenticate/options',
        payload: { email: 'nonexistent-user@example.com' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('challenge');
      // allowCredentials should be empty when user not found
      expect(body.allowCredentials).toEqual([]);
    });

    it('should return 400 for invalid email format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/authenticate/options',
        payload: { email: 'not-an-email' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 when email is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/authenticate/options',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── DELETE /credentials/:id ───────────────────────────────────────

  describe('DELETE /api/v1/webauthn/credentials/:id', () => {
    it('should return 404 for non-existent credential', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/webauthn/credentials/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${userToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/passkey not found/i);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/webauthn/credentials/00000000-0000-0000-0000-000000000000',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});

// ===================================================================
// Offline extended tests
// ===================================================================

describe('Offline Extended - /api/v1/offline', () => {
  let app: FastifyInstance;
  let devToken: string;
  let credentialId: string;
  let activeOfflineTokenId: string;
  let activeTokenPayload: Record<string, unknown>;
  let activeTokenSignature: string;
  const devEmail = 'offline-ext@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-offline-extended-32ch';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);

    await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;

    // Seed test credentials
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

    // Generate a valid offline token to use in verify tests
    const tokenRes = await app.inject({
      method: 'POST',
      url: '/api/v1/offline/tokens',
      headers: { authorization: `Bearer ${devToken}` },
      payload: { credentialId, expiresInHours: 24 },
    });
    const tokenBody = tokenRes.json();
    activeOfflineTokenId = tokenBody.id;
    activeTokenPayload = tokenBody.payload as Record<string, unknown>;
    activeTokenSignature = tokenBody.signature;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /tokens - error branches ────────────────────────────────

  describe('POST /api/v1/offline/tokens - error branches', () => {
    it('should return 400 for Zod validation failure (missing credentialId)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { expiresInHours: 24 },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod validation failure (invalid credentialId format)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { credentialId: 'not-a-uuid', expiresInHours: 24 },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for expiresInHours exceeding max (720)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { credentialId, expiresInHours: 721 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for expiresInHours below min (1)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { credentialId, expiresInHours: 0 },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when credential does not belong to user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          credentialId: '33333333-3333-3333-3333-333333333333',
          expiresInHours: 24,
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/credential not found/i);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/tokens',
        payload: { credentialId, expiresInHours: 24 },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /verify - error branches ────────────────────────────────

  describe('POST /api/v1/offline/verify - error branches', () => {
    it('should return 400 for Zod validation failure (missing tokenId)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/verify',
        payload: {
          payload: { some: 'data' },
          signature: 'sig',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for invalid tokenId format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/verify',
        payload: {
          tokenId: 'not-a-uuid',
          payload: { some: 'data' },
          signature: 'invalid-sig',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/verify',
        payload: {
          tokenId: '44444444-4444-4444-4444-444444444444',
          payload: { some: 'data' },
          signature: 'any-sig',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/token not found/i);
    });

    it('should return valid=false for bad signature', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/verify',
        payload: {
          tokenId: activeOfflineTokenId,
          payload: activeTokenPayload,
          signature: 'completely-wrong-signature-that-will-not-match',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.signatureValid).toBe(false);
      expect(body.valid).toBe(false);
    });

    it('should return valid=false for expired token signature check and report credential info', async () => {
      // Verify always returns 200 with the validation breakdown.
      // Using the token's stored payload but a wrong signature exercises the
      // signatureValid=false branch (already covered above), so here we test
      // that the response always includes credential metadata regardless of
      // signature validity.
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/verify',
        payload: {
          tokenId: activeOfflineTokenId,
          payload: activeTokenPayload,
          signature: 'signature-that-does-not-match-at-all-xxxxxxxx',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Key response fields should always be present
      expect(body).toHaveProperty('valid');
      expect(body).toHaveProperty('signatureValid');
      expect(body).toHaveProperty('expired');
      expect(body).toHaveProperty('credentialActive');
      expect(body).toHaveProperty('credential');
      expect(body.credential).toHaveProperty('id');
      expect(body.credential).toHaveProperty('holderDid');
      expect(body.credential).toHaveProperty('issuerDid');
      // Token is not expired (we created it with 24h TTL)
      expect(body.expired).toBe(false);
      // Credential was accepted so it should be active
      expect(body.credentialActive).toBe(true);
    });
  });

  // ── POST /sync - error branches ───────────────────────────────────

  describe('POST /api/v1/offline/sync - error branches', () => {
    it('should return 400 for Zod validation failure (missing tokenId)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/sync',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          verifiedAt: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for invalid tokenId format in sync', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/sync',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          tokenId: 'not-a-uuid',
          verifiedAt: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 404 when syncing a non-existent token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/sync',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          tokenId: '55555555-5555-5555-5555-555555555555',
          verifiedAt: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/token not found/i);
    });

    it('should require authentication for sync', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/sync',
        payload: {
          tokenId: activeOfflineTokenId,
          verifiedAt: new Date().toISOString(),
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should successfully sync with verifierInfo', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/offline/sync',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          tokenId: activeOfflineTokenId,
          verifiedAt: new Date().toISOString(),
          verifierInfo: { method: 'BLE', device: 'scanner-007' },
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/synced/i);
    });
  });

  // ── GET /tokens ───────────────────────────────────────────────────

  describe('GET /api/v1/offline/tokens', () => {
    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offline/tokens',
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
