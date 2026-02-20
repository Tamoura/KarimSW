/**
 * Compliance-Grade Audit Trail Integration Tests
 *
 * Tests for /api/v1/audit endpoints:
 * - GET /events       (query audit events)
 * - GET /events/export (export CSV/JSON)
 * - GET /events/verify (tamper-evidence check)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Audit Trail - /api/v1/audit', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: string;
  const adminEmail = 'audit-admin@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.webhookDelivery.deleteMany({ where: { webhook: { userId: existing.id } } });
      await prisma.webhook.deleteMany({ where: { userId: existing.id } });
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-audit';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);

    const user = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    adminUserId = user.id;

    // Seed some audit events
    await prisma.auditLog.createMany({
      data: [
        { userId: adminUserId, action: 'did.created', entityType: 'did', entityId: 'test-did-1', ipAddress: '127.0.0.1' },
        { userId: adminUserId, action: 'credential.issued', entityType: 'credential', entityId: 'test-cred-1', ipAddress: '127.0.0.1' },
        { userId: adminUserId, action: 'credential.revoked', entityType: 'credential', entityId: 'test-cred-1', ipAddress: '127.0.0.1' },
        { userId: adminUserId, action: 'verification.completed', entityType: 'verification', entityId: 'test-ver-1', ipAddress: '127.0.0.1' },
      ],
    });

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: adminUserId } });
    await cleanupUser(adminEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/audit/events', () => {
    it('should return audit events with pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('events');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body.events.length).toBeGreaterThan(0);
    });

    it('should filter by action', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events?action=credential.issued',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      body.events.forEach((e: { action: string }) => {
        expect(e.action).toBe('credential.issued');
      });
    });

    it('should filter by entity type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events?entityType=did',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      body.events.forEach((e: { entityType: string }) => {
        expect(e.entityType).toBe('did');
      });
    });

    it('should filter by date range', async () => {
      const from = new Date(Date.now() - 86400000).toISOString();
      const to = new Date().toISOString();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/audit/events?from=${from}&to=${to}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().events.length).toBeGreaterThan(0);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/audit/events/export', () => {
    it('should export as JSON', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=json',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/json/);
      const body = res.json();
      expect(Array.isArray(body.events)).toBe(true);
    });

    it('should export as CSV', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/export?format=csv',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/csv/);
      expect(res.body).toContain('id,');
    });
  });

  describe('GET /api/v1/audit/events/verify', () => {
    it('should verify audit chain integrity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/audit/events/verify',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('intact');
      expect(body).toHaveProperty('entriesChecked');
    });
  });
});
