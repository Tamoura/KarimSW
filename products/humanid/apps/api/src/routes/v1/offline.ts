/**
 * Offline Credential Presentation Routes - /api/v1/offline
 *
 * Pre-signed credential bundles for BLE/NFC exchange without internet.
 * Supports token generation, offline verification, and sync-back.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, createHmac } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { deriveHmacKey, timingSafeCompare } from '../../utils/encryption.js';

const createTokenSchema = z.object({
  credentialId: z.string().uuid(),
  expiresInHours: z.number().int().min(1).max(720), // max 30 days
});

const verifySchema = z.object({
  tokenId: z.string().uuid(),
  payload: z.record(z.unknown()),
  signature: z.string(),
});

const syncSchema = z.object({
  tokenId: z.string().uuid(),
  verifiedAt: z.string(),
  verifierInfo: z.record(z.unknown()).optional(),
});

const offlineRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/offline/tokens - Generate offline token
  fastify.post('/tokens', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const body = createTokenSchema.parse(request.body);

      // Verify credential belongs to user (as holder)
      const credential = await fastify.prisma.credential.findFirst({
        where: {
          id: body.credentialId,
          holderDid: { userId },
          status: 'ACTIVE',
        },
        include: {
          holderDid: true,
          issuerDid: true,
        },
      });

      if (!credential) {
        throw new AppError(404, 'not-found', 'Active credential not found');
      }

      const expiresAt = new Date(Date.now() + body.expiresInHours * 3600 * 1000);

      // Build offline payload
      const payload = {
        credential: {
          id: credential.id,
          type: credential.credentialType,
          credentialHash: credential.credentialHash,
          proof: credential.proof,
        },
        holderDid: credential.holderDid.did,
        issuerDid: credential.issuerDid.did,
        issuedAt: credential.issuedAt.toISOString(),
        offlineGeneratedAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
      };

      // Sign with HMAC using a derived secret key (not the public credential hash)
      const hmacKey = deriveHmacKey('offline-token', credential.id);
      const signature = createHmac('sha256', hmacKey)
        .update(JSON.stringify(payload))
        .digest('hex');

      const token = await fastify.prisma.offlineToken.create({
        data: {
          credentialId: credential.id,
          userId,
          payload,
          signature,
          expiresAt,
        },
      });

      logger.info('Offline token generated', { tokenId: token.id, credentialId: credential.id });

      return reply.code(201).send({
        id: token.id,
        payload: token.payload,
        signature: token.signature,
        expiresAt: token.expiresAt.toISOString(),
        createdAt: token.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/offline/tokens - List offline tokens
  fastify.get('/tokens', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page || '1') || 1);
      const limit = Math.max(1, Math.min(parseInt(query.limit || '50') || 50, 100));
      const skip = (page - 1) * limit;

      const where = { userId };
      const [tokens, total] = await Promise.all([
        fastify.prisma.offlineToken.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        fastify.prisma.offlineToken.count({ where }),
      ]);

      return reply.send({
        tokens: tokens.map(t => ({
          id: t.id,
          credentialId: t.credentialId,
          payload: t.payload,
          signature: t.signature,
          expiresAt: t.expiresAt.toISOString(),
          usedAt: t.usedAt?.toISOString() || null,
          syncedAt: t.syncedAt?.toISOString() || null,
          createdAt: t.createdAt.toISOString(),
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

  // POST /api/v1/offline/verify - Verify offline presentation (no auth - offline context)
  fastify.post('/verify', async (request, reply) => {
    try {
      const body = verifySchema.parse(request.body);

      const token = await fastify.prisma.offlineToken.findUnique({
        where: { id: body.tokenId },
      });

      if (!token) throw new AppError(404, 'not-found', 'Offline token not found');

      // Look up credential separately
      const credential = await fastify.prisma.credential.findUnique({
        where: { id: token.credentialId },
        include: { holderDid: true, issuerDid: true },
      });

      if (!credential) throw new AppError(404, 'not-found', 'Associated credential not found');

      // Verify signature using derived HMAC key (timing-safe comparison)
      const hmacKey = deriveHmacKey('offline-token', credential.id);
      const expectedSignature = createHmac('sha256', hmacKey)
        .update(JSON.stringify(body.payload))
        .digest('hex');

      const signatureValid = timingSafeCompare(body.signature, expectedSignature);
      const isExpired = token.expiresAt < new Date();
      const credentialActive = credential.status === 'ACTIVE';

      return reply.send({
        valid: signatureValid && !isExpired && credentialActive,
        signatureValid,
        expired: isExpired,
        credentialActive,
        credential: {
          id: credential.id,
          type: credential.credentialType,
          holderDid: credential.holderDid.did,
          issuerDid: credential.issuerDid.did,
        },
        expiresAt: token.expiresAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // POST /api/v1/offline/sync - Sync offline verification back
  fastify.post('/sync', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = syncSchema.parse(request.body);

      const token = await fastify.prisma.offlineToken.findUnique({
        where: { id: body.tokenId },
      });

      if (!token) throw new AppError(404, 'not-found', 'Offline token not found');

      await fastify.prisma.offlineToken.update({
        where: { id: body.tokenId },
        data: {
          usedAt: new Date(body.verifiedAt),
          syncedAt: new Date(),
        },
      });

      return reply.send({ message: 'Offline verification synced successfully' });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });
};

export default offlineRoutes;
