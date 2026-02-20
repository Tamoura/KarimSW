/**
 * Compliance Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/compliance endpoints:
 * - GET /status with non-admin (403)
 * - POST /controls with Zod error (400)
 * - POST /controls success with different frameworks
 * - GET /controls with framework filter
 * - GET /controls with status filter
 * - PATCH /controls/:id not found (404)
 * - PATCH /controls/:id VERIFIED status sets lastAuditedAt
 * - PATCH /controls/:id with Zod error (400)
 * - GET /controls/summary returns grouped data
 * - GET /controls/summary non-admin (403)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Compliance Extended - /api/v1/compliance error branches', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  let soc2ControlId: string;
  let gdprControlId: string;
  const adminEmail = 'comp-ext-admin@example.com';
  const devEmail = 'comp-ext-dev@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-comp-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    await prisma.complianceControl.deleteMany({});

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

    // Create SOC2 control
    const soc2Res = await app.inject({
      method: 'POST', url: '/api/v1/compliance/controls',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        framework: 'SOC2',
        controlId: 'CC7.1',
        title: 'System Operations Monitoring',
        description: 'Monitor system operations for anomalies.',
      },
    });
    soc2ControlId = soc2Res.json().id;

    // Create GDPR control
    const gdprRes = await app.inject({
      method: 'POST', url: '/api/v1/compliance/controls',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        framework: 'GDPR',
        controlId: 'ART-25',
        title: 'Data Protection by Design',
        description: 'Implement data protection by design and default.',
      },
    });
    gdprControlId = gdprRes.json().id;

    // Create an IMPLEMENTED control for readiness calculation
    await prisma.complianceControl.create({
      data: {
        framework: 'SOC2',
        controlId: 'CC6.2',
        title: 'Network Security',
        description: 'Network security measures',
        status: 'IMPLEMENTED',
      },
    });

    // Create a VERIFIED control
    await prisma.complianceControl.create({
      data: {
        framework: 'SOC2',
        controlId: 'CC6.3',
        title: 'Physical Security',
        description: 'Physical security measures',
        status: 'VERIFIED',
        lastAuditedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.complianceControl.deleteMany({});
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== GET /status error branches ====================

  describe('GET /api/v1/compliance/status', () => {
    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/status',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/status',
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return readiness with IMPLEMENTED and VERIFIED counted', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/status',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('frameworks');
      expect(body).toHaveProperty('overallReadiness');
      expect(body).toHaveProperty('totalControls');
      expect(body.frameworks).toHaveProperty('SOC2');
      expect(body.frameworks.SOC2.total).toBeGreaterThan(0);
      expect(body.frameworks.SOC2.implemented).toBeGreaterThan(0);
      expect(body.frameworks.SOC2.verified).toBeGreaterThan(0);
      expect(body.frameworks.SOC2.readiness).toBeGreaterThan(0);
      expect(body.frameworks).toHaveProperty('GDPR');
    });
  });

  // ==================== POST /controls error branches ====================

  describe('POST /api/v1/compliance/controls', () => {
    it('should return 400 for Zod error - missing framework', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          controlId: 'TEST-1',
          title: 'Test Control',
          description: 'Test description',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid framework', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          framework: 'INVALID',
          controlId: 'TEST-1',
          title: 'Test Control',
          description: 'Test description',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing controlId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          framework: 'SOC2',
          title: 'Test Control',
          description: 'Test description',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing title', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          framework: 'SOC2',
          controlId: 'TEST-1',
          description: 'Test description',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          framework: 'SOC2',
          controlId: 'TEST-1',
          title: 'Test',
          description: 'Test',
        },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should create controls with ISO27001 framework', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          framework: 'ISO27001',
          controlId: 'A.14.1.1',
          title: 'Information Security Requirements Analysis',
          description: 'Security requirements analysis for information systems',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().framework).toBe('ISO27001');
    });

    it('should create controls with HIPAA framework', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          framework: 'HIPAA',
          controlId: '164.312(a)(1)',
          title: 'Access Control',
          description: 'Implement access controls for ePHI',
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().framework).toBe('HIPAA');
    });
  });

  // ==================== GET /controls filter branches ====================

  describe('GET /api/v1/compliance/controls', () => {
    it('should filter by framework', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls?framework=GDPR',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.controls.length).toBeGreaterThan(0);
      for (const control of body.controls) {
        expect(control.framework).toBe('GDPR');
      }
    });

    it('should filter by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls?status=IMPLEMENTED',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const control of body.controls) {
        expect(control.status).toBe('IMPLEMENTED');
      }
    });

    it('should reject non-admin with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ==================== PATCH /controls/:id error branches ====================

  describe('PATCH /api/v1/compliance/controls/:id', () => {
    it('should return 404 for non-existent control', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${fakeId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'IN_PROGRESS' },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should set lastAuditedAt when status is VERIFIED', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${soc2ControlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'VERIFIED' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('VERIFIED');
      expect(body.lastAuditedAt).toBeTruthy();
    });

    it('should not set lastAuditedAt for other statuses', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${gdprControlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'IN_PROGRESS' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('IN_PROGRESS');
      expect(body.lastAuditedAt).toBeNull();
    });

    it('should update evidence object', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${gdprControlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          evidence: { documents: ['privacy-policy.pdf'], reviewer: 'legal-team' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().evidence).toHaveProperty('documents');
    });

    it('should update notes field', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${gdprControlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: 'Reviewed on 2026-02-20' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().notes).toBe('Reviewed on 2026-02-20');
    });

    it('should update assignee field', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${gdprControlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { assignee: 'compliance-team' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().assignee).toBe('compliance-team');
    });

    it('should reject non-admin with 403', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${soc2ControlId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'IN_PROGRESS' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ==================== GET /controls/summary ====================

  describe('GET /api/v1/compliance/controls/summary', () => {
    it('should return grouped framework data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls/summary',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('SOC2');
      expect(body.SOC2).toHaveProperty('total');
      expect(body.SOC2.total).toBeGreaterThan(0);
      expect(body).toHaveProperty('GDPR');
    });

    it('should reject non-admin with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls/summary',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
