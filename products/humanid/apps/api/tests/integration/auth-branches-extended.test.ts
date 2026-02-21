/**
 * Auth Branches Extended - Integration Tests
 *
 * Covers uncovered branches in src/routes/v1/auth.ts:
 *
 * 1.  Registration for existing email (line 68-74) — enumeration protection
 * 2.  Login with non-existent user (line 164-173) — 401, Redis increment
 * 3.  Login with wrong password (line 182-192) — 401, Redis increment
 * 4.  Login with suspended user (line 176-178) — 403 account-suspended
 * 5.  Refresh with expired session (line 269-273) — 401, session deleted
 * 6.  Refresh with suspended user (line 276-278) — 403 account-suspended
 * 7.  Logout with all=true (line 338-343) — 204, all sessions cleared
 * 8.  Logout with specific refresh_token (line 344-350) — 204
 * 9.  Logout with no body (line 351-356) — 204, fallback deletes all sessions
 * 10. Verify-email without Redis (line 376-378) — 500 service-unavailable
 * 11. Verify-email with invalid token (line 383-385) — 400 invalid-token
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const prisma = new PrismaClient();

const TEST_EMAIL = 'auth-branches-ext@example.com';
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Auth Branches Extended - /api/v1/auth uncovered branches', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let refreshToken: string;
  let userId: string;

  // ==================== Cleanup helper ====================

  /**
   * Delete all data owned by a user in FK-safe order.
   * DIDs cascade-delete DIDDocuments and BiometricBindings.
   * Session, ApiKey, Webhook cascade from User.
   * Credentials are linked to DIDs — delete them before the DID.
   */
  async function cleanupUserByEmail(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) return;

    const uid = existing.id;

    // Credentials are linked to DID IDs, not user ID directly
    const userDids = await prisma.dID.findMany({ where: { userId: uid } });
    for (const did of userDids) {
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDidId: did.id }, { issuerDidId: did.id }] },
      });
    }

    // Delete the user — all related sessions, apiKeys, webhooks, DIDs
    // (and their documents + biometric bindings) cascade automatically
    await prisma.user.delete({ where: { id: uid } });
  }

  // ==================== Setup ====================

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-auth-branches-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    app = await buildApp();

    // Clean up any leftover state from previous runs
    await cleanupUserByEmail(TEST_EMAIL);

    // Create the primary test user
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash,
        role: 'DEVELOPER',
        emailVerified: true,
      },
    });
    userId = user.id;

    // Login once to get tokens used by multiple tests
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    const loginBody = loginRes.json();
    accessToken = loginBody.access_token;
    refreshToken = loginBody.refresh_token;
  });

  afterAll(async () => {
    await cleanupUserByEmail(TEST_EMAIL);
    await prisma.$disconnect();
    await app.close();

    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
  });

  // ==================== 1. Registration — existing email ====================

  describe('POST /api/v1/auth/register — existing email enumeration protection', () => {
    it('should return 201 with generic success message when email already exists', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          role: 'DEVELOPER',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.message).toContain('Account created');
      // Must NOT expose tokens — that would confirm the email exists
      expect(body).not.toHaveProperty('access_token');
      expect(body).not.toHaveProperty('refresh_token');
    });
  });

  // ==================== 2. Login — non-existent user ====================

  describe('POST /api/v1/auth/login — non-existent user', () => {
    it('should return 401 with invalid-credentials for unknown email', async () => {
      // Use a fully unique email to avoid lockout from other tests
      const uniqueEmail = `nonexistent-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: uniqueEmail,
          password: TEST_PASSWORD,
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toContain('invalid-credentials');
      expect(body.detail).toMatch(/invalid email or password/i);
    });
  });

  // ==================== 3. Login — wrong password ====================

  describe('POST /api/v1/auth/login — wrong password', () => {
    it('should return 401 with invalid-credentials for wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: TEST_EMAIL,
          password: 'WrongPassword99!',
        },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toContain('invalid-credentials');
      expect(body.detail).toMatch(/invalid email or password/i);
    });
  });

  // ==================== 4. Login — suspended user ====================

  describe('POST /api/v1/auth/login — suspended user', () => {
    const suspendedEmail = 'auth-branches-ext-suspended@example.com';

    beforeAll(async () => {
      await cleanupUserByEmail(suspendedEmail);
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      await prisma.user.create({
        data: {
          email: suspendedEmail,
          passwordHash,
          role: 'HOLDER',
          emailVerified: true,
          status: 'SUSPENDED',
        },
      });
    });

    afterAll(async () => {
      await cleanupUserByEmail(suspendedEmail);
    });

    it('should return 403 with account-suspended for a suspended user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: suspendedEmail, password: TEST_PASSWORD },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.type).toContain('account-suspended');
      expect(body.detail).toMatch(/suspended/i);
    });
  });

  // ==================== 5. Refresh — expired session ====================

  describe('POST /api/v1/auth/refresh — expired session', () => {
    it('should return 401 and delete the expired session', async () => {
      // Login to get a fresh refresh token / session
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(loginRes.statusCode).toBe(200);
      const { refresh_token: expiredRefreshToken } = loginRes.json();

      // Back-date the session in the DB so it looks expired
      const tokenHash = createHash('sha256')
        .update(expiredRefreshToken)
        .digest('hex');

      await prisma.session.updateMany({
        where: { tokenHash },
        data: { expiresAt: new Date(Date.now() - 1000) }, // 1 second in the past
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: expiredRefreshToken },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.type).toContain('unauthorized');
      expect(body.detail).toMatch(/expired/i);

      // The expired session must have been deleted by the route
      const session = await prisma.session.findUnique({ where: { tokenHash } });
      expect(session).toBeNull();
    });
  });

  // ==================== 6. Refresh — suspended user ====================

  describe('POST /api/v1/auth/refresh — suspended user', () => {
    it('should return 403 when user is suspended after session was created', async () => {
      // Login as the primary test user to get a valid session
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(loginRes.statusCode).toBe(200);
      const { refresh_token: validRefreshToken } = loginRes.json();

      // Suspend the user after the session was created
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'SUSPENDED' },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: { refresh_token: validRefreshToken },
      });

      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.type).toContain('account-suspended');

      // Restore user to ACTIVE so subsequent tests are not affected
      await prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });

      // The refresh route deleted the session when it found the suspended user;
      // clean up any remnant just in case
      const tokenHash = createHash('sha256')
        .update(validRefreshToken)
        .digest('hex');
      await prisma.session.deleteMany({ where: { tokenHash } });
    });
  });

  // ==================== 7. Logout — all=true ====================

  describe('DELETE /api/v1/auth/logout — all=true', () => {
    it('should return 204 and clear all sessions for the user', async () => {
      // Ensure at least one session exists
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      expect(loginRes.statusCode).toBe(200);
      const freshAccessToken = loginRes.json().access_token;

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${freshAccessToken}` },
        payload: { all: true },
      });

      expect(res.statusCode).toBe(204);

      // No sessions should remain for this user
      const remaining = await prisma.session.findMany({ where: { userId } });
      expect(remaining).toHaveLength(0);

      // Re-login so subsequent tests still have valid tokens
      const reloginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      accessToken = reloginRes.json().access_token;
      refreshToken = reloginRes.json().refresh_token;
    });
  });

  // ==================== 8. Logout — specific refresh_token ====================

  describe('DELETE /api/v1/auth/logout — specific refresh_token', () => {
    it('should return 204 and delete only the matching session', async () => {
      // Login twice to create two distinct sessions
      const login1 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const login2 = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const token1 = login1.json().access_token;
      const refreshToken1 = login1.json().refresh_token;
      const refreshToken2 = login2.json().refresh_token;

      const sessionsBefore = await prisma.session.findMany({
        where: { userId },
      });
      expect(sessionsBefore.length).toBeGreaterThanOrEqual(2);

      // Logout only session 1 by its refresh_token
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${token1}` },
        payload: { refresh_token: refreshToken1 },
      });

      expect(res.statusCode).toBe(204);

      // Session 1 must be gone; session 2 must still exist
      const hash1 = createHash('sha256').update(refreshToken1).digest('hex');
      const hash2 = createHash('sha256').update(refreshToken2).digest('hex');

      const session1 = await prisma.session.findUnique({
        where: { tokenHash: hash1 },
      });
      const session2 = await prisma.session.findUnique({
        where: { tokenHash: hash2 },
      });

      expect(session1).toBeNull();
      expect(session2).not.toBeNull();

      // Clean up remaining sessions
      await prisma.session.deleteMany({ where: { userId } });

      // Restore tokens for downstream tests
      const reloginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      accessToken = reloginRes.json().access_token;
      refreshToken = reloginRes.json().refresh_token;
    });
  });

  // ==================== 9. Logout — no body (fallback) ====================

  describe('DELETE /api/v1/auth/logout — no body', () => {
    it('should return 204 and delete all sessions as fallback when no body given', async () => {
      // Create a fresh session to prove something actually gets deleted
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      const freshAccessToken = loginRes.json().access_token;

      // Send request with no body at all
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${freshAccessToken}` },
      });

      expect(res.statusCode).toBe(204);

      // All sessions deleted
      const remaining = await prisma.session.findMany({ where: { userId } });
      expect(remaining).toHaveLength(0);

      // Restore tokens for downstream tests
      const reloginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
      });
      accessToken = reloginRes.json().access_token;
      refreshToken = reloginRes.json().refresh_token;
    });
  });

  // ==================== 10 & 11. Verify-email — Redis-dependent branches ====================
  //
  // Branch 10 (line 376-378): fastify.redis is null → 500 service-unavailable
  // Branch 11 (line 383-385): token hash not in Redis → 400 invalid-token
  //
  // Which branch fires depends solely on whether Redis is available in the
  // current environment. We detect this at runtime via fastify.redis and
  // run the appropriate assertion.

  describe('POST /api/v1/auth/verify-email', () => {
    beforeEach(async () => {
      // Clear rate limit counter so tests aren't affected by cross-suite accumulation
      const redis = (app as unknown as { redis: null | { del: (...args: string[]) => Promise<number> } }).redis;
      if (redis) {
        await redis.del('verify-email:ratelimit:127.0.0.1');
      }
    });

    it('should return 500 service-unavailable when Redis is null, or 400 invalid-token when Redis is available but key is missing', async () => {
      const redis = (app as unknown as { redis: null | object }).redis;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/verify-email',
        payload: { token: 'totally-random-nonexistent-verification-token-xyz' },
      });

      if (!redis) {
        // Branch 10: Redis unavailable path
        expect(res.statusCode).toBe(500);
        const body = res.json();
        expect(body.type).toContain('service-unavailable');
        expect(body.detail).toMatch(/unavailable/i);
      } else {
        // Branch 11: Redis available but token missing
        expect(res.statusCode).toBe(400);
        const body = res.json();
        expect(body.type).toContain('invalid-token');
        expect(body.detail).toMatch(/invalid or expired/i);
      }
    });
  });
});
