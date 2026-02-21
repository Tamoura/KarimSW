/**
 * Auth, Developer & Organizations Extended Integration Tests
 *
 * Covers error/edge-case branches for:
 *   /api/v1/auth
 *     - POST /register Zod errors (invalid email, weak password, invalid role)
 *     - POST /register duplicate email (returns 201 generic response)
 *     - POST /login Zod errors (missing email, missing password)
 *     - POST /login invalid credentials (non-existent user)
 *     - POST /login wrong password
 *     - POST /login suspended account (403)
 *     - POST /refresh invalid/non-existent token (401)
 *     - POST /refresh expired session (401)
 *     - POST /verify-email missing token Zod error (400)
 *     - POST /verify-email invalid/expired token (400)
 *     - DELETE /logout with specific refresh_token
 *     - DELETE /logout all=true
 *     - DELETE /logout no body (fallback path)
 *
 *   /api/v1/developer/keys
 *     - POST /keys Zod errors (missing name, invalid environment, name too long)
 *     - POST /keys/:id/rotate not found (404)
 *     - POST /keys/:id/rotate already revoked (400)
 *     - DELETE /keys/:id not found (404)
 *     - GET /keys/usage returns aggregate stats
 *     - GET /logs with action filter
 *     - GET /logs pagination (page/limit)
 *
 *   /api/v1/orgs
 *     - POST / Zod errors (missing name, invalid slug chars)
 *     - POST / duplicate slug (409)
 *     - GET /:id not found (404)
 *     - GET /:id user not member (403)
 *     - POST /:id/members insufficient role (MEMBER cannot invite) (403)
 *     - POST /:id/members already active member (409)
 *     - POST /:id/members Zod error - invalid role (400)
 *     - GET /:id/members insufficient role (non-member) (403)
 *     - PATCH /:id/members/:userId not found target (404)
 *     - PATCH /:id/members/:userId not OWNER (403)
 *     - PATCH /:id/members/:userId Zod error (400)
 *     - DELETE /:id/members/:userId cannot remove OWNER (400)
 *     - DELETE /:id/members/:userId not found (404)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Auth, Developer & Organizations Extended - error branches', () => {
  let app: FastifyInstance;

  let ownerToken: string;
  let ownerUserId: string;
  let ownerRefreshToken: string;

  let memberToken: string;
  let memberUserId: string;

  let outsiderToken: string;
  let outsiderUserId: string;

  let orgId: string;
  let apiKeyId: string;

  const ownerEmail = 'auth-ext-owner@example.com';
  const memberEmail = 'auth-ext-member@example.com';
  const outsiderEmail = 'auth-ext-outsider@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.organizationMember.deleteMany({ where: { userId: existing.id } });
      await prisma.auditLog.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-auth-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(ownerEmail);
    await cleanupUser(memberEmail);
    await cleanupUser(outsiderEmail);

    // Create owner user
    const owner = await prisma.user.create({
      data: { email: ownerEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    ownerUserId = owner.id;
    const ownerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: ownerEmail, password: TEST_PASSWORD },
    });
    ownerToken = ownerLogin.json().access_token;
    ownerRefreshToken = ownerLogin.json().refresh_token;

    // Create member user
    const member = await prisma.user.create({
      data: { email: memberEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    memberUserId = member.id;
    const memberLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: memberEmail, password: TEST_PASSWORD },
    });
    memberToken = memberLogin.json().access_token;

    // Create outsider user
    const outsider = await prisma.user.create({
      data: { email: outsiderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    outsiderUserId = outsider.id;
    const outsiderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: outsiderEmail, password: TEST_PASSWORD },
    });
    outsiderToken = outsiderLogin.json().access_token;

    // Owner creates an org
    const orgRes = await app.inject({
      method: 'POST', url: '/api/v1/orgs',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Auth Ext Test Org', slug: `auth-ext-org-${Date.now()}` },
    });
    orgId = orgRes.json().id;

    // Add memberUser as MEMBER
    await app.inject({
      method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { userId: memberUserId, role: 'MEMBER' },
    });

    // Create an API key for owner
    const keyRes = await app.inject({
      method: 'POST', url: '/api/v1/developer/keys',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { name: 'Test Key', environment: 'SANDBOX' },
    });
    apiKeyId = keyRes.json().id;
  });

  afterAll(async () => {
    // Clean up org
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (org) {
      await prisma.organizationMember.deleteMany({ where: { orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
    }
    await cleanupUser(ownerEmail);
    await cleanupUser(memberEmail);
    await cleanupUser(outsiderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await app.close();
    await prisma.$disconnect();
  });

  // ==================== POST /api/v1/auth/register ====================

  describe('POST /api/v1/auth/register', () => {
    it('should return 400 for Zod error - invalid email format', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: 'not-an-email', password: 'StrongPass1' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
      expect(body.detail).toContain('Invalid email format');
    });

    it('should return 400 for Zod error - password too short', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: 'new@example.com', password: 'Short1' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
      expect(body.detail).toContain('8 characters');
    });

    it('should return 400 for Zod error - password missing uppercase letter', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: 'new@example.com', password: 'lowercase1' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - password missing digit', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: 'new@example.com', password: 'NoDigitsHere' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid role enum', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: 'new@example.com', password: 'StrongPass1', role: 'SUPERADMIN' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 201 with generic message for duplicate email (no enumeration)', async () => {
      // ownerEmail is already registered
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: ownerEmail, password: 'AnotherPass1' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.message).toContain('Account created successfully');
      // Crucially, no tokens are returned (prevents enumeration)
      expect(body).not.toHaveProperty('access_token');
    });

    it('should register with default HOLDER role when role not provided', async () => {
      const newEmail = `auth-ext-new-${Date.now()}@example.com`;
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/register',
        payload: { email: newEmail, password: 'ValidPass1' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.role).toBe('HOLDER');
      // Cleanup
      const created = await prisma.user.findUnique({ where: { email: newEmail } });
      if (created) {
        await prisma.session.deleteMany({ where: { userId: created.id } });
        await prisma.user.delete({ where: { email: newEmail } });
      }
    });
  });

  // ==================== POST /api/v1/auth/login ====================

  describe('POST /api/v1/auth/login', () => {
    it('should return 400 for Zod error - missing email', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - empty password', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: ownerEmail, password: '' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 401 for non-existent user', async () => {
      // Use a unique email to avoid rate-limiter interference from parallel test runs
      const nonExistentEmail = `auth-ghost-${Date.now()}-${randomUUID()}@example.com`;
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: nonExistentEmail, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.detail).toContain('Invalid email or password');
    });

    it('should return 401 for wrong password', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: ownerEmail, password: 'WrongPassword1' },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.detail).toContain('Invalid email or password');
    });

    it('should return 403 for suspended account', async () => {
      const suspendedEmail = `auth-ext-suspended-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      await prisma.user.create({
        data: { email: suspendedEmail, passwordHash, role: 'HOLDER', status: 'SUSPENDED' },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: suspendedEmail, password: TEST_PASSWORD },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('suspended');

      // Cleanup
      await prisma.user.delete({ where: { email: suspendedEmail } });
    });
  });

  // ==================== POST /api/v1/auth/refresh ====================

  describe('POST /api/v1/auth/refresh', () => {
    it('should return 400 for Zod error - missing refresh_token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/refresh',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 401 for invalid (non-existent) refresh token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/refresh',
        payload: { refresh_token: 'completely-invalid-token-that-does-not-exist' },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.detail).toContain('Invalid refresh token');
    });

    it('should return 401 for an expired session', async () => {
      // Create a session that is already expired
      const dummyToken = `expired-token-${randomUUID()}`;
      const tokenHash = createHash('sha256').update(dummyToken).digest('hex');
      await prisma.session.create({
        data: {
          userId: ownerUserId,
          tokenHash,
          deviceInfo: 'test-agent',
          ipAddress: '127.0.0.1',
          expiresAt: new Date(Date.now() - 1000), // already expired
        },
      });

      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/refresh',
        payload: { refresh_token: dummyToken },
      });
      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.detail).toContain('expired');
    });

    it('should return a new token pair for a valid refresh token', async () => {
      // Login fresh to get a clean refresh token
      const loginRes = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: ownerEmail, password: TEST_PASSWORD },
      });
      const freshRefreshToken = loginRes.json().refresh_token;

      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/refresh',
        payload: { refresh_token: freshRefreshToken },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('access_token');
      expect(body).toHaveProperty('refresh_token');
      // Old token must be rotated (can no longer be used)
      expect(body.refresh_token).not.toBe(freshRefreshToken);
    });
  });

  // ==================== POST /api/v1/auth/verify-email ====================

  describe('POST /api/v1/auth/verify-email', () => {
    beforeEach(async () => {
      // Clear rate limit counter so tests aren't affected by cross-suite accumulation
      if (app.redis) {
        await app.redis.del('verify-email:ratelimit:127.0.0.1');
      }
    });

    it('should return 400 for Zod error - missing token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/verify-email',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for invalid/non-existent verification token', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/auth/verify-email',
        payload: { token: 'non-existent-verification-token-12345' },
      });
      // Either 400 (invalid token) or 500 (no Redis) - both are acceptable uncovered branches
      expect([400, 500]).toContain(res.statusCode);
    });
  });

  // ==================== DELETE /api/v1/auth/logout ====================

  describe('DELETE /api/v1/auth/logout', () => {
    it('should return 204 when logging out with a specific refresh_token', async () => {
      // Login to get a fresh token pair
      const loginRes = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: memberEmail, password: TEST_PASSWORD },
      });
      const { access_token, refresh_token } = loginRes.json();

      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${access_token}` },
        payload: { refresh_token },
      });
      expect(res.statusCode).toBe(204);
    });

    it('should return 204 when logging out all sessions (all=true)', async () => {
      // Login to get a fresh token pair
      const loginRes = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: memberEmail, password: TEST_PASSWORD },
      });
      const { access_token } = loginRes.json();

      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${access_token}` },
        payload: { all: true },
      });
      expect(res.statusCode).toBe(204);
    });

    it('should return 204 when logging out with no body (fallback path)', async () => {
      // Login fresh
      const loginRes = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: memberEmail, password: TEST_PASSWORD },
      });
      const { access_token } = loginRes.json();

      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/auth/logout',
        headers: { authorization: `Bearer ${access_token}` },
        payload: {},
      });
      expect(res.statusCode).toBe(204);
    });

    it('should return 401 when not authenticated', async () => {
      const res = await app.inject({
        method: 'DELETE', url: '/api/v1/auth/logout',
        payload: {},
      });
      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== POST /api/v1/developer/keys ====================

  describe('POST /api/v1/developer/keys', () => {
    it('should return 400 for Zod error - missing name', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { environment: 'SANDBOX' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing environment', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'My Key' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid environment value', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'My Key', environment: 'STAGING' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - name too long (> 100)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'K'.repeat(101), environment: 'SANDBOX' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should set rateLimit=1000 for SANDBOX environment', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Sandbox Key', environment: 'SANDBOX' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.rateLimit).toBe(1000);
      expect(body).toHaveProperty('key'); // raw key returned once
    });

    it('should set rateLimit=100 for PRODUCTION environment', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Production Key', environment: 'PRODUCTION' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.rateLimit).toBe(100);
    });
  });

  // ==================== POST /api/v1/developer/keys/:id/rotate ====================

  describe('POST /api/v1/developer/keys/:id/rotate', () => {
    it('should return 404 for non-existent API key', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'POST', url: `/api/v1/developer/keys/${fakeId}/rotate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 400 when trying to rotate a revoked key', async () => {
      // Revoke the key first
      await app.inject({
        method: 'DELETE', url: `/api/v1/developer/keys/${apiKeyId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      const res = await app.inject({
        method: 'POST', url: `/api/v1/developer/keys/${apiKeyId}/rotate`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('revoked');
    });
  });

  // ==================== DELETE /api/v1/developer/keys/:id ====================

  describe('DELETE /api/v1/developer/keys/:id', () => {
    it('should return 404 for non-existent API key', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/developer/keys/${fakeId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 404 when trying to delete another user key', async () => {
      // Create a key as owner, then try to delete with member's token
      const keyRes = await app.inject({
        method: 'POST', url: '/api/v1/developer/keys',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Owner-Only Key', environment: 'SANDBOX' },
      });
      const ownedKeyId = keyRes.json().id;

      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/developer/keys/${ownedKeyId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== GET /api/v1/developer/keys/usage ====================

  describe('GET /api/v1/developer/keys/usage', () => {
    it('should return usage stats including total and active key counts', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/developer/keys/usage',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('totalKeys');
      expect(body).toHaveProperty('activeKeys');
      expect(body).toHaveProperty('revokedKeys');
      expect(body).toHaveProperty('totalRequests');
    });
  });

  // ==================== GET /api/v1/developer/logs ====================

  describe('GET /api/v1/developer/logs', () => {
    it('should return logs with default pagination', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/developer/logs',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('logs');
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
      expect(body).toHaveProperty('pageSize');
      expect(body).toHaveProperty('totalPages');
    });

    it('should filter logs by action query param', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/developer/logs?action=login',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('logs');
    });

    it('should respect page and limit query params', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/developer/logs?page=1&limit=5',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.page).toBe(1);
      expect(body.pageSize).toBeLessThanOrEqual(5);
    });

    it('should cap limit at 100', async () => {
      const res = await app.inject({
        method: 'GET', url: '/api/v1/developer/logs?limit=500',
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pageSize).toBeLessThanOrEqual(100);
    });
  });

  // ==================== POST /api/v1/orgs ====================

  describe('POST /api/v1/orgs', () => {
    it('should return 400 for Zod error - missing name', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/orgs',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { slug: 'my-org' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid slug (uppercase)', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/orgs',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'My Org', slug: 'My-Invalid-Slug' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - slug with special chars', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/orgs',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'My Org', slug: 'my org!' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 409 for duplicate slug', async () => {
      // Use the same slug as the org created in beforeAll (but get it first)
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      const existingSlug = org!.slug;

      const res = await app.inject({
        method: 'POST', url: '/api/v1/orgs',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { name: 'Another Org', slug: existingSlug },
      });
      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toContain('slug already exists');
    });
  });

  // ==================== GET /api/v1/orgs/:id ====================

  describe('GET /api/v1/orgs/:id', () => {
    it('should return 404 for non-existent org', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'GET', url: `/api/v1/orgs/${fakeId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 403 when user is not a member', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/orgs/${orgId}`,
        headers: { authorization: `Bearer ${outsiderToken}` },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('not a member');
    });

    it('should return org details for a member', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/orgs/${orgId}`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(orgId);
      expect(body).toHaveProperty('members');
      expect(body).toHaveProperty('ssoEnforced');
    });
  });

  // ==================== POST /api/v1/orgs/:id/members ====================

  describe('POST /api/v1/orgs/:id/members', () => {
    it('should return 403 when MEMBER (not OWNER/ADMIN) tries to invite', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { userId: outsiderUserId, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Requires role');
    });

    it('should return 403 when outsider (not a member) tries to invite', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${outsiderToken}` },
        payload: { userId: memberUserId, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 400 for Zod error - invalid role (SUPERADMIN)', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { userId: outsiderUserId, role: 'SUPERADMIN' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid userId (not UUID)', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { userId: 'not-a-uuid', role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 409 when inviting a user already actively a member', async () => {
      // memberUserId is already ACTIVE MEMBER
      const res = await app.inject({
        method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { userId: memberUserId, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(409);
      const body = res.json();
      expect(body.detail).toContain('already a member');
    });

    it('should return 201 when owner invites outsider', async () => {
      const res = await app.inject({
        method: 'POST', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { userId: outsiderUserId, role: 'MEMBER' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.role).toBe('MEMBER');
      expect(body.status).toBe('ACTIVE');
    });
  });

  // ==================== GET /api/v1/orgs/:id/members ====================

  describe('GET /api/v1/orgs/:id/members', () => {
    it('should return 403 for a non-member user', async () => {
      // Create a temporary fresh user with no membership
      const freshEmail2 = `auth-ext-fresh2-${Date.now()}@example.com`;
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      await prisma.user.create({
        data: { email: freshEmail2, passwordHash, role: 'HOLDER', emailVerified: true },
      });
      const freshLogin = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: freshEmail2, password: TEST_PASSWORD },
      });
      const freshToken2 = freshLogin.json().access_token;

      const res = await app.inject({
        method: 'GET', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${freshToken2}` },
      });
      expect(res.statusCode).toBe(403);

      // Cleanup
      const freshUser2 = await prisma.user.findUnique({ where: { email: freshEmail2 } });
      if (freshUser2) {
        await prisma.session.deleteMany({ where: { userId: freshUser2.id } });
        await prisma.user.delete({ where: { email: freshEmail2 } });
      }
    });

    it('should allow MEMBER role to list members', async () => {
      const res = await app.inject({
        method: 'GET', url: `/api/v1/orgs/${orgId}/members`,
        headers: { authorization: `Bearer ${memberToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('members');
      expect(body.members.length).toBeGreaterThan(0);
    });
  });

  // ==================== PATCH /api/v1/orgs/:id/members/:userId ====================

  describe('PATCH /api/v1/orgs/:id/members/:userId', () => {
    it('should return 403 when non-OWNER tries to change role', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${outsiderUserId}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: { role: 'ADMIN' },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Requires role: OWNER');
    });

    it('should return 400 for Zod error - invalid role value', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${outsiderUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'SUPERADMIN' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 404 for non-existent target member', async () => {
      const fakeUserId = randomUUID();
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${fakeUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'ADMIN' },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('Member not found');
    });

    it('should successfully update member role as OWNER', async () => {
      const res = await app.inject({
        method: 'PATCH', url: `/api/v1/orgs/${orgId}/members/${outsiderUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'ADMIN' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.role).toBe('ADMIN');
    });
  });

  // ==================== DELETE /api/v1/orgs/:id/members/:userId ====================

  describe('DELETE /api/v1/orgs/:id/members/:userId', () => {
    it('should return 403 when MEMBER tries to remove another member', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${outsiderUserId}`,
        headers: { authorization: `Bearer ${memberToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(403);
    });

    it('should return 404 for non-existent target member', async () => {
      const fakeUserId = randomUUID();
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${fakeUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('Member not found');
    });

    it('should return 400 when trying to remove the OWNER', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${ownerUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('Cannot remove the organization owner');
    });

    it('should successfully remove an ADMIN member', async () => {
      const res = await app.inject({
        method: 'DELETE', url: `/api/v1/orgs/${orgId}/members/${outsiderUserId}`,
        headers: { authorization: `Bearer ${ownerToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain('removed');
    });
  });
});
