/**
 * SSO Routes - /api/v1/sso
 *
 * Enterprise SSO bridge for OIDC and SAML providers.
 * Organization-level SSO configuration and enforcement.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import dns from 'dns/promises';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { encrypt, decrypt } from '../../utils/encryption.js';
import { buildRequireOrgOwner } from '../../utils/middleware.js';

/**
 * SSRF protection: reject URLs pointing to private/internal networks.
 * Reuses the same logic as webhooks.ts validateWebhookUrl.
 */
async function validateSsoUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  const hostname = parsed.hostname.toLowerCase();

  const blockedPatterns = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/,
    /^\[?fe80:/i,
    /^\[?fc00:/i,
    /^\[?fd/i,
    /\.internal$/i,
    /\.local$/i,
    /\.localhost$/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      throw new AppError(400, 'bad-request', 'SSO URL must not point to private or internal networks');
    }
  }

  // DNS resolution check: validate resolved IPs are not private
  const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
  const privateIpPatterns = [
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
  ];
  for (const addr of addresses) {
    if (privateIpPatterns.some(p => p.test(addr))) {
      throw new AppError(400, 'bad-request', 'SSO URL resolves to a private IP address');
    }
  }
}

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
  const requireOrgOwner = buildRequireOrgOwner(fastify);

  // POST /api/v1/sso/oidc - Configure OIDC provider
  fastify.post('/oidc', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = oidcConfigSchema.parse(request.body);
      const userId = request.currentUser!.id;

      await requireOrgOwner(userId, body.orgId);

      // SSRF protection: validate discoveryUrl does not point to private networks
      await validateSsoUrl(body.discoveryUrl);

      const ssoConfig = {
        oidc: {
          discoveryUrl: body.discoveryUrl,
          clientId: body.clientId,
          clientSecret: encrypt(body.clientSecret), // encrypted at rest
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

      // SSRF protection: validate metadataUrl does not point to private networks
      await validateSsoUrl(body.metadataUrl);

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

      // Verify user is a member of the org
      const membership = await fastify.prisma.organizationMember.findFirst({
        where: { userId: request.currentUser!.id, orgId: query.orgId },
      });
      if (!membership) {
        throw new AppError(403, 'forbidden', 'Not a member of this organization');
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
