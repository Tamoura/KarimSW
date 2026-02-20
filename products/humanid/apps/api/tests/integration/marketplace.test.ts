/**
 * Trusted Issuer Program & Credential Marketplace Tests
 *
 * Tests for marketplace and issuer onboarding endpoints:
 * - POST /issuers/apply              (issuer application)
 * - GET /issuers/directory            (public issuer directory)
 * - GET /marketplace/templates        (browse public templates)
 * - POST /marketplace/templates/:id/fork (fork a template)
 * - Admin: GET /admin/issuer-applications
 * - Admin: PATCH /admin/issuer-applications/:id
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Marketplace & Issuer Onboarding', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let adminToken: string;
  let adminUserId: string;
  let issuerDidId: string;
  let issuerId: string;
  let publicTemplateId: string;
  const devEmail = 'marketplace-dev@example.com';
  const adminEmail = 'marketplace-admin@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.credentialTemplate.deleteMany({ where: { issuer: { userId: existing.id } } });
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-marketplace';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);
    await cleanupUser(adminEmail);

    // Create dev user with issuer profile
    const dev = await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    devUserId = dev.id;

    const devLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = devLogin.json().access_token;

    // Create a DID for the issuer
    const didRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    issuerDidId = didRes.json().id;

    // Create admin user
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    adminUserId = admin.id;

    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    await cleanupUser(adminEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/issuers/apply', () => {
    it('should submit an issuer application', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers/apply',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: issuerDidId,
          organizationName: 'Test University',
          legalEntityId: 'LEI-123456',
          website: 'https://test-university.edu',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.trustStatus).toBe('PENDING');
      expect(body.tier).toBe('SELF_DECLARED');
      issuerId = body.id;
    });
  });

  describe('GET /api/v1/issuers/directory', () => {
    it('should list issuers in public directory', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/directory',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('issuers');
      expect(body).toHaveProperty('total');
    });
  });

  describe('Admin: issuer applications', () => {
    it('should list applications (admin only)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuer-applications',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('applications');
      expect(body.applications.length).toBeGreaterThan(0);
    });

    it('should reject non-admin access', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/issuer-applications',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should approve an application', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/issuer-applications/${issuerId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { action: 'approve', tier: 'VERIFIED' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.trustStatus).toBe('TRUSTED');
      expect(body.tier).toBe('VERIFIED');
    });
  });

  describe('Credential Marketplace', () => {
    beforeAll(async () => {
      // Create a public template
      const template = await prisma.credentialTemplate.create({
        data: {
          issuerId,
          name: 'Academic Transcript',
          credentialType: 'AcademicTranscript',
          schema: { type: 'object', properties: { gpa: { type: 'number' }, degree: { type: 'string' } } },
          requiredAttributes: ['gpa', 'degree'],
          optionalAttributes: ['honors'],
          isPublic: true,
          isActive: true,
        },
      });
      publicTemplateId = template.id;
    });

    it('should browse public templates', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/marketplace/templates',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('templates');
      expect(body.templates.length).toBeGreaterThan(0);
      expect(body.templates[0]).toHaveProperty('issuerName');
    });

    it('should fork a template', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/marketplace/templates/${publicTemplateId}/fork`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.forkedFromId).toBe(publicTemplateId);
      expect(body.name).toMatch(/Academic Transcript/);
    });
  });
});
