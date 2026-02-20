/**
 * AI Fraud Detection Integration Tests
 *
 * Tests for /api/v1/fraud endpoints:
 * - POST /scan            (scan credential for anomalies)
 * - GET /alerts           (list fraud alerts)
 * - PATCH /alerts/:id     (update alert status)
 * - GET /stats            (fraud detection stats)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('AI Fraud Detection - /api/v1/fraud', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  let credentialId: string;
  let alertId: string;
  const adminEmail = 'fraud-admin@example.com';
  const devEmail = 'fraud-dev@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-fraud';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    await prisma.fraudAlert.deleteMany({});

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

    // Seed a credential
    const seedRes = await app.inject({
      method: 'POST', url: '/api/v1/developer/sandbox/seed',
      headers: { authorization: `Bearer ${devToken}` },
    });
    credentialId = seedRes.json().testCredentials[0].id;
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

  describe('POST /api/v1/fraud/scan', () => {
    it('should scan credential for anomalies', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/fraud/scan',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { credentialId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('riskScore');
      expect(body).toHaveProperty('checks');
      expect(body.riskScore).toBeGreaterThanOrEqual(0);
      expect(body.riskScore).toBeLessThanOrEqual(1);
    });
  });

  describe('GET /api/v1/fraud/alerts', () => {
    beforeAll(async () => {
      // Create a test alert
      const alert = await prisma.fraudAlert.create({
        data: {
          credentialId,
          alertType: 'suspicious_issuance',
          severity: 'HIGH',
          description: 'Unusually high issuance rate detected',
          riskScore: 0.85,
        },
      });
      alertId = alert.id;
    });

    it('should list fraud alerts (admin)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('alerts');
      expect(body.alerts.length).toBeGreaterThan(0);
    });

    it('should require admin access', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/fraud/alerts/:id', () => {
    it('should update alert status', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/fraud/alerts/${alertId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { status: 'INVESTIGATING', assignee: 'security-team' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('INVESTIGATING');
    });
  });

  describe('GET /api/v1/fraud/stats', () => {
    it('should return fraud detection stats', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/stats',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('totalAlerts');
      expect(body).toHaveProperty('bySeverity');
      expect(body).toHaveProperty('byStatus');
    });
  });
});
