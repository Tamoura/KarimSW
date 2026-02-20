/**
 * Audit Trail Routes - /api/v1/audit
 *
 * Compliance-grade audit log with tamper-evident chain,
 * filtering, export (CSV/JSON), and integrity verification.
 */

import { FastifyPluginAsync } from 'fastify';
import { createHash } from 'crypto';
import { AppError } from '../../types/index.js';

const auditRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/audit/events - Query audit events
  fastify.get('/events', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const query = request.query as {
        page?: string;
        limit?: string;
        action?: string;
        entityType?: string;
        from?: string;
        to?: string;
        actorId?: string;
      };

      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { userId };

      if (query.action) {
        where.action = query.action;
      }
      if (query.entityType) {
        where.entityType = query.entityType;
      }
      // actorId filtering is restricted to the authenticated user's own events
      // (admin-level cross-user audit viewing requires admin role — not yet implemented)
      if (query.from || query.to) {
        where.createdAt = {} as Record<string, Date>;
        if (query.from) (where.createdAt as Record<string, Date>).gte = new Date(query.from);
        if (query.to) (where.createdAt as Record<string, Date>).lte = new Date(query.to);
      }

      const [events, total] = await Promise.all([
        fastify.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            userId: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            ipAddress: true,
            userAgent: true,
            prevHash: true,
            createdAt: true,
          },
        }),
        fastify.prisma.auditLog.count({ where }),
      ]);

      return reply.send({
        events: events.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
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

  // GET /api/v1/audit/events/export - Export audit events
  fastify.get('/events/export', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const query = request.query as {
        format?: string;
        action?: string;
        entityType?: string;
        from?: string;
        to?: string;
      };

      const format = query.format || 'json';
      const where: Record<string, unknown> = { userId };

      if (query.action) where.action = query.action;
      if (query.entityType) where.entityType = query.entityType;
      if (query.from || query.to) {
        where.createdAt = {} as Record<string, Date>;
        if (query.from) (where.createdAt as Record<string, Date>).gte = new Date(query.from);
        if (query.to) (where.createdAt as Record<string, Date>).lte = new Date(query.to);
      }

      const events = await fastify.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 10000, // Max export size
        select: {
          id: true,
          userId: true,
          action: true,
          entityType: true,
          entityId: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
        },
      });

      if (format === 'csv') {
        const header = 'id,userId,action,entityType,entityId,ipAddress,userAgent,createdAt';
        const rows = events.map((e) =>
          `${e.id},${e.userId || ''},${e.action},${e.entityType},${e.entityId},${e.ipAddress || ''},${(e.userAgent || '').replace(/,/g, ';')},${e.createdAt.toISOString()}`
        );
        const csv = [header, ...rows].join('\n');

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="audit-events.csv"')
          .send(csv);
      }

      // Default: JSON
      return reply.send({
        events: events.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        })),
        total: events.length,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/audit/events/verify - Verify audit chain integrity
  fastify.get('/events/verify', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      // Get all audit entries ordered by creation
      const events = await fastify.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          prevHash: true,
          createdAt: true,
        },
      });

      let intact = true;
      let brokenAt: string | null = null;
      let entriesChecked = 0;

      // Check entries that have prevHash set
      for (let i = 0; i < events.length; i++) {
        if (events[i].prevHash && i > 0) {
          // Verify the prevHash matches the hash of the previous entry
          const prevEntry = events[i - 1];
          const expectedHash = createHash('sha256')
            .update(JSON.stringify({
              id: prevEntry.id,
              action: prevEntry.action,
              entityType: prevEntry.entityType,
              entityId: prevEntry.entityId,
              createdAt: prevEntry.createdAt.toISOString(),
            }))
            .digest('hex');

          if (events[i].prevHash !== expectedHash) {
            intact = false;
            brokenAt = events[i].id;
            break;
          }
        }
        entriesChecked++;
      }

      return reply.send({
        intact,
        entriesChecked,
        totalEntries: events.length,
        brokenAt,
        verifiedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default auditRoutes;
