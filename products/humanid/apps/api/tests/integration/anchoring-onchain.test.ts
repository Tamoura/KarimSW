/**
 * On-Chain Verification Enhancement Tests
 *
 * Tests for enhanced anchoring endpoints:
 * - GET /:id/verify — returns onChainVerified + confirmations when RPC available
 * - GET /chains — returns rpcConnected + latestBlock when RPC available
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('On-Chain Verification Enhancement', () => {
  let app: FastifyInstance;
  let devToken: string;
  let testDidId: string;
  const devEmail = 'onchain-verify-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      const userDids = await prisma.dID.findMany({
        where: { userId: existing.id },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);
      await prisma.blockchainAnchor.deleteMany({
        where: { entityId: { in: didIds } },
      });
      await prisma.dIDDocument.deleteMany({
        where: { did: { userId: existing.id } },
      });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-onchain';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);

    await prisma.user.create({
      data: {
        email: devEmail,
        passwordHash,
        role: 'DEVELOPER',
        emailVerified: true,
      },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;

    const didRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    testDidId = didRes.json().id;
  });

  afterAll(async () => {
    // Clean up anchors that reference our entities
    await prisma.blockchainAnchor.deleteMany({
      where: { entityId: { startsWith: 'onchain-' } },
    });
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/anchoring/:id/verify (enhanced)', () => {
    it('should return onChainVerified=false for PENDING anchors', async () => {
      // Create a PENDING anchor
      const anchor = await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'a'.repeat(64),
          status: 'PENDING',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/anchoring/${anchor.id}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.anchored).toBe(false);
      expect(body.status).toBe('PENDING');
      expect(body.onChainVerified).toBe(false);

      await prisma.blockchainAnchor.delete({ where: { id: anchor.id } });
    });

    it('should return CONFIRMED anchor with onChainVerified field', async () => {
      // Create a CONFIRMED anchor (simulating already anchored)
      const anchor = await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'b'.repeat(64),
          status: 'CONFIRMED',
          transactionHash: '0xconfirmed123',
          blockNumber: '12345',
          anchoredAt: new Date(),
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/anchoring/${anchor.id}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.anchored).toBe(true);
      expect(body.status).toBe('CONFIRMED');
      expect(body.transactionHash).toBe('0xconfirmed123');
      expect(body.blockNumber).toBe('12345');
      // onChainVerified field should be present (false when no RPC)
      expect(body).toHaveProperty('onChainVerified');

      await prisma.blockchainAnchor.delete({ where: { id: anchor.id } });
    });

    it('should return SUBMITTED status for in-flight transactions', async () => {
      const anchor = await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'c'.repeat(64),
          status: 'SUBMITTED',
          transactionHash: '0xsubmitted456',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/anchoring/${anchor.id}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.anchored).toBe(false);
      expect(body.status).toBe('SUBMITTED');
      expect(body.onChainVerified).toBe(false);

      await prisma.blockchainAnchor.delete({ where: { id: anchor.id } });
    });
  });

  describe('GET /api/v1/anchoring/:id/verify (with fake RPC)', () => {
    it('should gracefully handle unreachable RPC for CONFIRMED anchor', async () => {
      const anchor = await prisma.blockchainAnchor.create({
        data: {
          entityType: 'DID',
          entityId: testDidId,
          chain: 'POLYGON',
          dataHash: 'f'.repeat(64),
          status: 'CONFIRMED',
          transactionHash: '0xrpctest123',
          blockNumber: '999',
          anchoredAt: new Date(),
        },
      });

      // Set a fake RPC URL to exercise the on-chain verification branch
      process.env.POLYGON_RPC_URL = 'http://127.0.0.1:19999';
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/v1/anchoring/${anchor.id}/verify`,
          headers: { authorization: `Bearer ${devToken}` },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        // RPC is unreachable, so onChainVerified stays false
        expect(body.onChainVerified).toBe(false);
        expect(body.anchored).toBe(true);
        expect(body.status).toBe('CONFIRMED');
      } finally {
        delete process.env.POLYGON_RPC_URL;
        await prisma.blockchainAnchor.delete({ where: { id: anchor.id } });
      }
    });
  });

  describe('GET /api/v1/anchoring/chains (enhanced)', () => {
    it('should return chain stats with rpcConnected field', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/anchoring/chains',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.chains.length).toBeGreaterThanOrEqual(4);

      const polygon = body.chains.find(
        (c: { name: string }) => c.name === 'POLYGON'
      );
      expect(polygon).toBeDefined();
      expect(polygon).toHaveProperty('rpcConnected');
      expect(polygon).toHaveProperty('totalAnchors');
      expect(polygon).toHaveProperty('confirmedAnchors');
    });

    it('should gracefully handle unreachable RPC in chain health', async () => {
      process.env.POLYGON_RPC_URL = 'http://127.0.0.1:19999';
      try {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/anchoring/chains',
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        const polygon = body.chains.find(
          (c: { name: string }) => c.name === 'POLYGON'
        );
        // RPC is unreachable, so rpcConnected should be false
        expect(polygon.rpcConnected).toBe(false);
        expect(polygon.latestBlock).toBeNull();
      } finally {
        delete process.env.POLYGON_RPC_URL;
      }
    });
  });
});
