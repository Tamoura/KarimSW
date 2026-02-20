/**
 * Credential Template Routes - /api/v1/templates
 *
 * CRUD for credential templates. Templates define the schema,
 * required/optional attributes, and default expiry for credentials.
 * Only users with an issuer profile can manage templates.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  credentialType: z.string().min(1).max(100),
  schema: z.record(z.unknown()),
  requiredAttributes: z.array(z.string()),
  optionalAttributes: z.array(z.string()),
  defaultExpiryDays: z.number().int().min(1).max(3650).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schema: z.record(z.unknown()).optional(),
  requiredAttributes: z.array(z.string()).optional(),
  optionalAttributes: z.array(z.string()).optional(),
  defaultExpiryDays: z.number().int().min(1).max(3650).nullable().optional(),
});

const templateRoutes: FastifyPluginAsync = async (fastify) => {
  // Helper: get issuer profile for authenticated user
  async function getIssuerProfile(userId: string) {
    return fastify.prisma.issuer.findFirst({ where: { userId } });
  }

  // POST /api/v1/templates - Create a credential template
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = createTemplateSchema.parse(request.body);
      const issuer = await getIssuerProfile(request.currentUser!.id);

      if (!issuer) {
        throw new AppError(403, 'forbidden', 'Issuer profile required to create templates');
      }

      const template = await fastify.prisma.credentialTemplate.create({
        data: {
          issuerId: issuer.id,
          name: body.name,
          credentialType: body.credentialType,
          schema: body.schema,
          requiredAttributes: body.requiredAttributes,
          optionalAttributes: body.optionalAttributes,
          defaultExpiryDays: body.defaultExpiryDays || null,
          isActive: true,
        },
      });

      logger.info('Credential template created', {
        templateId: template.id,
        issuerId: issuer.id,
      });

      return reply.code(201).send({
        id: template.id,
        name: template.name,
        credentialType: template.credentialType,
        schema: template.schema,
        requiredAttributes: template.requiredAttributes,
        optionalAttributes: template.optionalAttributes,
        defaultExpiryDays: template.defaultExpiryDays,
        isActive: template.isActive,
        createdAt: template.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/v1/templates - List templates
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const issuer = await getIssuerProfile(request.currentUser!.id);

      if (!issuer) {
        return reply.send({ templates: [], total: 0 });
      }

      const templates = await fastify.prisma.credentialTemplate.findMany({
        where: { issuerId: issuer.id },
        orderBy: { createdAt: 'desc' },
      });

      return reply.send({
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          credentialType: t.credentialType,
          isActive: t.isActive,
          defaultExpiryDays: t.defaultExpiryDays,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
        })),
        total: templates.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/templates/:id - Get a specific template
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const issuer = await getIssuerProfile(request.currentUser!.id);

      if (!issuer) {
        throw new AppError(404, 'not-found', 'Template not found');
      }

      const template = await fastify.prisma.credentialTemplate.findFirst({
        where: { id, issuerId: issuer.id },
      });

      if (!template) {
        throw new AppError(404, 'not-found', 'Template not found');
      }

      return reply.send({
        id: template.id,
        name: template.name,
        credentialType: template.credentialType,
        schema: template.schema,
        requiredAttributes: template.requiredAttributes,
        optionalAttributes: template.optionalAttributes,
        defaultExpiryDays: template.defaultExpiryDays,
        isActive: template.isActive,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // PATCH /api/v1/templates/:id - Update a template
  fastify.patch('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const body = updateTemplateSchema.parse(request.body);
      const issuer = await getIssuerProfile(request.currentUser!.id);

      if (!issuer) {
        throw new AppError(404, 'not-found', 'Template not found');
      }

      const existing = await fastify.prisma.credentialTemplate.findFirst({
        where: { id, issuerId: issuer.id },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'Template not found');
      }

      const updated = await fastify.prisma.credentialTemplate.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.schema && { schema: body.schema }),
          ...(body.requiredAttributes && { requiredAttributes: body.requiredAttributes }),
          ...(body.optionalAttributes && { optionalAttributes: body.optionalAttributes }),
          ...(body.defaultExpiryDays !== undefined && { defaultExpiryDays: body.defaultExpiryDays }),
        },
      });

      logger.info('Credential template updated', { templateId: id });

      return reply.send({
        id: updated.id,
        name: updated.name,
        credentialType: updated.credentialType,
        schema: updated.schema,
        requiredAttributes: updated.requiredAttributes,
        optionalAttributes: updated.optionalAttributes,
        defaultExpiryDays: updated.defaultExpiryDays,
        isActive: updated.isActive,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // DELETE /api/v1/templates/:id - Deactivate a template
  fastify.delete('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const issuer = await getIssuerProfile(request.currentUser!.id);

      if (!issuer) {
        throw new AppError(404, 'not-found', 'Template not found');
      }

      const existing = await fastify.prisma.credentialTemplate.findFirst({
        where: { id, issuerId: issuer.id },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'Template not found');
      }

      const updated = await fastify.prisma.credentialTemplate.update({
        where: { id },
        data: { isActive: false },
      });

      logger.info('Credential template deactivated', { templateId: id });

      return reply.send({
        id: updated.id,
        name: updated.name,
        isActive: updated.isActive,
        message: 'Template deactivated',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default templateRoutes;
