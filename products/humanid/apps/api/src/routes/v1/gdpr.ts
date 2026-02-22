/**
 * GDPR Data Subject Rights Routes - /api/v1/me
 *
 * Implements three rights under GDPR:
 *   Art. 15 — Right of access:       GET  /api/v1/me/data
 *   Art. 20 — Right to portability:  GET  /api/v1/me/export
 *   Art. 17 — Right to erasure:      DELETE /api/v1/me
 *
 * All endpoints require a valid Bearer JWT.
 * No sensitive internal fields (passwordHash, encryptedPrivateKey) are returned.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

// ---------------------------------------------------------------------------
// Helper — collect all personal data for a user
// ---------------------------------------------------------------------------

async function collectUserData(fastify: { prisma: any }, userId: string) {
  const [user, dids, credentials, webhooks, apiKeys, auditLogs, orgMemberships] =
    await Promise.all([
      fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          emailVerified: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          // passwordHash intentionally excluded
        },
      }),
      fastify.prisma.dID.findMany({
        where: { userId },
        select: {
          id: true,
          did: true,
          method: true,
          publicKey: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          // encryptedPrivateKey intentionally excluded
        },
      }),
      fastify.prisma.credential.findMany({
        where: { holderDid: { userId } },
        select: {
          id: true,
          credentialType: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
        },
      }),
      fastify.prisma.webhook.findMany({
        where: { userId },
        select: {
          id: true,
          url: true,
          events: true,
          status: true,
          description: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      fastify.prisma.apiKey.findMany({
        where: { userId },
        select: {
          id: true,
          name: true,
          environment: true,
          status: true,
          lastUsedAt: true,
          createdAt: true,
          // keyHash intentionally excluded
        },
      }),
      fastify.prisma.auditLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 1000, // cap for export size
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
      fastify.prisma.organizationMember.findMany({
        where: { userId },
        select: {
          role: true,
          status: true,
          joinedAt: true,
          org: { select: { id: true, name: true } },
        },
      }),
    ]);

  return {
    profile: user,
    dids,
    credentials,
    webhooks,
    apiKeys,
    auditLogs,
    organizations: orgMemberships,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const rectifySchema = z.object({
  email: z.string().email('Invalid email format').optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' },
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const gdprRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/me/data — Art. 15 right of access
  fastify.get('/data', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      if (fastify.redis) {
        const key = `gdpr:data:${userId}`;
        const attempts = await fastify.redis.incr(key);
        if (attempts === 1) await fastify.redis.expire(key, 3600);
        if (attempts > 10) {
          throw new AppError(429, 'rate-limited', 'Too many data access requests. Try again later.');
        }
      }

      const data = await collectUserData(fastify, userId);

      if (!data.profile) {
        throw new AppError(404, 'not-found', 'User not found');
      }

      logger.info('GDPR data access', { userId, action: 'data-access' });
      return reply.send(data);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('GDPR data access error', error);
      throw new AppError(500, 'internal-error', 'Failed to retrieve personal data');
    }
  });

  // GET /api/v1/me/export — Art. 20 right to data portability
  fastify.get('/export', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      if (fastify.redis) {
        const key = `gdpr:export:${userId}`;
        const attempts = await fastify.redis.incr(key);
        if (attempts === 1) await fastify.redis.expire(key, 3600);
        if (attempts > 5) {
          throw new AppError(429, 'rate-limited', 'Too many export requests. Try again later.');
        }
      }

      const data = await collectUserData(fastify, userId);

      if (!data.profile) {
        throw new AppError(404, 'not-found', 'User not found');
      }

      const filename = `humanid-data-export-${userId}-${Date.now()}.json`;

      logger.info('GDPR data export', { userId, action: 'data-export' });

      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(data);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('GDPR data export error', error);
      throw new AppError(500, 'internal-error', 'Failed to export personal data');
    }
  });

  // DELETE /api/v1/me — Art. 17 right to erasure
  fastify.delete('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      // 3 attempts per day — erasure is a one-shot operation.
      if (fastify.redis) {
        const key = `gdpr:delete:${userId}`;
        const attempts = await fastify.redis.incr(key);
        if (attempts === 1) await fastify.redis.expire(key, 86400);
        if (attempts > 3) {
          throw new AppError(429, 'rate-limited', 'Too many delete requests. Try again tomorrow.');
        }
      }

      // Revoke the current access token (add to blocklist) so it cannot be
      // reused even though the user row will be gone (belt-and-suspenders).
      const authHeader = request.headers.authorization as string | undefined;
      if (authHeader && fastify.redis) {
        const token = authHeader.substring(7);
        try {
          const decoded = fastify.jwt.decode(token) as { jti?: string; exp?: number } | null;
          if (decoded?.jti) {
            const now = Math.floor(Date.now() / 1000);
            const ttl = decoded.exp ? decoded.exp - now : 900; // default 15 min
            if (ttl > 0) {
              await fastify.redis.set(`revoked:jwt:${decoded.jti}`, '1', 'EX', ttl);
            }
          }
        } catch {
          // Token decode errors are non-fatal here — user will not exist anyway
        }
      }

      // Delete the user; Prisma cascades all related data automatically.
      await fastify.prisma.user.delete({ where: { id: userId } });

      logger.info('GDPR account erasure', { userId, action: 'account-deleted' });

      return reply.send({
        message: 'Account and all associated data have been permanently deleted.',
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('GDPR account deletion error', error);
      throw new AppError(500, 'internal-error', 'Failed to delete account');
    }
  });

  // PATCH /api/v1/me — Art. 16 Right to Rectification
  fastify.patch('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      // Rate limit rectification requests: 10 per hour per user.
      if (fastify.redis) {
        const key = `gdpr:rectify:${userId}`;
        const attempts = await fastify.redis.incr(key);
        if (attempts === 1) await fastify.redis.expire(key, 3600);
        if (attempts > 10) {
          throw new AppError(429, 'rate-limited', 'Too many rectification requests. Try again later.');
        }
      }

      let body: z.infer<typeof rectifySchema>;
      try {
        body = rectifySchema.parse(request.body);
      } catch (zodErr) {
        if (zodErr instanceof z.ZodError) {
          return reply.code(400).send({
            type: 'https://humanid.dev/errors/validation-error',
            title: 'Validation Error',
            status: 400,
            detail: zodErr.errors.map((e) => e.message).join('; '),
            request_id: request.id,
          });
        }
        throw zodErr;
      }

      const updated = await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          ...(body.email && { email: body.email }),
        },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info('GDPR rectification', { userId, action: 'data-rectified', fields: Object.keys(body) });

      return reply.send({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        status: updated.status,
        emailVerified: updated.emailVerified,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('GDPR rectification error', error);
      throw new AppError(500, 'internal-error', 'Failed to update personal data');
    }
  });

  // POST /api/v1/me/restrict — Art. 18 Right to Restriction of Processing
  fastify.post('/restrict', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      // Rate limit restriction requests: 10 per hour per user.
      if (fastify.redis) {
        const key = `gdpr:restrict:${userId}`;
        const attempts = await fastify.redis.incr(key);
        if (attempts === 1) await fastify.redis.expire(key, 3600);
        if (attempts > 10) {
          throw new AppError(429, 'rate-limited', 'Too many restriction requests. Try again later.');
        }
      }

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, metadata: true },
      });

      if (!user) {
        throw new AppError(404, 'not-found', 'User not found');
      }

      const existing = (user.metadata as Record<string, unknown>) || {};
      const restrictedAt = new Date().toISOString();

      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          metadata: {
            ...existing,
            processingRestricted: true,
            restrictedAt,
          } as Prisma.InputJsonValue,
        },
      });

      logger.info('GDPR processing restriction applied', { userId, action: 'processing-restricted' });

      return reply.code(200).send({
        message: 'Processing restriction applied. Your data will not be processed further until lifted.',
        processingRestricted: true,
        restrictedAt,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('GDPR restriction error', error);
      throw new AppError(500, 'internal-error', 'Failed to apply processing restriction');
    }
  });
};

export default gdprRoutes;
