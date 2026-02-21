/**
 * Compliance Routes - /api/v1/compliance
 *
 * SOC 2 Type II readiness tracking, control management, and evidence collection.
 * Admin-only endpoints for managing security controls across frameworks.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { buildRequireAdmin } from '../../utils/middleware.js';

const createControlSchema = z.object({
  framework: z.enum(['SOC2', 'ISO27001', 'GDPR', 'HIPAA']),
  controlId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
});

const updateControlSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'FAILED']).optional(),
  evidence: z.record(z.unknown()).optional(),
  notes: z.string().optional(),
  assignee: z.string().optional(),
});

const complianceRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = buildRequireAdmin(fastify);

  // GET /api/v1/compliance/status - Compliance readiness dashboard
  fastify.get('/status', async (request, reply) => {
    try {
      await requireAdmin(request);

      const controls = await fastify.prisma.complianceControl.findMany();

      const frameworks: Record<string, { total: number; implemented: number; verified: number; readiness: number }> = {};

      for (const c of controls) {
        if (!frameworks[c.framework]) {
          frameworks[c.framework] = { total: 0, implemented: 0, verified: 0, readiness: 0 };
        }
        frameworks[c.framework].total++;
        if (c.status === 'IMPLEMENTED' || c.status === 'VERIFIED') {
          frameworks[c.framework].implemented++;
        }
        if (c.status === 'VERIFIED') {
          frameworks[c.framework].verified++;
        }
      }

      // Calculate readiness percentage
      for (const fw of Object.keys(frameworks)) {
        const f = frameworks[fw];
        f.readiness = f.total > 0 ? Math.round((f.implemented / f.total) * 100) : 0;
      }

      // Ensure SOC2 key exists even if empty
      if (!frameworks.SOC2) {
        frameworks.SOC2 = { total: 0, implemented: 0, verified: 0, readiness: 0 };
      }

      const totalControls = controls.length;
      const implementedControls = controls.filter(c => c.status === 'IMPLEMENTED' || c.status === 'VERIFIED').length;
      const overallReadiness = totalControls > 0 ? Math.round((implementedControls / totalControls) * 100) : 0;

      return reply.send({
        frameworks,
        overallReadiness,
        totalControls,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // POST /api/v1/compliance/controls - Create compliance control
  fastify.post('/controls', async (request, reply) => {
    try {
      await requireAdmin(request);
      const body = createControlSchema.parse(request.body);

      const control = await fastify.prisma.complianceControl.create({
        data: {
          framework: body.framework,
          controlId: body.controlId,
          title: body.title,
          description: body.description,
        },
      });

      return reply.code(201).send({
        id: control.id,
        framework: control.framework,
        controlId: control.controlId,
        title: control.title,
        description: control.description,
        status: control.status,
        createdAt: control.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/compliance/controls - List controls with filters
  fastify.get('/controls', async (request, reply) => {
    try {
      await requireAdmin(request);
      const query = request.query as { framework?: string; status?: string; page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (query.framework) where.framework = query.framework;
      if (query.status) where.status = query.status;

      const [controls, total] = await Promise.all([
        fastify.prisma.complianceControl.findMany({
          where,
          orderBy: { createdAt: 'asc' },
          skip,
          take: limit,
        }),
        fastify.prisma.complianceControl.count({ where }),
      ]);

      return reply.send({
        controls: controls.map(c => ({
          ...c,
          lastAuditedAt: c.lastAuditedAt?.toISOString() || null,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        })),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // PATCH /api/v1/compliance/controls/:id - Update control
  fastify.patch('/controls/:id', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };
      const body = updateControlSchema.parse(request.body);

      const existing = await fastify.prisma.complianceControl.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'not-found', 'Control not found');

      const data: Record<string, unknown> = {};
      if (body.status) data.status = body.status;
      if (body.evidence) data.evidence = body.evidence;
      if (body.notes !== undefined) data.notes = body.notes;
      if (body.assignee !== undefined) data.assignee = body.assignee;
      if (body.status === 'VERIFIED') data.lastAuditedAt = new Date();

      const updated = await fastify.prisma.complianceControl.update({
        where: { id },
        data,
      });

      return reply.send({
        ...updated,
        lastAuditedAt: updated.lastAuditedAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/compliance/controls/summary - Framework summary stats
  fastify.get('/controls/summary', async (request, reply) => {
    try {
      await requireAdmin(request);

      const controls = await fastify.prisma.complianceControl.findMany();
      const summary: Record<string, { total: number; not_started: number; in_progress: number; implemented: number; verified: number; failed: number }> = {};

      for (const c of controls) {
        if (!summary[c.framework]) {
          summary[c.framework] = { total: 0, not_started: 0, in_progress: 0, implemented: 0, verified: 0, failed: 0 };
        }
        summary[c.framework].total++;
        const statusKey = c.status.toLowerCase().replace(/_/g, '_') as keyof typeof summary[string];
        if (statusKey in summary[c.framework]) {
          (summary[c.framework] as Record<string, number>)[statusKey]++;
        }
      }

      return reply.send(summary);
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default complianceRoutes;
