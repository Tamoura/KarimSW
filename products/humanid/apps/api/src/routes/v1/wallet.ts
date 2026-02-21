/**
 * Wallet Routes - /api/v1/wallet
 *
 * Holder-facing endpoints for managing credentials in their wallet.
 * - List credentials held by the authenticated user
 * - Accept an offered credential
 */

import { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const walletRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/wallet/credentials - List holder's credentials
  fastify.get('/credentials', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const userId = request.currentUser!.id;
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      // Get user's DID IDs
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);

      const where = { holderDidId: { in: didIds } };
      const [credentials, total] = await Promise.all([
        fastify.prisma.credential.findMany({
          where,
          orderBy: { issuedAt: 'desc' },
          skip,
          take: limit,
          include: {
            issuerDid: { select: { did: true } },
          },
        }),
        fastify.prisma.credential.count({ where }),
      ]);

      return reply.send({
        credentials: credentials.map((c) => ({
          id: c.id,
          credentialType: c.credentialType,
          status: c.status,
          issuerDid: c.issuerDid.did,
          issuedAt: c.issuedAt.toISOString(),
          expiresAt: c.expiresAt?.toISOString() || null,
          acceptedAt: c.acceptedAt?.toISOString() || null,
        })),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/wallet/credentials/:id/accept - Accept an offered credential
  fastify.post('/credentials/:id/accept', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      // Get user's DID IDs
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);

      const credential = await fastify.prisma.credential.findFirst({
        where: { id, holderDidId: { in: didIds } },
      });

      if (!credential) {
        // Check if it exists at all (could be issuer trying to accept)
        const exists = await fastify.prisma.credential.findUnique({ where: { id } });
        if (exists) {
          throw new AppError(403, 'forbidden', 'Only the holder can accept a credential');
        }
        throw new AppError(404, 'not-found', 'Credential not found');
      }

      if (credential.status !== 'OFFERED') {
        throw new AppError(400, 'bad-request', `Cannot accept a credential with status: ${credential.status}`);
      }

      const updated = await fastify.prisma.credential.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          acceptedAt: new Date(),
        },
      });

      logger.info('Credential accepted', { credentialId: id, userId });

      return reply.send({
        id: updated.id,
        status: updated.status,
        acceptedAt: updated.acceptedAt?.toISOString(),
        message: 'Credential accepted into wallet',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default walletRoutes;
