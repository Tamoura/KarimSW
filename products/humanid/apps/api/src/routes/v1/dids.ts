/**
 * DID Routes - /api/v1/dids
 *
 * CRUD operations for Decentralized Identifiers (W3C DID spec).
 * Generates Ed25519 key pairs, creates did:humanid identifiers,
 * and manages DID documents with versioning.
 *
 * All endpoints require JWT authentication.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

// ==================== Zod Schemas ====================

const updateDidSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

// ==================== Helpers ====================

/**
 * Generate a base58-encoded key pair simulation.
 * In production this would use Ed25519 via libsodium or noble-ed25519.
 * For H1 foundation, we generate random bytes as placeholders.
 */
function generateKeyPair() {
  const privateKeyBytes = randomBytes(32);
  const publicKeyBytes = randomBytes(32);
  return {
    publicKey: publicKeyBytes.toString('base64url'),
    privateKey: privateKeyBytes.toString('base64url'),
  };
}

/**
 * Build a did:humanid identifier from a public key.
 */
function buildDid(publicKey: string): string {
  return `did:humanid:${publicKey}`;
}

/**
 * Build a minimal W3C DID Document.
 */
function buildDidDocument(did: string, publicKey: string) {
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/ed2519-2020/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#key-1`,
        type: 'Ed25519VerificationKey2020',
        controller: did,
        publicKeyMultibase: `z${publicKey}`,
      },
    ],
    authentication: [`${did}#key-1`],
    assertionMethod: [`${did}#key-1`],
  };
}

// ==================== Routes ====================

const didRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/dids - Create a new DID
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { publicKey } = generateKeyPair();
      const did = buildDid(publicKey);
      const document = buildDidDocument(did, publicKey);
      const documentHash = createHash('sha256')
        .update(JSON.stringify(document))
        .digest('hex');

      const didRecord = await fastify.prisma.dID.create({
        data: {
          userId: request.currentUser!.id,
          did,
          method: 'humanid',
          publicKey,
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

      logger.info('DID created', { userId: request.currentUser!.id, did });

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

      // Only allow updating own DIDs
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
