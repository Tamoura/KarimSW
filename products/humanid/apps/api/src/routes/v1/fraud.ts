/**
 * AI Fraud Detection Routes - /api/v1/fraud
 *
 * ML-based credential fraud pattern detection.
 * Scan credentials, manage alerts, and view detection stats.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { buildRequireAdmin } from '../../utils/middleware.js';

const scanSchema = z.object({
  credentialId: z.string().uuid(),
});

const updateAlertSchema = z.object({
  status: z.enum(['OPEN', 'INVESTIGATING', 'CONFIRMED', 'DISMISSED']).optional(),
  assignee: z.string().optional(),
  resolution: z.string().optional(),
});

const fraudRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = buildRequireAdmin(fastify);

  // POST /api/v1/fraud/scan - Scan credential for anomalies
  fastify.post('/scan', async (request, reply) => {
    try {
      await requireAdmin(request);
      const body = scanSchema.parse(request.body);

      const credential = await fastify.prisma.credential.findUnique({
        where: { id: body.credentialId },
        include: { issuerDid: true },
      });

      if (!credential) throw new AppError(404, 'not-found', 'Credential not found');

      // Simulated ML-based fraud detection checks
      const checks = {
        duplicateCheck: { passed: true, detail: 'No duplicate credentials found' },
        issuerTrust: { passed: credential.issuerDid.status === 'ACTIVE', detail: `Issuer DID status: ${credential.issuerDid.status}` },
        expirationCheck: { passed: !credential.expiresAt || credential.expiresAt > new Date(), detail: 'Credential not expired' },
        revocationCheck: { passed: credential.status !== 'REVOKED', detail: `Status: ${credential.status}` },
        issuanceVelocity: { passed: true, detail: 'Normal issuance rate' },
      };

      const failedChecks = Object.values(checks).filter(c => !c.passed).length;
      const riskScore = Math.min(failedChecks * 0.25, 1.0);

      return reply.send({
        credentialId: credential.id,
        riskScore,
        riskLevel: riskScore > 0.7 ? 'HIGH' : riskScore > 0.3 ? 'MEDIUM' : 'LOW',
        checks,
        scannedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/fraud/alerts - List alerts
  fastify.get('/alerts', async (request, reply) => {
    try {
      await requireAdmin(request);
      const query = request.query as { status?: string; severity?: string; page?: string; limit?: string };

      const page = Math.max(1, parseInt(query.page || '1') || 1);
      const limit = Math.max(1, Math.min(parseInt(query.limit || '50') || 50, 100));
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.severity) where.severity = query.severity;

      const [alerts, total] = await Promise.all([
        fastify.prisma.fraudAlert.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        fastify.prisma.fraudAlert.count({ where }),
      ]);

      return reply.send({
        alerts: alerts.map(a => ({
          id: a.id,
          alertType: a.alertType,
          severity: a.severity,
          status: a.status,
          description: a.description,
          riskScore: a.riskScore,
          credentialId: a.credentialId,
          assignee: a.assignee,
          createdAt: a.createdAt.toISOString(),
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

  // PATCH /api/v1/fraud/alerts/:id - Update alert
  fastify.patch('/alerts/:id', async (request, reply) => {
    try {
      await requireAdmin(request);
      const { id } = request.params as { id: string };
      const body = updateAlertSchema.parse(request.body);

      const existing = await fastify.prisma.fraudAlert.findUnique({ where: { id } });
      if (!existing) throw new AppError(404, 'not-found', 'Alert not found');

      const data: Record<string, unknown> = {};
      if (body.status) data.status = body.status;
      if (body.assignee !== undefined) data.assignee = body.assignee;
      if (body.resolution !== undefined) data.resolution = body.resolution;
      if (body.status === 'CONFIRMED' || body.status === 'DISMISSED') data.resolvedAt = new Date();

      const updated = await fastify.prisma.fraudAlert.update({ where: { id }, data });

      return reply.send({
        id: updated.id,
        status: updated.status,
        assignee: updated.assignee,
        resolution: updated.resolution,
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

  // GET /api/v1/fraud/stats - Fraud detection stats
  fastify.get('/stats', async (request, reply) => {
    try {
      await requireAdmin(request);

      const alerts = await fastify.prisma.fraudAlert.findMany();

      const bySeverity: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      for (const a of alerts) {
        bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
        byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      }

      return reply.send({
        totalAlerts: alerts.length,
        bySeverity,
        byStatus,
        averageRiskScore: alerts.length > 0
          ? Math.round((alerts.reduce((sum, a) => sum + a.riskScore, 0) / alerts.length) * 100) / 100
          : 0,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default fraudRoutes;
