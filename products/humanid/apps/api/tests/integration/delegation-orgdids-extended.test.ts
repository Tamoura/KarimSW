/**
 * Issuance Delegation & Org DIDs Extended Integration Tests
 *
 * Covers error/edge-case branches for:
 *   /api/v1/issuance-delegation
 *     - POST / Zod error (missing fields, bad types)
 *     - POST / parent issuer not owned by user (403)
 *     - GET /  with parentIssuerId / delegateIssuerId query filters
 *     - GET /:id/chain not found (404)
 *     - DELETE /:id not found (404)
 *     - DELETE /:id parent issuer not owned (403)
 *     - DELETE /:id successful revoke
 *
 *   /api/v1/org-dids
 *     - POST / Zod error (missing orgId, bad type enum, name too long)
 *     - POST / user not a member of org (403)
 *     - POST /:id/children parent not found (404)
 *     - POST /:id/children user not member of parent org (403)
 *     - POST /:id/children Zod error (400)
 *     - GET / with orgId filter - user not member (403)
 *     - GET / with type filter
 *     - GET /:id/tree not found (404)
 *     - GET /:id/tree user not member (403)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Issuance Delegation & Org DIDs Extended - error branches', () => {
  let app: FastifyInstance;

  // Primary user (issuer/owner)
  let ownerToken: string;
  let ownerUserId: string;
  let ownerIssuerId: string;    // pair-1 parent
  let ownerIssuerId2: string;   // pair-2 parent (chain test)
  let ownerIssuerId3: string;   // pair-3 parent (revoke test)
  let ownerIssuerId4: string;   // pair-4 parent (delete-403 parent for outsider delegation)
  let otherIssuerId: string;    // pair-1 delegate (outsider)
  let otherIssuerId2: string;   // pair-2 delegate (outsider)
  let otherIssuerId3: string;   // pair-3 delegate (outsider)

  // Second user (outsider)
  let outsiderToken: string;
  let outsiderUserId: string;
  let outsiderIssuerId4: string; // parent for delete-403 test

  // Org + DID for org-did tests
  let orgId: string;
  let memberDidId: string;    // a DID that belongs to ownerUser
  let otherOrgId: string;     // org where outsider is owner

  const ownerEmail = 'deleg-ext-owner@example.com';
  const outsiderEmail = 'deleg-ext-outsider@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Delete delegations where the user's issuers are involved
      const userIssuers = await prisma.issuer.findMany({
        where: { userId: existing.id },
        select: { id: true },
      });
      const issuerIds = userIssuers.map((i) => i.id);
      if (issuerIds.length > 0) {
        await prisma.issuanceDelegation.deleteMany({
          where: {
            OR: [
              { parentIssuerId: { in: issuerIds } },
              { delegateIssuerId: { in: issuerIds } },
            ],
          },
        });
      }
      await prisma.orgDid.deleteMany({
        where: { orgId: { in: (await prisma.organizationMember.findMany({ where: { userId: existing.id, role: 'OWNER' }, select: { orgId: true } })).map((m) => m.orgId) } },
      });
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-deleg-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(ownerEmail);
    await cleanupUser(outsiderEmail);

    // Create owner user
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    ownerUserId = owner.id;
    const ownerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: ownerEmail, password: TEST_PASSWORD },
    });
    ownerToken = ownerLogin.json().access_token;

    // Create outsider user
    const outsider = await prisma.user.create({
      data: { email: outsiderEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    outsiderUserId = outsider.id;
    const outsiderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: outsiderEmail, password: TEST_PASSWORD },
    });
    outsiderToken = outsiderLogin.json().access_token;

    // Helper to create a DID + issuer for a given user token
    async function createIssuer(token: string, organizationName: string): Promise<{ didId: string; issuerId: string }> {
      const didRes = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      const didId = didRes.json().id;
      const issuerRes = await app.inject({
        method: 'POST', url: '/api/v1/issuers',
        headers: { authorization: `Bearer ${token}` },
        payload: { organizationName, didId },
      });
      return { didId, issuerId: issuerRes.json().id };
    }

    // Create owner issuers (4 separate, one per unique delegation pair)
    const ownerPair1 = await createIssuer(ownerToken, 'Owner Issuer 1');
    memberDidId = ownerPair1.didId;
    ownerIssuerId = ownerPair1.issuerId;

    const ownerPair2 = await createIssuer(ownerToken, 'Owner Issuer 2');
    ownerIssuerId2 = ownerPair2.issuerId;

    const ownerPair3 = await createIssuer(ownerToken, 'Owner Issuer 3');
    ownerIssuerId3 = ownerPair3.issuerId;

    const ownerPair4 = await createIssuer(ownerToken, 'Owner Issuer 4');
    ownerIssuerId4 = ownerPair4.issuerId;

    // Create outsider issuers
    const otherPair1 = await createIssuer(outsiderToken, 'Outsider Issuer 1');
    otherIssuerId = otherPair1.issuerId;

    const otherPair2 = await createIssuer(outsiderToken, 'Outsider Issuer 2');
    otherIssuerId2 = otherPair2.issuerId;

    const otherPair3 = await createIssuer(outsiderToken, 'Outsider Issuer 3');
    otherIssuerId3 = otherPair3.issuerId;

    // pair-4: outsider is parent (for delete-403 test)
    const otherPair4 = await createIssuer(outsiderToken, 'Outsider Issuer 4 Parent');
    outsiderIssuerId4 = otherPair4.issuerId;

    // Create an org owned by owner user
    const orgRes = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Delegation Test Org', slug: `deleg-test-org-${Date.now()}` },
    });
    orgId = orgRes.json().id;

    // Create an org owned by outsider
    const otherOrgRes = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${outsiderToken}` },
      payload: { name: 'Outsider Org', slug: `outsider-org-${Date.now()}` },
    });
    otherOrgId = otherOrgRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(ownerEmail);
    await cleanupUser(outsiderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ==================== POST /api/v1/issuance-delegation ====================

  describe('POST /api/v1/issuance-delegation', () => {
    it('should return 400 for Zod error - missing parentIssuerId', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          delegateIssuerId: otherIssuerId,
          allowedTypes: ['UniversityDegree'],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing delegateIssuerId', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId,
          allowedTypes: ['UniversityDegree'],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - allowedTypes empty array', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId,
          delegateIssuerId: otherIssuerId,
          allowedTypes: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - non-UUID parentIssuerId', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: 'not-a-uuid',
          delegateIssuerId: otherIssuerId,
          allowedTypes: ['UniversityDegree'],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - maxDepth exceeds 5', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId,
          delegateIssuerId: otherIssuerId,
          allowedTypes: ['UniversityDegree'],
          maxDepth: 10,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 403 when parentIssuerId does not belong to the user', async () => {
      // ownerUser tries to use outsider's issuer (otherIssuerId) as parent
      // Use a unique pair (outsider as parent, owner as delegate) to avoid unique constraint issues
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: outsiderIssuerId4, // owned by outsider - 403 path
          delegateIssuerId: ownerIssuerId4,
          allowedTypes: ['UniversityDegree'],
        },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('do not own');
    });

    it('should return 201 with default maxDepth when not provided', async () => {
      // Use ownerIssuerId (pair-1) -> otherIssuerId (pair-1)
      const res = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId,
          delegateIssuerId: otherIssuerId,
          allowedTypes: ['EmploymentCertificate'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.maxDepth).toBe(1);
      expect(body.allowedTypes).toContain('EmploymentCertificate');
    });
  });

  // ==================== GET /api/v1/issuance-delegation ====================

  describe('GET /api/v1/issuance-delegation', () => {
    it('should list delegations with no filters', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('delegations');
      expect(body).toHaveProperty('total');
    });

    it('should filter by parentIssuerId query param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/issuance-delegation?parentIssuerId=${ownerIssuerId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const d of body.delegations) {
        expect(d.parentIssuerId).toBe(ownerIssuerId);
      }
    });

    it('should filter by delegateIssuerId query param', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/issuance-delegation?delegateIssuerId=${otherIssuerId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('delegations');
    });

    it('should return empty list for user with no issuers', async () => {
      // Create a fresh user with no issuers
      const freshEmail = `deleg-fresh-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      await prisma.user.create({
        data: { email: freshEmail, passwordHash, role: 'HOLDER', emailVerified: true },
      });
      const freshLogin = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: freshEmail, password: TEST_PASSWORD },
      });
      const freshToken = freshLogin.json().access_token;

      const res = await app.inject({
        method: 'GET', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().total).toBe(0);

      // Cleanup
      const freshUser = await prisma.user.findUnique({ where: { email: freshEmail } });
      if (freshUser) {
        await prisma.session.deleteMany({ where: { userId: freshUser.id } });
        await prisma.user.delete({ where: { email: freshEmail } });
      }
    });
  });

  // ==================== GET /api/v1/issuance-delegation/:id/chain ====================

  describe('GET /api/v1/issuance-delegation/:id/chain', () => {
    it('should return 404 for non-existent delegation id', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'GET', url: `/api/v1/issuance-delegation/${fakeId}/chain`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return chain info for an active delegation', async () => {
      // Use pair-2 (ownerIssuerId2 -> otherIssuerId2) - unique pair not used elsewhere
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId2,
          delegateIssuerId: otherIssuerId2,
          allowedTypes: ['GovernmentID'],
          maxDepth: 2,
        },
      });
      expect(createRes.statusCode).toBe(201);
      const delegationId = createRes.json().id;

      const chainRes = await app.inject({
        method: 'GET', url: `/api/v1/issuance-delegation/${delegationId}/chain`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(chainRes.statusCode).toBe(200);
      const body = chainRes.json();
      expect(body).toHaveProperty('valid', true);
      expect(body).toHaveProperty('chain');
      expect(body.chain).toHaveLength(2);
      expect(body.chain[0].role).toBe('parent');
      expect(body.chain[1].role).toBe('delegate');
      expect(body.maxDepth).toBe(2);
      expect(body.status).toBe('ACTIVE');
    });

    it('should report invalid for a revoked delegation chain', async () => {
      // Use pair-3 (ownerIssuerId3 -> otherIssuerId3) - unique pair not used elsewhere
      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId3,
          delegateIssuerId: otherIssuerId3,
          allowedTypes: ['HealthRecord'],
        },
      });
      const delegationId = createRes.json().id;

      await prisma.issuanceDelegation.update({
        where: { id: delegationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      const chainRes = await app.inject({
        method: 'GET', url: `/api/v1/issuance-delegation/${delegationId}/chain`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(chainRes.statusCode).toBe(200);
      const body = chainRes.json();
      expect(body.valid).toBe(false);
      expect(body.status).toBe('REVOKED');
    });
  });

  // ==================== DELETE /api/v1/issuance-delegation/:id ====================

  describe('DELETE /api/v1/issuance-delegation/:id', () => {
    it('should return 404 for non-existent delegation', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/issuance-delegation/${fakeId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 403 when caller does not own the parent issuer', async () => {
      // outsider creates a delegation using outsiderIssuerId4 as parent -> ownerIssuerId4 as delegate
      const outsiderDelegRes = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {
          parentIssuerId: outsiderIssuerId4,
          delegateIssuerId: ownerIssuerId4,
          allowedTypes: ['DriversLicense'],
        },
      });
      expect(outsiderDelegRes.statusCode).toBe(201);
      const delegId = outsiderDelegRes.json().id;

      // ownerUser tries to delete outsider's delegation
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/issuance-delegation/${delegId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Not authorized');
    });

    it('should successfully revoke a delegation the user owns', async () => {
      // Create fresh issuers (pair-5) so unique constraint is not violated
      const did5Res = await app.inject({ method: 'POST', url: '/api/v1/dids', headers: { authorization: `Bearer ${ownerToken}` }, payload: {} });
      const did5Id = did5Res.json().id;
      const issuer5Res = await app.inject({ method: 'POST', url: '/api/v1/issuers', headers: { authorization: `Bearer ${ownerToken}` }, payload: { organizationName: 'Owner Issuer 5', didId: did5Id } });
      const ownerIssuerId5 = issuer5Res.json().id;

      const did6Res = await app.inject({ method: 'POST', url: '/api/v1/dids', headers: { authorization: `Bearer ${outsiderToken}` }, payload: {} });
      const did6Id = did6Res.json().id;
      const issuer6Res = await app.inject({ method: 'POST', url: '/api/v1/issuers', headers: { authorization: `Bearer ${outsiderToken}` }, payload: { organizationName: 'Outsider Issuer 5', didId: did6Id } });
      const otherIssuerId5 = issuer6Res.json().id;

      const createRes = await app.inject({
        method: 'POST', url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          parentIssuerId: ownerIssuerId5,
          delegateIssuerId: otherIssuerId5,
          allowedTypes: ['ResidenceProof'],
        },
      });
      expect(createRes.statusCode).toBe(201);
      const delegId = createRes.json().id;

      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/issuance-delegation/${delegId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain('revoked');

      const record = await prisma.issuanceDelegation.findUnique({ where: { id: delegId } });
      expect(record?.status).toBe('REVOKED');
      expect(record?.revokedAt).toBeTruthy();
    });
  });

  // ==================== POST /api/v1/org-dids ====================

  describe('POST /api/v1/org-dids', () => {
    it('should return 400 for Zod error - missing orgId', async () => {
      const fakeDidId = randomUUID();
      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          didId: fakeDidId,
          type: 'COMPANY',
          name: 'HQ',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid type enum', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: memberDidId,
          type: 'INVALID_TYPE',
          name: 'HQ',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - name too long', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: memberDidId,
          type: 'DEPARTMENT',
          name: 'N'.repeat(201),
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - description too long', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: memberDidId,
          type: 'SERVICE',
          name: 'Auth Service',
          description: 'D'.repeat(501),
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 403 when user is not a member of the org', async () => {
      // ownerUser tries to create DID under outsider's org - 403 triggers before DID unique check
      // Use a fake DID UUID (403 fires at membership check before DB insert)
      const fakeDid = randomUUID();
      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: otherOrgId,
          didId: fakeDid,
          type: 'COMPANY',
          name: 'Unauthorized HQ',
        },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Not a member');
    });

    it('should return 201 for valid org DID creation', async () => {
      // Create a fresh DID for this record
      const freshDidRes = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      const freshDidId = freshDidRes.json().id;

      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: freshDidId,
          type: 'COMPANY',
          name: 'Owner Corp HQ',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.orgId).toBe(orgId);
      expect(body.type).toBe('COMPANY');
      expect(body).toHaveProperty('id');
    });
  });

  // ==================== POST /api/v1/org-dids/:id/children ====================

  describe('POST /api/v1/org-dids/:id/children', () => {
    let parentOrgDidId: string;

    beforeAll(async () => {
      // Create a fresh DID + parent org DID
      const didRes = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      const parentDidId = didRes.json().id;

      const res = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: parentDidId,
          type: 'COMPANY',
          name: 'Parent Corp',
        },
      });
      parentOrgDidId = res.json().id;
    });

    it('should return 404 for non-existent parent org DID', async () => {
      const fakeId = randomUUID();
      const fakeChildDid = randomUUID();
      const res = await app.inject({
        method: 'POST', url: `/api/v1/org-dids/${fakeId}/children`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: fakeChildDid,
          type: 'DEPARTMENT',
          name: 'Engineering',
        },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 403 when user is not member of parent org', async () => {
      // outsider tries to add child to owner's org DID - 403 fires before DB insert
      const fakeDid = randomUUID();
      const res = await app.inject({
        method: 'POST', url: `/api/v1/org-dids/${parentOrgDidId}/children`,
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {
          orgId: orgId,
          didId: fakeDid,
          type: 'DEPARTMENT',
          name: 'Intruder Dept',
        },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Not a member');
    });

    it('should return 400 for Zod error - missing name', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/org-dids/${parentOrgDidId}/children`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: randomUUID(),
          type: 'DEPARTMENT',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should create a child org DID successfully', async () => {
      // Create a fresh DID for the child
      const childDidRes = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {},
      });
      const childDidId = childDidRes.json().id;

      const res = await app.inject({
        method: 'POST', url: `/api/v1/org-dids/${parentOrgDidId}/children`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: childDidId,
          type: 'DEPARTMENT',
          name: 'Engineering Dept',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.parentOrgDidId).toBe(parentOrgDidId);
      expect(body.type).toBe('DEPARTMENT');
    });
  });

  // ==================== GET /api/v1/org-dids ====================

  describe('GET /api/v1/org-dids', () => {
    it('should list org DIDs scoped to user memberships', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('orgDids');
      expect(body).toHaveProperty('total');
    });

    it('should filter by type query param', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/org-dids?type=COMPANY',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const d of body.orgDids) {
        expect(d.type).toBe('COMPANY');
      }
    });

    it('should return 403 when filtering by orgId the user is not a member of', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/org-dids?orgId=${otherOrgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Not a member');
    });

    it('should filter by orgId that the user is a member of', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/org-dids?orgId=${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const d of body.orgDids) {
        expect(d.orgId).toBe(orgId);
      }
    });
  });

  // ==================== GET /api/v1/org-dids/:id/tree ====================

  describe('GET /api/v1/org-dids/:id/tree', () => {
    it('should return 404 for non-existent org DID', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'GET', url: `/api/v1/org-dids/${fakeId}/tree`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 403 when user is not a member of the org DID org', async () => {
      // Create an org DID in outsider's org
      const outsiderDidRes = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {},
      });
      const outsiderDid3 = outsiderDidRes.json().id;

      const outsiderOrgDidRes = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {
          orgId: otherOrgId,
          didId: outsiderDid3,
          type: 'COMPANY',
          name: 'Outsider Corp',
        },
      });
      const outsiderOrgDidId = outsiderOrgDidRes.json().id;

      // ownerUser tries to get the tree
      const res = await app.inject({
        method: 'GET', url: `/api/v1/org-dids/${outsiderOrgDidId}/tree`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Not a member');
    });

    it('should return tree structure for a valid org DID', async () => {
      // Create fresh DIDs for root and child (unique constraint)
      const rootDidRes = await app.inject({ method: 'POST', url: '/api/v1/dids', headers: { authorization: `Bearer ${ownerToken}` }, payload: {} });
      const rootDidId = rootDidRes.json().id;

      const childDidRes = await app.inject({ method: 'POST', url: '/api/v1/dids', headers: { authorization: `Bearer ${ownerToken}` }, payload: {} });
      const childDidId = childDidRes.json().id;

      const parentRes = await app.inject({
        method: 'POST', url: '/api/v1/org-dids',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: rootDidId,
          type: 'COMPANY',
          name: 'Tree Root',
        },
      });
      const treeRootId = parentRes.json().id;

      // Add a child
      await app.inject({
        method: 'POST', url: `/api/v1/org-dids/${treeRootId}/children`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: orgId,
          didId: childDidId,
          type: 'DEPARTMENT',
          name: 'Tree Child',
        },
      });

      const treeRes = await app.inject({
        method: 'GET', url: `/api/v1/org-dids/${treeRootId}/tree`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(treeRes.statusCode).toBe(200);
      const body = treeRes.json();
      expect(body).toHaveProperty('id', treeRootId);
      expect(body).toHaveProperty('children');
      expect(body.children.length).toBeGreaterThan(0);
    });
  });
});
