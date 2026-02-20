/**
 * Marketplace & Issuer Onboarding Routes
 *
 * Trusted Issuer Program:
 * - POST /issuers/apply                 (apply as issuer)
 * - GET /issuers/directory               (public directory)
 * - GET /admin/issuer-applications       (admin: list applications)
 * - PATCH /admin/issuer-applications/:id (admin: approve/reject)
 *
 * Credential Template Marketplace:
 * - GET /marketplace/templates           (browse public templates)
 * - POST /marketplace/templates/:id/fork (fork a template)
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const applySchema = z.object({
  didId: z.string().uuid(),
  organizationName: z.string().min(1).max(200),
  legalEntityId: z.string().optional(),
  website: z.string().url().optional(),
});

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  tier: z.enum(['SELF_DECLARED', 'VERIFIED', 'QUALIFIED']).optional(),
  reason: z.string().optional(),
});

const marketplaceRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /issuers/apply - Submit issuer application
  fastify.post('/issuers/apply', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = applySchema.parse(request.body);
      const userId = request.currentUser!.id;

      // Verify DID ownership
      const did = await fastify.prisma.dID.findFirst({
        where: { id: body.didId, userId },
      });
      if (!did) {
        throw new AppError(404, 'not-found', 'DID not found or not owned by you');
      }

      // Check if already registered
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
          legalEntityId: body.legalEntityId,
          website: body.website,
          trustStatus: 'PENDING',
          tier: 'SELF_DECLARED',
        },
      });

      logger.info('Issuer application submitted', { issuerId: issuer.id, userId });

      return reply.code(201).send({
        id: issuer.id,
        organizationName: issuer.organizationName,
        trustStatus: issuer.trustStatus,
        tier: issuer.tier,
        website: issuer.website,
        createdAt: issuer.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error', status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /issuers/directory - Public issuer directory (no auth required)
  fastify.get('/issuers/directory', async (request, reply) => {
    const query = request.query as { search?: string; tier?: string; page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (query.tier) {
      where.tier = query.tier;
    }
    if (query.search) {
      where.organizationName = { contains: query.search, mode: 'insensitive' };
    }

    const [issuers, total] = await Promise.all([
      fastify.prisma.issuer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          organizationName: true,
          trustStatus: true,
          tier: true,
          website: true,
          domainVerified: true,
          createdAt: true,
          did: { select: { did: true } },
          _count: { select: { templates: { where: { isActive: true, isPublic: true } } } },
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
        website: i.website,
        domainVerified: i.domainVerified,
        publicTemplates: i._count.templates,
        createdAt: i.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: limit,
    });
  });

  // GET /admin/issuer-applications - List applications (admin only)
  fastify.get('/admin/issuer-applications', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      if (request.currentUser!.role !== 'ADMIN') {
        throw new AppError(403, 'forbidden', 'Admin access required');
      }

      const query = request.query as { status?: string; page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = {};
      if (query.status) {
        where.trustStatus = query.status;
      }

      const [applications, total] = await Promise.all([
        fastify.prisma.issuer.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            user: { select: { email: true } },
            did: { select: { did: true } },
          },
        }),
        fastify.prisma.issuer.count({ where }),
      ]);

      return reply.send({
        applications: applications.map((a) => ({
          id: a.id,
          organizationName: a.organizationName,
          email: a.user.email,
          did: a.did.did,
          trustStatus: a.trustStatus,
          tier: a.tier,
          website: a.website,
          legalEntityId: a.legalEntityId,
          createdAt: a.createdAt.toISOString(),
        })),
        total,
        page,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // PATCH /admin/issuer-applications/:id - Approve/reject (admin only)
  fastify.patch('/admin/issuer-applications/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      if (request.currentUser!.role !== 'ADMIN') {
        throw new AppError(403, 'forbidden', 'Admin access required');
      }

      const { id } = request.params as { id: string };
      const body = reviewSchema.parse(request.body);

      const issuer = await fastify.prisma.issuer.findUnique({ where: { id } });
      if (!issuer) {
        throw new AppError(404, 'not-found', 'Issuer application not found');
      }

      const updateData: Record<string, unknown> = {};
      if (body.action === 'approve') {
        updateData.trustStatus = 'TRUSTED';
        updateData.tier = body.tier || 'VERIFIED';
        updateData.verifiedAt = new Date();
      } else {
        updateData.trustStatus = 'REVOKED';
        updateData.revokedAt = new Date();
      }

      const updated = await fastify.prisma.issuer.update({
        where: { id },
        data: updateData,
      });

      logger.info('Issuer application reviewed', {
        issuerId: id,
        action: body.action,
        reviewedBy: request.currentUser!.id,
      });

      return reply.send({
        id: updated.id,
        organizationName: updated.organizationName,
        trustStatus: updated.trustStatus,
        tier: updated.tier,
        verifiedAt: updated.verifiedAt?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error', status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /marketplace/templates - Browse public templates
  fastify.get('/marketplace/templates', async (request, reply) => {
    const query = request.query as { search?: string; type?: string; page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { isPublic: true, isActive: true };
    if (query.type) {
      where.credentialType = query.type;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [templates, total] = await Promise.all([
      fastify.prisma.credentialTemplate.findMany({
        where,
        orderBy: [{ forkCount: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          issuer: { select: { organizationName: true, tier: true, trustStatus: true } },
        },
      }),
      fastify.prisma.credentialTemplate.count({ where }),
    ]);

    return reply.send({
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        credentialType: t.credentialType,
        schema: t.schema,
        requiredAttributes: t.requiredAttributes,
        optionalAttributes: t.optionalAttributes,
        defaultExpiryDays: t.defaultExpiryDays,
        forkCount: t.forkCount,
        issuerName: t.issuer.organizationName,
        issuerTier: t.issuer.tier,
        issuerTrustStatus: t.issuer.trustStatus,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page,
      pageSize: limit,
    });
  });

  // POST /marketplace/templates/:id/fork - Fork a public template
  fastify.post('/marketplace/templates/:id/fork', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const original = await fastify.prisma.credentialTemplate.findFirst({
        where: { id, isPublic: true, isActive: true },
      });

      if (!original) {
        throw new AppError(404, 'not-found', 'Template not found or not public');
      }

      // User must have an issuer profile to fork
      const issuer = await fastify.prisma.issuer.findFirst({
        where: { userId },
      });
      if (!issuer) {
        throw new AppError(403, 'forbidden', 'You need an issuer profile to fork templates');
      }

      const forked = await fastify.prisma.credentialTemplate.create({
        data: {
          issuerId: issuer.id,
          name: `${original.name} (Fork)`,
          credentialType: original.credentialType,
          schema: original.schema || {},
          requiredAttributes: original.requiredAttributes || [],
          optionalAttributes: original.optionalAttributes || [],
          defaultExpiryDays: original.defaultExpiryDays,
          isPublic: false,
          isActive: true,
          forkedFromId: original.id,
        },
      });

      // Increment fork count
      await fastify.prisma.credentialTemplate.update({
        where: { id: original.id },
        data: { forkCount: { increment: 1 } },
      });

      logger.info('Template forked', { originalId: id, forkId: forked.id, userId });

      return reply.code(201).send({
        id: forked.id,
        name: forked.name,
        credentialType: forked.credentialType,
        forkedFromId: forked.forkedFromId,
        createdAt: forked.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default marketplaceRoutes;
