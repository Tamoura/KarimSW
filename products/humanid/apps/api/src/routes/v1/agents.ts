/**
 * AI Agent Identity Routes - /api/v1/agents
 *
 * Agent registration with DID binding, delegation credentials,
 * proof-of-human-authorization verification, and capability scoping.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const registerAgentSchema = z.object({
  didId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  capabilities: z.array(z.string()).min(0),
  parentAgentId: z.string().uuid().optional(),
  maxDelegationDepth: z.number().int().min(1).max(10).optional(),
});

const delegateSchema = z.object({
  granterDidId: z.string().uuid(),
  permissions: z.array(z.string()).min(1),
  expiresInHours: z.number().int().min(1).max(8760), // max 1 year
});

const updateAgentSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REVOKED']),
});

const agentRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/agents - Register AI agent
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const body = registerAgentSchema.parse(request.body);

      // Verify DID belongs to user
      const did = await fastify.prisma.dID.findFirst({
        where: { id: body.didId, userId },
      });
      if (!did) {
        throw new AppError(400, 'bad-request', 'DID not found or does not belong to you');
      }

      const agent = await fastify.prisma.agentIdentity.create({
        data: {
          userId,
          didId: body.didId,
          name: body.name,
          description: body.description,
          capabilities: body.capabilities,
          parentAgentId: body.parentAgentId,
          maxDelegationDepth: body.maxDelegationDepth ?? 1,
        },
      });

      logger.info('Agent registered', { agentId: agent.id, userId });

      return reply.code(201).send({
        id: agent.id,
        didId: agent.didId,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities,
        status: agent.status,
        maxDelegationDepth: agent.maxDelegationDepth,
        createdAt: agent.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // GET /api/v1/agents - List user's agents
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const agents = await fastify.prisma.agentIdentity.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { delegations: true } } },
      });

      return reply.send({
        agents: agents.map(a => ({
          id: a.id,
          didId: a.didId,
          name: a.name,
          description: a.description,
          capabilities: a.capabilities,
          status: a.status,
          delegationCount: a._count.delegations,
          createdAt: a.createdAt.toISOString(),
        })),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // GET /api/v1/agents/:id - Get agent details
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };

      const agent = await fastify.prisma.agentIdentity.findFirst({
        where: { id, userId },
        include: {
          delegations: {
            orderBy: { createdAt: 'desc' },
            take: 20,
          },
        },
      });

      if (!agent) throw new AppError(404, 'not-found', 'Agent not found');

      return reply.send({
        id: agent.id,
        didId: agent.didId,
        name: agent.name,
        description: agent.description,
        capabilities: agent.capabilities,
        status: agent.status,
        maxDelegationDepth: agent.maxDelegationDepth,
        parentAgentId: agent.parentAgentId,
        delegations: agent.delegations.map(d => ({
          id: d.id,
          status: d.status,
          delegatedPermissions: d.delegatedPermissions,
          expiresAt: d.expiresAt.toISOString(),
          createdAt: d.createdAt.toISOString(),
        })),
        createdAt: agent.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // POST /api/v1/agents/:id/delegate - Create delegation credential
  fastify.post('/:id/delegate', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };
      const body = delegateSchema.parse(request.body);

      const agent = await fastify.prisma.agentIdentity.findFirst({
        where: { id, userId },
      });
      if (!agent) throw new AppError(404, 'not-found', 'Agent not found');
      if (agent.status !== 'ACTIVE') throw new AppError(400, 'bad-request', 'Agent is not active');

      // Verify granter DID belongs to user
      const granterDid = await fastify.prisma.dID.findFirst({
        where: { id: body.granterDidId, userId },
      });
      if (!granterDid) throw new AppError(400, 'bad-request', 'Granter DID not found');

      const expiresAt = new Date(Date.now() + body.expiresInHours * 3600 * 1000);

      // Generate proof-of-human-authorization
      const nonce = randomBytes(16).toString('hex');
      const proofPayload = {
        type: 'ProofOfHumanAuthorization',
        agentDid: agent.didId,
        granterDid: granterDid.did,
        permissions: body.permissions,
        issuedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        nonce,
      };
      const proofHash = createHash('sha256').update(JSON.stringify(proofPayload)).digest('hex');
      const proof = { ...proofPayload, proofHash };

      const delegation = await fastify.prisma.agentDelegation.create({
        data: {
          agentId: agent.id,
          granterUserId: userId,
          granterDidId: body.granterDidId,
          delegatedPermissions: body.permissions,
          proofOfAuthorization: proof,
          expiresAt,
        },
      });

      logger.info('Agent delegation created', { delegationId: delegation.id, agentId: agent.id });

      return reply.code(201).send({
        id: delegation.id,
        agentId: delegation.agentId,
        status: delegation.status,
        delegatedPermissions: delegation.delegatedPermissions,
        proofOfAuthorization: delegation.proofOfAuthorization,
        expiresAt: delegation.expiresAt.toISOString(),
        createdAt: delegation.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // POST /api/v1/agents/:id/verify - Verify proof-of-human-authorization
  fastify.post('/:id/verify', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const { delegationId } = request.body as { delegationId: string };

      if (!delegationId) throw new AppError(400, 'bad-request', 'delegationId required');

      const delegation = await fastify.prisma.agentDelegation.findFirst({
        where: { id: delegationId, agentId: id },
        include: {
          agent: { include: { did: true } },
          granter: true,
        },
      });

      if (!delegation) throw new AppError(404, 'not-found', 'Delegation not found');

      const isExpired = delegation.expiresAt < new Date();
      const isActive = delegation.status === 'ACTIVE';
      const valid = isActive && !isExpired;

      return reply.send({
        valid,
        agent: {
          id: delegation.agent.id,
          name: delegation.agent.name,
          did: delegation.agent.did.did,
        },
        granter: {
          id: delegation.granter.id,
          email: delegation.granter.email,
        },
        permissions: delegation.delegatedPermissions,
        expiresAt: delegation.expiresAt.toISOString(),
        status: delegation.status,
        ...(isExpired && { reason: 'Delegation has expired' }),
        ...(!isActive && { reason: 'Delegation is not active' }),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // DELETE /api/v1/agents/:id/delegations/:delegationId - Revoke delegation
  fastify.delete('/:id/delegations/:delegationId', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id, delegationId } = request.params as { id: string; delegationId: string };

      const agent = await fastify.prisma.agentIdentity.findFirst({
        where: { id, userId },
      });
      if (!agent) throw new AppError(404, 'not-found', 'Agent not found');

      const delegation = await fastify.prisma.agentDelegation.findFirst({
        where: { id: delegationId, agentId: id },
      });
      if (!delegation) throw new AppError(404, 'not-found', 'Delegation not found');

      await fastify.prisma.agentDelegation.update({
        where: { id: delegationId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      return reply.send({ message: 'Delegation revoked' });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // PATCH /api/v1/agents/:id - Update agent status
  fastify.patch('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };
      const body = updateAgentSchema.parse(request.body);

      const agent = await fastify.prisma.agentIdentity.findFirst({
        where: { id, userId },
      });
      if (!agent) throw new AppError(404, 'not-found', 'Agent not found');

      const updated = await fastify.prisma.agentIdentity.update({
        where: { id },
        data: { status: body.status },
      });

      // If suspending/revoking, also revoke all active delegations
      if (body.status !== 'ACTIVE') {
        await fastify.prisma.agentDelegation.updateMany({
          where: { agentId: id, status: 'ACTIVE' },
          data: { status: 'REVOKED', revokedAt: new Date() },
        });
      }

      return reply.send({
        id: updated.id,
        name: updated.name,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });
};

export default agentRoutes;
