/**
 * SOC 2 Compliance & Security Controls Integration Tests
 *
 * Tests for /api/v1/compliance endpoints:
 * - GET /status           (compliance readiness dashboard)
 * - POST /controls        (create compliance control)
 * - GET /controls         (list controls with filters)
 * - PATCH /controls/:id   (update control status/evidence)
 * - GET /controls/summary (framework summary stats)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('SOC 2 Compliance - /api/v1/compliance', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  const adminEmail = 'compliance-admin@example.com';
  const devEmail = 'compliance-dev@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-compliance';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);

    // Clean any existing compliance controls
    await prisma.complianceControl.deleteMany({});

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
    await prisma.complianceControl.deleteMany({});
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/compliance/status', () => {
    it('should return compliance readiness dashboard', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/status',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('frameworks');
      expect(body).toHaveProperty('overallReadiness');
      expect(body.frameworks).toHaveProperty('SOC2');
    });

    it('should require admin role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/status',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  let controlId: string;

  describe('POST /api/v1/compliance/controls', () => {
    it('should create a compliance control', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/compliance/controls',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          framework: 'SOC2',
          controlId: 'CC6.1',
          title: 'Logical Access Security',
          description: 'Logical access security measures are implemented to protect against unauthorized access.',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.framework).toBe('SOC2');
      expect(body.controlId).toBe('CC6.1');
      expect(body.status).toBe('NOT_STARTED');
      controlId = body.id;
    });
  });

  describe('GET /api/v1/compliance/controls', () => {
    it('should list controls filtered by framework', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls?framework=SOC2',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('controls');
      expect(body.controls.length).toBeGreaterThan(0);
      expect(body.controls[0].framework).toBe('SOC2');
    });
  });

  describe('PATCH /api/v1/compliance/controls/:id', () => {
    it('should update control status and evidence', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/compliance/controls/${controlId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          status: 'IMPLEMENTED',
          evidence: { documents: ['encryption-policy.pdf'], lastReview: '2026-02-01' },
          notes: 'AES-256-GCM encryption implemented for all PII fields.',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('IMPLEMENTED');
      expect(body.evidence).toHaveProperty('documents');
    });
  });

  describe('GET /api/v1/compliance/controls/summary', () => {
    it('should return framework summary statistics', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/compliance/controls/summary',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('SOC2');
      expect(body.SOC2).toHaveProperty('total');
      expect(body.SOC2).toHaveProperty('implemented');
      expect(body.SOC2).toHaveProperty('verified');
    });
  });
});
