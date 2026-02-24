/**
 * Audit Stats Endpoint Integration Tests
 *
 * Tests for GET /api/v1/audit/stats (admin-only platform statistics)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Audit Stats - GET /api/v1/audit/stats', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let adminUserId: string;
  let holderToken: string;
  const adminEmail = 'audit-stats-admin@example.com';
  const holderEmail = 'audit-stats-holder@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.auditLog.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-audit-stats';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);

    // Create admin user
    const admin = await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    adminUserId = admin.id;

    // Create holder user
    await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });

    // Login admin
    const adminLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLoginRes.json().access_token;

    // Login holder
    const holderLoginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLoginRes.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  it('should return platform stats for admin users', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/stats',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('totalUsers');
    expect(body).toHaveProperty('activeDids');
    expect(body).toHaveProperty('credentialsIssued');
    expect(body).toHaveProperty('activeIssuers');
    expect(typeof body.totalUsers).toBe('number');
    expect(typeof body.activeDids).toBe('number');
    expect(typeof body.credentialsIssued).toBe('number');
    expect(typeof body.activeIssuers).toBe('number');
  });

  it('should reject non-admin users with 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/stats',
      headers: { authorization: `Bearer ${holderToken}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('should reject unauthenticated requests with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/audit/stats',
    });

    expect(res.statusCode).toBe(401);
  });
});
