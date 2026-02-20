/**
 * Issuer Routes - /api/v1/issuers
 *
 * CRUD for issuer profiles. An issuer is an organization that
 * issues verifiable credentials, linked to a DID.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const createIssuerSchema = z.object({
  didId: z.string().uuid('Invalid DID ID'),
  organizationName: z.string().min(1).max(200),
  legalEntityId: z.string().max(100).optional(),
});

const updateIssuerSchema = z.object({
  organizationName: z.string().min(1).max(200).optional(),
  legalEntityId: z.string().max(100).optional(),
});

const issuerRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/issuers - Register issuer profile
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = createIssuerSchema.parse(request.body);
      const userId = request.currentUser!.id;

      // Verify the DID belongs to the user
      const did = await fastify.prisma.dID.findFirst({
        where: { id: body.didId, userId },
      });

      if (!did) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      // Check for existing issuer with this DID
      const existing = await fastify.prisma.issuer.findUnique({
        where: { didId: body.didId },
      });

      if (existing) {
        throw new AppError(409, 'conflict', 'Issuer profile already exists for this DID');
      }

      const issuer = await fastify.prisma.issuer.create({
        data: {
          userId,
          didId: body.didId,
          organizationName: body.organizationName,
          legalEntityId: body.legalEntityId || null,
          trustStatus: 'PENDING',
        },
      });

      logger.info('Issuer profile created', { issuerId: issuer.id, userId });

      return reply.code(201).send({
        id: issuer.id,
        organizationName: issuer.organizationName,
        legalEntityId: issuer.legalEntityId,
        trustStatus: issuer.trustStatus,
        createdAt: issuer.createdAt.toISOString(),
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

  // GET /api/v1/issuers/me - Get own issuer profile
  fastify.get('/me', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const issuer = await fastify.prisma.issuer.findFirst({
        where: { userId: request.currentUser!.id },
        include: {
          did: { select: { did: true, status: true } },
        },
      });

      if (!issuer) {
        throw new AppError(404, 'not-found', 'No issuer profile found');
      }

      return reply.send({
        id: issuer.id,
        organizationName: issuer.organizationName,
        legalEntityId: issuer.legalEntityId,
        trustStatus: issuer.trustStatus,
        did: issuer.did.did,
        didStatus: issuer.did.status,
        verifiedAt: issuer.verifiedAt?.toISOString() || null,
        createdAt: issuer.createdAt.toISOString(),
        updatedAt: issuer.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // PATCH /api/v1/issuers/me - Update own issuer profile
  fastify.patch('/me', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = updateIssuerSchema.parse(request.body);

      const issuer = await fastify.prisma.issuer.findFirst({
        where: { userId: request.currentUser!.id },
      });

      if (!issuer) {
        throw new AppError(404, 'not-found', 'No issuer profile found');
      }

      const updated = await fastify.prisma.issuer.update({
        where: { id: issuer.id },
        data: {
          ...(body.organizationName && { organizationName: body.organizationName }),
          ...(body.legalEntityId !== undefined && { legalEntityId: body.legalEntityId }),
        },
      });

      logger.info('Issuer profile updated', { issuerId: issuer.id });

      return reply.send({
        id: updated.id,
        organizationName: updated.organizationName,
        legalEntityId: updated.legalEntityId,
        trustStatus: updated.trustStatus,
        updatedAt: updated.updatedAt.toISOString(),
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
};

export default issuerRoutes;
