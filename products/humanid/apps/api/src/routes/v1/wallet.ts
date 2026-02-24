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
  // GET /api/v1/wallet/sharing - List credential sharing history (presentations)
  fastify.get('/sharing', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page || '1'));
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      // Get user's DID IDs
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);

      const where = { holderDidId: { in: didIds } };
      const [presentations, total] = await Promise.all([
        fastify.prisma.credentialPresentation.findMany({
          where,
          orderBy: { presentedAt: 'desc' },
          skip,
          take: limit,
          include: {
            credential: { select: { credentialType: true } },
            verifierDid: { select: { did: true } },
          },
        }),
        fastify.prisma.credentialPresentation.count({ where }),
      ]);

      return reply.send({
        sessions: presentations.map((p) => ({
          id: p.id,
          verifierName: p.verifierDid?.did ?? 'Unknown Verifier',
          verifierDomain: p.verifierDid?.did?.split(':').pop() ?? '',
          credentialTypes: [p.credential.credentialType],
          claimsDisclosed: Array.isArray(p.disclosedAttributes) ? p.disclosedAttributes : Object.keys(p.disclosedAttributes as object),
          sharedAt: p.presentedAt.toISOString(),
          expiresAt: null,
          status: p.status.toLowerCase(),
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

  // DELETE /api/v1/wallet/sharing/:id - Revoke a presentation
  fastify.delete('/sharing/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };

      // Get user's DID IDs
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);

      const presentation = await fastify.prisma.credentialPresentation.findFirst({
        where: { id, holderDidId: { in: didIds } },
      });

      if (!presentation) {
        throw new AppError(404, 'not-found', 'Presentation not found');
      }

      const updated = await fastify.prisma.credentialPresentation.update({
        where: { id },
        data: { status: 'REVOKED', revokedAt: new Date() },
      });

      logger.info('Presentation revoked', { presentationId: id, userId });

      return reply.send({
        id: updated.id,
        status: updated.status,
        revokedAt: updated.revokedAt?.toISOString(),
        message: 'Sharing session revoked',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
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
