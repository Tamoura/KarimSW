/**
 * Verification Routes - /api/v1/verify
 *
 * Endpoints for creating and managing verification requests.
 * A verifier creates a request specifying which attributes they need
 * from a holder's credentials.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

// ==================== Zod Schemas ====================

const createRequestSchema = z.object({
  holderDid: z.string().min(1, 'Holder DID is required'),
  requestedAttributes: z.array(z.string()).min(1, 'At least one attribute is required'),
  expiresInHours: z.number().min(1).max(720).optional().default(24),
});

// ==================== Routes ====================

const verifyRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/verify/requests - Create a verification request
  fastify.post('/requests', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = createRequestSchema.parse(request.body);

      const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);

      const verificationRequest = await fastify.prisma.verificationRequest.create({
        data: {
          verifierId: request.currentUser!.id,
          holderDid: body.holderDid,
          requestedAttributes: body.requestedAttributes,
          status: 'CREATED',
          expiresAt,
        },
      });

      logger.info('Verification request created', {
        requestId: verificationRequest.id,
        verifierId: request.currentUser!.id,
        holderDid: body.holderDid,
      });

      return reply.code(201).send({
        id: verificationRequest.id,
        holderDid: verificationRequest.holderDid,
        requestedAttributes: verificationRequest.requestedAttributes,
        status: verificationRequest.status,
        expiresAt: verificationRequest.expiresAt.toISOString(),
        createdAt: verificationRequest.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/v1/verify/requests - List verification requests
  fastify.get('/requests', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const requests = await fastify.prisma.verificationRequest.findMany({
        where: { verifierId: request.currentUser!.id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        requests: requests.map((r) => ({
          id: r.id,
          holderDid: r.holderDid,
          requestedAttributes: r.requestedAttributes,
          status: r.status,
          expiresAt: r.expiresAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
          respondedAt: r.respondedAt?.toISOString() || null,
        })),
        total: requests.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/verify/requests/:id - Get a specific verification request
  fastify.get('/requests/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };

      const verificationRequest = await fastify.prisma.verificationRequest.findFirst({
        where: { id, verifierId: request.currentUser!.id },
      });

      if (!verificationRequest) {
        throw new AppError(404, 'not-found', 'Verification request not found');
      }

      return reply.send({
        id: verificationRequest.id,
        holderDid: verificationRequest.holderDid,
        requestedAttributes: verificationRequest.requestedAttributes,
        status: verificationRequest.status,
        result: verificationRequest.result,
        failureReason: verificationRequest.failureReason,
        expiresAt: verificationRequest.expiresAt.toISOString(),
        createdAt: verificationRequest.createdAt.toISOString(),
        respondedAt: verificationRequest.respondedAt?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default verifyRoutes;
