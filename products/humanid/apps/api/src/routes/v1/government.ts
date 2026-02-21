/**
 * Government Partnership Routes - /api/v1/government
 *
 * Partnership applications, credential scheme registration for
 * government ID programs, and bulk issuance support.
 *
 * Data is persisted in PostgreSQL via Prisma (RISK-001 remediation).
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { buildRequireAdmin } from '../../utils/middleware.js';

const applySchema = z.object({
  governmentEntity: z.string().min(1),
  country: z.string().min(2).max(3),
  contactName: z.string().min(1),
  contactEmail: z.string().email(),
  programDescription: z.string().min(1),
  estimatedVolume: z.number().int().min(1).optional(),
});

const schemeSchema = z.object({
  name: z.string().min(1),
  country: z.string().min(2).max(3),
  credentialType: z.string().min(1),
  schema: z.record(z.unknown()),
  requiredAttributes: z.array(z.string()),
});

const governmentRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = buildRequireAdmin(fastify);

  // POST /api/v1/government/partnerships/apply
  fastify.post('/partnerships/apply', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = applySchema.parse(request.body);

      const partnership = await fastify.prisma.governmentPartnership.create({
        data: {
          governmentEntity: body.governmentEntity,
          country: body.country,
          contactName: body.contactName,
          contactEmail: body.contactEmail,
          programDescription: body.programDescription,
          estimatedVolume: body.estimatedVolume,
          appliedBy: request.currentUser!.id,
        },
      });

      return reply.code(201).send(partnership);
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/government/partnerships
  fastify.get('/partnerships', async (request, reply) => {
    try {
      await requireAdmin(request);

      const partnerships = await fastify.prisma.governmentPartnership.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        partnerships,
        total: partnerships.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // POST /api/v1/government/credential-schemes
  fastify.post('/credential-schemes', async (request, reply) => {
    try {
      await requireAdmin(request);
      const body = schemeSchema.parse(request.body);

      const scheme = await fastify.prisma.governmentCredentialScheme.create({
        data: {
          name: body.name,
          country: body.country,
          credentialType: body.credentialType,
          schema: body.schema as unknown as import('@prisma/client').Prisma.InputJsonValue,
          requiredAttributes: body.requiredAttributes,
          createdBy: request.currentUser!.id,
        },
      });

      return reply.code(201).send(scheme);
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/government/credential-schemes
  fastify.get('/credential-schemes', async (request, reply) => {
    try {
      await requireAdmin(request);

      const schemes = await fastify.prisma.governmentCredentialScheme.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        schemes,
        total: schemes.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default governmentRoutes;
