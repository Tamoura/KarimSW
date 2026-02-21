/**
 * AI Agent Identity Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/agents endpoints:
 * - POST / with DID not owned by user (400)
 * - POST / with Zod validation error (400)
 * - GET /:id with non-existent agent (404)
 * - POST /:id/delegate with inactive agent (400)
 * - POST /:id/delegate with DID not owned (400)
 * - POST /:id/delegate with Zod error (400)
 * - POST /:id/verify with expired delegation
 * - POST /:id/verify with missing delegationId (400)
 * - POST /:id/verify with non-existent delegation (404)
 * - DELETE /:id/delegations/:delegationId not found (404)
 * - PATCH /:id to SUSPENDED cascades delegation revocation
 * - PATCH /:id with Zod error (400)
 * - PATCH /:id not found (404)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('AI Agent Extended - /api/v1/agents error branches', () => {
  let app: FastifyInstance;
  let devToken: string;
  let devUserId: string;
  let agentDidId: string;
  let granterDidId: string;
  let agentId: string;

  // Second user for ownership tests
  let otherToken: string;
  let otherUserId: string;
  let otherDidId: string;

  const devEmail = 'agents-ext-dev@example.com';
  const otherEmail = 'agents-ext-other@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
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
    process.env.JWT_SECRET = 'test-jwt-secret-for-agents-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(devEmail);
    await cleanupUser(otherEmail);

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

    // Create DIDs for dev user
    const didRes1 = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    agentDidId = didRes1.json().id;

    const didRes2 = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {},
    });
    granterDidId = didRes2.json().id;

    // Create another user for ownership tests
    const otherUser = await prisma.user.create({
      data: { email: otherEmail, passwordHash, role: 'DEVELOPER', emailVerified: true },
    });
    otherUserId = otherUser.id;
    const otherLoginRes = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: otherEmail, password: TEST_PASSWORD },
    });
    otherToken = otherLoginRes.json().access_token;

    const otherDidRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${otherToken}` },
      payload: {},
    });
    otherDidId = otherDidRes.json().id;

    // Create a base agent for delegation tests
    const agentRes = await app.inject({
      method: 'POST',
      url: '/api/v1/agents',
      headers: { authorization: `Bearer ${devToken}` },
      payload: {
        didId: agentDidId,
        name: 'Extended Test Agent',
        capabilities: ['credential.read'],
      },
    });
    agentId = agentRes.json().id;
  });

  afterAll(async () => {
    await cleanupUser(devEmail);
    await cleanupUser(otherEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST / error branches ====================

  describe('POST /api/v1/agents', () => {
    it('should return 400 when DID is not owned by user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: otherDidId, // DID belongs to other user
          name: 'Unauthorized Agent',
          capabilities: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('DID');
    });

    it('should return 400 for Zod error - missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: agentDidId,
          capabilities: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - invalid didId format', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: 'not-a-uuid',
          name: 'Test',
          capabilities: [],
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - name too long', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: agentDidId,
          name: 'x'.repeat(101),
          capabilities: [],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - missing capabilities', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: agentDidId,
          name: 'Test',
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== GET /:id error branches ====================

  describe('GET /api/v1/agents/:id', () => {
    it('should return 404 for non-existent agent', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/agents/${fakeId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 404 when accessing another user\'s agent', async () => {
      // otherToken tries to access dev's agent
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/agents/${agentId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== POST /:id/delegate error branches ====================

  describe('POST /api/v1/agents/:id/delegate', () => {
    it('should return 400 when granter DID not owned by user', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: otherDidId, // DID owned by other user
          permissions: ['credential.read'],
          expiresInHours: 24,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('Granter DID');
    });

    it('should return 400 for Zod error - missing permissions', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          expiresInHours: 24,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod error - empty permissions array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: [],
          expiresInHours: 24,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod error - expiresInHours too high', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.read'],
          expiresInHours: 9999,
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 404 for non-existent agent', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${fakeId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.read'],
          expiresInHours: 24,
        },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ==================== POST /:id/verify error branches ====================

  describe('POST /api/v1/agents/:id/verify', () => {
    it('should return 400 when delegationId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('delegationId');
    });

    it('should return 404 for non-existent delegation', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { delegationId: fakeId },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should report expired delegation as invalid', async () => {
      // Create a delegation then expire it
      const delegRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.read'],
          expiresInHours: 1,
        },
      });
      expect(delegRes.statusCode).toBe(201);
      const delegationId = delegRes.json().id;

      // Manually expire the delegation
      await prisma.agentDelegation.update({
        where: { id: delegationId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const verifyRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { delegationId },
      });
      expect(verifyRes.statusCode).toBe(200);
      const body = verifyRes.json();
      expect(body.valid).toBe(false);
      expect(body.reason).toContain('expired');
    });

    it('should report revoked delegation as invalid', async () => {
      // Create and then revoke a delegation
      const delegRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.verify'],
          expiresInHours: 24,
        },
      });
      expect(delegRes.statusCode).toBe(201);
      const delegationId = delegRes.json().id;

      // Revoke it
      await prisma.agentDelegation.update({
        where: { id: delegationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      const verifyRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/verify`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { delegationId },
      });
      expect(verifyRes.statusCode).toBe(200);
      const body = verifyRes.json();
      expect(body.valid).toBe(false);
      expect(body.reason).toContain('not active');
    });
  });

  // ==================== DELETE /:id/delegations/:delegationId error branches ====================

  describe('DELETE /api/v1/agents/:id/delegations/:delegationId', () => {
    it('should return 404 for non-existent agent', async () => {
      const fakeAgentId = randomUUID();
      const fakeDelegId = randomUUID();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/agents/${fakeAgentId}/delegations/${fakeDelegId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should return 404 for non-existent delegation', async () => {
      const fakeDelegId = randomUUID();
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/agents/${agentId}/delegations/${fakeDelegId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should successfully revoke a delegation', async () => {
      // Create a delegation first
      const delegRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${agentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.read'],
          expiresInHours: 24,
        },
      });
      const delegationId = delegRes.json().id;

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/agents/${agentId}/delegations/${delegationId}`,
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().message).toContain('revoked');
    });
  });

  // ==================== PATCH /:id error branches ====================

  describe('PATCH /api/v1/agents/:id', () => {
    it('should return 400 for Zod error - invalid status value', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/agents/${agentId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'INVALID_STATUS' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 404 for non-existent agent', async () => {
      const fakeId = randomUUID();
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/agents/${fakeId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'SUSPENDED' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should cascade revoke delegations when suspending agent', async () => {
      // Create a new agent with an active delegation
      const newAgentRes = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: granterDidId,
          name: 'Cascade Test Agent',
          capabilities: ['credential.read'],
        },
      });
      const newAgentId = newAgentRes.json().id;

      // Create delegation
      const delegRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${newAgentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.read'],
          expiresInHours: 48,
        },
      });
      expect(delegRes.statusCode).toBe(201);
      const delegationId = delegRes.json().id;

      // Suspend the agent
      const suspendRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/agents/${newAgentId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'SUSPENDED' },
      });
      expect(suspendRes.statusCode).toBe(200);
      expect(suspendRes.json().status).toBe('SUSPENDED');

      // Verify delegation was revoked
      const delegation = await prisma.agentDelegation.findUnique({ where: { id: delegationId } });
      expect(delegation?.status).toBe('REVOKED');
      expect(delegation?.revokedAt).toBeDefined();
    });

    it('should cascade revoke delegations when revoking agent', async () => {
      // Create a new agent with an active delegation
      const did3Res = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {},
      });
      const did3Id = did3Res.json().id;

      const newAgentRes = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: did3Id,
          name: 'Revoke Test Agent',
          capabilities: ['credential.verify'],
        },
      });
      const newAgentId = newAgentRes.json().id;

      // Create delegation
      const delegRes = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${newAgentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.verify'],
          expiresInHours: 48,
        },
      });
      const delegationId = delegRes.json().id;

      // Revoke the agent
      const revokeRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/agents/${newAgentId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'REVOKED' },
      });
      expect(revokeRes.statusCode).toBe(200);
      expect(revokeRes.json().status).toBe('REVOKED');

      // Verify delegation was revoked
      const delegation = await prisma.agentDelegation.findUnique({ where: { id: delegationId } });
      expect(delegation?.status).toBe('REVOKED');
    });
  });

  // ==================== POST /:id/delegate - inactive agent ====================

  describe('POST /api/v1/agents/:id/delegate - inactive agent', () => {
    it('should return 400 when agent is not active', async () => {
      // Create agent and suspend it
      const did4Res = await app.inject({
        method: 'POST', url: '/api/v1/dids',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {},
      });
      const did4Id = did4Res.json().id;

      const inactiveAgentRes = await app.inject({
        method: 'POST',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          didId: did4Id,
          name: 'Inactive Test Agent',
          capabilities: ['credential.read'],
        },
      });
      const inactiveAgentId = inactiveAgentRes.json().id;

      // Suspend it
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/agents/${inactiveAgentId}`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: { status: 'SUSPENDED' },
      });

      // Try to delegate to inactive agent
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/agents/${inactiveAgentId}/delegate`,
        headers: { authorization: `Bearer ${devToken}` },
        payload: {
          granterDidId: granterDidId,
          permissions: ['credential.read'],
          expiresInHours: 24,
        },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('not active');
    });
  });

  // ==================== GET / ====================

  describe('GET /api/v1/agents', () => {
    it('should list agents with delegation counts', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${devToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('agents');
      expect(body.agents.length).toBeGreaterThan(0);
      for (const agent of body.agents) {
        expect(agent).toHaveProperty('delegationCount');
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('status');
      }
    });

    it('should return empty agents for user with no agents', async () => {
      // Create a fresh user with no agents
      const freshEmail = 'agents-ext-fresh@example.com';
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      const existing = await prisma.user.findUnique({ where: { email: freshEmail } });
      if (existing) {
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        await prisma.user.delete({ where: { email: freshEmail } });
      }
      await prisma.user.create({
        data: { email: freshEmail, passwordHash, role: 'HOLDER', emailVerified: true },
      });
      const loginRes = await app.inject({
        method: 'POST', url: '/api/v1/auth/login',
        payload: { email: freshEmail, password: TEST_PASSWORD },
      });
      const freshToken = loginRes.json().access_token;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/agents',
        headers: { authorization: `Bearer ${freshToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().agents).toHaveLength(0);

      // Cleanup
      const freshUser = await prisma.user.findUnique({ where: { email: freshEmail } });
      if (freshUser) {
        await prisma.session.deleteMany({ where: { userId: freshUser.id } });
        await prisma.user.delete({ where: { email: freshEmail } });
      }
    });
  });
});
