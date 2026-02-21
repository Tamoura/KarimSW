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
import { createHash, randomBytes } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { buildEd25519Proof, deserializePrivateKey } from '../../utils/did-crypto.js';
import { encryptClaims, decryptClaims, decryptPrivateKey } from '../../utils/encryption.js';

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

      // Use a single timestamp for both the signed data and the proof
      const issuanceTimestamp = new Date().toISOString();

      // Build the credential data that will be signed
      const credentialData = JSON.stringify({
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential', body.credentialType],
        issuer: issuerDid.did,
        credentialSubject: {
          id: holderDid.did,
          ...body.claims,
        },
        issuanceDate: issuanceTimestamp,
      });

      const credentialHash = createHash('sha256')
        .update(credentialData)
        .digest('hex');

      // Sign with real Ed25519 key (decrypt issuer's private key)
      let proof;
      if (issuerDid.encryptedPrivateKey) {
        const privateKeyHex = decryptPrivateKey(issuerDid.encryptedPrivateKey);
        const privateKey = deserializePrivateKey(privateKeyHex);
        const baseProof = buildEd25519Proof(issuerDid.did, credentialData, privateKey);
        proof = {
          ...baseProof,
          created: issuanceTimestamp, // Override with exact issuanceDate for verifiable reconstruction
          signedDataHash: credentialHash,
        };
      } else {
        // Fallback for DIDs created before H2 (no encrypted private key)
        proof = {
          type: 'Ed25519Signature2020',
          created: issuanceTimestamp,
          verificationMethod: `${issuerDid.did}#key-1`,
          proofPurpose: 'assertionMethod',
          proofValue: randomBytes(64).toString('base64'),
          legacy: true,
        };
      }

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

      const query = request.query as { role?: string; page?: string; limit?: string };
      const userId = request.currentUser!.id;
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

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

      const [credentials, total] = await Promise.all([
        fastify.prisma.credential.findMany({
          where: whereClause,
          orderBy: { issuedAt: 'desc' },
          skip,
          take: limit,
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
        }),
        fastify.prisma.credential.count({ where: whereClause }),
      ]);

      return reply.send({
        credentials: credentials.map((c) => ({
          ...c,
          issuedAt: c.issuedAt.toISOString(),
          expiresAt: c.expiresAt?.toISOString() || null,
          revokedAt: c.revokedAt?.toISOString() || null,
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
