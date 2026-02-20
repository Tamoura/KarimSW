/**
 * Credential Routes - /api/v1/credentials
 *
 * W3C Verifiable Credential issuance, listing, retrieval, and revocation.
 * Claims are encrypted at rest using AES-256-GCM.
 *
 * - Issue: Issuer creates a credential offered to a holder DID
 * - List: User sees credentials where they are holder or issuer
 * - Get: Retrieve a specific credential with decrypted claims
 * - Revoke: Issuer revokes a credential
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

// ==================== Zod Schemas ====================

const issueCredentialSchema = z.object({
  holderDidId: z.string().uuid('Invalid holder DID ID'),
  issuerDidId: z.string().uuid('Invalid issuer DID ID'),
  credentialType: z.string().min(1).max(100),
  claims: z.record(z.unknown()),
  expiresAt: z.string().datetime().optional(),
});

const revokeSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ==================== Crypto Helpers ====================

function getEncryptionKey(): Buffer {
  const key = process.env.CLAIMS_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('CLAIMS_ENCRYPTION_KEY is required');
  }
  return Buffer.from(key, 'hex');
}

function encryptClaims(claims: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(claims);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptClaims(encryptedClaims: string): Record<string, unknown> {
  const key = getEncryptionKey();
  const [ivB64, tagB64, dataB64] = encryptedClaims.split(':');

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString('utf8'));
}

/**
 * Build a minimal proof object (Ed25519Signature2020 placeholder).
 */
function buildProof(issuerDid: string) {
  return {
    type: 'Ed25519Signature2020',
    created: new Date().toISOString(),
    verificationMethod: `${issuerDid}#key-1`,
    proofPurpose: 'assertionMethod',
    proofValue: randomBytes(64).toString('base64'),
  };
}

// ==================== Routes ====================

const credentialRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/credentials - Issue a credential
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = issueCredentialSchema.parse(request.body);

      // Verify the issuer DID belongs to the authenticated user
      const issuerDid = await fastify.prisma.dID.findFirst({
        where: { id: body.issuerDidId, userId: request.currentUser!.id },
      });

      if (!issuerDid) {
        throw new AppError(403, 'forbidden', 'Issuer DID does not belong to authenticated user');
      }

      if (issuerDid.status !== 'ACTIVE') {
        throw new AppError(400, 'bad-request', 'Issuer DID is not active');
      }

      // Verify the holder DID exists
      const holderDid = await fastify.prisma.dID.findUnique({
        where: { id: body.holderDidId },
      });

      if (!holderDid) {
        throw new AppError(404, 'not-found', 'Holder DID not found');
      }

      // Encrypt claims
      const encryptedClaims = encryptClaims(body.claims);

      // Build proof
      const proof = buildProof(issuerDid.did);

      // Hash for blockchain anchoring
      const credentialHash = createHash('sha256')
        .update(JSON.stringify({
          issuerDid: issuerDid.did,
          holderDid: holderDid.did,
          credentialType: body.credentialType,
          claims: body.claims,
          issuedAt: new Date().toISOString(),
        }))
        .digest('hex');

      const credential = await fastify.prisma.credential.create({
        data: {
          holderDidId: body.holderDidId,
          issuerDidId: body.issuerDidId,
          credentialType: body.credentialType,
          encryptedClaims,
          proof,
          credentialHash,
          status: 'OFFERED',
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        },
      });

      logger.info('Credential issued', {
        credentialId: credential.id,
        type: body.credentialType,
        issuerDid: issuerDid.did,
        holderDid: holderDid.did,
      });

      return reply.code(201).send({
        id: credential.id,
        credentialType: credential.credentialType,
        status: credential.status,
        credentialHash: credential.credentialHash,
        proof: credential.proof,
        issuedAt: credential.issuedAt.toISOString(),
        expiresAt: credential.expiresAt?.toISOString() || null,
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

  // GET /api/v1/credentials - List credentials
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const query = request.query as { role?: string };
      const userId = request.currentUser!.id;

      // Get user's DID IDs
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);

      let whereClause;
      if (query.role === 'issuer') {
        whereClause = { issuerDidId: { in: didIds } };
      } else if (query.role === 'holder') {
        whereClause = { holderDidId: { in: didIds } };
      } else {
        // Default: show all credentials where user is holder or issuer
        whereClause = {
          OR: [
            { holderDidId: { in: didIds } },
            { issuerDidId: { in: didIds } },
          ],
        };
      }

      const credentials = await fastify.prisma.credential.findMany({
        where: whereClause,
        orderBy: { issuedAt: 'desc' },
        select: {
          id: true,
          credentialType: true,
          status: true,
          issuedAt: true,
          expiresAt: true,
          revokedAt: true,
          holderDidId: true,
          issuerDidId: true,
        },
      });

      return reply.send({
        credentials: credentials.map((c) => ({
          ...c,
          issuedAt: c.issuedAt.toISOString(),
          expiresAt: c.expiresAt?.toISOString() || null,
          revokedAt: c.revokedAt?.toISOString() || null,
        })),
        total: credentials.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/credentials/:id - Get a specific credential
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      // Get user's DID IDs
      const userDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const didIds = userDids.map((d) => d.id);

      const credential = await fastify.prisma.credential.findFirst({
        where: {
          id,
          OR: [
            { holderDidId: { in: didIds } },
            { issuerDidId: { in: didIds } },
          ],
        },
        include: {
          holderDid: { select: { did: true, status: true } },
          issuerDid: { select: { did: true, status: true } },
        },
      });

      if (!credential) {
        throw new AppError(404, 'not-found', 'Credential not found');
      }

      // Decrypt claims for the authorized user
      let claims: Record<string, unknown> | null = null;
      try {
        claims = decryptClaims(credential.encryptedClaims);
      } catch {
        logger.warn('Failed to decrypt claims', { credentialId: id });
      }

      return reply.send({
        id: credential.id,
        credentialType: credential.credentialType,
        status: credential.status,
        claims,
        proof: credential.proof,
        credentialHash: credential.credentialHash,
        holderDid: credential.holderDid.did,
        issuerDid: credential.issuerDid.did,
        issuedAt: credential.issuedAt.toISOString(),
        expiresAt: credential.expiresAt?.toISOString() || null,
        revokedAt: credential.revokedAt?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/credentials/:id/revoke - Revoke a credential
  fastify.post('/:id/revoke', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const body = revokeSchema.parse(request.body || {});
      const userId = request.currentUser!.id;

      // Get issuer's DID IDs
      const issuerDids = await fastify.prisma.dID.findMany({
        where: { userId },
        select: { id: true },
      });
      const issuerDidIds = issuerDids.map((d) => d.id);

      const credential = await fastify.prisma.credential.findUnique({
        where: { id },
      });

      if (!credential) {
        throw new AppError(404, 'not-found', 'Credential not found');
      }

      // Only the issuer can revoke
      if (!issuerDidIds.includes(credential.issuerDidId)) {
        throw new AppError(403, 'forbidden', 'Only the issuer can revoke a credential');
      }

      if (credential.status === 'REVOKED') {
        throw new AppError(400, 'bad-request', 'Credential is already revoked');
      }

      const updated = await fastify.prisma.credential.update({
        where: { id },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });

      logger.info('Credential revoked', {
        credentialId: id,
        reason: body.reason,
        revokedBy: userId,
      });

      return reply.send({
        id: updated.id,
        status: updated.status,
        revokedAt: updated.revokedAt?.toISOString(),
        message: 'Credential has been revoked',
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
};

export default credentialRoutes;
