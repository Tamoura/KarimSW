/**
 * Admin Users Endpoint Integration Tests
 *
 * Tests for /api/v1/admin/users:
 * - GET / (paginated user listing, admin-only)
 * - PATCH /:id/suspend (suspend user)
 * - PATCH /:id/reactivate (reactivate user)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Admin Users - /api/v1/admin/users', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let holderToken: string;
  let targetUserId: string;
  const adminEmail = 'admin-users-admin@example.com';
  const holderEmail = 'admin-users-holder@example.com';
  const targetEmail = 'admin-users-target@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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
    process.env.JWT_SECRET = 'test-jwt-secret-for-admin-users';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    await cleanupUser(targetEmail);

    // Create admin user
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });

    // Create holder user
    await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });

    // Create target user (to be suspended/reactivated)
    const target = await prisma.user.create({
      data: { email: targetEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    targetUserId = target.id;

    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    const holderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;
  });

  afterAll(async () => {
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    await cleanupUser(targetEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/admin/users', () => {
    it('should return paginated user list for admins', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('users');
      expect(Array.isArray(body.users)).toBe(true);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('totalPages');

      const user = body.users[0];
      expect(user).toHaveProperty('id');
      expect(user).toHaveProperty('email');
      expect(user).toHaveProperty('role');
      expect(user).toHaveProperty('status');
      expect(user).toHaveProperty('didCount');
      expect(user).toHaveProperty('createdAt');
    });

    it('should support search by email', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/admin/users?search=${encodeURIComponent('admin-users-target')}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.users.length).toBeGreaterThanOrEqual(1);
      expect(body.users[0].email).toContain('admin-users-target');
    });

    it('should reject non-admin users with 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { authorization: `Bearer ${holderToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/users/:id/suspend', () => {
    it('should suspend an active user', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${targetUserId}/suspend`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('SUSPENDED');
    });

    it('should reject non-admin users with 403', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${targetUserId}/suspend`,
        headers: { authorization: `Bearer ${holderToken}` },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/admin/users/:id/reactivate', () => {
    it('should reactivate a suspended user', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${targetUserId}/reactivate`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('ACTIVE');
    });
  });
});
