/**
 * DID Routes - /api/v1/dids
 *
 * CRUD operations for Decentralized Identifiers (W3C DID spec).
 * Generates real Ed25519 key pairs, creates did:humanid identifiers
 * with base58btc encoding, and manages DID documents with versioning.
 *
 * Private keys are encrypted at rest using AES-256-GCM.
 * All endpoints require JWT authentication.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  generateEd25519KeyPair,
  buildDidFromPublicKey,
  buildDidDocument,
  serializeKeyPair,
  multibaseEncode,
  VerificationMethodEntry,
} from '../../utils/did-crypto.js';
import { encryptPrivateKey } from '../../utils/encryption.js';

// ==================== Zod Schemas ====================

const updateDidSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

// ==================== Routes ====================

const didRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/dids - Create a new DID
  // Rate limited: 20 per hour per key (IP or user) to prevent DID creation abuse (RISK-006)
  fastify.post('/', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    try {
      await fastify.authenticate(request);

      // Generate real Ed25519 key pair
      const keyPair = generateEd25519KeyPair();
      const serialized = serializeKeyPair(keyPair);

      // Build DID and document
      const did = buildDidFromPublicKey(keyPair.publicKey);
      const document = buildDidDocument(did, keyPair.publicKey);
      const documentHash = createHash('sha256')
        .update(JSON.stringify(document))
        .digest('hex');

      // Encrypt private key for storage
      const encryptedPrivateKey = encryptPrivateKey(serialized.privateKeyHex);

      const didRecord = await fastify.prisma.dID.create({
        data: {
          userId: request.currentUser!.id,
          did,
          method: 'humanid',
          publicKey: serialized.publicKeyBase58,
          encryptedPrivateKey,
          status: 'ACTIVE',
        },
      });

      // Create initial DID document (version 1)
      await fastify.prisma.dIDDocument.create({
        data: {
          didId: didRecord.id,
          version: 1,
          document,
          documentHash,
        },
      });

      logger.info('DID created with Ed25519 key pair', { userId: request.currentUser!.id, did });

      return reply.code(201).send({
        id: didRecord.id,
        did: didRecord.did,
        method: didRecord.method,
        publicKey: didRecord.publicKey,
        status: didRecord.status,
        createdAt: didRecord.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/dids - List user's DIDs
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const dids = await fastify.prisma.dID.findMany({
        where: { userId: request.currentUser!.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          did: true,
          method: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return reply.send({
        dids: dids.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
          updatedAt: d.updatedAt.toISOString(),
        })),
        total: dids.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/dids/:id - Resolve a DID
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };

      const didRecord = await fastify.prisma.dID.findFirst({
        where: { id, userId: request.currentUser!.id },
        include: {
          documents: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      if (!didRecord) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      const latestDoc = didRecord.documents[0] || null;

      return reply.send({
        id: didRecord.id,
        did: didRecord.did,
        method: didRecord.method,
        publicKey: didRecord.publicKey,
        status: didRecord.status,
        document: latestDoc?.document || null,
        documentVersion: latestDoc?.version || null,
        createdAt: didRecord.createdAt.toISOString(),
        updatedAt: didRecord.updatedAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // PATCH /api/v1/dids/:id - Update DID status
  fastify.patch('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const body = updateDidSchema.parse(request.body);

      const existing = await fastify.prisma.dID.findFirst({
        where: { id, userId: request.currentUser!.id },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      if (existing.status === 'DEACTIVATED') {
        throw new AppError(400, 'bad-request', 'Cannot update a deactivated DID');
      }

      const updated = await fastify.prisma.dID.update({
        where: { id },
        data: { status: body.status },
      });

      logger.info('DID status updated', { didId: id, status: body.status });

      return reply.send({
        id: updated.id,
        did: updated.did,
        method: updated.method,
        publicKey: updated.publicKey,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
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

  // POST /api/v1/dids/:id/rotate - Rotate DID key pair
  fastify.post('/:id/rotate', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };

      const existing = await fastify.prisma.dID.findFirst({
        where: { id, userId: request.currentUser!.id },
        include: {
          documents: {
            orderBy: { version: 'desc' },
            take: 1,
          },
        },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      if (existing.status !== 'ACTIVE') {
        throw new AppError(
          400,
          'bad-request',
          `Cannot rotate key for a ${existing.status.toLowerCase()} DID`
        );
      }

      // Generate new key pair
      const newKeyPair = generateEd25519KeyPair();
      const serialized = serializeKeyPair(newKeyPair);
      const encryptedNewKey = encryptPrivateKey(serialized.privateKeyHex);

      // Build updated DID document with old + new keys
      const latestDoc = existing.documents[0];
      const currentVersion = latestDoc?.version || 1;
      const newVersion = currentVersion + 1;
      const newKeyId = `${existing.did}#key-${newVersion}`;

      // Collect existing verification methods and mark them all as revoked
      const existingVMs: VerificationMethodEntry[] =
        latestDoc?.document &&
        (latestDoc.document as Record<string, unknown>).verificationMethod
          ? (
              (latestDoc.document as Record<string, unknown>)
                .verificationMethod as VerificationMethodEntry[]
            ).map((vm) => ({ ...vm, revoked: true }))
          : [
              {
                id: `${existing.did}#key-1`,
                type: 'Ed25519VerificationKey2020',
                controller: existing.did,
                publicKeyMultibase: multibaseEncode(
                  Buffer.from(existing.publicKey, 'base64')
                ),
                revoked: true,
              },
            ];

      // Add new key
      const newVM: VerificationMethodEntry = {
        id: newKeyId,
        type: 'Ed25519VerificationKey2020',
        controller: existing.did,
        publicKeyMultibase: multibaseEncode(newKeyPair.publicKey),
      };

      const verificationMethods = [...existingVMs, newVM];

      // Carry forward services from current document
      const currentServices =
        latestDoc?.document &&
        (latestDoc.document as Record<string, unknown>).service
          ? ((latestDoc.document as Record<string, unknown>).service as Array<{
              id: string;
              type: string;
              serviceEndpoint: string;
            }>)
          : [];

      const document = buildDidDocument(existing.did, newKeyPair.publicKey, {
        verificationMethods,
        activeKeyId: newKeyId,
        services: currentServices,
      });

      const documentHash = createHash('sha256')
        .update(JSON.stringify(document))
        .digest('hex');

      // Update DID record and create new document version in a transaction
      await fastify.prisma.$transaction([
        fastify.prisma.dID.update({
          where: { id },
          data: {
            publicKey: serialized.publicKeyBase58,
            encryptedPrivateKey: encryptedNewKey,
          },
        }),
        fastify.prisma.dIDDocument.create({
          data: {
            didId: id,
            version: newVersion,
            document,
            documentHash,
          },
        }),
      ]);

      logger.info('DID key rotated', {
        didId: id,
        newVersion,
        userId: request.currentUser!.id,
      });

      return reply.send({
        id: existing.id,
        did: existing.did,
        publicKey: serialized.publicKeyBase58,
        documentVersion: newVersion,
        status: existing.status,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // DELETE /api/v1/dids/:id - Deactivate a DID (soft delete)
  fastify.delete('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };

      const existing = await fastify.prisma.dID.findFirst({
        where: { id, userId: request.currentUser!.id },
      });

      if (!existing) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      if (existing.status === 'DEACTIVATED') {
        throw new AppError(400, 'bad-request', 'DID is already deactivated');
      }

      const updated = await fastify.prisma.dID.update({
        where: { id },
        data: { status: 'DEACTIVATED' },
      });

      logger.info('DID deactivated', { didId: id });

      return reply.send({
        id: updated.id,
        did: updated.did,
        status: updated.status,
        message: 'DID has been permanently deactivated',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default didRoutes;
