/**
 * Developer Routes - /api/v1/developer
 *
 * API key lifecycle management: create, list, rotate, revoke.
 * Usage statistics and request logging for developer dashboard.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { generateApiKey, hashApiKey, getApiKeyPrefix } from '../../utils/crypto.js';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  permissions: z.object({
    read: z.boolean().optional().default(true),
    write: z.boolean().optional().default(true),
  }).optional(),
});

const developerRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/developer/keys - Create API key
  fastify.post('/keys', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = createKeySchema.parse(request.body);
      const userId = request.currentUser!.id;

      const rawKey = generateApiKey('sk');
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = getApiKeyPrefix(rawKey);

      const apiKey = await fastify.prisma.apiKey.create({
        data: {
          userId,
          keyHash,
          keyPrefix,
          name: body.name,
          environment: body.environment,
          status: 'ACTIVE',
          permissions: body.permissions || { read: true, write: true },
          rateLimit: body.environment === 'SANDBOX' ? 1000 : 100,
        },
      });

      logger.info('API key created', {
        keyId: apiKey.id,
        userId,
        environment: body.environment,
      });

      return reply.code(201).send({
        id: apiKey.id,
        key: rawKey, // Only returned once at creation
        keyPrefix: apiKey.keyPrefix,
        name: apiKey.name,
        environment: apiKey.environment,
        status: apiKey.status,
        permissions: apiKey.permissions,
        rateLimit: apiKey.rateLimit,
        createdAt: apiKey.createdAt.toISOString(),
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

  // GET /api/v1/developer/keys - List API keys
  fastify.get('/keys', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const keys = await fastify.prisma.apiKey.findMany({
        where: { userId: request.currentUser!.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          keyPrefix: true,
          name: true,
          environment: true,
          status: true,
          permissions: true,
          rateLimit: true,
          lastUsedAt: true,
          createdAt: true,
        },
      });

      return reply.send({
        keys: keys.map((k) => ({
          ...k,
          lastUsedAt: k.lastUsedAt?.toISOString() || null,
          createdAt: k.createdAt.toISOString(),
        })),
        total: keys.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/developer/keys/:id/rotate - Rotate API key
  fastify.post('/keys/:id/rotate', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const existing = await fastify.prisma.apiKey.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'API key not found');
      }

      if (existing.status !== 'ACTIVE') {
        throw new AppError(400, 'bad-request', 'Cannot rotate a revoked key');
      }

      // Revoke old key and create new one
      await fastify.prisma.apiKey.update({
        where: { id },
        data: { status: 'REVOKED' },
      });

      const rawKey = generateApiKey('sk');
      const keyHash = hashApiKey(rawKey);
      const keyPrefix = getApiKeyPrefix(rawKey);

      const newKey = await fastify.prisma.apiKey.create({
        data: {
          userId,
          keyHash,
          keyPrefix,
          name: existing.name,
          environment: existing.environment,
          status: 'ACTIVE',
          permissions: existing.permissions || { read: true, write: true },
          rateLimit: existing.rateLimit,
        },
      });

      logger.info('API key rotated', {
        oldKeyId: id,
        newKeyId: newKey.id,
        userId,
      });

      return reply.send({
        id: newKey.id,
        key: rawKey,
        keyPrefix: newKey.keyPrefix,
        name: newKey.name,
        environment: newKey.environment,
        status: newKey.status,
        message: 'Key rotated. Old key has been revoked.',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // DELETE /api/v1/developer/keys/:id - Revoke API key
  fastify.delete('/keys/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const existing = await fastify.prisma.apiKey.findFirst({
        where: { id, userId },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'API key not found');
      }

      const updated = await fastify.prisma.apiKey.update({
        where: { id },
        data: { status: 'REVOKED' },
      });

      logger.info('API key revoked', { keyId: id, userId });

      return reply.send({
        id: updated.id,
        status: updated.status,
        message: 'API key revoked',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/developer/keys/usage - Usage statistics
  fastify.get('/keys/usage', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const userId = request.currentUser!.id;

      const keys = await fastify.prisma.apiKey.findMany({
        where: { userId },
        select: { id: true, status: true, lastUsedAt: true },
      });

      const totalKeys = keys.length;
      const activeKeys = keys.filter((k) => k.status === 'ACTIVE').length;

      // Count API-authenticated audit log entries
      const totalRequests = await fastify.prisma.auditLog.count({
        where: { userId },
      });

      return reply.send({
        totalKeys,
        activeKeys,
        revokedKeys: totalKeys - activeKeys,
        totalRequests,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default developerRoutes;
