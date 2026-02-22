/**
 * Presentation Routes - /api/v1/presentations
 *
 * W3C Verifiable Presentation creation, listing, retrieval, and revocation.
 * Supports FULL (all claims) and SELECTIVE (hash-based disclosure) proof types.
 *
 * - Create: Holder creates a presentation from a credential
 * - List: Holder sees their presentations (paginated)
 * - Get: Retrieve presentation with disclosed/hashed data
 * - Revoke: Holder revokes a shared presentation
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  buildEd25519Proof,
  deserializePrivateKey,
} from '../../utils/did-crypto.js';
import { decryptClaims, decryptPrivateKey } from '../../utils/encryption.js';

// ==================== Zod Schemas ====================

const createPresentationSchema = z
  .object({
    credentialId: z.string().uuid('Invalid credential ID'),
    holderDidId: z.string().uuid('Invalid holder DID ID'),
    verifierDidId: z.string().uuid('Invalid verifier DID ID').optional(),
    proofType: z.enum(['FULL', 'SELECTIVE']),
    disclosedAttributes: z.array(z.string().min(1)).optional(),
  })
  .refine(
    (data) => {
      if (data.proofType === 'SELECTIVE') {
        return (
          data.disclosedAttributes &&
          data.disclosedAttributes.length > 0
        );
      }
      return true;
    },
    {
      message:
        'disclosedAttributes is required for SELECTIVE proof type',
      path: ['disclosedAttributes'],
    }
  );

// ==================== Routes ====================

const presentationRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/presentations - Create a presentation
  fastify.post('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = createPresentationSchema.parse(request.body);
      const userId = request.currentUser!.id;

      // Verify holder DID belongs to authenticated user
      const holderDid = await fastify.prisma.dID.findFirst({
        where: { id: body.holderDidId, userId },
      });

      if (!holderDid) {
        throw new AppError(
          403,
          'forbidden',
          'Holder DID does not belong to authenticated user'
        );
      }

      // Fetch the credential and verify it belongs to this holder
      const credential = await fastify.prisma.credential.findUnique({
        where: { id: body.credentialId },
        include: {
          issuerDid: { select: { did: true } },
          holderDid: { select: { did: true, id: true } },
        },
      });

      if (!credential) {
        throw new AppError(404, 'not-found', 'Credential not found');
      }

      if (credential.holderDidId !== body.holderDidId) {
        throw new AppError(
          403,
          'forbidden',
          'Credential does not belong to the specified holder DID'
        );
      }

      // Decrypt claims
      let claims: Record<string, unknown>;
      try {
        claims = decryptClaims(credential.encryptedClaims);
      } catch {
        throw new AppError(
          500,
          'decryption-failed',
          'Failed to decrypt credential claims'
        );
      }

      // Determine disclosed attributes
      const allClaimKeys = Object.keys(claims);
      let disclosedAttributes: string[];

      if (body.proofType === 'FULL') {
        disclosedAttributes = allClaimKeys;
      } else {
        disclosedAttributes = body.disclosedAttributes!;
        // Validate all disclosed attributes exist in the credential claims
        const invalidAttrs = disclosedAttributes.filter(
          (attr) => !allClaimKeys.includes(attr)
        );
        if (invalidAttrs.length > 0) {
          throw new AppError(
            400,
            'bad-request',
            `Disclosed attributes not found in credential: ${invalidAttrs.join(', ')}`
          );
        }
      }

      // Build presentation data
      const disclosed: Record<string, unknown> = {};
      const hashed: Record<string, string> = {};

      for (const key of allClaimKeys) {
        if (disclosedAttributes.includes(key)) {
          disclosed[key] = claims[key];
        } else {
          hashed[key] = createHash('sha256')
            .update(`${key}\0${claims[key]}`)
            .digest('hex');
        }
      }

      const presentationData = {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        holder: holderDid.did,
        verifiableCredential: {
          credentialId: credential.id,
          issuer: credential.issuerDid.did,
          credentialType: credential.credentialType,
        },
        disclosed,
        hashed,
      };

      // Sign presentation with holder's Ed25519 key (required)
      if (!holderDid.encryptedPrivateKey) {
        throw new AppError(
          400,
          'signing-failed',
          'Holder DID does not have a signing key. Rotate the DID to add an encrypted private key before creating presentations.'
        );
      }

      const presentationJson = JSON.stringify(presentationData);
      const privateKeyHex = decryptPrivateKey(holderDid.encryptedPrivateKey);
      const privateKey = deserializePrivateKey(privateKeyHex);
      const proof = buildEd25519Proof(
        holderDid.did,
        presentationJson,
        privateKey
      );

      // Store in database
      const presentation =
        await fastify.prisma.credentialPresentation.create({
          data: {
            credentialId: credential.id,
            holderDidId: body.holderDidId,
            verifierDidId: body.verifierDidId || null,
            disclosedAttributes,
            proofType: body.proofType,
            status: 'ACTIVE',
            presentedAt: new Date(),
          },
        });

      logger.info('Presentation created', {
        presentationId: presentation.id,
        credentialId: credential.id,
        proofType: body.proofType,
        disclosedCount: disclosedAttributes.length,
        totalClaims: allClaimKeys.length,
      });

      return reply.code(201).send({
        id: presentation.id,
        credentialId: presentation.credentialId,
        holderDid: holderDid.did,
        proofType: presentation.proofType,
        disclosedAttributes: presentation.disclosedAttributes,
        status: presentation.status,
        proof,
        presentedAt: presentation.presentedAt.toISOString(),
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

  // GET /api/v1/presentations - List holder's presentations
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const userId = request.currentUser!.id;
      const query = request.query as {
        page?: string;
        limit?: string;
      };
      const page = Math.max(1, parseInt(query.page || '1') || 1);
      const limit = Math.max(
        1,
        Math.min(parseInt(query.limit || '50') || 50, 100)
      );
      const skip = (page - 1) * limit;

      const where = { holderDid: { userId } };

      const [presentations, total] = await Promise.all([
        fastify.prisma.credentialPresentation.findMany({
          where,
          orderBy: { presentedAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            credentialId: true,
            holderDidId: true,
            proofType: true,
            disclosedAttributes: true,
            status: true,
            presentedAt: true,
            revokedAt: true,
          },
        }),
        fastify.prisma.credentialPresentation.count({ where }),
      ]);

      return reply.send({
        presentations: presentations.map((p) => ({
          ...p,
          presentedAt: p.presentedAt.toISOString(),
          revokedAt: p.revokedAt?.toISOString() || null,
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

  // GET /api/v1/presentations/:id - Get presentation details
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const presentation =
        await fastify.prisma.credentialPresentation.findFirst({
          where: {
            id,
            holderDid: { userId },
          },
          include: {
            credential: {
              select: {
                encryptedClaims: true,
                credentialType: true,
                issuerDid: { select: { did: true } },
              },
            },
            holderDid: { select: { did: true } },
          },
        });

      if (!presentation) {
        throw new AppError(404, 'not-found', 'Presentation not found');
      }

      // Build presentation data with disclosed/hashed claims
      let presentationData: {
        disclosed: Record<string, unknown>;
        hashed: Record<string, string>;
      } = { disclosed: {}, hashed: {} };

      try {
        const claims = decryptClaims(
          presentation.credential.encryptedClaims
        );
        const disclosedAttrs =
          presentation.disclosedAttributes as string[];
        const allClaimKeys = Object.keys(claims);

        const disclosed: Record<string, unknown> = {};
        const hashed: Record<string, string> = {};

        for (const key of allClaimKeys) {
          if (disclosedAttrs.includes(key)) {
            disclosed[key] = claims[key];
          } else {
            hashed[key] = createHash('sha256')
              .update(`${key}\0${claims[key]}`)
              .digest('hex');
          }
        }

        presentationData = { disclosed, hashed };
      } catch {
        logger.warn('Failed to decrypt claims for presentation', {
          presentationId: id,
        });
      }

      return reply.send({
        id: presentation.id,
        credentialId: presentation.credentialId,
        holderDid: presentation.holderDid.did,
        issuerDid: presentation.credential.issuerDid.did,
        credentialType: presentation.credential.credentialType,
        proofType: presentation.proofType,
        disclosedAttributes: presentation.disclosedAttributes,
        status: presentation.status,
        presentationData,
        presentedAt: presentation.presentedAt.toISOString(),
        revokedAt: presentation.revokedAt?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/presentations/:id/revoke - Revoke a presentation
  fastify.post('/:id/revoke', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const presentation =
        await fastify.prisma.credentialPresentation.findFirst({
          where: {
            id,
            holderDid: { userId },
          },
        });

      if (!presentation) {
        throw new AppError(404, 'not-found', 'Presentation not found');
      }

      if (presentation.status === 'REVOKED') {
        throw new AppError(
          400,
          'bad-request',
          'Presentation is already revoked'
        );
      }

      const updated =
        await fastify.prisma.credentialPresentation.update({
          where: { id },
          data: {
            status: 'REVOKED',
            revokedAt: new Date(),
          },
        });

      logger.info('Presentation revoked', {
        presentationId: id,
        revokedBy: userId,
      });

      return reply.send({
        id: updated.id,
        status: updated.status,
        revokedAt: updated.revokedAt?.toISOString(),
        message: 'Presentation has been revoked',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default presentationRoutes;
