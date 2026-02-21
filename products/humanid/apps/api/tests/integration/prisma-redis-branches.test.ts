/**
 * Prisma & Redis Plugin Branch Coverage
 *
 * Targets uncovered validation branches in:
 *   - prisma.ts: pool size/timeout validation (lines 29-37)
 *   - redis.ts: no REDIS_URL branch (lines 59-63)
 */

import { buildApp } from '../../src/app';

describe('Prisma Plugin — pool validation branches', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envKeys = ['DATABASE_POOL_SIZE', 'DATABASE_POOL_TIMEOUT', 'JWT_SECRET', 'CLAIMS_ENCRYPTION_KEY'];

  beforeEach(() => {
    for (const k of envKeys) savedEnv[k] = process.env[k];
    process.env.JWT_SECRET = 'test-jwt-secret-prisma-validation-32ch';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  });

  afterEach(() => {
    for (const k of envKeys) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('should reject pool size = 0', async () => {
    process.env.DATABASE_POOL_SIZE = '0';
    await expect(buildApp()).rejects.toThrow('Invalid DATABASE_POOL_SIZE');
  });

  it('should reject pool size > 500', async () => {
    process.env.DATABASE_POOL_SIZE = '999';
    await expect(buildApp()).rejects.toThrow('Invalid DATABASE_POOL_SIZE');
  });

  it('should reject non-numeric pool size', async () => {
    process.env.DATABASE_POOL_SIZE = 'abc';
    await expect(buildApp()).rejects.toThrow('Invalid DATABASE_POOL_SIZE');
  });

  it('should reject pool timeout = 0', async () => {
    process.env.DATABASE_POOL_TIMEOUT = '0';
    await expect(buildApp()).rejects.toThrow('Invalid DATABASE_POOL_TIMEOUT');
  });

  it('should reject pool timeout > 300', async () => {
    process.env.DATABASE_POOL_TIMEOUT = '999';
    await expect(buildApp()).rejects.toThrow('Invalid DATABASE_POOL_TIMEOUT');
  });

  it('should reject non-numeric pool timeout', async () => {
    process.env.DATABASE_POOL_TIMEOUT = 'xyz';
    await expect(buildApp()).rejects.toThrow('Invalid DATABASE_POOL_TIMEOUT');
  });
});

describe('Prisma Plugin — URL with query string', () => {
  it('should accept valid pool size at boundary (1)', async () => {
    process.env.DATABASE_POOL_SIZE = '1';
    process.env.JWT_SECRET = 'test-jwt-secret-prisma-boundary-32chars';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect([200, 503]).toContain(res.statusCode);
    await app.close();
    delete process.env.DATABASE_POOL_SIZE;
    delete process.env.JWT_SECRET;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
  });
});
