/**
 * Credential Templates & Issuer Profile Integration Tests
 *
 * Tests for:
 * - POST /api/v1/issuers (register issuer profile)
 * - GET /api/v1/issuers/me (get own profile)
 * - PATCH /api/v1/issuers/me (update profile)
 * - POST /api/v1/templates (create template)
 * - GET /api/v1/templates (list templates)
 * - GET /api/v1/templates/:id (get template)
 * - PATCH /api/v1/templates/:id (update template)
 * - DELETE /api/v1/templates/:id (deactivate template)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Credential Templates & Issuer Profiles', () => {
  let app: FastifyInstance;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let holderToken: string;
  let holderUserId: string;
  const issuerEmail = 'template-issuer@example.com';
  const holderEmail = 'template-holder@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-templates';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    async function setupUser(email: string, role: 'HOLDER' | 'ISSUER') {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        await prisma.credentialTemplate.deleteMany({ where: { issuer: { userId: existing.id } } });
        await prisma.issuer.deleteMany({ where: { userId: existing.id } });
        await prisma.credential.deleteMany({
          where: {
            OR: [
              { holderDid: { userId: existing.id } },
              { issuerDid: { userId: existing.id } },
            ],
          },
        });
        await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
        await prisma.dID.deleteMany({ where: { userId: existing.id } });
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        await prisma.user.delete({ where: { email } });
      }

      const user = await prisma.user.create({
        data: { email, passwordHash, role, emailVerified: true },
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: TEST_PASSWORD },
      });
      const token = loginRes.json().access_token;

      let didId: string | undefined;
      if (role === 'ISSUER') {
        const didRes = await app.inject({
          method: 'POST',
          url: '/api/v1/dids',
          headers: { authorization: `Bearer ${token}` },
          payload: {},
        });
        didId = didRes.json().id;
      }

      return { user, token, didId };
    }

    const issuer = await setupUser(issuerEmail, 'ISSUER');
    issuerToken = issuer.token;
    issuerUserId = issuer.user.id;
    issuerDidId = issuer.didId!;

    const holder = await setupUser(holderEmail, 'HOLDER');
    holderToken = holder.token;
    holderUserId = holder.user.id;
  });

  afterAll(async () => {
    await prisma.credentialTemplate.deleteMany({ where: { issuer: { userId: issuerUserId } } });
    await prisma.issuer.deleteMany({ where: { userId: issuerUserId } });
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { issuerDid: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: { did: { userId: { in: [issuerUserId, holderUserId] } } },
    });
    await prisma.dID.deleteMany({
      where: { userId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [issuerUserId, holderUserId] } },
    });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== Issuer Profile ====================

  describe('POST /api/v1/issuers', () => {
    it('should register an issuer profile', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          didId: issuerDidId,
          organizationName: 'Test University',
          legalEntityId: 'LEI-123456',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.organizationName).toBe('Test University');
      expect(body.trustStatus).toBe('PENDING');
    });

    it('should reject duplicate issuer profile for same DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          didId: issuerDidId,
          organizationName: 'Duplicate Org',
        },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuers',
        payload: {
          didId: issuerDidId,
          organizationName: 'No Auth Org',
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/issuers/me', () => {
    it('should return the issuer profile', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/me',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.organizationName).toBe('Test University');
      expect(body).toHaveProperty('did');
    });

    it('should return 404 if user has no issuer profile', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuers/me',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/issuers/me', () => {
    it('should update the organization name', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/issuers/me',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { organizationName: 'Updated University' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().organizationName).toBe('Updated University');
    });
  });

  // ==================== Credential Templates ====================

  describe('POST /api/v1/templates', () => {
    it('should create a credential template', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          name: 'University Degree',
          credentialType: 'UniversityDegree',
          schema: {
            type: 'object',
            properties: {
              degree: { type: 'string' },
              university: { type: 'string' },
              graduationYear: { type: 'number' },
            },
          },
          requiredAttributes: ['degree', 'university'],
          optionalAttributes: ['graduationYear'],
          defaultExpiryDays: 365,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('University Degree');
      expect(body.credentialType).toBe('UniversityDegree');
      expect(body.isActive).toBe(true);
    });

    it('should require an issuer profile to create templates', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          name: 'Test Template',
          credentialType: 'Test',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        payload: {
          name: 'No Auth',
          credentialType: 'Test',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/templates', () => {
    it('should list templates for the issuer', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.templates)).toBe(true);
      expect(body.templates.length).toBeGreaterThan(0);
      expect(body).toHaveProperty('total');
    });
  });

  describe('GET /api/v1/templates/:id', () => {
    let templateId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          name: 'Employment Cert',
          credentialType: 'EmploymentCertificate',
          schema: { type: 'object', properties: { employer: { type: 'string' } } },
          requiredAttributes: ['employer'],
          optionalAttributes: [],
        },
      });
      templateId = res.json().id;
    });

    it('should return a specific template', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/templates/${templateId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(templateId);
      expect(res.json().name).toBe('Employment Cert');
    });

    it('should return 404 for non-existent template', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/templates/:id', () => {
    let updateTemplateId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          name: 'Updateable Template',
          credentialType: 'UpdateTest',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
        },
      });
      updateTemplateId = res.json().id;
    });

    it('should update a template', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/templates/${updateTemplateId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: { name: 'Updated Template Name', defaultExpiryDays: 180 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('Updated Template Name');
      expect(res.json().defaultExpiryDays).toBe(180);
    });
  });

  describe('DELETE /api/v1/templates/:id', () => {
    let deleteTemplateId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          name: 'Deleteable Template',
          credentialType: 'DeleteTest',
          schema: {},
          requiredAttributes: [],
          optionalAttributes: [],
        },
      });
      deleteTemplateId = res.json().id;
    });

    it('should deactivate a template (soft delete)', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/templates/${deleteTemplateId}`,
        headers: { authorization: `Bearer ${issuerToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().isActive).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/templates/${deleteTemplateId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
