/**
 * Identity Federation Bridge Routes - /api/v1/federation
 *
 * Bidirectional SAML/OIDC to DID/VC bridge.
 * Links external IdP identities to decentralized identifiers.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const createLinkSchema = z.object({
  didId: z.string().uuid(),
  protocol: z.enum(['SAML', 'OIDC', 'DID_VC']),
  externalIssuer: z.string().min(1),
  externalSubject: z.string().min(1),
  direction: z.enum(['IMPORT', 'EXPORT', 'BIDIRECTIONAL']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const resolveSchema = z.object({
  protocol: z.enum(['SAML', 'OIDC', 'DID_VC']),
  externalIssuer: z.string().min(1),
  externalSubject: z.string().min(1),
});

const federationRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/federation/links - Create federation link
  fastify.post('/links', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const body = createLinkSchema.parse(request.body);

      // Verify DID belongs to user
      const did = await fastify.prisma.dID.findFirst({ where: { id: body.didId, userId } });
      if (!did) throw new AppError(400, 'bad-request', 'DID not found or not owned by you');

      const link = await fastify.prisma.federationLink.create({
        data: {
          userId,
          didId: body.didId,
          protocol: body.protocol,
          direction: body.direction || 'BIDIRECTIONAL',
          externalIssuer: body.externalIssuer,
          externalSubject: body.externalSubject,
          metadata: body.metadata,
        },
      });

      return reply.code(201).send({
        id: link.id,
        didId: link.didId,
        protocol: link.protocol,
        direction: link.direction,
        externalIssuer: link.externalIssuer,
        externalSubject: link.externalSubject,
        isActive: link.isActive,
        createdAt: link.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/federation/links - List links
  fastify.get('/links', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const links = await fastify.prisma.federationLink.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        links: links.map(l => ({
          id: l.id,
          didId: l.didId,
          protocol: l.protocol,
          direction: l.direction,
          externalIssuer: l.externalIssuer,
          externalSubject: l.externalSubject,
          isActive: l.isActive,
          lastSyncedAt: l.lastSyncedAt?.toISOString() || null,
          createdAt: l.createdAt.toISOString(),
        })),
        total: links.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // POST /api/v1/federation/resolve - Resolve federated identity
  fastify.post('/resolve', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = resolveSchema.parse(request.body);

      const link = await fastify.prisma.federationLink.findFirst({
        where: {
          protocol: body.protocol,
          externalIssuer: body.externalIssuer,
          externalSubject: body.externalSubject,
          isActive: true,
        },
      });

      if (!link) {
        return reply.send({ found: false, didId: null, userId: null });
      }

      return reply.send({
        found: true,
        didId: link.didId,
        userId: link.userId,
        protocol: link.protocol,
        direction: link.direction,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // DELETE /api/v1/federation/links/:id - Remove link
  fastify.delete('/links/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const { id } = request.params as { id: string };

      const link = await fastify.prisma.federationLink.findFirst({ where: { id, userId } });
      if (!link) throw new AppError(404, 'not-found', 'Federation link not found');

      await fastify.prisma.federationLink.delete({ where: { id } });

      return reply.send({ message: 'Federation link removed' });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default federationRoutes;
