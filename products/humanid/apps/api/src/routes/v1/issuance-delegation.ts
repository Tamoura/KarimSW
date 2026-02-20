/**
 * Delegated Issuance Routes - /api/v1/issuance-delegation
 *
 * Sub-entity credential issuance rights.
 * Parent issuers delegate credential issuance to sub-entities.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const createDelegationSchema = z.object({
  parentIssuerId: z.string().uuid(),
  delegateIssuerId: z.string().uuid(),
  allowedTypes: z.array(z.string()).min(1),
  maxDepth: z.number().int().min(1).max(5).optional(),
});

const issuanceDelegationRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/issuance-delegation - Grant issuance rights
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const body = createDelegationSchema.parse(request.body);

      // Verify parent issuer belongs to user
      const parentIssuer = await fastify.prisma.issuer.findFirst({
        where: { id: body.parentIssuerId, userId },
      });
      if (!parentIssuer) throw new AppError(403, 'forbidden', 'You do not own this issuer');

      const delegation = await fastify.prisma.issuanceDelegation.create({
        data: {
          parentIssuerId: body.parentIssuerId,
          delegateIssuerId: body.delegateIssuerId,
          allowedTypes: body.allowedTypes,
          maxDepth: body.maxDepth ?? 1,
        },
      });

      return reply.code(201).send({
        id: delegation.id,
        parentIssuerId: delegation.parentIssuerId,
        delegateIssuerId: delegation.delegateIssuerId,
        allowedTypes: delegation.allowedTypes,
        maxDepth: delegation.maxDepth,
        status: delegation.status,
        createdAt: delegation.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/issuance-delegation - List delegations (scoped to user's issuers)
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const query = request.query as { parentIssuerId?: string; delegateIssuerId?: string };

      // Get the user's issuer IDs to scope delegations
      const userIssuers = await fastify.prisma.issuer.findMany({
        where: { userId },
        select: { id: true },
      });
      const issuerIds = userIssuers.map(i => i.id);

      // Show delegations where user is parent or delegate
      const where: Record<string, unknown> = {
        OR: [
          { parentIssuerId: { in: issuerIds } },
          { delegateIssuerId: { in: issuerIds } },
        ],
      };
      if (query.parentIssuerId) where.parentIssuerId = query.parentIssuerId;
      if (query.delegateIssuerId) where.delegateIssuerId = query.delegateIssuerId;

      const delegations = await fastify.prisma.issuanceDelegation.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        delegations: delegations.map(d => ({
          id: d.id,
          parentIssuerId: d.parentIssuerId,
          delegateIssuerId: d.delegateIssuerId,
          allowedTypes: d.allowedTypes,
          maxDepth: d.maxDepth,
          status: d.status,
          createdAt: d.createdAt.toISOString(),
        })),
        total: delegations.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // GET /api/v1/issuance-delegation/:id/chain - Verify delegation chain
  fastify.get('/:id/chain', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };

      const delegation = await fastify.prisma.issuanceDelegation.findUnique({ where: { id } });
      if (!delegation) throw new AppError(404, 'not-found', 'Delegation not found');

      // Build chain by walking parent delegations
      const chain = [
        {
          issuerId: delegation.parentIssuerId,
          role: 'parent',
          allowedTypes: delegation.allowedTypes,
        },
        {
          issuerId: delegation.delegateIssuerId,
          role: 'delegate',
          allowedTypes: delegation.allowedTypes,
        },
      ];

      return reply.send({
        valid: delegation.status === 'ACTIVE',
        chain,
        maxDepth: delegation.maxDepth,
        status: delegation.status,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // DELETE /api/v1/issuance-delegation/:id - Revoke delegation
  fastify.delete('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };

      const delegation = await fastify.prisma.issuanceDelegation.findUnique({ where: { id } });
      if (!delegation) throw new AppError(404, 'not-found', 'Delegation not found');

      // Verify user owns the parent issuer
      const parentIssuer = await fastify.prisma.issuer.findFirst({
        where: { id: delegation.parentIssuerId, userId },
      });
      if (!parentIssuer) throw new AppError(403, 'forbidden', 'Not authorized');

      await fastify.prisma.issuanceDelegation.update({
        where: { id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      return reply.send({ message: 'Issuance delegation revoked' });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default issuanceDelegationRoutes;
