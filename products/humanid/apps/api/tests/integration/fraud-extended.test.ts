/**
 * AI Fraud Detection Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/fraud endpoints:
 * - POST /scan with non-admin (403)
 * - POST /scan with Zod error - invalid credentialId (400)
 * - POST /scan with credential not found (404)
 * - GET /alerts with status filter
 * - GET /alerts with severity filter
 * - PATCH /alerts/:id not found (404)
 * - PATCH /alerts/:id with Zod error (400)
 * - PATCH /alerts/:id update status to CONFIRMED sets resolvedAt
 * - PATCH /alerts/:id update status to DISMISSED sets resolvedAt
 * - GET /stats returns aggregated data
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('AI Fraud Detection Extended - /api/v1/fraud error branches', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  let credentialId: string;
  let alertId: string;
  let alertId2: string;
  const adminEmail = 'fraud-ext-admin@example.com';
  const devEmail = 'fraud-ext-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-fraud-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    await prisma.fraudAlert.deleteMany({});

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

    // Seed a credential
    const seedRes = await app.inject({
      method: 'POST', url: '/api/v1/developer/sandbox/seed',
      headers: { authorization: `Bearer ${devToken}` },
    });
    credentialId = seedRes.json().testCredentials[0].id;

    // Seed test alerts with different severities and statuses
    const alert1 = await prisma.fraudAlert.create({
      data: {
        credentialId,
        alertType: 'velocity_anomaly',
        severity: 'HIGH',
        description: 'High velocity issuance pattern',
        riskScore: 0.85,
        status: 'OPEN',
      },
    });
    alertId = alert1.id;

    const alert2 = await prisma.fraudAlert.create({
      data: {
        credentialId,
        alertType: 'duplicate_detection',
        severity: 'MEDIUM',
        description: 'Potential duplicate credential',
        riskScore: 0.45,
        status: 'INVESTIGATING',
      },
    });
    alertId2 = alert2.id;

    // Create a LOW severity OPEN alert
    await prisma.fraudAlert.create({
      data: {
        credentialId,
        alertType: 'pattern_anomaly',
        severity: 'LOW',
        description: 'Unusual but not suspicious pattern',
        riskScore: 0.15,
        status: 'OPEN',
      },
    });
  });

  afterAll(async () => {
    await prisma.fraudAlert.deleteMany({});
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST /scan error branches ====================

  describe('POST /api/v1/fraud/scan', () => {
    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { credentialId },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        payload: { credentialId },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 400 for Zod error - invalid credentialId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { credentialId: 'not-a-uuid' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing credentialId', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for credential not found', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { credentialId: fakeId },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return scan results with risk checks', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { credentialId },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('credentialId', credentialId);
      expect(body).toHaveProperty('riskScore');
      expect(body).toHaveProperty('riskLevel');
      expect(body).toHaveProperty('checks');
      expect(body.checks).toHaveProperty('duplicateCheck');
      expect(body.checks).toHaveProperty('issuerTrust');
      expect(body.checks).toHaveProperty('expirationCheck');
      expect(body.checks).toHaveProperty('revocationCheck');
      expect(body.checks).toHaveProperty('issuanceVelocity');
      expect(body).toHaveProperty('scannedAt');
    });
  });

  // ==================== GET /alerts filter branches ====================

  describe('GET /api/v1/fraud/alerts', () => {
    it('should filter alerts by status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts?status=OPEN',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.alerts.length).toBeGreaterThan(0);
      for (const alert of body.alerts) {
        expect(alert.status).toBe('OPEN');
      }
    });

    it('should filter alerts by severity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts?severity=HIGH',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.alerts.length).toBeGreaterThan(0);
      for (const alert of body.alerts) {
        expect(alert.severity).toBe('HIGH');
      }
    });

    it('should filter alerts by both status and severity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts?status=OPEN&severity=LOW',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const alert of body.alerts) {
        expect(alert.status).toBe('OPEN');
        expect(alert.severity).toBe('LOW');
      }
    });

    it('should return empty list when no alerts match filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts?severity=CRITICAL',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.alerts).toHaveLength(0);
    });
  });

  // ==================== PATCH /alerts/:id error branches ====================

  describe('PATCH /api/v1/fraud/alerts/:id', () => {
    it('should return 404 for non-existent alert', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/fraud/alerts/${fakeId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'INVESTIGATING' },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should set resolvedAt when status is CONFIRMED', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/fraud/alerts/${alertId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'CONFIRMED', resolution: 'Verified as fraudulent activity' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('CONFIRMED');
      expect(body.resolution).toBe('Verified as fraudulent activity');

      // Verify resolvedAt was set in DB
      const alert = await prisma.fraudAlert.findUnique({ where: { id: alertId } });
      expect(alert?.resolvedAt).toBeTruthy();
    });

    it('should set resolvedAt when status is DISMISSED', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/fraud/alerts/${alertId2}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'DISMISSED', resolution: 'False positive' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('DISMISSED');

      const alert = await prisma.fraudAlert.findUnique({ where: { id: alertId2 } });
      expect(alert?.resolvedAt).toBeTruthy();
    });

    it('should update assignee field', async () => {
      // Create a fresh alert for this test
      const alert = await prisma.fraudAlert.create({
        data: {
          credentialId,
          alertType: 'test_alert',
          severity: 'LOW',
          description: 'Test alert for assignee',
          riskScore: 0.1,
        },
      });

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/fraud/alerts/${alert.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { assignee: 'security-analyst-1' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().assignee).toBe('security-analyst-1');
    });

    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/fraud/alerts/${alertId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'INVESTIGATING' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ==================== GET /stats ====================

  describe('GET /api/v1/fraud/stats', () => {
    it('should return aggregated stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('totalAlerts');
      expect(body.totalAlerts).toBeGreaterThan(0);
      expect(body).toHaveProperty('bySeverity');
      expect(body).toHaveProperty('byStatus');
      expect(body).toHaveProperty('averageRiskScore');
      expect(typeof body.averageRiskScore).toBe('number');
    });

    it('should reject non-admin with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/stats',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
