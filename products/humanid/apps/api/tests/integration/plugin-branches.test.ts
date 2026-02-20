/**
 * Plugin Branch Coverage Tests
 *
 * Targets uncovered branches in:
 * - src/plugins/auth.ts  — all auth decorator edge cases
 * - src/plugins/redis.ts — getRedisOptions() unit tests
 *
 * Auth branches covered:
 *   a) Missing Authorization header             → 401 unauthorized
 *   b) Non-Bearer Authorization format          → 401 unauthorized
 *   c) JWT with missing/non-string userId       → 401 unauthorized
 *   d) JWT for non-existent user                → 401 unauthorized
 *   e) JWT for suspended user                   → 403 account-suspended
 *   f) Valid API key authenticates successfully
 *   g) Revoked API key                          → 401 api-key-revoked
 *   h) API key for suspended user               → 403 account-suspended
 *   i) Unknown Bearer token (not JWT, not key)  → 401 unauthorized
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { hashApiKey } from '../../src/utils/crypto';
import { getRedisOptions } from '../../src/plugins/redis';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

// ──────────────────────────────────────────────────────────────
// Auth plugin branch tests
// ──────────────────────────────────────────────────────────────

describe('Auth plugin — uncovered branches', () => {
  let app: FastifyInstance;
  let devUserId: string;
  let devToken: string;

  // IDs of API key rows created during tests so we can clean them up
  const createdApiKeyIds: string[] = [];
  // IDs of secondary users created during tests
  const createdUserIds: string[] = [];

  const devEmail = 'plugin-branches@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-plugin-branches-32ch';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key-plugin-branches';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    app = await buildApp();

    // Remove any stale user from prior run
    const existing = await prisma.user.findUnique({ where: { email: devEmail } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email: devEmail,
        passwordHash,
        role: 'DEVELOPER',
        emailVerified: true,
      },
    });
    devUserId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    // Clean up API keys created during tests
    if (createdApiKeyIds.length > 0) {
      await prisma.apiKey.deleteMany({ where: { id: { in: createdApiKeyIds } } });
    }

    // Clean up secondary test users
    if (createdUserIds.length > 0) {
      for (const uid of createdUserIds) {
        await prisma.apiKey.deleteMany({ where: { userId: uid } });
        await prisma.session.deleteMany({ where: { userId: uid } });
        await prisma.dID.deleteMany({ where: { userId: uid } });
        await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
      }
    }

    // Clean up primary dev user
    await prisma.apiKey.deleteMany({ where: { userId: devUserId } });
    await prisma.session.deleteMany({ where: { userId: devUserId } });
    await prisma.dID.deleteMany({ where: { userId: devUserId } });
    await prisma.user.delete({ where: { id: devUserId } }).catch(() => undefined);

    await prisma.$disconnect();
    await app.close();
  });

  // Helper: an authenticated endpoint to probe the auth decorator
  const PROBE = '/api/v1/dids';

  // ── a) Missing authorization header ────────────────────────

  it('returns 401 when Authorization header is absent', async () => {
    const res = await app.inject({ method: 'GET', url: PROBE });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/unauthorized/);
  });

  // ── b) Invalid authorization format (non-Bearer) ───────────

  it('returns 401 when Authorization header is not Bearer scheme', async () => {
    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/unauthorized/);
  });

  // ── c) JWT with missing userId claim ───────────────────────

  it('returns 401 when JWT payload has no userId', async () => {
    const token = app.jwt.sign({ noUserId: true });

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/unauthorized/);
  });

  it('returns 401 when JWT payload has a non-string userId', async () => {
    const token = app.jwt.sign({ userId: 12345 });

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/unauthorized/);
  });

  // ── d) JWT for non-existent user ───────────────────────────

  it('returns 401 when JWT userId does not exist in the database', async () => {
    const ghostId = randomUUID();
    const token = app.jwt.sign({ userId: ghostId });

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/unauthorized/);
  });

  // ── e) JWT for suspended user ──────────────────────────────

  it('returns 403 when JWT user has status SUSPENDED', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const suspendedEmail = `suspended-${randomUUID()}@example.com`;

    const suspendedUser = await prisma.user.create({
      data: {
        email: suspendedEmail,
        passwordHash,
        role: 'HOLDER',
        emailVerified: true,
        status: 'SUSPENDED',
      },
    });
    createdUserIds.push(suspendedUser.id);

    const token = app.jwt.sign({ userId: suspendedUser.id });

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/account-suspended/);
  });

  // ── f) Valid API key authenticates successfully ─────────────

  it('authenticates successfully with a valid API key', async () => {
    const rawKey = `test-valid-key-${randomUUID()}`;
    const keyHash = hashApiKey(rawKey);

    const apiKeyRow = await prisma.apiKey.create({
      data: {
        userId: devUserId,
        keyHash,
        keyPrefix: rawKey.substring(0, 16),
        name: 'plugin-branch-valid',
        environment: 'SANDBOX',
        status: 'ACTIVE',
      },
    });
    createdApiKeyIds.push(apiKeyRow.id);

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(res.statusCode).toBe(200);
  });

  // ── g) Revoked API key ─────────────────────────────────────

  it('returns 401 with code api-key-revoked when key status is REVOKED', async () => {
    const rawKey = `test-revoked-key-${randomUUID()}`;
    const keyHash = hashApiKey(rawKey);

    const apiKeyRow = await prisma.apiKey.create({
      data: {
        userId: devUserId,
        keyHash,
        keyPrefix: rawKey.substring(0, 16),
        name: 'plugin-branch-revoked',
        environment: 'SANDBOX',
        status: 'REVOKED',
      },
    });
    createdApiKeyIds.push(apiKeyRow.id);

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/api-key-revoked/);
  });

  // ── h) API key for a suspended user ───────────────────────

  it('returns 403 with code account-suspended when API key owner is suspended', async () => {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const suspendedEmail = `suspended-apikey-${randomUUID()}@example.com`;

    const suspendedUser = await prisma.user.create({
      data: {
        email: suspendedEmail,
        passwordHash,
        role: 'DEVELOPER',
        emailVerified: true,
        status: 'SUSPENDED',
      },
    });
    createdUserIds.push(suspendedUser.id);

    const rawKey = `test-suspended-user-key-${randomUUID()}`;
    const keyHash = hashApiKey(rawKey);

    const apiKeyRow = await prisma.apiKey.create({
      data: {
        userId: suspendedUser.id,
        keyHash,
        keyPrefix: rawKey.substring(0, 16),
        name: 'plugin-branch-suspended-user',
        environment: 'SANDBOX',
        status: 'ACTIVE',
      },
    });
    createdApiKeyIds.push(apiKeyRow.id);

    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${rawKey}` },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/account-suspended/);
  });

  // ── i) Unknown Bearer token — not a JWT, not in the API key table ──

  it('returns 401 for a Bearer token that is neither a valid JWT nor a known API key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: 'Bearer totally-unknown-garbage-token-xyz' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.code ?? body.type).toMatch(/unauthorized/);
  });

  // ── Sanity: valid JWT still works ─────────────────────────

  it('accepts a valid JWT from the dev user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: PROBE,
      headers: { authorization: `Bearer ${devToken}` },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────
// getRedisOptions() unit tests (no live Redis connection needed)
// ──────────────────────────────────────────────────────────────

describe('getRedisOptions() — branch coverage', () => {
  // Snapshot the relevant env vars before each test and restore after
  let savedTls: string | undefined;
  let savedTlsRejectUnauthorized: string | undefined;
  let savedPassword: string | undefined;

  beforeEach(() => {
    savedTls = process.env.REDIS_TLS;
    savedTlsRejectUnauthorized = process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
    savedPassword = process.env.REDIS_PASSWORD;

    delete process.env.REDIS_TLS;
    delete process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
    delete process.env.REDIS_PASSWORD;
  });

  afterEach(() => {
    if (savedTls === undefined) {
      delete process.env.REDIS_TLS;
    } else {
      process.env.REDIS_TLS = savedTls;
    }

    if (savedTlsRejectUnauthorized === undefined) {
      delete process.env.REDIS_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.REDIS_TLS_REJECT_UNAUTHORIZED = savedTlsRejectUnauthorized;
    }

    if (savedPassword === undefined) {
      delete process.env.REDIS_PASSWORD;
    } else {
      process.env.REDIS_PASSWORD = savedPassword;
    }
  });

  it('sets tls to undefined when REDIS_TLS is not configured', () => {
    const options = getRedisOptions();

    expect(options.tls).toBeUndefined();
  });

  it('sets tls with rejectUnauthorized: true when REDIS_TLS=true', () => {
    process.env.REDIS_TLS = 'true';

    const options = getRedisOptions();

    expect(options.tls).toBeDefined();
    expect(options.tls!.rejectUnauthorized).toBe(true);
  });

  it('sets tls.rejectUnauthorized: false when REDIS_TLS_REJECT_UNAUTHORIZED=false', () => {
    process.env.REDIS_TLS = 'true';
    process.env.REDIS_TLS_REJECT_UNAUTHORIZED = 'false';

    const options = getRedisOptions();

    expect(options.tls).toBeDefined();
    expect(options.tls!.rejectUnauthorized).toBe(false);
  });

  it('sets password from REDIS_PASSWORD env var', () => {
    process.env.REDIS_PASSWORD = 'super-secret-redis-pass';

    const options = getRedisOptions();

    expect(options.password).toBe('super-secret-redis-pass');
  });

  it('leaves password undefined when REDIS_PASSWORD is not set', () => {
    const options = getRedisOptions();

    expect(options.password).toBeUndefined();
  });

  it('retryStrategy returns 50 on the first retry attempt', () => {
    const options = getRedisOptions();
    const delay = options.retryStrategy!(1);

    expect(delay).toBe(50);
  });

  it('retryStrategy returns a larger delay on subsequent retry attempts', () => {
    const options = getRedisOptions();

    const delay1 = options.retryStrategy!(1);
    const delay2 = options.retryStrategy!(2);
    const delay5 = options.retryStrategy!(5);

    expect(delay2).toBeGreaterThan(delay1);
    expect(delay5).toBeGreaterThan(delay2);
  });

  it('retryStrategy caps delay at 5000 ms for very large retry counts', () => {
    const options = getRedisOptions();
    const delay = options.retryStrategy!(100);

    expect(delay).toBeLessThanOrEqual(5000);
  });

  it('maxRetriesPerRequest is set to 3', () => {
    const options = getRedisOptions();

    expect(options.maxRetriesPerRequest).toBe(3);
  });
});
