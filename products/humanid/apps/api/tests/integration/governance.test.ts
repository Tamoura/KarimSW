/**
 * Decentralized Governance Integration Tests
 *
 * Tests for /api/v1/governance endpoints:
 * - POST /proposals       (create proposal)
 * - GET /proposals        (list proposals)
 * - POST /proposals/:id/vote (vote on proposal)
 * - GET /proposals/:id/results (proposal results)
 * - GET /params           (governance parameters)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Decentralized Governance - /api/v1/governance', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let proposalId: string;
  const devEmail = 'gov-voter@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.governanceVote.deleteMany({ where: { voterId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-governance';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);
    await prisma.governanceVote.deleteMany({});
    await prisma.governanceProposal.deleteMany({});

    const user = await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    devUserId = user.id;

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await prisma.governanceVote.deleteMany({});
    await prisma.governanceProposal.deleteMany({});
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/governance/proposals', () => {
    it('should create a governance proposal', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Add support for BBS+ signatures',
          description: 'Proposal to add BBS+ signature support for enhanced privacy-preserving presentations.',
          category: 'protocol',
          votingDurationHours: 168,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('ACTIVE');
      expect(body.votesFor).toBe(0);
      proposalId = body.id;
    });
  });

  describe('GET /api/v1/governance/proposals', () => {
    it('should list proposals with auth', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('proposals');
      expect(body.proposals.length).toBeGreaterThan(0);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/governance/proposals/:id/vote', () => {
    it('should cast a vote', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${proposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          vote: true,
          reason: 'BBS+ would greatly improve selective disclosure capabilities.',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('votesFor');
      expect(body.votesFor).toBe(1);
    });
  });

  describe('GET /api/v1/governance/proposals/:id/results', () => {
    it('should return proposal results', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/governance/proposals/${proposalId}/results`,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('votesFor');
      expect(body).toHaveProperty('votesAgainst');
      expect(body).toHaveProperty('totalVotes');
      expect(body).toHaveProperty('quorumReached');
    });
  });

  describe('GET /api/v1/governance/params', () => {
    it('should return governance parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/params',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('defaultQuorum');
      expect(body).toHaveProperty('minVotingDuration');
      expect(body).toHaveProperty('categories');
    });
  });
});
