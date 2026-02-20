/**
 * Organizational DIDs Integration Tests
 *
 * Tests for /api/v1/org-dids endpoints:
 * - POST /               (create org DID)
 * - GET /                (list org DIDs)
 * - GET /:id/tree        (DID hierarchy tree)
 * - POST /:id/children   (create child DID under parent)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Organizational DIDs - /api/v1/org-dids', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let orgId: string;
  let parentOrgDidId: string;
  let didId: string;
  const ownerEmail = 'orgdid-owner@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-orgdids';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(ownerEmail);

    // Clean test org
    const existingOrg = await prisma.organization.findUnique({ where: { slug: 'orgdid-test' } });
    if (existingOrg) {
      await prisma.orgDid.deleteMany({ where: { orgId: existingOrg.id } });
      await prisma.organizationMember.deleteMany({ where: { orgId: existingOrg.id } });
      await prisma.organization.delete({ where: { id: existingOrg.id } });
    }

    const user = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: ownerEmail, password: TEST_PASSWORD },
    });
    ownerToken = loginRes.json().access_token;

    // Create org
    const orgRes = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'OrgDID Test Corp', slug: 'orgdid-test' },
    });
    orgId = orgRes.json().id;

    // Create a DID for org use
    const didRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: {},
    });
    didId = didRes.json().id;
  });

  afterAll(async () => {
    await prisma.orgDid.deleteMany({ where: { orgId } });
    await prisma.organizationMember.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await cleanupUser(ownerEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/org-dids', () => {
    it('should create a company-level org DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          didId,
          type: 'COMPANY',
          name: 'OrgDID Test Corp Main Identity',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.type).toBe('COMPANY');
      parentOrgDidId = body.id;
    });
  });

  describe('POST /api/v1/org-dids/:id/children', () => {
    it('should create a department DID under parent', async () => {
      // Create another DID for the department
      const didRes = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/org-dids/${parentOrgDidId}/children`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          didId: didRes.json().id,
          type: 'DEPARTMENT',
          name: 'Engineering Department',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.type).toBe('DEPARTMENT');
      expect(body.parentOrgDidId).toBe(parentOrgDidId);
    });
  });

  describe('GET /api/v1/org-dids', () => {
    it('should list org DIDs filtered by org', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/org-dids?orgId=${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('orgDids');
      expect(body.orgDids.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/org-dids/:id/tree', () => {
    it('should return DID hierarchy tree', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/org-dids/${parentOrgDidId}/tree`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('children');
      expect(body.children.length).toBeGreaterThan(0);
    });
  });
});
