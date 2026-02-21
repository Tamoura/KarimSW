/**
 * DID & WebAuthn Branch Coverage Tests
 *
 * Targets specific uncovered branches in:
 *   - src/routes/v1/dids.ts     (deactivated-DID guard on PATCH, deactivated-DID
 *                                 guard on DELETE, Zod validation on PATCH,
 *                                 latestDoc truthy branch on GET /:id)
 *   - src/routes/v1/webauthn.ts (register/options DID-not-found, register/options
 *                                 success, register/verify DID-not-found,
 *                                 register/verify Zod error, authenticate/options
 *                                 non-existent user, authenticate/options existing
 *                                 user, GET /credentials empty list,
 *                                 DELETE /credentials/:id not-found)
 *
 * Test user: did-wa-branches@example.com / Test123!@#  role: DEVELOPER
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_EMAIL = 'did-wa-branches@example.com';
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

async function cleanupTestUser(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) return;

  await prisma.biometricBinding.deleteMany({
    where: { did: { userId: existing.id } },
  });
  await prisma.dIDDocument.deleteMany({
    where: { did: { userId: existing.id } },
  });
  await prisma.dID.deleteMany({ where: { userId: existing.id } });
  await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
  await prisma.session.deleteMany({ where: { userId: existing.id } });
  await prisma.user.delete({ where: { email } });
}

// ===================================================================
// DID Branch Tests
// ===================================================================

describe('DID Branch Coverage - /api/v1/dids', () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;
  let activeDid: string;   // DID created in beforeAll (has a document)
  let deactivatedDid: string; // DID that gets deactivated during tests

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-did-wa-branches-32ch';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    app = await buildApp();

    await cleanupTestUser(TEST_EMAIL);

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        role: 'DEVELOPER',
        emailVerified: true,
      },
    });
    userId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    token = loginRes.json().access_token;

    // Create the primary DID used across tests
    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    activeDid = didRes.json().id;

    // Create a second DID that will be deactivated by the DELETE test below
    const didRes2 = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    deactivatedDid = didRes2.json().id;

    // Deactivate it now so subsequent tests can exercise the guard branches
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/dids/${deactivatedDid}`,
      headers: { authorization: `Bearer ${token}` },
    });
  });

  afterAll(async () => {
    await cleanupTestUser(TEST_EMAIL);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── GET /:id — DID with document (latestDoc truthy branch, line 148) ─

  describe('GET /api/v1/dids/:id - DID with document', () => {
    it('should return document and documentVersion when a DID document exists', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${activeDid}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(activeDid);
      // The DID was created via POST which always creates a DID document,
      // so the latestDoc truthy branch should be exercised.
      expect(body.document).not.toBeNull();
      expect(body.documentVersion).not.toBeNull();
      expect(typeof body.documentVersion).toBe('number');
    });
  });

  // ── PATCH /:id — deactivated DID guard (lines 185-186) ──────────────

  describe('PATCH /api/v1/dids/:id - deactivated DID', () => {
    it('should return 400 with correct message when trying to update a deactivated DID', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${deactivatedDid}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'ACTIVE' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/cannot update a deactivated did/i);
    });
  });

  // ── PATCH /:id — Zod validation error (lines 209-217) ───────────────

  describe('PATCH /api/v1/dids/:id - Zod validation error', () => {
    it('should return 400 when status value is not a valid enum member', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${activeDid}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'INVALID_STATUS' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      // The route's Zod handler returns a validation-error type
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 when the request body is empty', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/dids/${activeDid}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── DELETE /:id — already-deactivated guard (lines 237-238) ─────────

  describe('DELETE /api/v1/dids/:id - already deactivated', () => {
    it('should return 400 with correct message when DID is already deactivated', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${deactivatedDid}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/did is already deactivated/i);
    });
  });
});

// ===================================================================
// WebAuthn Branch Tests
// ===================================================================

describe('WebAuthn Branch Coverage - /api/v1/webauthn', () => {
  let app: FastifyInstance;
  let token: string;
  let userId: string;
  let didId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-did-wa-branches-32ch';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_RP_NAME = 'HumanID Test';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3117';

    // Re-use the same app instance if it was already built by the DID suite;
    // Jest runs suites sequentially so we build a fresh one here to be safe.
    app = await buildApp();

    // The DID suite already cleaned up and recreated this user; we look it up
    // rather than recreating to avoid conflicts when both suites run together.
    let existing = await prisma.user.findUnique({ where: { email: TEST_EMAIL } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      existing = await prisma.user.create({
        data: {
          email: TEST_EMAIL,
          passwordHash,
          role: 'DEVELOPER',
          emailVerified: true,
        },
      });
    }
    userId = existing.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    token = loginRes.json().access_token;

    // Create a fresh DID to bind WebAuthn credentials against
    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    didId = didRes.json().id;
  });

  afterAll(async () => {
    await cleanupTestUser(TEST_EMAIL);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    delete process.env.WEBAUTHN_RP_ID;
    delete process.env.WEBAUTHN_RP_NAME;
    delete process.env.WEBAUTHN_ORIGIN;
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /register/options — DID not found (lines 75-76) ────────────

  describe('POST /api/v1/webauthn/register/options - DID not found', () => {
    it('should return 404 when the supplied didId does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${token}` },
        payload: { didId: randomUUID() },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.title).toMatch(/not found/i);
    });
  });

  // ── POST /register/options — success (lines 85-125) ─────────────────

  describe('POST /api/v1/webauthn/register/options - success', () => {
    it('should return challenge, rp, user, and pubKeyCredParams for a valid didId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${token}` },
        payload: { didId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('challenge');
      expect(typeof body.challenge).toBe('string');
      expect(body).toHaveProperty('rp');
      expect(body.rp).toHaveProperty('name');
      expect(body.rp).toHaveProperty('id');
      expect(body).toHaveProperty('user');
      expect(body.user).toHaveProperty('id');
      expect(body.user).toHaveProperty('name');
      expect(body.user).toHaveProperty('displayName');
      expect(body).toHaveProperty('pubKeyCredParams');
      expect(Array.isArray(body.pubKeyCredParams)).toBe(true);
      expect(body.pubKeyCredParams.length).toBeGreaterThan(0);
    });
  });

  // ── POST /register/verify — DID not found (lines 156-157) ───────────

  describe('POST /api/v1/webauthn/register/verify - DID not found', () => {
    it('should return 404 when the supplied didId does not exist', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          didId: randomUUID(),
          credential: {
            id: 'fake-cred-id',
            rawId: 'fake-raw-id',
            type: 'public-key',
            response: {
              clientDataJSON: Buffer.from(
                JSON.stringify({
                  type: 'webauthn.create',
                  challenge: 'abc',
                  origin: 'http://localhost:3117',
                })
              ).toString('base64url'),
              attestationObject: 'fake-attestation-object',
            },
          },
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.title).toMatch(/not found/i);
    });
  });

  // ── POST /register/verify — Zod validation error (lines 233-239) ────

  describe('POST /api/v1/webauthn/register/verify - Zod validation error', () => {
    it('should return 400 when the credential object is missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          didId,
          credential: {
            id: 'some-id',
            // rawId, type, and response are intentionally omitted
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 when the credential type is not public-key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          didId,
          credential: {
            id: 'cred-id',
            rawId: 'raw-id',
            type: 'not-public-key',
            response: {
              clientDataJSON: 'data',
              attestationObject: 'obj',
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when the entire body is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /authenticate/options — non-existent user (lines 255-258) ──

  describe('POST /api/v1/webauthn/authenticate/options - non-existent user', () => {
    it('should return 200 with empty allowCredentials to avoid user enumeration', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/authenticate/options',
        payload: { email: 'no-such-user-ever@example.com' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('challenge');
      expect(Array.isArray(body.allowCredentials)).toBe(true);
      expect(body.allowCredentials).toHaveLength(0);
    });
  });

  // ── POST /authenticate/options — existing user (lines 262-273) ──────

  describe('POST /api/v1/webauthn/authenticate/options - existing user', () => {
    it('should return 200 with challenge and allowCredentials array for known user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/authenticate/options',
        payload: { email: TEST_EMAIL },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('challenge');
      expect(typeof body.challenge).toBe('string');
      expect(body).toHaveProperty('allowCredentials');
      expect(Array.isArray(body.allowCredentials)).toBe(true);
      // User has no registered FIDO2 passkeys yet so the list is empty,
      // but the branch for an existing user was still taken.
      expect(body).toHaveProperty('rpId');
      expect(body).toHaveProperty('timeout');
    });
  });

  // ── GET /credentials — no passkeys (lines 304-336) ──────────────────

  describe('GET /api/v1/webauthn/credentials - no passkeys', () => {
    it('should return 200 with an empty credentials array when no passkeys are registered', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webauthn/credentials',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('credentials');
      expect(Array.isArray(body.credentials)).toBe(true);
      expect(body.credentials).toHaveLength(0);
      expect(body).toHaveProperty('total');
      expect(body.total).toBe(0);
    });
  });

  // ── DELETE /credentials/:id — not found (lines 350-352) ─────────────

  describe('DELETE /api/v1/webauthn/credentials/:id - not found', () => {
    it('should return 404 when the passkey ID does not belong to the user', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/webauthn/credentials/${randomUUID()}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/passkey not found/i);
    });
  });
});
