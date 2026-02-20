/**
 * eIDAS 2.0 Routes - /api/v1/eidas
 *
 * eIDAS 2.0 compliance module: credential format conversion,
 * EUDI wallet interoperability (SD-JWT-VC), trust framework.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createHash, randomBytes } from 'crypto';
import { AppError } from '../../types/index.js';
import { decryptClaims } from '../../utils/encryption.js';

const convertSchema = z.object({
  credentialId: z.string().uuid(),
  targetFormat: z.enum(['SD-JWT-VC', 'JSON-LD']),
});

const eidasRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/eidas/status - Compliance readiness
  fastify.get('/status', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const qualifiedIssuers = await fastify.prisma.issuer.count({
        where: { tier: 'QUALIFIED' },
      });

      return reply.send({
        eidas2Ready: false, // Will be true when all requirements met
        eudiInterop: true,
        supportedFormats: ['JSON-LD', 'SD-JWT-VC'],
        supportedProtocols: ['OpenID4VP', 'OpenID4VCI'],
        qualifiedIssuers,
        complianceChecklist: {
          credentialFormatSupport: true,
          sdJwtVcSupport: true,
          openId4VpSupport: true,
          qualifiedElectronicSignatures: false,
          trustedIssuerRegistry: true,
          crossBorderInterop: false,
        },
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });

  // POST /api/v1/eidas/convert - Convert credential format
  fastify.post('/convert', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = convertSchema.parse(request.body);
      const userId = request.currentUser!.id;

      const credential = await fastify.prisma.credential.findFirst({
        where: {
          id: body.credentialId,
          OR: [
            { holderDid: { userId } },
            { issuerDid: { userId } },
          ],
        },
        include: {
          holderDid: true,
          issuerDid: true,
        },
      });

      if (!credential) {
        throw new AppError(404, 'not-found', 'Credential not found');
      }

      // Decrypt claims
      const claims = decryptClaims(credential.encryptedClaims);

      if (body.targetFormat === 'SD-JWT-VC') {
        // Convert to SD-JWT-VC format (selective disclosure JWT)
        const header = {
          alg: 'EdDSA',
          typ: 'vc+sd-jwt',
          kid: `${credential.issuerDid.did}#key-1`,
        };

        const payload = {
          iss: credential.issuerDid.did,
          sub: credential.holderDid.did,
          iat: Math.floor(new Date(credential.issuedAt).getTime() / 1000),
          exp: credential.expiresAt ? Math.floor(new Date(credential.expiresAt).getTime() / 1000) : undefined,
          vct: `https://humanid.dev/credentials/${credential.credentialType}`,
          status: { idx: 0, uri: `https://api.humanid.dev/api/v1/credentials/${credential.id}/status` },
          _sd_alg: 'sha-256',
        };

        // Create selective disclosures for each claim
        const disclosures = Object.entries(claims).map(([key, value]) => {
          const salt = randomBytes(16).toString('base64url');
          const disclosure = Buffer.from(JSON.stringify([salt, key, value])).toString('base64url');
          const hash = createHash('sha256').update(disclosure).digest('base64url');
          return { key, disclosure, hash };
        });

        return reply.send({
          originalFormat: 'JSON-LD',
          targetFormat: 'SD-JWT-VC',
          credentialId: credential.id,
          converted: {
            header,
            payload: {
              ...payload,
              _sd: disclosures.map((d) => d.hash),
            },
            disclosures: disclosures.map((d) => ({
              key: d.key,
              disclosure: d.disclosure,
            })),
          },
        });
      }

      // JSON-LD format (current native format)
      return reply.send({
        originalFormat: 'JSON-LD',
        targetFormat: 'JSON-LD',
        credentialId: credential.id,
        converted: {
          '@context': ['https://www.w3.org/2018/credentials/v1', 'https://humanid.dev/credentials/v1'],
          type: ['VerifiableCredential', credential.credentialType],
          issuer: credential.issuerDid.did,
          credentialSubject: {
            id: credential.holderDid.did,
            ...claims,
          },
          issuanceDate: credential.issuedAt.toISOString(),
          expirationDate: credential.expiresAt?.toISOString(),
          proof: credential.proof,
        },
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error', status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/v1/eidas/trust-framework - Trust framework info
  fastify.get('/trust-framework', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const [trustedIssuers, qualifiedIssuers] = await Promise.all([
        fastify.prisma.issuer.count({ where: { trustStatus: 'TRUSTED' } }),
        fastify.prisma.issuer.count({ where: { tier: 'QUALIFIED' } }),
      ]);

      return reply.send({
        framework: 'eIDAS 2.0',
        version: '2024-11',
        supportedCredentialTypes: [
          'VerifiableAttestation',
          'VerifiablePresentationOfAttributes',
          'QualifiedElectronicAttestation',
          'PersonIdentificationData',
          'AcademicCredential',
          'ProfessionalQualification',
        ],
        qualifiedIssuers,
        trustedIssuers,
        registryUrl: 'https://humanid.dev/trust-registry',
        interoperability: {
          eudiWallet: true,
          openId4VP: true,
          openId4VCI: true,
          sdJwtVc: true,
          mdoc: false,
        },
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default eidasRoutes;
