/**
 * Auth Routes Integration Tests
 *
 * Tests for /api/v1/auth endpoints:
 * - POST /register (existing)
 * - POST /login (existing)
 * - POST /refresh (new)
 * - DELETE /logout (new)
 * - POST /verify-email (new)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';

const prisma = new PrismaClient();

const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10; // Faster for tests

describe('Auth Routes - /api/v1/auth', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-auth-tests';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    app = await buildApp();
  });

  afterAll(async () => {
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // Helper: create a user and login, returning tokens
  async function createAndLogin(
    email: string,
    role: 'HOLDER' | 'ISSUER' | 'DEVELOPER' = 'HOLDER'
  ) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Clean up any existing user+sessions
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }

    const user = await prisma.user.create({
      data: { email, passwordHash, role, emailVerified: false },
    });

    // Login to get tokens
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });

    const body = loginRes.json();
    return {
      user,
      accessToken: body.access_token as string,
      refreshToken: body.refresh_token as string,
    };
  }

  // Helper: clean up test user
  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  // ==================== POST /refresh ====================

  describe('POST /api/v1/auth/refresh', () => {
    const testEmail = 'refresh-test@example.com';

    afterEach(async () => {
      await cleanupUser(testEmail);
    });

    it('should return new access and refresh tokens with a valid refresh token', async () => {
      const { refreshToken } = await createAndLogin(testEmail);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: refreshToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('access_token');
      expect(body).toHaveProperty('refresh_token');
      expect(typeof body.access_token).toBe('string');
      expect(typeof body.refresh_token).toBe('string');
      // New tokens should be different from old ones
      expect(body.refresh_token).not.toBe(refreshToken);
    });

    it('should invalidate the old refresh token after rotation', async () => {
      const { refreshToken } = await createAndLogin(testEmail);

      // First refresh should succeed
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: refreshToken },
      });
      expect(res1.statusCode).toBe(200);

      // Second refresh with the same old token should fail (token rotation)
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: refreshToken },
      });
      expect(res2.statusCode).toBe(401);
    });

    it('should reject an invalid refresh token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: 'invalid-token-value' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toContain('unauthorized');
    });

    it('should reject when refresh_token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject refresh for a suspended user', async () => {
      const { refreshToken, user } = await createAndLogin(testEmail);

      // Suspend the user
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'SUSPENDED' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: refreshToken },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should reject an expired session', async () => {
      const { refreshToken, user } = await createAndLogin(testEmail);

      // Expire all sessions for this user
      await prisma.session.updateMany({
        where: { userId: user.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: refreshToken },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== DELETE /logout ====================

  describe('DELETE /api/v1/auth/logout', () => {
    const testEmail = 'logout-test@example.com';

    afterEach(async () => {
      await cleanupUser(testEmail);
    });

    it('should invalidate the session and return 204', async () => {
      const { accessToken, refreshToken } = await createAndLogin(testEmail);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: { refresh_token: refreshToken },
      });

      expect(res.statusCode).toBe(204);
    });

    it('should prevent using the refresh token after logout', async () => {
      const { accessToken, refreshToken } = await createAndLogin(testEmail);

      // Logout
      await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: { refresh_token: refreshToken },
      });

      // Try to refresh - should fail
      const refreshRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: refreshToken },
      });

      expect(refreshRes.statusCode).toBe(401);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        payload: { refresh_token: 'some-token' },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should handle logout-all to clear all user sessions', async () => {
      const { accessToken, user } = await createAndLogin(testEmail);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        payload: { all: true },
      });

      expect(res.statusCode).toBe(204);

      // All sessions should be deleted
      const sessions = await prisma.session.findMany({
        where: { userId: user.id },
      });
      expect(sessions).toHaveLength(0);
    });
  });

  // ==================== POST /verify-email ====================

  describe('POST /api/v1/auth/verify-email', () => {
    const testEmail = 'verify-test@example.com';

    beforeEach(async () => {
      // Clear rate limit counter so tests aren't affected by cross-suite accumulation
      if (app.redis) {
        await app.redis.del('verify-email:ratelimit:127.0.0.1');
      }
    });

    afterEach(async () => {
      await cleanupUser(testEmail);
    });

    it('should verify email with a valid token', async () => {
      const { user } = await createAndLogin(testEmail);

      // Create a verification token (stored in Redis or DB)
      // We'll use a simple approach: generate token, store hash in user record
      const verificationToken = randomUUID();
      const tokenHash = createHash('sha256').update(verificationToken).digest('hex');

      // Store token hash on the user (we'll use a convention in metadata or
      // a separate mechanism; for now let's assume the endpoint accepts a token
      // that maps to the user)
      // We need to store this - let's use Redis
      if (app.redis) {
        await app.redis.set(
          `email-verify:${tokenHash}`,
          user.id,
          'EX',
          3600 // 1 hour
        );
      }

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: verificationToken },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toMatch(/verified/i);

      // Verify the user's emailVerified flag is now true
      const updatedUser = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(updatedUser?.emailVerified).toBe(true);
    });

    it('should reject an invalid verification token', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: 'invalid-token-value' },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('invalid');
    });

    it('should reject when token is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject an expired verification token', async () => {
      const { user } = await createAndLogin(testEmail);
      const verificationToken = randomUUID();
      const tokenHash = createHash('sha256').update(verificationToken).digest('hex');

      if (app.redis) {
        // Set with 1-second expiry, then wait
        await app.redis.set(
          `email-verify:${tokenHash}`,
          user.id,
          'EX',
          1
        );
        // Wait for expiry
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: verificationToken },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should not allow double-verification with the same token', async () => {
      const { user } = await createAndLogin(testEmail);
      const verificationToken = randomUUID();
      const tokenHash = createHash('sha256').update(verificationToken).digest('hex');

      if (app.redis) {
        await app.redis.set(
          `email-verify:${tokenHash}`,
          user.id,
          'EX',
          3600
        );
      }

      // First verification
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: verificationToken },
      });
      expect(res1.statusCode).toBe(200);

      // Second verification with same token should fail
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: verificationToken },
      });
      expect(res2.statusCode).toBe(400);
    });
  });
});
