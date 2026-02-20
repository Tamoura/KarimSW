/**
 * Bug Bounty & Security Program Integration Tests
 *
 * Tests for /api/v1/security endpoints:
 * - POST /reports           (submit vulnerability report)
 * - GET /reports            (list reports - admin)
 * - PATCH /reports/:id      (update report status - admin)
 * - GET /advisories         (public security advisories)
 * - POST /advisories        (publish advisory - admin)
 * - GET /.well-known/security.txt (security contact info)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Bug Bounty & Security - /api/v1/security', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let reportId: string;
  let advisoryId: string;
  const adminEmail = 'security-admin@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-security';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await prisma.securityAdvisory.deleteMany({});
    await prisma.vulnerabilityReport.deleteMany({});

    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;
  });

  afterAll(async () => {
    await prisma.securityAdvisory.deleteMany({});
    await prisma.vulnerabilityReport.deleteMany({});
    await cleanupUser(adminEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/security/reports', () => {
    it('should submit a vulnerability report (no auth required)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'researcher@hacker.one',
          title: 'XSS in credential display',
          description: 'Reflected XSS vulnerability in credential claims rendering endpoint.',
          severity: 'HIGH',
          cvssScore: 7.5,
          affectedComponent: 'credential-viewer',
          stepsToReproduce: '1. Create credential with XSS payload in claims\n2. View credential\n3. Script executes',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('SUBMITTED');
      expect(body.severity).toBe('HIGH');
      reportId = body.id;
    });
  });

  describe('GET /api/v1/security/reports', () => {
    it('should list reports (admin only)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('reports');
      expect(body.reports.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated access', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/v1/security/reports/:id', () => {
    it('should update report status', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/security/reports/${reportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: 'CONFIRMED',
          bountyAmount: 5000,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('CONFIRMED');
      expect(body.bountyAmount).toBe(5000);
    });
  });

  describe('POST /api/v1/security/advisories', () => {
    it('should publish a security advisory (admin)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          vulnerabilityReportId: reportId,
          title: 'XSS vulnerability in credential viewer',
          description: 'A reflected XSS vulnerability was discovered in the credential claims rendering.',
          severity: 'HIGH',
          affectedVersions: ['1.0.0', '1.1.0'],
          patchedVersions: ['1.2.0'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.severity).toBe('HIGH');
      advisoryId = body.id;
    });
  });

  describe('GET /api/v1/security/advisories', () => {
    it('should list public security advisories (no auth)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/advisories',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('advisories');
      expect(body.advisories.length).toBeGreaterThan(0);
    });
  });

  describe('GET /.well-known/security.txt', () => {
    it('should return security.txt', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/security.txt',
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      const text = res.body;
      expect(text).toContain('Contact:');
      expect(text).toContain('Policy:');
    });
  });
});
