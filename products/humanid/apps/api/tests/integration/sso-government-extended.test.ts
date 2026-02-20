/**
 * SSO & Government Extended Integration Tests
 *
 * Covers error/edge-case branches for:
 *   /api/v1/sso
 *     - POST /oidc Zod validation errors (bad URL, missing clientId/Secret)
 *     - POST /oidc org not found (requireOrgOwner 403)
 *     - POST /oidc user is not org owner/admin (403)
 *     - POST /saml Zod validation errors (missing entityId, bad metadataUrl)
 *     - POST /saml org not found (403)
 *     - GET /providers without orgId param (400)
 *     - GET /providers org not found (404)
 *     - GET /providers user not a member of org (403)
 *     - GET /providers with OIDC + SAML configured (lists both)
 *     - DELETE /oidc without orgId (400)
 *     - DELETE /oidc user not org owner (403)
 *
 *   /api/v1/government
 *     - POST /partnerships/apply Zod error - missing governmentEntity (400)
 *     - POST /partnerships/apply Zod error - invalid contactEmail (400)
 *     - POST /partnerships/apply Zod error - country too short (400)
 *     - GET /partnerships by non-admin (403)
 *     - POST /credential-schemes by non-admin (403)
 *     - POST /credential-schemes Zod error - missing requiredAttributes (400)
 *     - GET /credential-schemes by non-admin (403)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('SSO & Government Extended - error branches', () => {
  let app: FastifyInstance;

  let ownerToken: string;
  let ownerUserId: string;
  let memberToken: string;
  let memberUserId: string;
  let outsiderToken: string;
  let adminToken: string;
  let adminUserId: string;

  let orgId: string; // org where ownerUser is OWNER, memberUser is MEMBER

  const ownerEmail = 'sso-ext-owner@example.com';
  const memberEmail = 'sso-ext-member@example.com';
  const outsiderEmail = 'sso-ext-outsider@example.com';
  const adminEmail = 'sso-ext-admin@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-sso-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Clean up before seeding
    await cleanupUser(ownerEmail);
    await cleanupUser(memberEmail);
    await cleanupUser(outsiderEmail);
    await cleanupUser(adminEmail);

    // Create owner
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    ownerUserId = owner.id;
    const ownerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: ownerEmail, password: TEST_PASSWORD },
    });
    ownerToken = ownerLogin.json().access_token;

    // Create member (will be added to the org as MEMBER)
    const member = await prisma.user.create({
      data: { email: memberEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    memberUserId = member.id;
    const memberLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: memberEmail, password: TEST_PASSWORD },
    });
    memberToken = memberLogin.json().access_token;

    // Create outsider
    await prisma.user.create({
      data: { email: outsiderEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    const outsiderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: outsiderEmail, password: TEST_PASSWORD },
    });
    outsiderToken = outsiderLogin.json().access_token;

    // Create admin
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    adminUserId = admin.id;
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    // Owner creates an org
    const orgRes = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'SSO Test Org', slug: `sso-test-org-${Date.now()}` },
    });
    orgId = orgRes.json().id;

    // Add memberUser as MEMBER
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { userId: memberUserId, role: 'MEMBER' },
    });
  });

  afterAll(async () => {
    // Clean up org and SSO config
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (org) {
      await prisma.organizationMember.deleteMany({ where: { orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    await cleanupUser(ownerEmail);
    await cleanupUser(memberEmail);
    await cleanupUser(outsiderEmail);
    await cleanupUser(adminEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ==================== POST /api/v1/sso/oidc ====================

  describe('POST /api/v1/sso/oidc', () => {
    it('should return 400 for Zod error - missing discoveryUrl', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          clientId: 'my-client',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid discoveryUrl (not a URL)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          discoveryUrl: 'not-a-url',
          clientId: 'my-client',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing clientId', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - non-UUID orgId', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: 'not-a-uuid',
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'my-client',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 403 when user is MEMBER (not OWNER/ADMIN) of org', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          orgId,
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'my-client',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('owners/admins');
    });

    it('should return 403 when user is not a member of org at all', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: {
          orgId,
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'my-client',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for non-existent org (requireOrgOwner throws)', async () => {
      const fakeOrgId = randomUUID();
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId: fakeOrgId,
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'my-client',
          clientSecret: 'my-secret',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 201 when org owner configures OIDC', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'google-client-id',
          clientSecret: 'google-client-secret',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.provider).toBe('oidc');
      expect(body.orgId).toBe(orgId);
      expect(body).toHaveProperty('configuredAt');
      // Secret must not be echoed back
      expect(body).not.toHaveProperty('clientSecret');
    });
  });

  // ==================== POST /api/v1/sso/saml ====================

  describe('POST /api/v1/sso/saml', () => {
    it('should return 400 for Zod error - missing entityId', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/saml',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          metadataUrl: 'https://idp.example.com/metadata',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid metadataUrl', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/saml',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          metadataUrl: 'not-a-url',
          entityId: 'urn:my-idp',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 403 when MEMBER tries to configure SAML', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/saml',
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {
          orgId,
          metadataUrl: 'https://idp.example.com/metadata',
          entityId: 'urn:my-idp',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 201 when org owner configures SAML', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/sso/saml',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          metadataUrl: 'https://idp.example.com/saml/metadata',
          entityId: 'urn:example-idp:saml',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.provider).toBe('saml');
      expect(body.orgId).toBe(orgId);
      expect(body.entityId).toBe('urn:example-idp:saml');
    });
  });

  // ==================== GET /api/v1/sso/providers ====================

  describe('GET /api/v1/sso/providers', () => {
    it('should return 400 when orgId query param is missing', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/sso/providers',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('orgId');
    });

    it('should return 404 for non-existent org', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'GET', url: `/api/v1/sso/providers?orgId=${fakeId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 403 when user is not a member of org', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/sso/providers?orgId=${orgId}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Not a member');
    });

    it('should list both OIDC and SAML providers when both are configured', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/sso/providers?orgId=${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.orgId).toBe(orgId);
      expect(body).toHaveProperty('providers');
      const types = body.providers.map((p: { type: string }) => p.type);
      expect(types).toContain('oidc');
      expect(types).toContain('saml');
    });

    it('should allow a MEMBER of org to view providers', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/sso/providers?orgId=${orgId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('ssoEnforced');
    });
  });

  // ==================== DELETE /api/v1/sso/oidc ====================

  describe('DELETE /api/v1/sso/oidc', () => {
    it('should return 400 when orgId query param is missing', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('orgId');
    });

    it('should return 403 when MEMBER tries to remove OIDC config', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/sso/oidc?orgId=${orgId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 403 for non-existent org', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/sso/oidc?orgId=${fakeId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should successfully remove OIDC config as org owner', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/sso/oidc?orgId=${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain('OIDC');
    });
  });

  // ==================== POST /api/v1/government/partnerships/apply ====================

  describe('POST /api/v1/government/partnerships/apply', () => {
    it('should return 400 for Zod error - missing governmentEntity', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          country: 'US',
          contactName: 'Jane Doe',
          contactEmail: 'jane@gov.us',
          programDescription: 'Digital ID program',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid contactEmail', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'US',
          contactName: 'Jane Doe',
          contactEmail: 'not-an-email',
          programDescription: 'Digital ID program',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - country too short (< 2 chars)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'X',
          contactName: 'Jane Doe',
          contactEmail: 'jane@gov.us',
          programDescription: 'Digital ID program',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - country too long (> 3 chars)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'USAA',
          contactName: 'Jane Doe',
          contactEmail: 'jane@gov.us',
          programDescription: 'Digital ID program',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - estimatedVolume less than 1', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'US',
          contactName: 'Jane Doe',
          contactEmail: 'jane@gov.us',
          programDescription: 'Digital ID program',
          estimatedVolume: 0,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'US',
          contactName: 'Jane Doe',
          contactEmail: 'jane@gov.us',
          programDescription: 'Digital ID program',
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 201 for valid partnership application', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'US',
          contactName: 'Jane Doe',
          contactEmail: 'jane@gov.us',
          programDescription: 'National digital identity program',
          estimatedVolume: 10000,
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('PENDING');
      expect(body.governmentEntity).toBe('Ministry of Digital Affairs');
      expect(body).toHaveProperty('id');
    });
  });

  // ==================== GET /api/v1/government/partnerships ====================

  describe('GET /api/v1/government/partnerships', () => {
    it('should return 403 for non-admin user', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/government/partnerships',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Admin access required');
    });

    it('should return 401 when unauthenticated', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/government/partnerships',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return partnership list for admin', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/government/partnerships',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('partnerships');
      expect(body).toHaveProperty('total');
      expect(body.partnerships.length).toBeGreaterThan(0);
    });
  });

  // ==================== POST /api/v1/government/credential-schemes ====================

  describe('POST /api/v1/government/credential-schemes', () => {
    it('should return 403 for non-admin user', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          name: 'National ID v1',
          country: 'US',
          credentialType: 'GovernmentID',
          schema: { type: 'object' },
          requiredAttributes: ['idNumber', 'country'],
        },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Admin access required');
    });

    it('should return 400 for Zod error - missing name', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          country: 'US',
          credentialType: 'GovernmentID',
          schema: { type: 'object' },
          requiredAttributes: ['idNumber'],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing requiredAttributes', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'National ID v1',
          country: 'US',
          credentialType: 'GovernmentID',
          schema: { type: 'object' },
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing schema', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'National ID v1',
          country: 'US',
          credentialType: 'GovernmentID',
          requiredAttributes: ['idNumber'],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should create credential scheme as admin', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'National ID v1',
          country: 'US',
          credentialType: 'GovernmentID',
          schema: { type: 'object', properties: { idNumber: { type: 'string' } } },
          requiredAttributes: ['idNumber', 'country'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('ACTIVE');
      expect(body.name).toBe('National ID v1');
      expect(body).toHaveProperty('id');
    });
  });

  // ==================== GET /api/v1/government/credential-schemes ====================

  describe('GET /api/v1/government/credential-schemes', () => {
    it('should return 403 for non-admin user', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return schemes list for admin', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('schemes');
      expect(body).toHaveProperty('total');
      expect(body.schemes.length).toBeGreaterThan(0);
    });
  });
});
