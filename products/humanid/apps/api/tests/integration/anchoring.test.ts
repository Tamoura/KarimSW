/**
 * Cross-Chain Anchoring Integration Tests
 *
 * Tests for /api/v1/anchoring endpoints:
 * - POST /submit         (submit anchor to chain)
 * - GET /                (list anchors)
 * - GET /:id/verify      (verify on-chain anchor)
 * - GET /chains          (chain health status)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Cross-Chain Anchoring - /api/v1/anchoring', () => {
  let app: FastifyInstance;
  let devToken: string;
  let anchorId: string;
  let testDidId: string;
  const devEmail = 'anchor-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-anchoring';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);

    await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;

    // Create a DID to use as entityId for anchoring
    const didRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    testDidId = didRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/anchoring/submit', () => {
    it('should submit an anchor to Ethereum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/anchoring/submit',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'ETHEREUM',
          dataHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.chain).toBe('ETHEREUM');
      expect(body.status).toBe('PENDING');
      anchorId = body.id;
    });

    it('should support multiple chains', async () => {
      for (const chain of ['SOLANA', 'ARBITRUM']) {
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/anchoring/submit',
          headers: { authorization: `Bearer ${devToken}` },
          payload: {
            entityType: 'DID',
            entityId: testDidId,
            chain,
            dataHash: 'ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00ff00',
          },
        });
        expect(res.statusCode).toBe(201);
        expect(res.json().chain).toBe(chain);
      }
    });
  });

  describe('GET /api/v1/anchoring', () => {
    it('should list anchors with chain filter', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring?chain=ETHEREUM',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('anchors');
      expect(body.anchors.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/anchoring/:id/verify', () => {
    it('should return anchor verification status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/anchoring/${anchorId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('anchored');
      expect(body).toHaveProperty('chain');
      expect(body).toHaveProperty('dataHash');
    });
  });

  describe('GET /api/v1/anchoring/chains', () => {
    it('should return chain health status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring/chains',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('chains');
      expect(body.chains.length).toBeGreaterThanOrEqual(4);
      expect(body.chains.map((c: { name: string }) => c.name)).toContain('ETHEREUM');
    });
  });
});
