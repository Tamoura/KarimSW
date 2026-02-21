/**
 * GDPR Data Subject Rights Integration Tests (RISK-005)
 *
 * Endpoints:
 *   GET    /api/v1/me/data    — structured personal data export
 *   GET    /api/v1/me/export  — downloadable JSON file attachment
 *   DELETE /api/v1/me         — account erasure (right to be forgotten)
 *
 * GDPR Articles covered:
 *   Art. 15 — Right of access (GET /data)
 *   Art. 20 — Right to data portability (GET /export)
 *   Art. 17 — Right to erasure (DELETE /me)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('GDPR Data Subject Rights - /api/v1/me', () => {
  let app: FastifyInstance;

  const holderEmail = 'gdpr-holder@example.com';

  async function cleanupUser(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.user.delete({ where: { id: user.id } });
    }
  }

  async function createUserAndLogin(email: string): Promise<{ token: string; userId: string }> {
    await cleanupUser(email);
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: TEST_PASSWORD },
    });
    return { token: loginRes.json().access_token, userId: user.id };
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-gdpr';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();
  });

  afterAll(async () => {
    await cleanupUser(holderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ── GET /api/v1/me/data ──────────────────────────────────────────────────

  describe('GET /api/v1/me/data', () => {
    let token: string;

    beforeEach(async () => {
      ({ token } = await createUserAndLogin(holderEmail));
    });

    afterEach(async () => {
      await cleanupUser(holderEmail);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me/data' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with structured personal data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
    });

    it('includes the profile section with email and role', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      expect(body.profile).toBeDefined();
      expect(body.profile.email).toBe(holderEmail);
      expect(body.profile.role).toBe('HOLDER');
      expect(body.profile.id).toBeDefined();
    });

    it('omits passwordHash from the profile section', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      expect(body.profile.passwordHash).toBeUndefined();
      expect(body.profile.password_hash).toBeUndefined();
    });

    it('includes dids, credentials, webhooks, apiKeys, and auditLogs arrays', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      expect(Array.isArray(body.dids)).toBe(true);
      expect(Array.isArray(body.credentials)).toBe(true);
      expect(Array.isArray(body.webhooks)).toBe(true);
      expect(Array.isArray(body.apiKeys)).toBe(true);
      expect(Array.isArray(body.auditLogs)).toBe(true);
    });

    it('includes a generatedAt timestamp in ISO format', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      expect(typeof body.generatedAt).toBe('string');
      expect(() => new Date(body.generatedAt)).not.toThrow();
    });

    it('does not expose encrypted private keys in DID data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = res.json();
      for (const did of body.dids) {
        expect(did.encryptedPrivateKey).toBeUndefined();
        expect(did.encrypted_private_key).toBeUndefined();
      }
    });
  });

  // ── GET /api/v1/me/export ────────────────────────────────────────────────

  describe('GET /api/v1/me/export', () => {
    let token: string;

    beforeEach(async () => {
      ({ token } = await createUserAndLogin(holderEmail));
    });

    afterEach(async () => {
      await cleanupUser(holderEmail);
    });

    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/me/export' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 with application/json content type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/export',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/application\/json/);
    });

    it('sets Content-Disposition attachment header for file download', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/export',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const cd = res.headers['content-disposition'] as string;
      expect(cd).toBeDefined();
      expect(cd).toMatch(/attachment/);
      expect(cd).toMatch(/\.json/);
    });

    it('returns valid JSON body with the same structure as /me/data', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/export',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.profile).toBeDefined();
      expect(body.profile.email).toBe(holderEmail);
      expect(Array.isArray(body.dids)).toBe(true);
    });
  });

  // ── DELETE /api/v1/me ────────────────────────────────────────────────────

  describe('DELETE /api/v1/me', () => {
    it('returns 401 without a token', async () => {
      const res = await app.inject({ method: 'DELETE', url: '/api/v1/me' });
      expect(res.statusCode).toBe(401);
    });

    it('returns 200 and deletes the account', async () => {
      const deleteEmail = 'gdpr-delete@example.com';
      const { token, userId } = await createUserAndLogin(deleteEmail);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.message).toMatch(/deleted/i);

      // User should no longer exist in DB
      const deleted = await prisma.user.findUnique({ where: { id: userId } });
      expect(deleted).toBeNull();
    });

    it('returns 401 when the same (now-deleted) token is used again', async () => {
      const reuseEmail = 'gdpr-reuse@example.com';
      const { token } = await createUserAndLogin(reuseEmail);

      // Delete the account
      await app.inject({
        method: 'DELETE',
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });

      // Subsequent request with the same token must be rejected
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/me/data',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
