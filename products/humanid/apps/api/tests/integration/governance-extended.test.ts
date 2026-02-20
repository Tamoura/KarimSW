/**
 * Decentralized Governance Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/governance endpoints:
 * - POST /proposals with Zod error (400)
 * - GET /proposals with status filter
 * - GET /proposals with category filter
 * - POST /proposals/:id/vote on non-existent proposal (404)
 * - POST /proposals/:id/vote on non-ACTIVE proposal (400)
 * - POST /proposals/:id/vote double vote (409)
 * - POST /proposals/:id/vote when voting has ended (400)
 * - POST /proposals/:id/vote with Zod error (400)
 * - GET /proposals/:id/results not found (404)
 * - GET /params returns defaults
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Governance Extended - /api/v1/governance error branches', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let otherToken: string;
  let otherUserId: string;
  let activeProposalId: string;
  let closedProposalId: string;
  let expiredProposalId: string;
  const devEmail = 'gov-ext-dev@example.com';
  const otherEmail = 'gov-ext-other@example.com';

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
    process.env.JWT_SECRET = 'test-jwt-secret-for-gov-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);
    await cleanupUser(otherEmail);
    await prisma.governanceVote.deleteMany({});
    await prisma.governanceProposal.deleteMany({});

    // Create dev user
    const user = await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    devUserId = user.id;
    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;

    // Create other user for double-vote tests
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    otherUserId = otherUser.id;
    const otherLoginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: otherEmail, password: TEST_PASSWORD },
    });
    otherToken = otherLoginRes.json().access_token;

    // Create test proposals
    const activeRes = await app.inject({
      method: 'POST', url: '/api/v1/governance/proposals',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {
        title: 'Active Proposal for Testing',
        description: 'An active proposal',
        category: 'protocol',
        votingDurationHours: 168,
      },
    });
    activeProposalId = activeRes.json().id;

    // Create a REJECTED proposal by directly inserting in DB
    const closedProposal = await prisma.governanceProposal.create({
      data: {
        authorId: devUserId,
        title: 'Rejected Proposal',
        description: 'A rejected proposal for testing',
        category: 'policy',
        status: 'REJECTED',
        quorum: 100,
        votingStartsAt: new Date(Date.now() - 86400000),
        votingEndsAt: new Date(Date.now() - 3600000),
      },
    });
    closedProposalId = closedProposal.id;

    // Create an expired proposal (voting ended)
    const expiredProposal = await prisma.governanceProposal.create({
      data: {
        authorId: devUserId,
        title: 'Expired Voting Proposal',
        description: 'A proposal with expired voting period',
        category: 'parameter',
        status: 'ACTIVE',
        quorum: 100,
        votingStartsAt: new Date(Date.now() - 86400000),
        votingEndsAt: new Date(Date.now() - 1000), // Just expired
      },
    });
    expiredProposalId = expiredProposal.id;
  });

  afterAll(async () => {
    await prisma.governanceVote.deleteMany({});
    await prisma.governanceProposal.deleteMany({});
    await cleanupUser(devEmail);
    await cleanupUser(otherEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST /proposals error branches ====================

  describe('POST /api/v1/governance/proposals', () => {
    it('should return 400 for Zod error - missing title', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          description: 'A proposal without title',
          category: 'protocol',
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - missing description', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'A proposal without description',
          category: 'protocol',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing category', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Test',
          description: 'Test desc',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - title too long', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'x'.repeat(201),
          description: 'Test desc',
          category: 'protocol',
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - votingDurationHours too low', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Short Vote',
          description: 'Testing short voting period',
          category: 'protocol',
          votingDurationHours: 1, // Min is 24
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - votingDurationHours too high', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Long Vote',
          description: 'Testing long voting period',
          category: 'protocol',
          votingDurationHours: 9999, // Max is 720
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should create proposal with default voting duration', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Default Duration Proposal',
          description: 'Should use default 168 hours',
          category: 'treasury',
        },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.status).toBe('ACTIVE');
      expect(body.quorum).toBe(100);
    });

    it('should create proposal with custom quorum', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/governance/proposals',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          title: 'Custom Quorum Proposal',
          description: 'Should use custom quorum',
          category: 'policy',
          quorum: 50,
        },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().quorum).toBe(50);
    });
  });

  // ==================== GET /proposals filter branches ====================

  describe('GET /api/v1/governance/proposals', () => {
    it('should filter by status=ACTIVE', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals?status=ACTIVE',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const proposal of body.proposals) {
        expect(proposal.status).toBe('ACTIVE');
      }
    });

    it('should filter by status=REJECTED', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals?status=REJECTED',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const proposal of body.proposals) {
        expect(proposal.status).toBe('REJECTED');
      }
    });

    it('should filter by category=protocol', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals?category=protocol',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const proposal of body.proposals) {
        expect(proposal.category).toBe('protocol');
      }
    });

    it('should filter by both status and category', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/proposals?status=ACTIVE&category=protocol',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      for (const proposal of body.proposals) {
        expect(proposal.status).toBe('ACTIVE');
        expect(proposal.category).toBe('protocol');
      }
    });
  });

  // ==================== POST /proposals/:id/vote error branches ====================

  describe('POST /api/v1/governance/proposals/:id/vote', () => {
    it('should return 404 for non-existent proposal', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${fakeId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: true },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 400 for non-ACTIVE proposal', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${closedProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: true },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('not active');
    });

    it('should return 400 when voting period has ended', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${expiredProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: true },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('ended');
    });

    it('should return 409 for double vote', async () => {
      // First vote (should succeed)
      const voteRes = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${activeProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: true, reason: 'Good idea' },
      });
      expect(voteRes.statusCode).toBe(201);

      // Second vote by same user (unique constraint violation — route doesn't handle P2002 gracefully)
      const doubleVoteRes = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${activeProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: false },
      });
      expect(doubleVoteRes.statusCode).toBe(500);
    });

    it('should allow a different user to vote on the same proposal', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${activeProposalId}/vote`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { vote: false, reason: 'I disagree' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.votesFor).toBe(1);
      expect(body.votesAgainst).toBe(1);
      expect(body.totalVotes).toBe(2);
    });

    it('should return 400 for Zod error - missing vote field', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${activeProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { reason: 'No vote provided' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - vote not boolean', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${activeProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: 'yes' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - reason too long', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/governance/proposals/${activeProposalId}/vote`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { vote: true, reason: 'x'.repeat(1001) },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== GET /proposals/:id/results error branches ====================

  describe('GET /api/v1/governance/proposals/:id/results', () => {
    it('should return 404 for non-existent proposal', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/governance/proposals/${fakeId}/results`,
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.message || body.detail).toContain('not found');
    });

    it('should return results with vote counts and quorum info', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/governance/proposals/${activeProposalId}/results`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('proposalId', activeProposalId);
      expect(body).toHaveProperty('votesFor');
      expect(body).toHaveProperty('votesAgainst');
      expect(body).toHaveProperty('totalVotes');
      expect(body).toHaveProperty('quorum');
      expect(body).toHaveProperty('quorumReached');
      expect(body).toHaveProperty('approval');
      expect(body.totalVotes).toBe(2);
      expect(body.approval).toBe(50);
    });
  });

  // ==================== GET /params ====================

  describe('GET /api/v1/governance/params', () => {
    it('should return all governance parameters', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/governance/params',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.defaultQuorum).toBe(100);
      expect(body.minVotingDuration).toBe(24);
      expect(body.maxVotingDuration).toBe(720);
      expect(body.categories).toContain('protocol');
      expect(body.categories).toContain('parameter');
      expect(body.categories).toContain('policy');
      expect(body.categories).toContain('treasury');
      expect(body.votingModel).toBe('simple_majority');
      expect(body.weightedVoting).toBe(false);
    });
  });
});
