/**
 * Cross-Chain Anchoring Routes - /api/v1/anchoring
 *
 * Multi-chain identity anchoring: Polygon, Ethereum, Solana, Arbitrum.
 * Submit anchors, verify on-chain, and check chain health.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const SUPPORTED_CHAINS = ['POLYGON', 'ETHEREUM', 'SOLANA', 'ARBITRUM'] as const;

const submitSchema = z.object({
  entityType: z.enum(['DID', 'CREDENTIAL', 'REVOCATION']),
  entityId: z.string().min(1),
  chain: z.enum(SUPPORTED_CHAINS),
  dataHash: z.string().length(64, 'dataHash must be 64 hex characters'),
});

const anchoringRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/anchoring/submit - Submit anchor
  fastify.post('/submit', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = submitSchema.parse(request.body);
      const userId = request.currentUser!.id;

      // BOLA (RISK-001): verify the entity being anchored belongs to the authenticated user
      if (body.entityType === 'DID') {
        const did = await fastify.prisma.dID.findFirst({ where: { id: body.entityId, userId } });
        if (!did) {
          throw new AppError(403, 'forbidden', 'DID does not belong to authenticated user');
        }
      } else if (body.entityType === 'CREDENTIAL' || body.entityType === 'REVOCATION') {
        const userDids = await fastify.prisma.dID.findMany({ where: { userId }, select: { id: true } });
        const didIds = userDids.map(d => d.id);
        const credential = await fastify.prisma.credential.findFirst({
          where: {
            id: body.entityId,
            OR: [{ holderDidId: { in: didIds } }, { issuerDidId: { in: didIds } }],
          },
        });
        if (!credential) {
          throw new AppError(403, 'forbidden', 'Credential does not belong to authenticated user');
        }
      }

      const anchor = await fastify.prisma.blockchainAnchor.create({
        data: {
          entityType: body.entityType,
          entityId: body.entityId,
          chain: body.chain,
          dataHash: body.dataHash,
          status: 'PENDING',
        },
      });

      return reply.code(201).send({
        id: anchor.id,
        entityType: anchor.entityType,
        entityId: anchor.entityId,
        chain: anchor.chain,
        dataHash: anchor.dataHash,
        status: anchor.status,
        createdAt: anchor.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/anchoring - List anchors (scoped to user's entities)
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const query = request.query as { chain?: string; status?: string; entityType?: string; page?: string; limit?: string };

      // Get user's DID IDs to scope anchors to owned entities
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map(d => d.id);

      // Get user's credential IDs (as holder or issuer)
      const userCredentials = await fastify.prisma.credential.findMany({
        where: {
          OR: [
            { holderDidId: { in: didIds } },
            { issuerDidId: { in: didIds } },
          ],
        },
        select: { id: true },
      });
      const credentialIds = userCredentials.map(c => c.id);

      // Scope anchors to user's DIDs and credentials
      const entityIds = [...didIds, ...credentialIds];

      const where: Record<string, unknown> = { entityId: { in: entityIds } };
      if (query.chain) where.chain = query.chain;
      if (query.status) where.status = query.status;
      if (query.entityType) where.entityType = query.entityType;

      const page = Math.max(1, parseInt(query.page || '1') || 1);
      const limit = Math.max(1, Math.min(parseInt(query.limit || '50') || 50, 100));
      const skip = (page - 1) * limit;

      const [anchors, total] = await Promise.all([
        fastify.prisma.blockchainAnchor.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        fastify.prisma.blockchainAnchor.count({ where }),
      ]);

      return reply.send({
        anchors: anchors.map(a => ({
          id: a.id,
          entityType: a.entityType,
          entityId: a.entityId,
          chain: a.chain,
          dataHash: a.dataHash,
          transactionHash: a.transactionHash,
          blockNumber: a.blockNumber,
          status: a.status,
          anchoredAt: a.anchoredAt?.toISOString() || null,
          createdAt: a.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // GET /api/v1/anchoring/:id/verify - Verify anchor
  fastify.get('/:id/verify', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };

      const anchor = await fastify.prisma.blockchainAnchor.findUnique({ where: { id } });
      if (!anchor) throw new AppError(404, 'not-found', 'Anchor not found');

      return reply.send({
        anchored: anchor.status === 'CONFIRMED',
        chain: anchor.chain,
        dataHash: anchor.dataHash,
        transactionHash: anchor.transactionHash,
        blockNumber: anchor.blockNumber,
        status: anchor.status,
        anchoredAt: anchor.anchoredAt?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // GET /api/v1/anchoring/chains - Chain health status
  fastify.get('/chains', async (_request, reply) => {
    const chainStats = await Promise.all(
      SUPPORTED_CHAINS.map(async (chain) => {
        const count = await fastify.prisma.blockchainAnchor.count({ where: { chain } });
        const confirmed = await fastify.prisma.blockchainAnchor.count({ where: { chain, status: 'CONFIRMED' } });
        return {
          name: chain,
          status: 'available',
          totalAnchors: count,
          confirmedAnchors: confirmed,
        };
      })
    );

    return reply.send({ chains: chainStats });
  });
};

export default anchoringRoutes;
