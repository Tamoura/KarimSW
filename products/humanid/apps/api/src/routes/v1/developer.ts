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
import { createHash } from 'crypto';
import { encryptPrivateKey, encryptClaims, reEncrypt } from '../../utils/encryption.js';
import { buildRequireAdmin } from '../../utils/middleware.js';

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  environment: z.enum(['SANDBOX', 'PRODUCTION']),
  permissions: z.object({
    read: z.boolean().optional().default(true),
    write: z.boolean().optional().default(true),
  }).optional(),
});

const keyRotationSchema = z.object({
  oldKeyHex: z.string().length(64, 'Key must be 64-char hex (32 bytes)'),
  newKeyHex: z.string().length(64, 'Key must be 64-char hex (32 bytes)'),
});

const developerRoutes: FastifyPluginAsync = async (fastify) => {
  const requireAdmin = buildRequireAdmin(fastify);
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

      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where = { userId: request.currentUser!.id };
      const [keys, total] = await Promise.all([
        fastify.prisma.apiKey.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
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
        }),
        fastify.prisma.apiKey.count({ where }),
      ]);

      return reply.send({
        keys: keys.map((k) => ({
          ...k,
          lastUsedAt: k.lastUsedAt?.toISOString() || null,
          createdAt: k.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
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
  // ==================== Sandbox ====================

  // POST /api/v1/developer/sandbox/seed - Generate test data
  fastify.post('/sandbox/seed', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      // Create test DIDs
      const testDids: { id: string; did: string }[] = [];
      for (let i = 0; i < 3; i++) {
        const { generateEd25519KeyPair, buildDidFromPublicKey, buildDidDocument, serializeKeyPair, base58Encode } = await import('../../utils/did-crypto.js');
        const keyPair = generateEd25519KeyPair();
        const serialized = serializeKeyPair(keyPair);
        const did = buildDidFromPublicKey(keyPair.publicKey);
        const document = buildDidDocument(did, keyPair.publicKey);
        const documentHash = createHash('sha256').update(JSON.stringify(document)).digest('hex');

        // Encrypt private key
        const encryptedPrivateKey = encryptPrivateKey(serialized.privateKeyHex);

        const didRecord = await fastify.prisma.dID.create({
          data: {
            userId,
            did,
            method: 'humanid',
            publicKey: serialized.publicKeyBase58,
            encryptedPrivateKey,
            status: 'ACTIVE',
          },
        });

        await fastify.prisma.dIDDocument.create({
          data: { didId: didRecord.id, version: 1, document, documentHash },
        });

        testDids.push({ id: didRecord.id, did: didRecord.did });
      }

      // Create test credentials between the DIDs
      const testCredentials: { id: string; type: string }[] = [];
      const credTypes = [
        { type: 'UniversityDegree', claims: { degree: 'BSc Computer Science', university: 'MIT', year: 2025 } },
        { type: 'EmploymentCertificate', claims: { employer: 'Acme Corp', role: 'Engineer', startDate: '2025-01-01' } },
        { type: 'GovernmentID', claims: { idNumber: 'TEST-123456', country: 'US', expiryDate: '2030-01-01' } },
      ];

      for (const ct of credTypes) {
        const issuerDidId = testDids[0].id;
        const holderDidId = testDids[1].id;

        const encryptedClaims = encryptClaims(ct.claims);

        const credentialHash = createHash('sha256').update(JSON.stringify(ct.claims)).digest('hex');

        const credential = await fastify.prisma.credential.create({
          data: {
            holderDidId,
            issuerDidId,
            credentialType: ct.type,
            encryptedClaims,
            proof: { type: 'Ed25519Signature2020', sandbox: true },
            credentialHash,
            status: 'OFFERED',
          },
        });

        testCredentials.push({ id: credential.id, type: ct.type });
      }

      logger.info('Sandbox seeded', { userId, dids: testDids.length, credentials: testCredentials.length });

      return reply.code(201).send({
        message: 'Sandbox environment seeded with test data',
        testDids,
        testCredentials,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/developer/sandbox/status - Sandbox status
  fastify.get('/sandbox/status', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const didCount = await fastify.prisma.dID.count({ where: { userId } });
      const credentialCount = await fastify.prisma.credential.count({
        where: {
          OR: [
            { holderDid: { userId } },
            { issuerDid: { userId } },
          ],
        },
      });
      const apiKeyCount = await fastify.prisma.apiKey.count({ where: { userId, status: 'ACTIVE' } });

      return reply.send({
        environment: 'SANDBOX',
        didCount,
        credentialCount,
        apiKeyCount,
        features: {
          unlimitedRateLimit: true,
          testCredentials: true,
          noBlockchainAnchoring: true,
        },
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // ==================== Encryption Key Rotation ====================

  // POST /api/v1/developer/rotate-encryption-key - Re-encrypt all data with new key (admin only)
  fastify.post('/rotate-encryption-key', async (request, reply) => {
    try {
      await requireAdmin(request);
      const body = keyRotationSchema.parse(request.body);

      // Validate old key matches current environment key
      const currentKey = process.env.CLAIMS_ENCRYPTION_KEY;
      if (!currentKey || currentKey !== body.oldKeyHex) {
        throw new AppError(400, 'bad-request', 'Provided old key does not match current CLAIMS_ENCRYPTION_KEY');
      }

      let credentialsMigrated = 0;
      let didsMigrated = 0;
      let webhooksMigrated = 0;
      let skipped = 0;

      // Re-encrypt credential claims
      const credentials = await fastify.prisma.credential.findMany({
        select: { id: true, encryptedClaims: true },
      });
      for (const cred of credentials) {
        if (!cred.encryptedClaims) continue;
        try {
          const reEncrypted = reEncrypt(cred.encryptedClaims, body.oldKeyHex, body.newKeyHex);
          await fastify.prisma.credential.update({
            where: { id: cred.id },
            data: { encryptedClaims: reEncrypted },
          });
          credentialsMigrated++;
        } catch {
          skipped++;
        }
      }

      // Re-encrypt DID private keys
      const dids = await fastify.prisma.dID.findMany({
        select: { id: true, encryptedPrivateKey: true },
      });
      for (const did of dids) {
        if (!did.encryptedPrivateKey) continue;
        try {
          const reEncrypted = reEncrypt(did.encryptedPrivateKey, body.oldKeyHex, body.newKeyHex);
          await fastify.prisma.dID.update({
            where: { id: did.id },
            data: { encryptedPrivateKey: reEncrypted },
          });
          didsMigrated++;
        } catch {
          skipped++;
        }
      }

      // Re-encrypt webhook secrets (only those in iv:tag:data format)
      const webhooks = await fastify.prisma.webhook.findMany({
        select: { id: true, secret: true },
      });
      for (const wh of webhooks) {
        if (!wh.secret || !wh.secret.includes(':')) continue;
        try {
          const reEncrypted = reEncrypt(wh.secret, body.oldKeyHex, body.newKeyHex);
          await fastify.prisma.webhook.update({
            where: { id: wh.id },
            data: { secret: reEncrypted },
          });
          webhooksMigrated++;
        } catch {
          skipped++;
        }
      }

      logger.info('Encryption key rotation complete', {
        credentialsMigrated,
        didsMigrated,
        webhooksMigrated,
      });

      return reply.send({
        message: 'Encryption key rotation complete. Update CLAIMS_ENCRYPTION_KEY env var to the new key.',
        credentialsMigrated,
        didsMigrated,
        webhooksMigrated,
        skipped,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // ==================== Request Logs ====================

  // GET /api/v1/developer/logs - Request log history
  fastify.get('/logs', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;
      const query = request.query as { page?: string; limit?: string; action?: string };

      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where: Record<string, unknown> = { userId };
      if (query.action) {
        if (query.action.length > 100) {
          throw new AppError(400, 'bad-request', 'Action filter too long');
        }
        where.action = query.action;
      }

      const [logs, total] = await Promise.all([
        fastify.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            metadata: true,
            ipAddress: true,
            createdAt: true,
          },
        }),
        fastify.prisma.auditLog.count({ where }),
      ]);

      return reply.send({
        logs: logs.map((l) => ({
          ...l,
          createdAt: l.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize: limit,
        totalPages: Math.ceil(total / limit),
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
