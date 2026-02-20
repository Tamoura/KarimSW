/**
 * Government Partnership Program Integration Tests
 *
 * Tests for /api/v1/government endpoints:
 * - POST /partnerships/apply    (submit partnership application)
 * - GET /partnerships            (list partnerships)
 * - POST /credential-schemes     (register government credential scheme)
 * - GET /credential-schemes      (list schemes)
 * - POST /bulk-issue             (bulk credential issuance)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Government Partnerships - /api/v1/government', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  const adminEmail = 'gov-admin@example.com';
  const devEmail = 'gov-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-gov';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);

    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    const devLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = devLogin.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/government/partnerships/apply', () => {
    it('should submit a partnership application', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/government/partnerships/apply',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          governmentEntity: 'Ministry of Digital Affairs',
          country: 'NL',
          contactName: 'Jan de Vries',
          contactEmail: 'jan@gov.nl',
          programDescription: 'National digital identity card program',
          estimatedVolume: 1000000,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('PENDING');
      expect(body.governmentEntity).toBe('Ministry of Digital Affairs');
    });
  });

  describe('GET /api/v1/government/partnerships', () => {
    it('should list partnerships (admin)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/government/partnerships',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('partnerships');
      expect(body.partnerships.length).toBeGreaterThan(0);
    });

    it('should reject non-admin access', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/government/partnerships',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/government/credential-schemes', () => {
    it('should register a government credential scheme', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'National ID Card',
          country: 'NL',
          credentialType: 'GovernmentID',
          schema: {
            type: 'object',
            properties: {
              fullName: { type: 'string' },
              dateOfBirth: { type: 'string' },
              nationalId: { type: 'string' },
            },
          },
          requiredAttributes: ['fullName', 'dateOfBirth', 'nationalId'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('National ID Card');
      expect(body.credentialType).toBe('GovernmentID');
    });
  });

  describe('GET /api/v1/government/credential-schemes', () => {
    it('should list credential schemes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/government/credential-schemes',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('schemes');
      expect(body.schemes.length).toBeGreaterThan(0);
    });
  });
});
