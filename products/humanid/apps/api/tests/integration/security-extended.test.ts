/**
 * Security & Bug Bounty Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/security endpoints:
 * - POST /reports with Zod error (400)
 * - POST /reports success (no auth required)
 * - GET /reports non-admin (403)
 * - GET /reports admin success with filters
 * - PATCH /reports/:id not found (404)
 * - PATCH /reports/:id with bounty sets paidAt
 * - PATCH /reports/:id non-admin (403)
 * - PATCH /reports/:id Zod error (400)
 * - POST /advisories admin success
 * - POST /advisories non-admin (403)
 * - POST /advisories Zod error (400)
 * - GET /advisories public (no auth)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Security Extended - /api/v1/security error branches', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  let reportId: string;
  const adminEmail = 'sec-ext-admin@example.com';
  const devEmail = 'sec-ext-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-sec-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    await prisma.securityAdvisory.deleteMany({});
    await prisma.vulnerabilityReport.deleteMany({});

    // Create admin
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    // Create dev (non-admin)
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
    await prisma.securityAdvisory.deleteMany({});
    await prisma.vulnerabilityReport.deleteMany({});
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST /reports error branches ====================

  describe('POST /api/v1/security/reports', () => {
    it('should return 400 for Zod error - missing reporterEmail', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          title: 'Test vuln',
          description: 'Test description',
          severity: 'HIGH',
          affectedComponent: 'api',
          stepsToReproduce: 'Step 1',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid email format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'not-an-email',
          title: 'Test vuln',
          description: 'Test description',
          severity: 'HIGH',
          affectedComponent: 'api',
          stepsToReproduce: 'Step 1',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - invalid severity', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'test@example.com',
          title: 'Test vuln',
          description: 'Test description',
          severity: 'INVALID',
          affectedComponent: 'api',
          stepsToReproduce: 'Step 1',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing title', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'test@example.com',
          description: 'Test description',
          severity: 'HIGH',
          affectedComponent: 'api',
          stepsToReproduce: 'Step 1',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing stepsToReproduce', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'test@example.com',
          title: 'Test vuln',
          description: 'Test description',
          severity: 'HIGH',
          affectedComponent: 'api',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should submit report without auth (no auth required)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'researcher@example.com',
          title: 'SSRF in webhook handler',
          description: 'Server-side request forgery vulnerability found',
          severity: 'CRITICAL',
          cvssScore: 9.1,
          affectedComponent: 'webhook-handler',
          stepsToReproduce: '1. Set webhook URL to internal address\n2. Trigger webhook',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('SUBMITTED');
      expect(body.severity).toBe('CRITICAL');
      reportId = body.id;
    });

    it('should submit report with INFO severity', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'info@example.com',
          title: 'Information disclosure',
          description: 'Minor info disclosure',
          severity: 'INFO',
          affectedComponent: 'api-docs',
          stepsToReproduce: 'View the API docs',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().severity).toBe('INFO');
    });

    it('should submit report with LOW severity and no cvssScore', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/reports',
        payload: {
          reporterEmail: 'low@example.com',
          title: 'Missing HSTS header',
          description: 'HSTS header missing on some endpoints',
          severity: 'LOW',
          affectedComponent: 'http-headers',
          stepsToReproduce: 'Check response headers',
        },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  // ==================== GET /reports error branches ====================

  describe('GET /api/v1/security/reports', () => {
    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should list reports for admin with report details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('reports');
      expect(body).toHaveProperty('total');
      expect(body.reports.length).toBeGreaterThan(0);
      const report = body.reports[0];
      expect(report).toHaveProperty('id');
      expect(report).toHaveProperty('reporterEmail');
      expect(report).toHaveProperty('title');
      expect(report).toHaveProperty('severity');
      expect(report).toHaveProperty('status');
    });

    it('should filter reports by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports?status=SUBMITTED',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const report of body.reports) {
        expect(report.status).toBe('SUBMITTED');
      }
    });

    it('should filter reports by severity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/reports?severity=CRITICAL',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const report of body.reports) {
        expect(report.severity).toBe('CRITICAL');
      }
    });
  });

  // ==================== PATCH /reports/:id error branches ====================

  describe('PATCH /api/v1/security/reports/:id', () => {
    it('should return 404 for non-existent report', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/security/reports/${fakeId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'TRIAGED' },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should reject non-admin with 403', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/security/reports/${reportId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'TRIAGED' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should set paidAt when bountyAmount is positive', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/security/reports/${reportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { bountyAmount: 10000 },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.bountyAmount).toBe(10000);
      expect(body.paidAt).toBeTruthy();
    });

    it('should update status to TRIAGED', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/security/reports/${reportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'TRIAGED' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('TRIAGED');
    });

    it('should update assignee', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/security/reports/${reportId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { assignee: 'security-engineer-1' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ==================== POST /advisories error branches ====================

  describe('POST /api/v1/security/advisories', () => {
    it('should reject non-admin with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Test Advisory',
          description: 'Test description',
          severity: 'HIGH',
          affectedVersions: ['1.0.0'],
          patchedVersions: ['1.0.1'],
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        payload: {
          title: 'Test Advisory',
          description: 'Test description',
          severity: 'HIGH',
          affectedVersions: ['1.0.0'],
          patchedVersions: ['1.0.1'],
        },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 400 for Zod error - missing title', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          description: 'Test description',
          severity: 'HIGH',
          affectedVersions: ['1.0.0'],
          patchedVersions: ['1.0.1'],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - invalid severity', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Test',
          description: 'Test description',
          severity: 'INVALID',
          affectedVersions: ['1.0.0'],
          patchedVersions: ['1.0.1'],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should create advisory with linked vulnerability report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          vulnerabilityReportId: reportId,
          title: 'SSRF in webhook handler - Advisory',
          description: 'Server-side request forgery vulnerability was patched',
          severity: 'CRITICAL',
          affectedVersions: ['1.0.0', '1.1.0', '1.2.0'],
          patchedVersions: ['1.2.1'],
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.severity).toBe('CRITICAL');
      expect(body.affectedVersions).toContain('1.0.0');
      expect(body.patchedVersions).toContain('1.2.1');
      expect(body.publishedAt).toBeTruthy();
    });

    it('should create advisory without vulnerability report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/security/advisories',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          title: 'Proactive Security Fix',
          description: 'Internally discovered and fixed',
          severity: 'MEDIUM',
          affectedVersions: ['1.0.0'],
          patchedVersions: ['1.0.1'],
        },
      });
      expect(res.statusCode).toBe(201);
    });
  });

  // ==================== GET /advisories ====================

  describe('GET /api/v1/security/advisories', () => {
    it('should list public advisories without auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/security/advisories',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('advisories');
      expect(body).toHaveProperty('total');
      expect(body.advisories.length).toBeGreaterThan(0);
      const advisory = body.advisories[0];
      expect(advisory).toHaveProperty('id');
      expect(advisory).toHaveProperty('title');
      expect(advisory).toHaveProperty('severity');
      expect(advisory).toHaveProperty('affectedVersions');
      expect(advisory).toHaveProperty('patchedVersions');
      expect(advisory).toHaveProperty('publishedAt');
    });
  });
});
