/**
 * Admin Routes - /api/v1/admin
 *
 * Admin-only endpoints for user and issuer management.
 */

import { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { buildRequireAdmin } from '../../utils/middleware.js';

const adminRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = buildRequireAdmin(fastify);

  // GET /api/v1/admin/users - Paginated user listing
  fastify.get('/users', async (request, reply) => {
    try {
      await requireAdmin(request);

      const query = request.query as {
        page?: string;
        limit?: string;
        search?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page || '1'));
      const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 100));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};

      if (query.search) {
        where.email = { contains: query.search, mode: 'insensitive' };
      }
      if (query.status && ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'].includes(query.status)) {
        where.status = query.status;
      }

      const [users, total] = await Promise.all([
        fastify.prisma.user.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { dids: true } },
          },
        }),
        fastify.prisma.user.count({ where }),
      ]);

      return reply.send({
        users: users.map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          status: u.status,
          didCount: u._count.dids,
          createdAt: u.createdAt.toISOString(),
          updatedAt: u.updatedAt.toISOString(),
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

  // PATCH /api/v1/admin/users/:id/suspend - Suspend a user
  fastify.patch('/users/:id/suspend', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };

      const user = await fastify.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new AppError(404, 'not-found', 'User not found');
      }
      if (user.status === 'SUSPENDED') {
        throw new AppError(400, 'bad-request', 'User is already suspended');
      }

      const updated = await fastify.prisma.user.update({
        where: { id },
        data: { status: 'SUSPENDED' },
      });

      logger.info('User suspended', { userId: id, adminId: request.currentUser!.id });

      return reply.send({
        id: updated.id,
        email: updated.email,
        status: updated.status,
        message: 'User suspended',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // PATCH /api/v1/admin/users/:id/reactivate - Reactivate a suspended user
  fastify.patch('/users/:id/reactivate', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };

      const user = await fastify.prisma.user.findUnique({ where: { id } });
      if (!user) {
        throw new AppError(404, 'not-found', 'User not found');
      }
      if (user.status === 'ACTIVE') {
        throw new AppError(400, 'bad-request', 'User is already active');
      }

      const updated = await fastify.prisma.user.update({
        where: { id },
        data: { status: 'ACTIVE' },
      });

      logger.info('User reactivated', { userId: id, adminId: request.currentUser!.id });

      return reply.send({
        id: updated.id,
        email: updated.email,
        status: updated.status,
        message: 'User reactivated',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/admin/issuers - Paginated issuer listing
  fastify.get('/issuers', async (request, reply) => {
    try {
      await requireAdmin(request);

      const query = request.query as {
        page?: string;
        limit?: string;
        search?: string;
        status?: string;
      };

      const page = Math.max(1, parseInt(query.page || '1'));
      const limit = Math.max(1, Math.min(parseInt(query.limit || '20'), 100));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};

      if (query.search) {
        where.organizationName = { contains: query.search, mode: 'insensitive' };
      }
      if (query.status && ['PENDING', 'TRUSTED', 'REVOKED'].includes(query.status)) {
        where.trustStatus = query.status;
      }

      const [issuers, total] = await Promise.all([
        fastify.prisma.issuer.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            did: { select: { did: true } },
            _count: { select: { credentials: true } },
          },
        }),
        fastify.prisma.issuer.count({ where }),
      ]);

      return reply.send({
        issuers: issuers.map((i) => ({
          id: i.id,
          organizationName: i.organizationName,
          did: i.did.did,
          trustStatus: i.trustStatus,
          tier: i.tier,
          credentialCount: i._count.credentials,
          createdAt: i.createdAt.toISOString(),
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

  // PATCH /api/v1/admin/issuers/:id/approve - Approve an issuer
  fastify.patch('/issuers/:id/approve', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };

      const issuer = await fastify.prisma.issuer.findUnique({ where: { id } });
      if (!issuer) {
        throw new AppError(404, 'not-found', 'Issuer not found');
      }
      if (issuer.trustStatus === 'TRUSTED') {
        throw new AppError(400, 'bad-request', 'Issuer is already approved');
      }

      const updated = await fastify.prisma.issuer.update({
        where: { id },
        data: { trustStatus: 'TRUSTED', verifiedAt: new Date() },
      });

      logger.info('Issuer approved', { issuerId: id, adminId: request.currentUser!.id });

      return reply.send({
        id: updated.id,
        organizationName: updated.organizationName,
        trustStatus: updated.trustStatus,
        verifiedAt: updated.verifiedAt?.toISOString(),
        message: 'Issuer approved',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // PATCH /api/v1/admin/issuers/:id/suspend - Suspend an issuer
  fastify.patch('/issuers/:id/suspend', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };

      const issuer = await fastify.prisma.issuer.findUnique({ where: { id } });
      if (!issuer) {
        throw new AppError(404, 'not-found', 'Issuer not found');
      }
      if (issuer.trustStatus === 'REVOKED') {
        throw new AppError(400, 'bad-request', 'Issuer is already suspended');
      }

      const updated = await fastify.prisma.issuer.update({
        where: { id },
        data: { trustStatus: 'REVOKED', revokedAt: new Date() },
      });

      logger.info('Issuer suspended', { issuerId: id, adminId: request.currentUser!.id });

      return reply.send({
        id: updated.id,
        organizationName: updated.organizationName,
        trustStatus: updated.trustStatus,
        message: 'Issuer suspended',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default adminRoutes;
