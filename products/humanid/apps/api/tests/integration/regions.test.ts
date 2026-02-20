/**
 * Multi-Region Deployment Integration Tests
 *
 * Tests for /api/v1/regions endpoints:
 * - GET /              (list regions)
 * - GET /:code/health  (health check for region)
 * - POST /             (register region - admin)
 * - PATCH /:code       (update region config - admin)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Multi-Region - /api/v1/regions', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let devToken: string;
  const adminEmail = 'regions-admin@example.com';
  const devEmail = 'regions-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-regions';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    await prisma.region.deleteMany({});

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
    await prisma.region.deleteMany({});
    await cleanupUser(adminEmail);
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/regions', () => {
    it('should register a new region (admin)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/regions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          code: 'EU_FRANKFURT',
          name: 'EU (Frankfurt)',
          endpoint: 'https://eu.api.humanid.dev',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.code).toBe('EU_FRANKFURT');
      expect(body.name).toBe('EU (Frankfurt)');
      expect(body.healthStatus).toBe('unknown');
    });

    it('should register additional regions', async () => {
      const res1 = await app.inject({
        method: 'POST', url: '/api/v1/regions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'US_VIRGINIA', name: 'US (Virginia)', endpoint: 'https://us.api.humanid.dev' },
      });
      expect(res1.statusCode).toBe(201);

      const res2 = await app.inject({
        method: 'POST', url: '/api/v1/regions',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'APAC_SINGAPORE', name: 'APAC (Singapore)', endpoint: 'https://apac.api.humanid.dev' },
      });
      expect(res2.statusCode).toBe(201);
    });

    it('should reject non-admin', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/regions',
        headers: { authorization: `Bearer ${devToken}` },
        payload: { code: 'EU_FRANKFURT', name: 'test', endpoint: 'https://test.example.com' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/regions', () => {
    it('should list all regions (public)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/regions',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('regions');
      expect(body.regions.length).toBe(3);
    });
  });

  describe('GET /api/v1/regions/:code/health', () => {
    it('should return region health status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/regions/EU_FRANKFURT/health',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('code', 'EU_FRANKFURT');
      expect(body).toHaveProperty('healthStatus');
      expect(body).toHaveProperty('endpoint');
    });
  });

  describe('PATCH /api/v1/regions/:code', () => {
    it('should update region configuration', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/regions/EU_FRANKFURT',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          healthStatus: 'healthy',
          dataResidencyEnabled: true,
          latencyMs: 45,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.healthStatus).toBe('healthy');
      expect(body.latencyMs).toBe(45);
    });
  });
});
