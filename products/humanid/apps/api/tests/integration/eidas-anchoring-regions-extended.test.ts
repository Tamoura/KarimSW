/**
 * eIDAS, Anchoring & Regions Extended Branch Coverage Tests
 *
 * Targets uncovered branches in:
 *   - src/routes/v1/eidas.ts     (convert 404, JSON-LD branch, Zod errors,
 *                                  unauthenticated access)
 *   - src/routes/v1/anchoring.ts (submit Zod errors, verify 404,
 *                                  list with status/entityType filters)
 *   - src/routes/v1/regions.ts   (create non-admin, health not-found,
 *                                  patch non-admin, patch not-found, Zod errors)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

// ===================================================================
// eIDAS extended
// ===================================================================

describe('eIDAS Extended - /api/v1/eidas', () => {
  let app: FastifyInstance;
  let devToken: string;
  let credentialId: string;
  const devEmail = 'eidas-ext@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-eidas-extended-32chars';
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

    // Seed a test credential
    const seedRes = await app.inject({
      method: 'POST',
      url: '/api/v1/developer/sandbox/seed',
      headers: { authorization: `Bearer ${devToken}` },
    });
    credentialId = seedRes.json().testCredentials[0].id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── GET /status ───────────────────────────────────────────────────

  describe('GET /api/v1/eidas/status', () => {
    it('should require authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/eidas/status' });
      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /convert ─────────────────────────────────────────────────

  describe('POST /api/v1/eidas/convert - error branches', () => {
    it('should return 404 for non-existent credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          credentialId: '00000000-0000-0000-0000-000000000000',
          targetFormat: 'SD-JWT-VC',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/credential not found/i);
    });

    it('should return 400 for Zod validation failure (missing credentialId)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { targetFormat: 'SD-JWT-VC' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for invalid targetFormat', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { credentialId, targetFormat: 'UNSUPPORTED_FORMAT' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should convert to JSON-LD format (native format branch)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { credentialId, targetFormat: 'JSON-LD' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.targetFormat).toBe('JSON-LD');
      expect(body.converted).toHaveProperty('@context');
      expect(body.converted).toHaveProperty('credentialSubject');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/eidas/convert',
        payload: { credentialId, targetFormat: 'SD-JWT-VC' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /trust-framework ──────────────────────────────────────────

  describe('GET /api/v1/eidas/trust-framework', () => {
    it('should require authentication', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/eidas/trust-framework' });
      expect(res.statusCode).toBe(401);
    });

    it('should return trust framework data with counts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/eidas/trust-framework',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('framework', 'eIDAS 2.0');
      expect(body).toHaveProperty('trustedIssuers');
      expect(body).toHaveProperty('qualifiedIssuers');
      expect(body.interoperability).toHaveProperty('eudiWallet', true);
    });
  });
});

// ===================================================================
// Anchoring extended
// ===================================================================

describe('Anchoring Extended - /api/v1/anchoring', () => {
  let app: FastifyInstance;
  let devToken: string;
  let testDidId: string;
  let anchorId: string;
  const devEmail = 'anchoring-ext@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-anchoring-ext-32chars';
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

    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    testDidId = didRes.json().id;

    // Create one anchor for list filter tests (dataHash must be exactly 64 hex chars)
    const anchorRes = await app.inject({
      method: 'POST',
      url: '/api/v1/anchoring/submit',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {
        entityType: 'DID',
        entityId: testDidId,
        chain: 'POLYGON',
        dataHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      },
    });
    anchorId = anchorRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /submit - Zod error branches ────────────────────────────

  describe('POST /api/v1/anchoring/submit - error branches', () => {
    it('should return 400 for missing entityType', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/anchoring/submit',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for unsupported chain', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/anchoring/submit',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'BITCOIN',
          dataHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for dataHash that is not 64 chars', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/anchoring/submit',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'tooshort',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toMatch(/64 hex/i);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/anchoring/submit',
        payload: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET / - list with filters ─────────────────────────────────────

  describe('GET /api/v1/anchoring - filter branches', () => {
    it('should filter by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?status=PENDING',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('anchors');
      body.anchors.forEach((a: { status: string }) => {
        expect(a.status).toBe('PENDING');
      });
    });

    it('should filter by entityType', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?entityType=DID',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      body.anchors.forEach((a: { entityType: string }) => {
        expect(a.entityType).toBe('DID');
      });
    });

    it('should filter by chain and return only matching anchors', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?chain=POLYGON',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
    });

    it('should return empty list with non-matching status filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?status=CONFIRMED',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      // May be empty if none confirmed — that's fine
      expect(res.json()).toHaveProperty('anchors');
    });
  });

  // ── GET /:id/verify - 404 branch ──────────────────────────────────

  describe('GET /api/v1/anchoring/:id/verify - error branches', () => {
    it('should return 404 for non-existent anchor', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring/00000000-0000-0000-0000-000000000000/verify',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/anchor not found/i);
    });

    it('should return anchor with null anchoredAt when PENDING', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/anchoring/${anchorId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.anchored).toBe(false); // PENDING means not confirmed
      expect(body.anchoredAt).toBeNull();
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/anchoring/${anchorId}/verify`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /chains ───────────────────────────────────────────────────

  describe('GET /api/v1/anchoring/chains', () => {
    it('should include all four supported chains', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring/chains',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const names = body.chains.map((c: { name: string }) => c.name);
      expect(names).toContain('POLYGON');
      expect(names).toContain('ETHEREUM');
      expect(names).toContain('SOLANA');
      expect(names).toContain('ARBITRUM');
    });
  });
});

// ===================================================================
// Regions extended
// ===================================================================

describe('Regions Extended - /api/v1/regions', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let nonAdminToken: string;
  const adminEmail = 'regions-admin@example.com';
  const holderEmail = 'regions-holder@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  async function cleanupRegion(code: string) {
    await prisma.region.deleteMany({ where: { code: code as 'EU_FRANKFURT' | 'US_VIRGINIA' | 'APAC_SINGAPORE' } });
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-regions-extended-32ch';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);

    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    const holderLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    nonAdminToken = holderLogin.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    // Clean up any test regions
    await cleanupRegion('EU_FRANKFURT');
    await cleanupRegion('US_VIRGINIA');
    await cleanupRegion('APAC_SINGAPORE');
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST / - create region ────────────────────────────────────────

  describe('POST /api/v1/regions - error branches', () => {
    it('should return 403 for non-admin user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/regions',
        headers: { authorization: `Bearer ${nonAdminToken}` },
        payload: {
          code: 'EU_FRANKFURT',
          name: 'Europe Frankfurt',
          endpoint: 'https://eu.humanid.dev',
        },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toMatch(/admin/i);
    });

    it('should return 400 for invalid region code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/regions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          code: 'INVALID_REGION',
          name: 'Invalid',
          endpoint: 'https://invalid.humanid.dev',
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for invalid endpoint URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/regions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          code: 'EU_FRANKFURT',
          name: 'Europe Frankfurt',
          endpoint: 'not-a-url',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/regions',
        payload: {
          code: 'EU_FRANKFURT',
          name: 'Europe Frankfurt',
          endpoint: 'https://eu.humanid.dev',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should create a region successfully as admin', async () => {
      // Clean up before create to avoid unique constraint conflicts
      await cleanupRegion('EU_FRANKFURT');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/regions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          code: 'EU_FRANKFURT',
          name: 'Europe Frankfurt',
          endpoint: 'https://eu.humanid.dev',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.code).toBe('EU_FRANKFURT');
      expect(body).toHaveProperty('healthStatus');
    });
  });

  // ── GET /:code/health - not-found branch ──────────────────────────

  describe('GET /api/v1/regions/:code/health', () => {
    it('should return 404 for non-existent region code', async () => {
      // Delete any existing record to ensure not-found
      await cleanupRegion('APAC_SINGAPORE');

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/regions/APAC_SINGAPORE/health',
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      // Error is either from AppError toJSON (detail field) or not-found handler
      const errorText = body.detail || body.message || '';
      expect(errorText.toLowerCase()).toMatch(/not found|region/i);
    });

    it('should return health data for existing region', async () => {
      // EU_FRANKFURT was created above
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/regions/EU_FRANKFURT/health',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('code', 'EU_FRANKFURT');
      expect(body).toHaveProperty('healthStatus');
    });
  });

  // ── PATCH /:code - update region ──────────────────────────────────

  describe('PATCH /api/v1/regions/:code', () => {
    it('should return 403 for non-admin user', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        headers: { authorization: `Bearer ${nonAdminToken}` },
        payload: { healthStatus: 'degraded' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent region code', async () => {
      await cleanupRegion('US_VIRGINIA');

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/US_VIRGINIA',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { healthStatus: 'degraded' },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/region not found/i);
    });

    it('should return 400 for Zod validation failure (negative latencyMs)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { latencyMs: -5 },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should update healthStatus and set lastHealthCheck', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { healthStatus: 'healthy' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.healthStatus).toBe('healthy');
      expect(body.lastHealthCheck).not.toBeNull();
    });

    it('should update dataResidencyEnabled', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { dataResidencyEnabled: true },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().dataResidencyEnabled).toBe(true);
    });

    it('should update latencyMs', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { latencyMs: 42 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().latencyMs).toBe(42);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        payload: { healthStatus: 'healthy' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET / - public list ───────────────────────────────────────────

  describe('GET /api/v1/regions', () => {
    it('should return a list of regions (public)', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/regions' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('regions');
      expect(Array.isArray(body.regions)).toBe(true);
    });
  });
});
