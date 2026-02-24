/**
 * Admin Issuers Endpoint Integration Tests
 *
 * Tests for /api/v1/admin/issuers:
 * - GET / (paginated issuer listing, admin-only)
 * - PATCH /:id/approve (approve issuer)
 * - PATCH /:id/suspend (suspend issuer)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Admin Issuers - /api/v1/admin/issuers', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let holderToken: string;
  let issuerId: string;
  const adminEmail = 'admin-issuers-admin@example.com';
  const holderEmail = 'admin-issuers-holder@example.com';
  const issuerEmail = 'admin-issuers-issuer@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.auditLog.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-admin-issuers';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    await cleanupUser(issuerEmail);

    // Create admin
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });

    // Create holder
    await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });

    // Create issuer user with DID and issuer profile
    const issuerUser = await prisma.user.create({
      data: { email: issuerEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });

    // Login issuer to create DID via API
    const issuerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: issuerEmail, password: TEST_PASSWORD },
    });
    const issuerToken = issuerLogin.json().access_token;

    const didRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    const didId = didRes.json().id;

    // Create issuer profile
    const issuerProfile = await prisma.issuer.create({
      data: {
        userId: issuerUser.id,
        didId,
        organizationName: 'Test University',
        trustStatus: 'PENDING',
      },
    });
    issuerId = issuerProfile.id;

    // Login admin
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    // Login holder
    const holderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(issuerEmail);
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/admin/issuers', () => {
    it('should return paginated issuer list for admins', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuers',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('issuers');
      expect(Array.isArray(body.issuers)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');

      const issuer = body.issuers.find((i: { id: string }) => i.id === issuerId);
      expect(issuer).toBeDefined();
      expect(issuer.organizationName).toBe('Test University');
      expect(issuer).toHaveProperty('did');
      expect(issuer).toHaveProperty('trustStatus');
      expect(issuer).toHaveProperty('credentialCount');
    });

    it('should support search by organization name', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuers?search=Test%20University',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.issuers.length).toBeGreaterThanOrEqual(1);
      expect(body.issuers[0].organizationName).toContain('Test University');
    });

    it('should reject non-admin users with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuers',
        headers: { authorization: `Bearer ${holderToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/admin/issuers with status filter', () => {
    it('should filter issuers by trust status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuers?status=PENDING',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.issuers.every((i: { trustStatus: string }) => i.trustStatus === 'PENDING')).toBe(true);
    });
  });

  describe('PATCH /api/v1/admin/issuers/:id/approve', () => {
    it('should approve a pending issuer', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuers/${issuerId}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trustStatus).toBe('TRUSTED');
      expect(body.verifiedAt).toBeTruthy();
    });

    it('should return 400 when issuer is already approved', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuers/${issuerId}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('already approved');
    });

    it('should return 404 for non-existent issuer', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/issuers/00000000-0000-0000-0000-000000000000/approve',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/admin/issuers/:id/suspend', () => {
    it('should suspend a trusted issuer', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuers/${issuerId}/suspend`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trustStatus).toBe('REVOKED');
    });

    it('should return 400 when issuer is already suspended', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuers/${issuerId}/suspend`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().detail).toContain('already suspended');
    });

    it('should return 404 for non-existent issuer', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/admin/issuers/00000000-0000-0000-0000-000000000000/suspend',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
