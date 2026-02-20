/**
 * Enterprise SSO Bridge Integration Tests
 *
 * Tests for /api/v1/sso endpoints:
 * - POST /oidc           (configure OIDC provider)
 * - GET /oidc             (get OIDC config)
 * - DELETE /oidc          (remove OIDC config)
 * - POST /saml            (configure SAML provider)
 * - GET /providers        (list SSO providers for org)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Enterprise SSO - /api/v1/sso', () => {
  let app: FastifyInstance;
  let ownerToken: string;
  let ownerUserId: string;
  let orgId: string;
  const ownerEmail = 'sso-owner@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-sso';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(ownerEmail);

    const existingOrg = await prisma.organization.findUnique({ where: { slug: 'sso-test-org' } });
    if (existingOrg) {
      await prisma.organizationMember.deleteMany({ where: { orgId: existingOrg.id } });
      await prisma.organization.delete({ where: { id: existingOrg.id } });
    }

    const user = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    ownerUserId = user.id;

    const org = await prisma.organization.create({
      data: { name: 'SSO Test Org', slug: 'sso-test-org', settings: {} },
    });
    orgId = org.id;

    await prisma.organizationMember.create({
      data: { orgId: org.id, userId: user.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: ownerEmail, password: TEST_PASSWORD },
    });
    ownerToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await prisma.organizationMember.deleteMany({ where: { orgId } });
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {});
    await cleanupUser(ownerEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/sso/oidc', () => {
    it('should configure OIDC provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sso/oidc',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          discoveryUrl: 'https://accounts.google.com/.well-known/openid-configuration',
          clientId: 'test-client-id',
          clientSecret: 'test-client-secret',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('provider');
      expect(body.provider).toBe('oidc');
      expect(body).toHaveProperty('orgId');
    });

    it('should require org ownership', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sso/oidc',
        payload: {
          orgId,
          discoveryUrl: 'https://example.com/.well-known/openid-configuration',
          clientId: 'test', clientSecret: 'test',
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/sso/providers', () => {
    it('should list SSO providers for org', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sso/providers?orgId=${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('providers');
      expect(body.providers.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/v1/sso/saml', () => {
    it('should configure SAML provider', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sso/saml',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          orgId,
          metadataUrl: 'https://login.microsoftonline.com/tenant/federationmetadata/2007-06/federationmetadata.xml',
          entityId: 'https://humanid.dev/saml',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.provider).toBe('saml');
    });
  });

  describe('DELETE /api/v1/sso/oidc', () => {
    it('should remove OIDC configuration', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/sso/oidc?orgId=${orgId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/removed/i);
    });
  });
});
