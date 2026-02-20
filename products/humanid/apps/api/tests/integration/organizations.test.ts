/**
 * Organization & RBAC Integration Tests
 *
 * Tests for /api/v1/orgs endpoints:
 * - POST /           (create org)
 * - GET /:id         (get org)
 * - POST /:id/members (invite member)
 * - PATCH /:id/members/:userId (update role)
 * - DELETE /:id/members/:userId (remove member)
 * - GET /:id/members (list members)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Organizations & RBAC - /api/v1/orgs', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let ownerUserId: string;
  let memberToken: string;
  let memberUserId: string;
  let orgId: string;
  const ownerEmail = 'org-owner@example.com';
  const memberEmail = 'org-member@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.webhookDelivery.deleteMany({ where: { webhook: { userId: existing.id } } });
      await prisma.webhook.deleteMany({ where: { userId: existing.id } });
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-orgs';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Cleanup stale data
    await cleanupUser(ownerEmail);
    await cleanupUser(memberEmail);
    // Clean orgs by slug
    const existingOrg = await prisma.organization.findUnique({ where: { slug: 'test-org' } });
    if (existingOrg) {
      await prisma.organizationMember.deleteMany({ where: { orgId: existingOrg.id } });
      await prisma.organization.delete({ where: { id: existingOrg.id } });
    }

    // Create owner user
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    ownerUserId = owner.id;

    const ownerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: ownerEmail, password: TEST_PASSWORD },
    });
    ownerToken = ownerLogin.json().access_token;

    // Create member user
    const member = await prisma.user.create({
      data: { email: memberEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    memberUserId = member.id;

    const memberLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: memberEmail, password: TEST_PASSWORD },
    });
    memberToken = memberLogin.json().access_token;
  });

  afterAll(async () => {
    // Clean up org members first
    if (orgId) {
      await prisma.organizationMember.deleteMany({ where: { orgId } });
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    }
    await cleanupUser(ownerEmail);
    await cleanupUser(memberEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/orgs', () => {
    it('should create an organization', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orgs',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Test Organization', slug: 'test-org' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('Test Organization');
      expect(body.slug).toBe('test-org');
      orgId = body.id;
    });

    it('should reject duplicate slug', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orgs',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Another Org', slug: 'test-org' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/orgs',
        payload: { name: 'No Auth Org', slug: 'no-auth' },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/orgs/:id', () => {
    it('should return organization details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/orgs/${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Test Organization');
      expect(body).toHaveProperty('members');
    });
  });

  describe('POST /api/v1/orgs/:id/members', () => {
    it('should invite a member', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { userId: memberUserId, role: 'MEMBER' },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.userId).toBe(memberUserId);
      expect(body.role).toBe('MEMBER');
      expect(body.status).toBe('ACTIVE');
    });

    it('should reject non-owner inviting', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { userId: '00000000-0000-0000-0000-000000000000', role: 'MEMBER' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/orgs/:id/members', () => {
    it('should list organization members', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.members.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PATCH /api/v1/orgs/:id/members/:userId', () => {
    it('should update member role', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/orgs/${orgId}/members/${memberUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'ADMIN' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.role).toBe('ADMIN');
    });
  });

  describe('DELETE /api/v1/orgs/:id/members/:userId', () => {
    it('should remove a member', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/orgs/${orgId}/members/${memberUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/removed/i);
    });
  });
});
