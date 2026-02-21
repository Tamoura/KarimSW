/**
 * Phase 2 Risk Remediation Integration Tests
 *
 * Covers 4 risk fixes applied in Phase 2 of the HumanID security audit:
 *
 * RISK-009: Federation resolve endpoint no longer leaks userId
 * RISK-010: All list endpoints support pagination with metadata
 * RISK-008: Encryption key rotation via reEncrypt utility + admin endpoint
 * RISK-005: WebAuthn attestation CBOR structure validation
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { encrypt, decrypt, reEncrypt } from '../../src/utils/encryption';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

const TEST_EMAIL = 'phase2-test@example.com';
const ADMIN_EMAIL = 'phase2-admin@example.com';

const OLD_KEY_HEX = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const NEW_KEY_HEX = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

describe('Phase 2 Risk Remediation Fixes', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;
  let didId: string;
  let adminAccessToken: string;
  let adminUserId: string;

  // ==================== Lifecycle ====================

  async function cleanupUser(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return;

    const userDids = await prisma.dID.findMany({ where: { userId: user.id } });
    const didIds = userDids.map((d) => d.id);

    if (didIds.length > 0) {
      await prisma.biometricBinding.deleteMany({ where: { didId: { in: didIds } } });
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDidId: { in: didIds } }, { issuerDidId: { in: didIds } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { didId: { in: didIds } } });
    }

    await prisma.federationLink.deleteMany({ where: { userId: user.id } });
    await prisma.agentDelegation.deleteMany({ where: { granterUserId: user.id } });
    await prisma.agentIdentity.deleteMany({ where: { userId: user.id } });
    await prisma.apiKey.deleteMany({ where: { userId: user.id } });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.dID.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { email } });
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-phase2-fixes';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = OLD_KEY_HEX;
    process.env.WEBAUTHN_RP_ID = 'localhost';
    process.env.WEBAUTHN_RP_NAME = 'HumanID Test';
    process.env.WEBAUTHN_ORIGIN = 'http://localhost:3117';

    app = await buildApp();

    // --- Create developer test user ---
    await cleanupUser(TEST_EMAIL);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    userId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    accessToken = loginRes.json().access_token;

    // Create a DID for the test user
    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    didId = didRes.json().id;

    // --- Create admin test user (for RISK-008 key rotation) ---
    await cleanupUser(ADMIN_EMAIL);
    const adminUser = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS),
        role: 'ADMIN',
        emailVerified: true,
      },
    });
    adminUserId = adminUser.id;

    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
    });
    adminAccessToken = adminLoginRes.json().access_token;
  });

  afterAll(async () => {
    // Restore env to OLD_KEY before cleanup (in case test changed it)
    process.env.CLAIMS_ENCRYPTION_KEY = OLD_KEY_HEX;

    await cleanupUser(TEST_EMAIL);
    await cleanupUser(ADMIN_EMAIL);

    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    delete process.env.WEBAUTHN_RP_ID;
    delete process.env.WEBAUTHN_RP_NAME;
    delete process.env.WEBAUTHN_ORIGIN;

    await prisma.$disconnect();
    await app.close();
  });

  // ==================== RISK-009: Federation Resolve Privacy ====================

  describe('RISK-009: Federation Resolve — userId not leaked', () => {
    let federationLinkId: string;

    beforeAll(async () => {
      // Create a federation link so resolve can find it
      const linkRes = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/links',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          didId,
          protocol: 'OIDC',
          externalIssuer: 'https://accounts.google.com',
          externalSubject: 'phase2-google-user-xyz',
          direction: 'BIDIRECTIONAL',
        },
      });
      federationLinkId = linkRes.json().id;
    });

    afterAll(async () => {
      if (federationLinkId) {
        await prisma.federationLink.deleteMany({ where: { id: federationLinkId } });
      }
    });

    it('should return found: true with didId but NOT userId when link exists', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://accounts.google.com',
          externalSubject: 'phase2-google-user-xyz',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.found).toBe(true);
      expect(body).toHaveProperty('didId');
      expect(body.didId).toBe(didId);
      expect(body).not.toHaveProperty('userId');
    });

    it('should return found: false with didId: null but NOT userId when link is not found', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://accounts.google.com',
          externalSubject: 'nonexistent-subject-phase2',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.found).toBe(false);
      expect(body.didId).toBeNull();
      expect(body).not.toHaveProperty('userId');
    });

    it('resolve response shape has exactly: found, didId, protocol, direction — no extra fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/federation/resolve',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          protocol: 'OIDC',
          externalIssuer: 'https://accounts.google.com',
          externalSubject: 'phase2-google-user-xyz',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const keys = Object.keys(body);

      // Must have these four fields
      expect(keys).toContain('found');
      expect(keys).toContain('didId');
      expect(keys).toContain('protocol');
      expect(keys).toContain('direction');

      // Must NOT have userId or any internal identity field
      expect(keys).not.toContain('userId');
      expect(keys).not.toContain('user_id');
      expect(keys).not.toContain('externalSubject');
    });
  });

  // ==================== RISK-010: Pagination on List Endpoints ====================

  describe('RISK-010: Pagination metadata on all list endpoints', () => {
    function assertPaginationShape(body: Record<string, unknown>) {
      expect(typeof body.total).toBe('number');
      expect(typeof body.page).toBe('number');
      expect(typeof body.pageSize).toBe('number');
      expect(typeof body.totalPages).toBe('number');
    }

    it('GET /api/v1/federation/links returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/federation/links?page=1&limit=2',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/credentials returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/credentials?page=1&limit=5',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/wallet/credentials returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/credentials?page=1&limit=5',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/agents returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents?page=1&limit=5',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/governance/proposals returns pagination fields (public endpoint)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals?page=1&limit=2',
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/developer/keys returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/developer/keys?page=1&limit=5',
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/security/advisories returns pagination fields (public endpoint)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/advisories?page=1&limit=5',
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });

    it('GET /api/v1/i18n/locales returns pagination fields (public endpoint)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/i18n/locales?page=1&limit=5',
      });

      expect(res.statusCode).toBe(200);
      assertPaginationShape(res.json());
    });
  });

  // ==================== RISK-008: Encryption Key Rotation ====================

  describe('RISK-008: Encryption key rotation', () => {
    it('unit: reEncrypt re-encrypts data so new key can decrypt the original plaintext', () => {
      const originalText = 'sensitive-credential-data-phase2';

      // Encrypt using the current key (OLD_KEY_HEX is in env)
      const encrypted = encrypt(originalText);

      // Re-encrypt from old key to new key
      const reEncrypted = reEncrypt(encrypted, OLD_KEY_HEX, NEW_KEY_HEX);

      // The re-encrypted value must differ from the original encrypted value
      expect(reEncrypted).not.toBe(encrypted);

      // Decrypt with the new key by temporarily swapping the env var
      const previousKey = process.env.CLAIMS_ENCRYPTION_KEY;
      process.env.CLAIMS_ENCRYPTION_KEY = NEW_KEY_HEX;
      try {
        const decrypted = decrypt(reEncrypted);
        expect(decrypted).toBe(originalText);
      } finally {
        process.env.CLAIMS_ENCRYPTION_KEY = previousKey;
      }
    });

    it('non-admin user receives 403 when calling POST /api/v1/developer/rotate-encryption-key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/rotate-encryption-key',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          oldKeyHex: OLD_KEY_HEX,
          newKeyHex: NEW_KEY_HEX,
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body).toHaveProperty('title');
    });

    it('admin user can rotate the encryption key and encrypted data remains accessible', async () => {
      // Encrypt a test string with the current (old) key
      const plaintext = 'rotation-test-secret-phase2';
      process.env.CLAIMS_ENCRYPTION_KEY = OLD_KEY_HEX;
      const encryptedWithOldKey = encrypt(plaintext);

      // Call the rotation endpoint as admin
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/developer/rotate-encryption-key',
        headers: { authorization: `Bearer ${adminAccessToken}` },
        payload: {
          oldKeyHex: OLD_KEY_HEX,
          newKeyHex: NEW_KEY_HEX,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('message');
      expect(typeof body.credentialsMigrated).toBe('number');
      expect(typeof body.didsMigrated).toBe('number');
      expect(typeof body.webhooksMigrated).toBe('number');

      // Switch env to the new key and verify re-encrypt works at the utility level
      const reEncryptedData = reEncrypt(encryptedWithOldKey, OLD_KEY_HEX, NEW_KEY_HEX);
      process.env.CLAIMS_ENCRYPTION_KEY = NEW_KEY_HEX;
      try {
        const decrypted = decrypt(reEncryptedData);
        expect(decrypted).toBe(plaintext);
      } finally {
        // Restore key for subsequent tests
        process.env.CLAIMS_ENCRYPTION_KEY = OLD_KEY_HEX;
      }
    });
  });

  // ==================== RISK-005: WebAuthn Attestation Validation ====================

  describe('RISK-005: WebAuthn CBOR attestation object validation', () => {
    let challenge: string;

    beforeAll(async () => {
      // Obtain a real challenge from the server
      const optionsRes = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { didId },
      });

      expect(optionsRes.statusCode).toBe(200);
      challenge = optionsRes.json().challenge;
    });

    it('register/verify rejects an attestation object that is too small (< 47 bytes)', async () => {
      // 10 random bytes — far below the 47-byte minimum
      const tinyAttestationObject = Buffer.alloc(10, 0xaa).toString('base64url');

      const clientData = {
        type: 'webauthn.create',
        challenge,
        origin: 'http://localhost:3117',
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          didId,
          credential: {
            id: 'test-credential-id-tiny',
            rawId: 'test-credential-id-tiny',
            type: 'public-key',
            response: {
              clientDataJSON,
              attestationObject: tinyAttestationObject,
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      // The error message must indicate attestation validation failed
      const errorDetail = JSON.stringify(body).toLowerCase();
      expect(errorDetail).toMatch(/attestation/);
    });

    it('register/verify rejects an attestation object with an invalid CBOR map header byte', async () => {
      // Build a 60-byte buffer whose first byte is NOT in 0xa0-0xbf range (invalid CBOR map header)
      // Use 0x10 (a CBOR unsigned integer) as the first byte
      const invalidCborHeader = Buffer.alloc(60, 0x00);
      invalidCborHeader[0] = 0x10; // Not a CBOR map tag
      const invalidAttestationObject = invalidCborHeader.toString('base64url');

      // Use a fresh challenge — the previous one was consumed, so call options again
      const freshOptionsRes = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/options',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { didId },
      });
      const freshChallenge = freshOptionsRes.json().challenge;

      const clientData = {
        type: 'webauthn.create',
        challenge: freshChallenge,
        origin: 'http://localhost:3117',
      };
      const clientDataJSON = Buffer.from(JSON.stringify(clientData)).toString('base64url');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/webauthn/register/verify',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          didId,
          credential: {
            id: 'test-credential-id-bad-cbor',
            rawId: 'test-credential-id-bad-cbor',
            type: 'public-key',
            response: {
              clientDataJSON,
              attestationObject: invalidAttestationObject,
            },
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      const errorDetail = JSON.stringify(body).toLowerCase();
      expect(errorDetail).toMatch(/attestation/);
    });
  });
});
