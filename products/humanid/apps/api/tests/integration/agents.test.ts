/**
 * AI Agent Identity Protocol Integration Tests
 *
 * Tests for /api/v1/agents endpoints:
 * - POST /                    (register agent with DID)
 * - GET /                     (list user's agents)
 * - GET /:id                  (get agent details)
 * - POST /:id/delegate        (create delegation credential)
 * - POST /:id/verify          (verify proof-of-human-authorization)
 * - DELETE /:id/delegations/:delegationId (revoke delegation)
 * - PATCH /:id                (suspend/revoke agent)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('AI Agent Identity - /api/v1/agents', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let agentDidId: string;
  let granterDidId: string;
  let agentId: string;
  let delegationId: string;
  const devEmail = 'agent-dev@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Clean agent delegations
      const agents = await prisma.agentIdentity.findMany({ where: { userId: existing.id } });
      for (const agent of agents) {
        await prisma.agentDelegation.deleteMany({ where: { agentId: agent.id } });
      }
      await prisma.agentIdentity.deleteMany({ where: { userId: existing.id } });
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-agents';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);

    const user = await prisma.user.create({
      data: { email: devEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    devUserId = user.id;

    const loginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: devEmail, password: TEST_PASSWORD },
    });
    devToken = loginRes.json().access_token;

    // Create a DID for the agent
    const didRes1 = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    agentDidId = didRes1.json().id;

    // Create a DID for the granter (human)
    const didRes2 = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    granterDidId = didRes2.json().id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/agents', () => {
    it('should register an AI agent with DID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: agentDidId,
          name: 'Research Assistant',
          description: 'AI agent for document research and summarization',
          capabilities: ['credential.read', 'credential.verify', 'presentation.create'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.name).toBe('Research Assistant');
      expect(body.status).toBe('ACTIVE');
      expect(body.capabilities).toContain('credential.read');
      agentId = body.id;
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/v1/agents',
        payload: { didId: agentDidId, name: 'test', capabilities: [] },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/agents', () => {
    it('should list user agents', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('agents');
      expect(body.agents.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/agents/:id', () => {
    it('should return agent details with delegations', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/agents/${agentId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.name).toBe('Research Assistant');
      expect(body).toHaveProperty('delegations');
    });
  });

  describe('POST /api/v1/agents/:id/delegate', () => {
    it('should create delegation credential', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId,
          permissions: ['credential.read', 'credential.verify'],
          expiresInHours: 24,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('ACTIVE');
      expect(body.delegatedPermissions).toContain('credential.read');
      expect(body).toHaveProperty('proofOfAuthorization');
      delegationId = body.id;
    });
  });

  describe('POST /api/v1/agents/:id/verify', () => {
    it('should verify proof-of-human-authorization', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { delegationId },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('valid', true);
      expect(body).toHaveProperty('agent');
      expect(body).toHaveProperty('granter');
      expect(body).toHaveProperty('permissions');
    });
  });

  describe('DELETE /api/v1/agents/:id/delegations/:delegationId', () => {
    it('should revoke delegation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/agents/${agentId}/delegations/${delegationId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/revoked/i);
    });
  });

  describe('PATCH /api/v1/agents/:id', () => {
    it('should suspend an agent', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/agents/${agentId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'SUSPENDED' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('SUSPENDED');
    });
  });
});
