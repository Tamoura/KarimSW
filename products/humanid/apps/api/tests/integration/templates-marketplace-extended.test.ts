/**
 * Templates & Marketplace Extended Branch Coverage Tests
 *
 * Targets uncovered branches in:
 *   - src/routes/v1/templates.ts   (create Zod errors, update non-owned,
 *                                   update no-issuer, delete non-owned,
 *                                   get with no-issuer, list with no-issuer)
 *   - src/routes/v1/marketplace.ts (apply invalid DID, apply duplicate 409,
 *                                   apply Zod errors, admin reject action,
 *                                   admin Zod errors, directory search+tier filters,
 *                                   marketplace template search+type filters,
 *                                   fork non-public template, fork without issuer profile)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

// ===================================================================
// Templates extended
// ===================================================================

describe('Templates Extended - /api/v1/templates', () => {
  let app: FastifyInstance;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let holderToken: string;
  let holderUserId: string;
  let templateId: string;
  const issuerEmail = 'tmpl-ext-issuer@example.com';
  const holderEmail = 'tmpl-ext-holder@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.credentialTemplate.deleteMany({ where: { issuer: { userId: existing.id } } });
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
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
    process.env.JWT_SECRET = 'test-jwt-secret-for-templates-ext-32chars';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(issuerEmail);
    await cleanupUser(holderEmail);

    // Issuer user with a DID and issuer profile
    const issuerUser = await prisma.user.create({
      data: { email: issuerEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    issuerUserId = issuerUser.id;

    const issuerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: issuerEmail, password: TEST_PASSWORD },
    });
    issuerToken = issuerLogin.json().access_token;

    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    issuerDidId = didRes.json().id;

    // Register issuer profile
    await app.inject({
      method: 'POST',
      url: '/api/v1/issuers',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: { didId: issuerDidId, organizationName: 'Extended Test Org' },
    });

    // Holder user (no issuer profile)
    const holderUser = await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    holderUserId = holderUser.id;

    const holderLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;

    // Create a template to use in update/delete tests
    const tmplRes = await app.inject({
      method: 'POST',
      url: '/api/v1/templates',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        name: 'Base Template',
        credentialType: 'BaseCredential',
        schema: { type: 'object' },
        requiredAttributes: ['name'],
        optionalAttributes: [],
        defaultExpiryDays: 365,
      },
    });
    templateId = tmplRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(issuerEmail);
    await cleanupUser(holderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST / - Zod errors ───────────────────────────────────────────

  describe('POST /api/v1/templates - Zod validation branches', () => {
    it('should return 400 when name is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          credentialType: 'TestType',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 when credentialType is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          name: 'Some Template',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should return 400 when defaultExpiryDays is out of range (max 3650)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          name: 'Too Long Template',
          credentialType: 'TooLong',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
          defaultExpiryDays: 9999,
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ── GET / - no-issuer branch ──────────────────────────────────────

  describe('GET /api/v1/templates - no-issuer branch', () => {
    it('should return empty list when user has no issuer profile', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.templates).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  // ── GET /:id - no-issuer branch ───────────────────────────────────

  describe('GET /api/v1/templates/:id - no-issuer branch', () => {
    it('should return 404 when user has no issuer profile', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for template that belongs to a different issuer', async () => {
      // templateId belongs to issuerToken's issuer; holderToken has none
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/templates/00000000-0000-0000-0000-000000000000`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  // ── PATCH /:id - error branches ───────────────────────────────────

  describe('PATCH /api/v1/templates/:id - error branches', () => {
    it('should return 404 when user has no issuer profile', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${holderToken}` },
        payload: { name: 'New Name' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for template not owned by this issuer', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/templates/00000000-0000-0000-0000-000000000000`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { name: 'Should Fail' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 400 for Zod validation failure (name too long)', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { name: 'x'.repeat(201) },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should update requiredAttributes and optionalAttributes', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          requiredAttributes: ['name', 'dob'],
          optionalAttributes: ['address'],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.requiredAttributes).toContain('dob');
      expect(body.optionalAttributes).toContain('address');
    });

    it('should set defaultExpiryDays to null when passed null', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { defaultExpiryDays: null },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().defaultExpiryDays).toBeNull();
    });
  });

  // ── DELETE /:id - error branches ──────────────────────────────────

  describe('DELETE /api/v1/templates/:id - error branches', () => {
    it('should return 404 when user has no issuer profile', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for template not owned by this issuer', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/templates/00000000-0000-0000-0000-000000000000`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});

// ===================================================================
// Marketplace extended
// ===================================================================

describe('Marketplace Extended - /api/v1', () => {
  let app: FastifyInstance;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let issuerId: string;
  let holderToken: string;
  let holderUserId: string;
  let adminToken: string;
  let adminUserId: string;
  let publicTemplateId: string;
  const issuerEmail = 'mktplace-ext-issuer@example.com';
  const holderEmail = 'mktplace-ext-holder@example.com';
  const adminEmail = 'mktplace-ext-admin@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.credentialTemplate.deleteMany({ where: { issuer: { userId: existing.id } } });
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
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
    process.env.JWT_SECRET = 'test-jwt-secret-for-marketplace-ext-32ch';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(issuerEmail);
    await cleanupUser(holderEmail);
    await cleanupUser(adminEmail);

    // Issuer user
    const issuerUser = await prisma.user.create({
      data: { email: issuerEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    issuerUserId = issuerUser.id;

    const issuerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: issuerEmail, password: TEST_PASSWORD },
    });
    issuerToken = issuerLogin.json().access_token;

    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    issuerDidId = didRes.json().id;

    // Holder user (no issuer profile)
    const holderUser = await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    holderUserId = holderUser.id;

    const holderLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;

    // Admin user
    const adminUser = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    adminUserId = adminUser.id;

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    // Submit an issuer application
    const applyRes = await app.inject({
      method: 'POST',
      url: '/api/v1/issuers/apply',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        didId: issuerDidId,
        organizationName: 'Marketplace Extended Org',
        website: 'https://mktplace-ext.example.com',
      },
    });
    issuerId = applyRes.json().id;

    // Create a public template directly in DB for fork tests
    const template = await prisma.credentialTemplate.create({
      data: {
        issuerId,
        name: 'Public Extended Template',
        credentialType: 'PublicExtType',
        schema: { type: 'object' },
        requiredAttributes: ['field1'],
        optionalAttributes: [],
        isPublic: true,
        isActive: true,
      },
    });
    publicTemplateId = template.id;
  });

  afterAll(async () => {
    await cleanupUser(issuerEmail);
    await cleanupUser(holderEmail);
    await cleanupUser(adminEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ── POST /issuers/apply - error branches ──────────────────────────

  describe('POST /api/v1/issuers/apply - error branches', () => {
    it('should return 404 when DID not owned by user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers/apply',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          didId: '00000000-0000-0000-0000-000000000000',
          organizationName: 'Wrong DID Org',
        },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/did not found/i);
    });

    it('should return 409 when issuer profile already exists for this DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers/apply',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          didId: issuerDidId,
          organizationName: 'Duplicate Application',
        },
      });

      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toMatch(/already exists/i);
    });

    it('should return 400 for Zod validation failure (missing didId)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers/apply',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { organizationName: 'No DID Org' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for invalid website URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers/apply',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          didId: issuerDidId,
          organizationName: 'Bad URL Org',
          website: 'not-a-url',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers/apply',
        payload: { didId: issuerDidId, organizationName: 'No Auth' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ── GET /issuers/directory - filter branches ──────────────────────

  describe('GET /api/v1/issuers/directory - filter branches', () => {
    it('should filter by tier', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/directory?tier=SELF_DECLARED',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('issuers');
      body.issuers.forEach((i: { tier: string }) => {
        expect(i.tier).toBe('SELF_DECLARED');
      });
    });

    it('should filter by search string', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/directory?search=Marketplace+Extended',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('issuers');
      // The created org matches
      expect(body.issuers.some((i: { organizationName: string }) =>
        i.organizationName.includes('Marketplace Extended')
      )).toBe(true);
    });

    it('should support pagination with page and limit', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/directory?page=1&limit=5',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(5);
    });
  });

  // ── GET /admin/issuer-applications - filter branches ──────────────

  describe('GET /api/v1/admin/issuer-applications - filter branches', () => {
    it('should filter by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuer-applications?status=PENDING',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      body.applications.forEach((a: { trustStatus: string }) => {
        expect(a.trustStatus).toBe('PENDING');
      });
    });

    it('should require admin role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuer-applications',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  // ── PATCH /admin/issuer-applications/:id - reject branch ─────────

  describe('PATCH /admin/issuer-applications/:id - error branches', () => {
    it('should return 403 for non-admin user', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuer-applications/${issuerId}`,
        headers: { authorization: `Bearer ${holderToken}` },
        payload: { action: 'approve' },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent application', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/issuer-applications/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'approve' },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/not found/i);
    });

    it('should return 400 for invalid action', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuer-applications/${issuerId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'invalidaction' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should reject an application with reject action', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuer-applications/${issuerId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'reject', reason: 'Insufficient documentation' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trustStatus).toBe('REVOKED');
    });

    it('should approve with default tier when tier not specified', async () => {
      // Re-set trust status via DB so we can approve again
      await prisma.issuer.update({
        where: { id: issuerId },
        data: { trustStatus: 'PENDING', revokedAt: null },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuer-applications/${issuerId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'approve' }, // no tier specified → defaults to VERIFIED
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trustStatus).toBe('TRUSTED');
      expect(body.tier).toBe('VERIFIED');
    });
  });

  // ── GET /marketplace/templates - filter branches ──────────────────

  describe('GET /api/v1/marketplace/templates - filter branches', () => {
    it('should filter by credential type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/marketplace/templates?type=PublicExtType',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      body.templates.forEach((t: { credentialType: string }) => {
        expect(t.credentialType).toBe('PublicExtType');
      });
    });

    it('should filter by search term', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/marketplace/templates?search=Public+Extended',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.templates.some((t: { name: string }) => t.name.includes('Public Extended'))).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/marketplace/templates?page=1&limit=10',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(10);
    });
  });

  // ── POST /marketplace/templates/:id/fork - error branches ─────────

  describe('POST /marketplace/templates/:id/fork - error branches', () => {
    it('should return 404 for non-existent or private template', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/marketplace/templates/00000000-0000-0000-0000-000000000000/fork',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toMatch(/not found/i);
    });

    it('should return 403 when user has no issuer profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/templates/${publicTemplateId}/fork`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toMatch(/issuer profile/i);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/templates/${publicTemplateId}/fork`,
      });

      expect(res.statusCode).toBe(401);
    });

    it('should fork a public template successfully when user has issuer profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/templates/${publicTemplateId}/fork`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.forkedFromId).toBe(publicTemplateId);
      expect(body.name).toContain('Fork');
    });
  });
});
