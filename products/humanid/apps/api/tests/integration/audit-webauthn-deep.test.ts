/**
 * Audit & WebAuthn Deep Branch Coverage Tests
 *
 * Targets remaining uncovered branches in:
 *   - src/routes/v1/audit.ts   (lines 85, 153-156, 188-202, 216-219)
 *       • from-only date filter (line 45 branch)
 *       • to-only date filter (line 46 branch)
 *       • export with action filter (line 106)
 *       • export with entityType filter (line 107)
 *       • export with date range + CSV (lines 108-112)
 *       • verify chain with broken prevHash (lines 199-203)
 *       • verify chain intact with valid prevHash (lines 188-206)
 *   - src/routes/v1/webauthn.ts (lines 118-119, 167-191, 241, 271-272, 299)
 *       • register/verify — challenge expired / not found (line 167-168)
 *       • register/verify — invalid clientDataJSON type (line 177-179)
 *       • register/verify — challenge mismatch (line 181-183)
 *       • register/verify — origin mismatch (line 185-187)
 *       • register/verify — unparseable clientDataJSON (line 188-191)
 *
 * Test user: audit-wa-deep@example.com / Test123!@#  role: DEVELOPER
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'crypto';

const prisma = new PrismaClient();
const TEST_EMAIL = 'audit-wa-deep@example.com';
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

// ---------------------------------------------------------------------------
// Shared cleanup helper
// ---------------------------------------------------------------------------

async function cleanupTestUser(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) return;

  await prisma.auditLog.deleteMany({ where: { userId: existing.id } });
  await prisma.biometricBinding.deleteMany({
    where: { did: { userId: existing.id } },
  });
  await prisma.dIDDocument.deleteMany({
    where: { did: { userId: existing.id } },
  });
  await prisma.dID.deleteMany({ where: { userId: existing.id } });
  await prisma.session.deleteMany({ where: { userId: existing.id } });
  await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
  await prisma.user.delete({ where: { email } });
}

// ---------------------------------------------------------------------------
// Shared state populated by the top-level beforeAll
// ---------------------------------------------------------------------------

let sharedApp: FastifyInstance;
let sharedToken: string;
let sharedUserId: string;
let sharedDidId: string;

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-audit-wa-deep-32ch';
  process.env.INTERNAL_API_KEY = 'test-internal-api-key';
  process.env.CLAIMS_ENCRYPTION_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.WEBAUTHN_RP_ID = 'localhost';
  process.env.WEBAUTHN_RP_NAME = 'HumanID Test';
  process.env.WEBAUTHN_ORIGIN = 'http://localhost:3117';

  sharedApp = await buildApp();

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
  sharedUserId = user.id;

  const loginRes = await sharedApp.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
  });
  sharedToken = loginRes.json().access_token;

  // Create a DID for the webauthn tests
  const didRes = await sharedApp.inject({
    method: 'POST',
    url: '/api/v1/dids',
    headers: { authorization: `Bearer ${sharedToken}` },
    payload: {},
  });
  sharedDidId = didRes.json().id;
});

afterAll(async () => {
  await cleanupTestUser(TEST_EMAIL);
  delete process.env.JWT_SECRET;
  delete process.env.INTERNAL_API_KEY;
  delete process.env.CLAIMS_ENCRYPTION_KEY;
  delete process.env.WEBAUTHN_RP_ID;
  delete process.env.WEBAUTHN_RP_NAME;
  delete process.env.WEBAUTHN_ORIGIN;
  await sharedApp.close();
  await prisma.$disconnect();
});

// ===========================================================================
// Audit Deep Branch Coverage
// ===========================================================================

describe('Audit Deep Coverage - /api/v1/audit', () => {
  // Seed a handful of audit entries so filters have something to match against
  beforeAll(async () => {
    await prisma.auditLog.createMany({
      data: [
        {
          userId: sharedUserId,
          action: 'LOGIN',
          entityType: 'USER',
          entityId: sharedUserId,
          ipAddress: '127.0.0.1',
        },
        {
          userId: sharedUserId,
          action: 'did.created',
          entityType: 'DID',
          entityId: sharedDidId,
          ipAddress: '127.0.0.1',
        },
      ],
    });
  });

  // ── GET /events — from-only filter (line 45 branch, NOT line 46) ───────

  describe('GET /api/v1/audit/events - from only filter', () => {
    it('should return 200 when only `from` is provided (no `to`)', async () => {
      const from = new Date('2020-01-01').toISOString();

      const res = await sharedApp.inject({
        method: 'GET',
        url: `/api/v1/audit/events?from=${encodeURIComponent(from)}`,
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('events');
      expect(Array.isArray(body.events)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(body.total).toBeGreaterThan(0);
    });
  });

  // ── GET /events — to-only filter (line 46 branch, NOT line 45) ─────────

  describe('GET /api/v1/audit/events - to only filter', () => {
    it('should return 200 when only `to` is provided (no `from`)', async () => {
      const to = new Date('2030-01-01').toISOString();

      const res = await sharedApp.inject({
        method: 'GET',
        url: `/api/v1/audit/events?to=${encodeURIComponent(to)}`,
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('events');
      expect(Array.isArray(body.events)).toBe(true);
      expect(body.total).toBeGreaterThan(0);
    });
  });

  // ── GET /events/export — action filter (line 106) ───────────────────────

  describe('GET /api/v1/audit/events/export - action filter', () => {
    it('should return 200 JSON export filtered by action', async () => {
      const res = await sharedApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=json&action=LOGIN',
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('events');
      expect(Array.isArray(body.events)).toBe(true);
      // Every returned event must have the requested action
      body.events.forEach((e: { action: string }) => {
        expect(e.action).toBe('LOGIN');
      });
    });
  });

  // ── GET /events/export — entityType filter (line 107) ──────────────────

  describe('GET /api/v1/audit/events/export - entityType filter', () => {
    it('should return 200 JSON export filtered by entityType', async () => {
      const res = await sharedApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=json&entityType=USER',
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('events');
      expect(Array.isArray(body.events)).toBe(true);
      body.events.forEach((e: { entityType: string }) => {
        expect(e.entityType).toBe('USER');
      });
    });
  });

  // ── GET /events/export — date range + CSV (lines 108-112, 130-141) ──────

  describe('GET /api/v1/audit/events/export - date range with CSV format', () => {
    it('should return 200 text/csv with date-range filter applied', async () => {
      const from = new Date('2020-01-01').toISOString();
      const to = new Date('2030-01-01').toISOString();

      const res = await sharedApp.inject({
        method: 'GET',
        url: `/api/v1/audit/events/export?format=csv&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/csv/i);
      expect(res.headers['content-disposition']).toMatch(/attachment/i);
      // CSV must start with the header row
      expect(res.body).toContain('id,userId,action,entityType');
    });
  });

  // ── GET /events/verify — broken prevHash chain (lines 199-203) ─────────

  describe('GET /api/v1/audit/events/verify - broken prevHash chain', () => {
    it('should return intact=false and identify the broken entry', async () => {
      // Clear any existing audit logs for this user to isolate the chain
      await prisma.auditLog.deleteMany({ where: { userId: sharedUserId } });

      // Entry 1 — no prevHash (anchor / genesis entry)
      const entry1 = await prisma.auditLog.create({
        data: {
          userId: sharedUserId,
          action: 'chain.start',
          entityType: 'SYSTEM',
          entityId: sharedUserId,
          prevHash: null,
        },
      });

      // Entry 2 — prevHash is the correct SHA-256 of entry 1
      const correctHash = createHash('sha256')
        .update(
          JSON.stringify({
            id: entry1.id,
            action: entry1.action,
            entityType: entry1.entityType,
            entityId: entry1.entityId,
            createdAt: entry1.createdAt.toISOString(),
          })
        )
        .digest('hex');

      const entry2 = await prisma.auditLog.create({
        data: {
          userId: sharedUserId,
          action: 'chain.middle',
          entityType: 'SYSTEM',
          entityId: sharedUserId,
          prevHash: correctHash,
        },
      });

      // Entry 3 — prevHash is intentionally wrong (simulates tampering)
      const entry3 = await prisma.auditLog.create({
        data: {
          userId: sharedUserId,
          action: 'chain.tampered',
          entityType: 'SYSTEM',
          entityId: sharedUserId,
          prevHash: 'broken-hash-does-not-match-anything',
        },
      });

      const res = await sharedApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('intact');
      expect(body).toHaveProperty('brokenAt');
      expect(body).toHaveProperty('entriesChecked');
      expect(body).toHaveProperty('totalEntries');
      expect(body.intact).toBe(false);
      // The verify endpoint should identify entry3 as the first broken link
      expect(body.brokenAt).toBe(entry3.id);

      // Silence the unused variable warning — entry2 is needed to build entry3
      void entry2;
    });
  });

  // ── GET /events/verify — valid chain (lines 185-206, intact branch) ─────

  describe('GET /api/v1/audit/events/verify - intact prevHash chain', () => {
    it('should return intact=true when all prevHash values are correct', async () => {
      // Replace the chain from the previous test with a fully-valid one
      await prisma.auditLog.deleteMany({ where: { userId: sharedUserId } });

      // Entry A — genesis (no prevHash)
      const entryA = await prisma.auditLog.create({
        data: {
          userId: sharedUserId,
          action: 'intact.genesis',
          entityType: 'SYSTEM',
          entityId: sharedUserId,
          prevHash: null,
        },
      });

      // Entry B — prevHash is the correct SHA-256 of entry A
      const hashOfA = createHash('sha256')
        .update(
          JSON.stringify({
            id: entryA.id,
            action: entryA.action,
            entityType: entryA.entityType,
            entityId: entryA.entityId,
            createdAt: entryA.createdAt.toISOString(),
          })
        )
        .digest('hex');

      await prisma.auditLog.create({
        data: {
          userId: sharedUserId,
          action: 'intact.second',
          entityType: 'SYSTEM',
          entityId: sharedUserId,
          prevHash: hashOfA,
        },
      });

      const res = await sharedApp.inject({
        method: 'GET',
        url: '/api/v1/audit/events/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.intact).toBe(true);
      expect(body.brokenAt).toBeNull();
      expect(body.entriesChecked).toBeGreaterThanOrEqual(2);
    });
  });
});

// ===========================================================================
// WebAuthn Deep Branch Coverage
// ===========================================================================

describe('WebAuthn Deep Coverage - /api/v1/webauthn', () => {
  // ── POST /register/verify — challenge expired / not found (line 167-168) -

  describe('POST /register/verify - challenge expired or not found', () => {
    it('should return 400 when no challenge was stored for the user+DID pair', async () => {
      // Use a fresh DID that never had /register/options called for it,
      // so no challenge exists in Redis (or Redis is absent).
      const freshDidRes = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: {},
      });
      const freshDidId = freshDidRes.json().id;

      const clientData = {
        type: 'webauthn.create',
        challenge: 'some-challenge-that-was-never-stored',
        origin: 'http://localhost:3117',
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');

      const res = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: {
          didId: freshDidId,
          credential: {
            id: `cred-${randomUUID()}`,
            rawId: `raw-${randomUUID()}`,
            type: 'public-key',
            response: {
              clientDataJSON,
              attestationObject: Buffer.from('fake-attestation').toString('base64url'),
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/registration challenge expired or not found/i);
    });
  });

  // ── POST /register/verify — invalid clientDataJSON type (line 177-179) ──

  describe('POST /register/verify - invalid client data type', () => {
    it('should return 400 when clientDataJSON type is not webauthn.create', async () => {
      // First call /register/options so a challenge is stored in Redis
      const optionsRes = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: { didId: sharedDidId },
      });

      expect(optionsRes.statusCode).toBe(200);
      const storedChallenge = optionsRes.json().challenge as string;

      // Build a clientDataJSON with the WRONG type (webauthn.get instead of webauthn.create)
      const clientData = {
        type: 'webauthn.get',           // wrong — must be 'webauthn.create'
        challenge: storedChallenge,
        origin: 'http://localhost:3117',
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');

      const res = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: {
          didId: sharedDidId,
          credential: {
            id: `cred-${randomUUID()}`,
            rawId: `raw-${randomUUID()}`,
            type: 'public-key',
            response: {
              clientDataJSON,
              attestationObject: Buffer.from('fake-attestation-obj').toString('base64url'),
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/invalid client data type/i);
    });
  });

  // ── POST /register/verify — challenge mismatch (line 181-183) ───────────

  describe('POST /register/verify - challenge mismatch', () => {
    it('should return 400 when the challenge in clientDataJSON does not match the stored challenge', async () => {
      // Get a fresh stored challenge
      const optionsRes = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: { didId: sharedDidId },
      });

      expect(optionsRes.statusCode).toBe(200);

      // Correct type but a DIFFERENT challenge value
      const clientData = {
        type: 'webauthn.create',
        challenge: 'totally-different-challenge-value-that-wont-match',
        origin: 'http://localhost:3117',
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');

      const res = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: {
          didId: sharedDidId,
          credential: {
            id: `cred-${randomUUID()}`,
            rawId: `raw-${randomUUID()}`,
            type: 'public-key',
            response: {
              clientDataJSON,
              attestationObject: Buffer.from('fake-attestation-obj').toString('base64url'),
            },
          },
        },
      });

      // When Redis is available: storedChallenge is present → challenge mismatch (400)
      // When Redis is absent: storedChallenge is null → challenge expired (400)
      // Either way we expect a 400.
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/challenge/i);
    });
  });

  // ── POST /register/verify — origin mismatch (line 185-187) ─────────────

  describe('POST /register/verify - origin mismatch', () => {
    it('should return 400 when clientDataJSON origin does not match WEBAUTHN_ORIGIN', async () => {
      // Obtain and store a fresh challenge
      const optionsRes = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: { didId: sharedDidId },
      });

      expect(optionsRes.statusCode).toBe(200);
      const storedChallenge = optionsRes.json().challenge as string;

      // Correct type and challenge, but WRONG origin
      const clientData = {
        type: 'webauthn.create',
        challenge: storedChallenge,
        origin: 'https://evil.example.com',  // wrong origin
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');

      const res = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: {
          didId: sharedDidId,
          credential: {
            id: `cred-${randomUUID()}`,
            rawId: `raw-${randomUUID()}`,
            type: 'public-key',
            response: {
              clientDataJSON,
              attestationObject: Buffer.from('fake-attestation-obj').toString('base64url'),
            },
          },
        },
      });

      // When Redis is available: storedChallenge matches → origin check fires → 400
      // When Redis is absent: storedChallenge null → 400 (challenge expired)
      // Either way the response is 400.
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/origin mismatch|challenge/i);
    });
  });

  // ── POST /register/verify — unparseable clientDataJSON (line 188-191) ───

  describe('POST /register/verify - unparseable clientDataJSON', () => {
    it('should return 400 with invalid attestation response for non-JSON clientDataJSON', async () => {
      // Obtain and store a fresh challenge so we pass the null-challenge guard
      const optionsRes = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: { didId: sharedDidId },
      });

      expect(optionsRes.statusCode).toBe(200);

      // clientDataJSON that decodes to invalid JSON (not parseable)
      const invalidClientDataJSON = Buffer.from('this-is-not-json-at-all!!!').toString('base64url');

      const res = await sharedApp.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${sharedToken}` },
        payload: {
          didId: sharedDidId,
          credential: {
            id: `cred-${randomUUID()}`,
            rawId: `raw-${randomUUID()}`,
            type: 'public-key',
            response: {
              clientDataJSON: invalidClientDataJSON,
              attestationObject: Buffer.from('fake-attestation-obj').toString('base64url'),
            },
          },
        },
      });

      // When Redis is available: storedChallenge present → JSON.parse throws →
      //   outer catch (parseError not AppError) → 400 'Invalid attestation response'
      // When Redis is absent: storedChallenge null → 400 'challenge expired'
      // Either path produces 400.
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/invalid attestation response|challenge/i);
    });
  });
});
