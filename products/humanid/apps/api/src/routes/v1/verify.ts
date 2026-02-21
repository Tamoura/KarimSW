/**
 * Verification Routes - /api/v1/verify
 *
 * Endpoints for creating and managing verification requests.
 * A verifier creates a request specifying which attributes they need
 * from a holder's credentials.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  verifyEd25519Proof,
  extractPublicKeyFromDid,
  verify as ed25519Verify,
} from '../../utils/did-crypto.js';
import { decryptClaims } from '../../utils/encryption.js';

// ==================== Zod Schemas ====================

const verifyCredentialSchema = z.object({
  credentialId: z.string().uuid('Invalid credential ID'),
});

const createRequestSchema = z.object({
  holderDid: z.string().min(1, 'Holder DID is required').regex(/^did:[a-z]+:.+$/, 'Invalid DID format (expected did:method:identifier)'),
  requestedAttributes: z.array(z.string().min(1).max(100)).min(1, 'At least one attribute is required').max(50, 'Maximum 50 attributes allowed'),
  expiresInHours: z.number().min(1).max(720).optional().default(24),
});

const verifyRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/verify/credentials - Verify a credential (4-step pipeline)
  fastify.post('/credentials', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = verifyCredentialSchema.parse(request.body);

      const credential = await fastify.prisma.credential.findUnique({
        where: { id: body.credentialId },
        include: {
          issuerDid: { select: { did: true, status: true, publicKey: true } },
          holderDid: { select: { did: true, status: true } },
        },
      });

      if (!credential) {
        throw new AppError(404, 'not-found', 'Credential not found');
      }

      const checks: Record<string, { passed: boolean; detail: string }> = {};

      // Step 1: Signature verification (real Ed25519 cryptographic check)
      try {
        const proof = credential.proof as {
          proofValue?: string;
          verificationMethod?: string;
          signedDataHash?: string;
          legacy?: boolean;
          created?: string;
        };
        if (proof.legacy) {
          checks.signature = { passed: false, detail: 'Legacy proof without real signature' };
        } else if (proof.proofValue && proof.verificationMethod && proof.signedDataHash) {
          // Verify data integrity: the credentialHash should match the signedDataHash
          const hashMatch = credential.credentialHash === proof.signedDataHash;
          if (!hashMatch) {
            checks.signature = { passed: false, detail: 'Credential data has been tampered with' };
          } else {
            // Verify issuer DID matches the proof's verification method
            const vmDid = proof.verificationMethod.split('#')[0];
            const issuerMatch = vmDid === credential.issuerDid.did;
            if (!issuerMatch) {
              checks.signature = { passed: false, detail: 'Issuer DID does not match verification method' };
            } else {
              // Reconstruct the exact signed credential data
              let claims: Record<string, unknown> = {};
              try {
                claims = decryptClaims(credential.encryptedClaims);
              } catch {
                // fall through — claims may be empty
              }

              const publicKey = extractPublicKeyFromDid(credential.issuerDid.did);

              // Reconstruct the credential data that was signed during issuance.
              // The signature was over JSON.stringify({@context, type, issuer, credentialSubject, issuanceDate}).
              // We use the proof.created timestamp as the issuanceDate (set at signing time).
              const credentialData = JSON.stringify({
                '@context': ['https://www.w3.org/2018/credentials/v1'],
                type: ['VerifiableCredential', credential.credentialType],
                issuer: credential.issuerDid.did,
                credentialSubject: {
                  id: credential.holderDid.did,
                  ...claims,
                },
                issuanceDate: proof.created,
              });

              const reconstructedHash = createHash('sha256').update(credentialData).digest('hex');

              if (reconstructedHash === proof.signedDataHash) {
                // We have the exact signed bytes — perform real Ed25519 verification
                const sigValid = verifyEd25519Proof(
                  { proofValue: proof.proofValue, verificationMethod: proof.verificationMethod },
                  credentialData,
                  publicKey
                );
                checks.signature = {
                  passed: sigValid,
                  detail: sigValid
                    ? 'Ed25519Signature2020 cryptographically verified'
                    : 'Ed25519 signature invalid — credential may be forged',
                };
              } else {
                // Cannot reconstruct exact signed bytes — signature cannot be verified
                checks.signature = {
                  passed: false,
                  detail: 'Cannot verify signature — signed data hash mismatch',
                };
              }
            }
          }
        } else {
          checks.signature = { passed: false, detail: 'Missing proof data' };
        }
      } catch {
        checks.signature = { passed: false, detail: 'Signature verification error' };
      }

      // Step 2: Issuer trust check (DID resolution)
      const issuerDid = credential.issuerDid;
      if (issuerDid.status === 'ACTIVE') {
        checks.issuerTrust = { passed: true, detail: 'Issuer DID is active' };
      } else {
        checks.issuerTrust = {
          passed: false,
          detail: `Issuer DID is ${issuerDid.status}`,
        };
      }

      // Step 3: Revocation check
      if (credential.status === 'REVOKED') {
        checks.revocation = { passed: false, detail: 'Credential has been revoked' };
      } else {
        checks.revocation = { passed: true, detail: 'Credential is not revoked' };
      }

      // Step 4: Expiry check
      if (credential.expiresAt && new Date(credential.expiresAt) < new Date()) {
        checks.expiry = { passed: false, detail: 'Credential has expired' };
      } else {
        checks.expiry = { passed: true, detail: credential.expiresAt ? 'Credential is within validity period' : 'No expiry set' };
      }

      const verified = Object.values(checks).every((c) => c.passed);

      logger.info('Credential verification completed', {
        credentialId: body.credentialId,
        verified,
        checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.passed])),
      });

      return reply.send({
        credentialId: credential.id,
        verified,
        checks,
        verifiedAt: new Date().toISOString(),
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

  // POST /api/v1/verify/requests - Create a verification request
  fastify.post('/requests', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = createRequestSchema.parse(request.body);

      const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);

      const verificationRequest = await fastify.prisma.verificationRequest.create({
        data: {
          verifierId: request.currentUser!.id,
          holderDid: body.holderDid,
          requestedAttributes: body.requestedAttributes,
          status: 'CREATED',
          expiresAt,
        },
      });

      logger.info('Verification request created', {
        requestId: verificationRequest.id,
        verifierId: request.currentUser!.id,
        holderDid: body.holderDid,
      });

      return reply.code(201).send({
        id: verificationRequest.id,
        holderDid: verificationRequest.holderDid,
        requestedAttributes: verificationRequest.requestedAttributes,
        status: verificationRequest.status,
        expiresAt: verificationRequest.expiresAt.toISOString(),
        createdAt: verificationRequest.createdAt.toISOString(),
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

  // GET /api/v1/verify/requests - List verification requests
  fastify.get('/requests', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page || '1') || 1);
      const limit = Math.max(1, Math.min(parseInt(query.limit || '50') || 50, 100));
      const skip = (page - 1) * limit;

      const where = { verifierId: request.currentUser!.id };
      const [requests, total] = await Promise.all([
        fastify.prisma.verificationRequest.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        fastify.prisma.verificationRequest.count({ where }),
      ]);

      return reply.send({
        requests: requests.map((r) => ({
          id: r.id,
          holderDid: r.holderDid,
          requestedAttributes: r.requestedAttributes,
          status: r.status,
          expiresAt: r.expiresAt.toISOString(),
          createdAt: r.createdAt.toISOString(),
          respondedAt: r.respondedAt?.toISOString() || null,
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

  // GET /api/v1/verify/requests/:id - Get a specific verification request
  fastify.get('/requests/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };

      const verificationRequest = await fastify.prisma.verificationRequest.findFirst({
        where: { id, verifierId: request.currentUser!.id },
      });

      if (!verificationRequest) {
        throw new AppError(404, 'not-found', 'Verification request not found');
      }

      return reply.send({
        id: verificationRequest.id,
        holderDid: verificationRequest.holderDid,
        requestedAttributes: verificationRequest.requestedAttributes,
        status: verificationRequest.status,
        result: verificationRequest.result,
        failureReason: verificationRequest.failureReason,
        expiresAt: verificationRequest.expiresAt.toISOString(),
        createdAt: verificationRequest.createdAt.toISOString(),
        respondedAt: verificationRequest.respondedAt?.toISOString() || null,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default verifyRoutes;
