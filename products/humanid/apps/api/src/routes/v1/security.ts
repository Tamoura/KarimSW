/**
 * Security & Bug Bounty Routes - /api/v1/security
 *
 * Vulnerability report submission, security advisories, and
 * /.well-known/security.txt endpoint.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { buildRequireAdmin } from '../../utils/middleware.js';

const reportSchema = z.object({
  reporterEmail: z.string().email(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  cvssScore: z.number().min(0).max(10).optional(),
  affectedComponent: z.string().min(1),
  stepsToReproduce: z.string().min(1),
});

const updateReportSchema = z.object({
  status: z.enum(['SUBMITTED', 'TRIAGED', 'CONFIRMED', 'FIXED', 'CLOSED', 'INVALID']).optional(),
  bountyAmount: z.number().min(0).optional(),
  assignee: z.string().optional(),
});

const advisorySchema = z.object({
  vulnerabilityReportId: z.string().uuid().optional(),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  affectedVersions: z.array(z.string()),
  patchedVersions: z.array(z.string()),
});

const securityRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = buildRequireAdmin(fastify);

  // POST /api/v1/security/reports - Submit vulnerability report (no auth)
  fastify.post('/reports', async (request, reply) => {
    try {
      const body = reportSchema.parse(request.body);

      const report = await fastify.prisma.vulnerabilityReport.create({
        data: {
          reporterEmail: body.reporterEmail,
          title: body.title,
          description: body.description,
          severity: body.severity,
          cvssScore: body.cvssScore,
          affectedComponent: body.affectedComponent,
          stepsToReproduce: body.stepsToReproduce,
        },
      });

      return reply.code(201).send({
        id: report.id,
        status: report.status,
        severity: report.severity,
        title: report.title,
        createdAt: report.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/security/reports - List reports (admin only)
  fastify.get('/reports', async (request, reply) => {
    try {
      await requireAdmin(request);

      const query = request.query as { status?: string; severity?: string; page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.severity) where.severity = query.severity;

      const [reports, total] = await Promise.all([
        fastify.prisma.vulnerabilityReport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        fastify.prisma.vulnerabilityReport.count({ where }),
      ]);

      return reply.send({
        reports: reports.map(r => ({
          id: r.id,
          reporterEmail: r.reporterEmail,
          title: r.title,
          severity: r.severity,
          cvssScore: r.cvssScore,
          status: r.status,
          bountyAmount: r.bountyAmount,
          createdAt: r.createdAt.toISOString(),
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

  // PATCH /api/v1/security/reports/:id - Update report (admin only)
  fastify.patch('/reports/:id', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };
      const body = updateReportSchema.parse(request.body);

      const existing = await fastify.prisma.vulnerabilityReport.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'not-found', 'Report not found');

      const data: Record<string, unknown> = {};
      if (body.status) data.status = body.status;
      if (body.bountyAmount !== undefined) data.bountyAmount = body.bountyAmount;
      if (body.assignee !== undefined) data.assignee = body.assignee;
      if (body.bountyAmount && body.bountyAmount > 0) data.paidAt = new Date();

      const updated = await fastify.prisma.vulnerabilityReport.update({
        where: { id },
        data,
      });

      return reply.send({
        id: updated.id,
        status: updated.status,
        severity: updated.severity,
        bountyAmount: updated.bountyAmount,
        paidAt: updated.paidAt?.toISOString() || null,
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

  // POST /api/v1/security/advisories - Publish advisory (admin)
  fastify.post('/advisories', async (request, reply) => {
    try {
      await requireAdmin(request);
      const body = advisorySchema.parse(request.body);

      const advisory = await fastify.prisma.securityAdvisory.create({
        data: {
          vulnerabilityReportId: body.vulnerabilityReportId,
          title: body.title,
          description: body.description,
          severity: body.severity,
          affectedVersions: body.affectedVersions,
          patchedVersions: body.patchedVersions,
          publishedAt: new Date(),
        },
      });

      return reply.code(201).send({
        id: advisory.id,
        title: advisory.title,
        severity: advisory.severity,
        affectedVersions: advisory.affectedVersions,
        patchedVersions: advisory.patchedVersions,
        publishedAt: advisory.publishedAt?.toISOString(),
        createdAt: advisory.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/security/advisories - List public advisories (no auth)
  fastify.get('/advisories', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);
    const skip = (page - 1) * limit;

    const where = { publishedAt: { not: null } };
    const [advisories, total] = await Promise.all([
      fastify.prisma.securityAdvisory.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip,
        take: limit,
      }),
      fastify.prisma.securityAdvisory.count({ where }),
    ]);

    return reply.send({
      advisories: advisories.map(a => ({
        id: a.id,
        title: a.title,
        severity: a.severity,
        affectedVersions: a.affectedVersions,
        patchedVersions: a.patchedVersions,
        publishedAt: a.publishedAt?.toISOString(),
      })),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  });
};

export default securityRoutes;
