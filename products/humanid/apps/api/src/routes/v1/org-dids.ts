/**
 * Organizational DIDs Routes - /api/v1/org-dids
 *
 * Identity for companies, departments, devices, and services.
 * Hierarchical DID structure with parent-child relationships.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const createOrgDidSchema = z.object({
  orgId: z.string().uuid(),
  didId: z.string().uuid(),
  type: z.enum(['COMPANY', 'DEPARTMENT', 'DEVICE', 'SERVICE']),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const orgDidRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/org-dids - Create org DID
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = createOrgDidSchema.parse(request.body);

      const orgDid = await fastify.prisma.orgDid.create({
        data: {
          orgId: body.orgId,
          didId: body.didId,
          type: body.type,
          name: body.name,
          description: body.description,
          metadata: body.metadata,
        },
      });

      return reply.code(201).send({
        id: orgDid.id,
        orgId: orgDid.orgId,
        didId: orgDid.didId,
        type: orgDid.type,
        name: orgDid.name,
        parentOrgDidId: orgDid.parentOrgDidId,
        createdAt: orgDid.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // POST /api/v1/org-dids/:id/children - Create child DID under parent
  fastify.post('/:id/children', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const body = createOrgDidSchema.parse(request.body);

      const parent = await fastify.prisma.orgDid.findUnique({ where: { id } });
      if (!parent) throw new AppError(404, 'not-found', 'Parent org DID not found');

      const child = await fastify.prisma.orgDid.create({
        data: {
          orgId: body.orgId,
          didId: body.didId,
          type: body.type,
          name: body.name,
          description: body.description,
          metadata: body.metadata,
          parentOrgDidId: id,
        },
      });

      return reply.code(201).send({
        id: child.id,
        orgId: child.orgId,
        didId: child.didId,
        type: child.type,
        name: child.name,
        parentOrgDidId: child.parentOrgDidId,
        createdAt: child.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ status: 400, detail: error.errors.map(e => e.message).join('; ') });
      }
      throw error;
    }
  });

  // GET /api/v1/org-dids - List org DIDs
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const query = request.query as { orgId?: string; type?: string };

      const where: Record<string, unknown> = {};
      if (query.orgId) where.orgId = query.orgId;
      if (query.type) where.type = query.type;

      const orgDids = await fastify.prisma.orgDid.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { childOrgDids: true } } },
      });

      return reply.send({
        orgDids: orgDids.map(d => ({
          id: d.id,
          orgId: d.orgId,
          didId: d.didId,
          type: d.type,
          name: d.name,
          parentOrgDidId: d.parentOrgDidId,
          childCount: d._count.childOrgDids,
          createdAt: d.createdAt.toISOString(),
        })),
        total: orgDids.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // GET /api/v1/org-dids/:id/tree - DID hierarchy tree
  fastify.get('/:id/tree', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };

      const root = await fastify.prisma.orgDid.findUnique({
        where: { id },
        include: {
          childOrgDids: {
            include: {
              childOrgDids: {
                include: { childOrgDids: true },
              },
            },
          },
        },
      });

      if (!root) throw new AppError(404, 'not-found', 'Org DID not found');

      function buildTree(node: typeof root): Record<string, unknown> {
        return {
          id: node!.id,
          type: node!.type,
          name: node!.name,
          didId: node!.didId,
          children: (node as Record<string, unknown[]>).childOrgDids?.map((c: typeof root) => buildTree(c)) || [],
        };
      }

      return reply.send(buildTree(root));
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default orgDidRoutes;
