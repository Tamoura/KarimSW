/**
 * Multi-Region Routes - /api/v1/regions
 *
 * Region registry, health checks, and data residency configuration.
 * Supports EU (Frankfurt), US (Virginia), APAC (Singapore).
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const createRegionSchema = z.object({
  code: z.enum(['EU_FRANKFURT', 'US_VIRGINIA', 'APAC_SINGAPORE']),
  name: z.string().min(1),
  endpoint: z.string().url(),
});

const updateRegionSchema = z.object({
  healthStatus: z.string().optional(),
  dataResidencyEnabled: z.boolean().optional(),
  latencyMs: z.number().int().min(0).optional(),
});

const regionRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/regions - Register region (admin only)
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      if (request.currentUser!.role !== 'ADMIN') {
        throw new AppError(403, 'forbidden', 'Admin access required');
      }

      const body = createRegionSchema.parse(request.body);

      const region = await fastify.prisma.region.create({
        data: {
          code: body.code,
          name: body.name,
          endpoint: body.endpoint,
        },
      });

      return reply.code(201).send({
        id: region.id,
        code: region.code,
        name: region.name,
        endpoint: region.endpoint,
        healthStatus: region.healthStatus,
        dataResidencyEnabled: region.dataResidencyEnabled,
        createdAt: region.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // GET /api/v1/regions - List all regions (public)
  fastify.get('/', async (_request, reply) => {
    const regions = await fastify.prisma.region.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      regions: regions.map(r => ({
        code: r.code,
        name: r.name,
        endpoint: r.endpoint,
        healthStatus: r.healthStatus,
        dataResidencyEnabled: r.dataResidencyEnabled,
        latencyMs: r.latencyMs,
        lastHealthCheck: r.lastHealthCheck?.toISOString() || null,
      })),
    });
  });

  // GET /api/v1/regions/:code/health - Region health check
  fastify.get('/:code/health', async (request, reply) => {
    const { code } = request.params as { code: string };

    const region = await fastify.prisma.region.findFirst({
      where: { code: code as 'EU_FRANKFURT' | 'US_VIRGINIA' | 'APAC_SINGAPORE' },
    });

    if (!region) {
      throw new AppError(404, 'not-found', 'Region not found');
    }

    return reply.send({
      code: region.code,
      name: region.name,
      endpoint: region.endpoint,
      healthStatus: region.healthStatus,
      latencyMs: region.latencyMs,
      lastHealthCheck: region.lastHealthCheck?.toISOString() || null,
    });
  });

  // PATCH /api/v1/regions/:code - Update region config (admin only)
  fastify.patch('/:code', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      if (request.currentUser!.role !== 'ADMIN') {
        throw new AppError(403, 'forbidden', 'Admin access required');
      }

      const { code } = request.params as { code: string };
      const body = updateRegionSchema.parse(request.body);

      const region = await fastify.prisma.region.findFirst({
        where: { code: code as 'EU_FRANKFURT' | 'US_VIRGINIA' | 'APAC_SINGAPORE' },
      });

      if (!region) {
        throw new AppError(404, 'not-found', 'Region not found');
      }

      const data: Record<string, unknown> = {};
      if (body.healthStatus !== undefined) {
        data.healthStatus = body.healthStatus;
        data.lastHealthCheck = new Date();
      }
      if (body.dataResidencyEnabled !== undefined) data.dataResidencyEnabled = body.dataResidencyEnabled;
      if (body.latencyMs !== undefined) data.latencyMs = body.latencyMs;

      const updated = await fastify.prisma.region.update({
        where: { id: region.id },
        data,
      });

      return reply.send({
        code: updated.code,
        name: updated.name,
        endpoint: updated.endpoint,
        healthStatus: updated.healthStatus,
        dataResidencyEnabled: updated.dataResidencyEnabled,
        latencyMs: updated.latencyMs,
        lastHealthCheck: updated.lastHealthCheck?.toISOString() || null,
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

export default regionRoutes;
