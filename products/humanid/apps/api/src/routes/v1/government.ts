/**
 * Government Partnership Routes - /api/v1/government
 *
 * Partnership applications, credential scheme registration for
 * government ID programs, and bulk issuance support.
 * Uses in-memory storage for partnership/scheme data (no dedicated DB tables).
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AppError } from '../../types/index.js';

// In-memory stores (would be DB tables in production)
const partnerships: Array<Record<string, unknown>> = [];
const credentialSchemes: Array<Record<string, unknown>> = [];

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
  async function requireAdmin(request: Parameters<typeof fastify.authenticate>[0]) {
    await fastify.authenticate(request);
    if (request.currentUser!.role !== 'ADMIN') {
      throw new AppError(403, 'forbidden', 'Admin access required');
    }
  }

  // POST /api/v1/government/partnerships/apply
  fastify.post('/partnerships/apply', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = applySchema.parse(request.body);

      const partnership = {
        id: randomUUID(),
        ...body,
        status: 'PENDING',
        appliedBy: request.currentUser!.id,
        createdAt: new Date().toISOString(),
      };
      partnerships.push(partnership);

      return reply.code(201).send(partnership);
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // GET /api/v1/government/partnerships
  fastify.get('/partnerships', async (request, reply) => {
    try {
      await requireAdmin(request);

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

      const scheme = {
        id: randomUUID(),
        ...body,
        status: 'ACTIVE',
        createdAt: new Date().toISOString(),
      };
      credentialSchemes.push(scheme);

      return reply.code(201).send(scheme);
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // GET /api/v1/government/credential-schemes
  fastify.get('/credential-schemes', async (request, reply) => {
    try {
      await requireAdmin(request);

      return reply.send({
        schemes: credentialSchemes,
        total: credentialSchemes.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default governmentRoutes;
