/**
 * SSO Routes - /api/v1/sso
 *
 * Enterprise SSO bridge for OIDC and SAML providers.
 * Organization-level SSO configuration and enforcement.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const oidcConfigSchema = z.object({
  orgId: z.string().uuid(),
  discoveryUrl: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
});

const samlConfigSchema = z.object({
  orgId: z.string().uuid(),
  metadataUrl: z.string().url(),
  entityId: z.string().min(1),
});

const ssoRoutes: FastifyPluginAsync = async (fastify) => {
  async function requireOrgOwner(userId: string, orgId: string) {
    const membership = await fastify.prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });
    if (!membership || membership.status !== 'ACTIVE' || !['OWNER', 'ADMIN'].includes(membership.role)) {
      throw new AppError(403, 'forbidden', 'Only organization owners/admins can manage SSO');
    }
  }

  // POST /api/v1/sso/oidc - Configure OIDC provider
  fastify.post('/oidc', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = oidcConfigSchema.parse(request.body);
      const userId = request.currentUser!.id;

      await requireOrgOwner(userId, body.orgId);

      const ssoConfig = {
        oidc: {
          discoveryUrl: body.discoveryUrl,
          clientId: body.clientId,
          clientSecret: body.clientSecret,
          configuredAt: new Date().toISOString(),
          configuredBy: userId,
        },
      };

      // Get existing SSO config and merge
      const org = await fastify.prisma.organization.findUnique({ where: { id: body.orgId } });
      const existing = (org?.ssoProvider as Record<string, unknown>) || {};

      await fastify.prisma.organization.update({
        where: { id: body.orgId },
        data: { ssoProvider: { ...existing, ...ssoConfig } },
      });

      logger.info('OIDC SSO configured', { orgId: body.orgId, userId });

      return reply.code(201).send({
        provider: 'oidc',
        orgId: body.orgId,
        discoveryUrl: body.discoveryUrl,
        clientId: body.clientId,
        configuredAt: ssoConfig.oidc.configuredAt,
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

  // POST /api/v1/sso/saml - Configure SAML provider
  fastify.post('/saml', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = samlConfigSchema.parse(request.body);
      const userId = request.currentUser!.id;

      await requireOrgOwner(userId, body.orgId);

      const ssoConfig = {
        saml: {
          metadataUrl: body.metadataUrl,
          entityId: body.entityId,
          configuredAt: new Date().toISOString(),
          configuredBy: userId,
        },
      };

      const org = await fastify.prisma.organization.findUnique({ where: { id: body.orgId } });
      const existing = (org?.ssoProvider as Record<string, unknown>) || {};

      await fastify.prisma.organization.update({
        where: { id: body.orgId },
        data: { ssoProvider: { ...existing, ...ssoConfig } },
      });

      logger.info('SAML SSO configured', { orgId: body.orgId, userId });

      return reply.code(201).send({
        provider: 'saml',
        orgId: body.orgId,
        metadataUrl: body.metadataUrl,
        entityId: body.entityId,
        configuredAt: ssoConfig.saml.configuredAt,
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

  // GET /api/v1/sso/providers - List SSO providers for org
  fastify.get('/providers', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const query = request.query as { orgId?: string };

      if (!query.orgId) {
        throw new AppError(400, 'bad-request', 'orgId query parameter required');
      }

      const org = await fastify.prisma.organization.findUnique({
        where: { id: query.orgId },
        select: { id: true, name: true, ssoProvider: true, ssoEnforced: true },
      });

      if (!org) {
        throw new AppError(404, 'not-found', 'Organization not found');
      }

      const ssoProvider = (org.ssoProvider as Record<string, unknown>) || {};
      const providers: { type: string; configuredAt?: string }[] = [];

      if (ssoProvider.oidc) {
        const oidc = ssoProvider.oidc as Record<string, string>;
        providers.push({ type: 'oidc', configuredAt: oidc.configuredAt });
      }
      if (ssoProvider.saml) {
        const saml = ssoProvider.saml as Record<string, string>;
        providers.push({ type: 'saml', configuredAt: saml.configuredAt });
      }

      return reply.send({
        orgId: org.id,
        orgName: org.name,
        ssoEnforced: org.ssoEnforced,
        providers,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // DELETE /api/v1/sso/oidc - Remove OIDC config
  fastify.delete('/oidc', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const query = request.query as { orgId?: string };
      const userId = request.currentUser!.id;

      if (!query.orgId) {
        throw new AppError(400, 'bad-request', 'orgId query parameter required');
      }

      await requireOrgOwner(userId, query.orgId);

      const org = await fastify.prisma.organization.findUnique({ where: { id: query.orgId } });
      const ssoProvider = (org?.ssoProvider as Record<string, unknown>) || {};
      delete ssoProvider.oidc;

      await fastify.prisma.organization.update({
        where: { id: query.orgId },
        data: { ssoProvider: Object.keys(ssoProvider).length > 0 ? ssoProvider : {} },
      });

      logger.info('OIDC SSO removed', { orgId: query.orgId, userId });

      return reply.send({ message: 'OIDC configuration removed' });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default ssoRoutes;
