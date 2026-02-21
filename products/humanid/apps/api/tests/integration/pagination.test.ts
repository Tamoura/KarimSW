/**
 * Pagination Integration Tests — RISK-003
 *
 * Verifies that all list endpoints accept page/limit query params
 * and return paginated responses with total, page, pageSize, totalPages.
 *
 * Endpoints covered:
 *   GET /api/v1/webhooks
 *   GET /api/v1/verify/requests
 *   GET /api/v1/templates
 *   GET /api/v1/offline/tokens
 *   GET /api/v1/fraud/alerts
 *   GET /api/v1/issuance-delegation
 *   GET /api/v1/anchoring
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const HASH_ROUNDS = 10;

const DEV_EMAIL = 'pagination-dev@example.com';
const ISSUER_EMAIL = 'pagination-issuer@example.com';
const ADMIN_EMAIL = 'pagination-admin@example.com';

async function cleanupUser(email: string) {
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u) return;
  await prisma.webhookDelivery.deleteMany({ where: { webhook: { userId: u.id } } });
  await prisma.webhook.deleteMany({ where: { userId: u.id } });
  await prisma.offlineToken.deleteMany({ where: { userId: u.id } });
  await prisma.verificationRequest.deleteMany({ where: { verifierId: u.id } });
  await prisma.credentialTemplate.deleteMany({ where: { issuer: { userId: u.id } } });
  await prisma.issuer.deleteMany({ where: { userId: u.id } });
  // IssuanceDelegation is scoped by issuer IDs; issuers already cleaned above.
  await prisma.session.deleteMany({ where: { userId: u.id } });
  await prisma.apiKey.deleteMany({ where: { userId: u.id } });
  await prisma.user.delete({ where: { email } });
}

describe('Pagination — all list endpoints', () => {
  let app: FastifyInstance;
  let devToken: string;
  let issuerToken: string;
  let adminToken: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-pagination';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const hash = await bcrypt.hash(TEST_PASSWORD, HASH_ROUNDS);
    await cleanupUser(DEV_EMAIL);
    await cleanupUser(ISSUER_EMAIL);
    await cleanupUser(ADMIN_EMAIL);

    // Developer user
    await prisma.user.create({
      data: { email: DEV_EMAIL, passwordHash: hash, role: 'DEVELOPER', emailVerified: true },
    });
    devToken = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: DEV_EMAIL, password: TEST_PASSWORD },
      })
    ).json().access_token;

    // Issuer user
    await prisma.user.create({
      data: { email: ISSUER_EMAIL, passwordHash: hash, role: 'ISSUER', emailVerified: true },
    });
    issuerToken = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: ISSUER_EMAIL, password: TEST_PASSWORD },
      })
    ).json().access_token;

    // Admin user
    await prisma.user.create({
      data: { email: ADMIN_EMAIL, passwordHash: hash, role: 'ADMIN', emailVerified: true },
    });
    adminToken = (
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: ADMIN_EMAIL, password: TEST_PASSWORD },
      })
    ).json().access_token;
  });

  afterAll(async () => {
    await app.close();
    await cleanupUser(DEV_EMAIL);
    await cleanupUser(ISSUER_EMAIL);
    await cleanupUser(ADMIN_EMAIL);
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/webhooks
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/webhooks', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks?page=1&limit=10',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 10);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
      expect(typeof body.total).toBe('number');
      expect(typeof body.totalPages).toBe('number');
    });

    it('defaults page=1 limit=50 when not supplied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
    });

    it('clamps negative page to 1', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks?page=-5&limit=10',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });

    it('clamps negative limit to 1', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks?page=1&limit=-1',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(1);
    });

    it('caps limit at 100', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/webhooks?limit=999',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/verify/requests
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/verify/requests', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/requests?page=1&limit=10',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 10);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
    });

    it('clamps negative page to 1', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/requests?page=-3',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/templates
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/templates', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates?page=1&limit=10',
        headers: { authorization: `Bearer ${issuerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 10);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
    });

    it('defaults when no params supplied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/templates',
        headers: { authorization: `Bearer ${issuerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/offline/tokens
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/offline/tokens', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offline/tokens?page=1&limit=5',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 5);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
    });

    it('clamps limit exceeding max to 100', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/offline/tokens?limit=500',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(100);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/fraud/alerts
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/fraud/alerts', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts?page=1&limit=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 10);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
    });

    it('clamps negative page to 1', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/fraud/alerts?page=-1',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().page).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/issuance-delegation
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/issuance-delegation', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuance-delegation?page=1&limit=10',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 10);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
    });

    it('defaults when no params supplied', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/anchoring
  // ---------------------------------------------------------------------------
  describe('GET /api/v1/anchoring', () => {
    it('returns pagination fields', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?page=1&limit=10',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('page', 1);
      expect(body).toHaveProperty('pageSize', 10);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('totalPages');
    });

    it('replaces hardcoded take:100 with real pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?limit=5',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().pageSize).toBe(5);
    });
  });
});
