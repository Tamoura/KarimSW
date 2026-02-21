/**
 * WebAuthn/FIDO2 Routes - /api/v1/webauthn
 *
 * Passkey registration and authentication ceremonies.
 * Stores FIDO2 credentials in BiometricBinding table.
 *
 * Registration flow:
 * 1. POST /register/options  → get challenge + options
 * 2. POST /register/verify   → verify attestation, store credential
 *
 * Authentication flow:
 * 1. POST /authenticate/options → get challenge + allowed credentials
 * 2. POST /authenticate/verify  → verify assertion, issue token
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHash } from 'crypto';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { base58Encode } from '../../utils/did-crypto.js';

/**
 * Validate the CBOR attestation object structure.
 *
 * WebAuthn attestation objects are CBOR-encoded maps with three keys:
 *   - "fmt" (attestation format: "none", "packed", "tpm", etc.)
 *   - "attStmt" (attestation statement)
 *   - "authData" (authenticator data, min 37 bytes)
 *
 * AuthData structure (first 37+ bytes):
 *   - bytes 0-31:  SHA-256 hash of the RP ID
 *   - byte  32:    flags (bit 0 = UP, bit 2 = UV, bit 6 = AT, bit 7 = ED)
 *   - bytes 33-36: sign count (big-endian uint32)
 *
 * Without a full CBOR library we perform structural validation:
 *   1. Buffer must be at least 37 bytes (authData minimum)
 *   2. First byte must be a CBOR map tag (0xa0-0xbf for definite, 0xbf for indefinite)
 *   3. RP ID hash (first 32 bytes of authData) must match expected RP
 *   4. User-present flag must be set
 */
function validateAttestationObject(
  attestationB64: string,
  rpId: string,
): { valid: boolean; reason?: string } {
  let buf: Buffer;
  try {
    buf = Buffer.from(attestationB64, 'base64url');
  } catch {
    return { valid: false, reason: 'Invalid base64url encoding' };
  }

  // Minimum size: CBOR overhead (~10 bytes) + 37 bytes authData
  if (buf.length < 47) {
    return { valid: false, reason: 'Attestation object too small' };
  }

  // First byte must be a CBOR map indicator (0xa0-0xbf)
  const firstByte = buf[0];
  if (firstByte < 0xa0 || firstByte > 0xbf) {
    return { valid: false, reason: 'Invalid CBOR map header' };
  }

  // Locate authData: scan for the CBOR string "authData" (68617574684461746)
  // The key "authData" is 8 bytes. In CBOR, it's encoded as 0x68 (text string length 8) + "authData"
  const authDataKey = Buffer.from('6861757468446174611', 'hex').subarray(0, 9); // 0x68 + "authData"
  const keyOffset = buf.indexOf(authDataKey);
  if (keyOffset === -1) {
    // Try alternate CBOR encoding for "authData" (could be 0x68 prefix)
    const altKey = Buffer.concat([Buffer.from([0x68]), Buffer.from('authData')]);
    const altOffset = buf.indexOf(altKey);
    if (altOffset === -1) {
      return { valid: false, reason: 'authData key not found in CBOR map' };
    }
    // Found with alternate encoding - validate from there
    return validateAuthData(buf, altOffset + altKey.length, rpId);
  }

  return validateAuthData(buf, keyOffset + authDataKey.length, rpId);
}

function validateAuthData(
  buf: Buffer,
  authDataValueOffset: number,
  rpId: string,
): { valid: boolean; reason?: string } {
  // The value after the key should be a CBOR byte string
  // 0x58 = byte string with 1-byte length, 0x59 = 2-byte length
  const lenTag = buf[authDataValueOffset];
  let authDataStart: number;
  let authDataLen: number;

  if (lenTag >= 0x40 && lenTag <= 0x57) {
    // Short byte string (length encoded in bottom 5 bits)
    authDataLen = lenTag - 0x40;
    authDataStart = authDataValueOffset + 1;
  } else if (lenTag === 0x58) {
    authDataLen = buf[authDataValueOffset + 1];
    authDataStart = authDataValueOffset + 2;
  } else if (lenTag === 0x59) {
    authDataLen = buf.readUInt16BE(authDataValueOffset + 1);
    authDataStart = authDataValueOffset + 3;
  } else {
    return { valid: false, reason: 'Invalid authData CBOR encoding' };
  }

  if (authDataLen < 37) {
    return { valid: false, reason: 'authData too short (minimum 37 bytes)' };
  }

  if (authDataStart + authDataLen > buf.length) {
    return { valid: false, reason: 'authData extends beyond buffer' };
  }

  // Verify RP ID hash (first 32 bytes of authData)
  const rpIdHash = createHash('sha256').update(rpId).digest();
  const attestedRpIdHash = buf.subarray(authDataStart, authDataStart + 32);
  if (!rpIdHash.equals(attestedRpIdHash)) {
    return { valid: false, reason: 'RP ID hash mismatch' };
  }

  // Verify flags byte (byte 32 of authData)
  const flags = buf[authDataStart + 32];
  const userPresent = (flags & 0x01) !== 0;
  if (!userPresent) {
    return { valid: false, reason: 'User-present flag not set' };
  }

  return { valid: true };
}

const registerOptionsSchema = z.object({
  didId: z.string().uuid('Invalid DID ID'),
});

const registerVerifySchema = z.object({
  didId: z.string().uuid('Invalid DID ID'),
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      attestationObject: z.string(),
    }),
  }),
});

const authenticateOptionsSchema = z.object({
  email: z.string().email(),
});

const authenticateVerifySchema = z.object({
  credential: z.object({
    id: z.string(),
    rawId: z.string(),
    type: z.literal('public-key'),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
      signature: z.string(),
    }),
  }),
});

const RP_ID = () => process.env.WEBAUTHN_RP_ID || 'localhost';
const RP_NAME = () => process.env.WEBAUTHN_RP_NAME || 'HumanID';
const ORIGIN = () => process.env.WEBAUTHN_ORIGIN || 'http://localhost:3117';

const webauthnRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /register/options - Generate registration options
  fastify.post('/register/options', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = registerOptionsSchema.parse(request.body);
      const userId = request.currentUser!.id;

      // Verify the DID belongs to the user
      const did = await fastify.prisma.dID.findFirst({
        where: { id: body.didId, userId },
      });

      if (!did) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      // Get existing credentials to exclude
      const existingBindings = await fastify.prisma.biometricBinding.findMany({
        where: { didId: body.didId, type: 'FIDO2' },
        select: { fido2CredentialId: true },
      });

      const challenge = randomBytes(32);
      const challengeB64 = challenge.toString('base64url');

      // Store challenge in Redis for verification (5 min TTL)
      const challengeKey = `webauthn:reg:${userId}:${body.didId}`;
      if (fastify.redis) {
        await fastify.redis.set(challengeKey, challengeB64, 'EX', 300);
      }

      const options = {
        challenge: challengeB64,
        rp: {
          name: RP_NAME(),
          id: RP_ID(),
        },
        user: {
          id: Buffer.from(userId).toString('base64url'),
          name: request.currentUser!.email,
          displayName: request.currentUser!.email.split('@')[0],
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256
          { alg: -257, type: 'public-key' },  // RS256
          { alg: -8, type: 'public-key' },    // EdDSA
        ],
        timeout: 60000,
        attestation: 'direct',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          requireResidentKey: false,
          userVerification: 'preferred',
        },
        excludeCredentials: existingBindings
          .filter((b) => b.fido2CredentialId)
          .map((b) => ({
            id: b.fido2CredentialId!,
            type: 'public-key',
          })),
      };

      return reply.send(options);
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

  // POST /register/verify - Verify registration attestation
  fastify.post('/register/verify', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = registerVerifySchema.parse(request.body);
      const userId = request.currentUser!.id;

      // Verify DID belongs to user
      const did = await fastify.prisma.dID.findFirst({
        where: { id: body.didId, userId },
      });

      if (!did) {
        throw new AppError(404, 'not-found', 'DID not found');
      }

      // Retrieve stored challenge
      const challengeKey = `webauthn:reg:${userId}:${body.didId}`;
      let storedChallenge: string | null = null;
      if (fastify.redis) {
        storedChallenge = await fastify.redis.get(challengeKey);
      }

      if (!storedChallenge) {
        throw new AppError(400, 'bad-request', 'Registration challenge expired or not found');
      }

      // Attestation validation: clientDataJSON + attestation object
      try {
        const clientDataJSON = Buffer.from(body.credential.response.clientDataJSON, 'base64url');
        const clientData = JSON.parse(clientDataJSON.toString('utf8'));

        if (clientData.type !== 'webauthn.create') {
          throw new AppError(400, 'bad-request', 'Invalid client data type');
        }

        if (clientData.challenge !== storedChallenge) {
          throw new AppError(400, 'bad-request', 'Challenge mismatch');
        }

        if (clientData.origin !== ORIGIN()) {
          throw new AppError(400, 'bad-request', 'Origin mismatch');
        }
      } catch (parseError) {
        if (parseError instanceof AppError) throw parseError;
        throw new AppError(400, 'bad-request', 'Invalid attestation response');
      }

      // CBOR attestation object validation (RP ID hash, flags, structure)
      const attestationResult = validateAttestationObject(
        body.credential.response.attestationObject,
        RP_ID(),
      );
      if (!attestationResult.valid) {
        logger.warn('Attestation object validation failed', {
          reason: attestationResult.reason,
          didId: body.didId,
        });
        throw new AppError(400, 'bad-request', `Attestation validation failed: ${attestationResult.reason}`);
      }

      // Store the credential binding
      const templateHash = createHash('sha256')
        .update(body.credential.response.attestationObject)
        .digest('hex');

      const binding = await fastify.prisma.biometricBinding.create({
        data: {
          didId: body.didId,
          type: 'FIDO2',
          templateHash,
          fido2CredentialId: body.credential.id,
          fido2PublicKey: body.credential.response.attestationObject,
          metadata: {
            registeredAt: new Date().toISOString(),
            userAgent: request.headers['user-agent'] || 'unknown',
          },
        },
      });

      // Clean up challenge
      if (fastify.redis) {
        await fastify.redis.del(challengeKey);
      }

      logger.info('WebAuthn credential registered', {
        bindingId: binding.id,
        didId: body.didId,
        userId,
      });

      return reply.code(201).send({
        id: binding.id,
        credentialId: body.credential.id,
        message: 'Passkey registered successfully',
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

  // POST /authenticate/options - Generate authentication options
  fastify.post('/authenticate/options', async (request, reply) => {
    try {
      const body = authenticateOptionsSchema.parse(request.body);

      // Find user by email
      const user = await fastify.prisma.user.findUnique({
        where: { email: body.email },
      });

      if (!user) {
        // Don't reveal whether user exists
        // Return options anyway with empty allowCredentials
      }

      // Get user's FIDO2 credentials
      let allowCredentials: { id: string; type: string }[] = [];
      if (user) {
        const bindings = await fastify.prisma.biometricBinding.findMany({
          where: {
            did: { userId: user.id },
            type: 'FIDO2',
          },
          select: { fido2CredentialId: true },
        });
        allowCredentials = bindings
          .filter((b) => b.fido2CredentialId)
          .map((b) => ({ id: b.fido2CredentialId!, type: 'public-key' }));
      }

      const challenge = randomBytes(32).toString('base64url');

      // Store challenge in Redis
      if (fastify.redis && user) {
        await fastify.redis.set(`webauthn:auth:${user.id}`, challenge, 'EX', 300);
      }

      return reply.send({
        challenge,
        timeout: 60000,
        rpId: RP_ID(),
        allowCredentials,
        userVerification: 'preferred',
      });
    } catch (error) {
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

  // GET /credentials - List passkeys for authenticated user
  fastify.get('/credentials', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const userId = request.currentUser!.id;
      const query = request.query as { page?: string; limit?: string };
      const page = parseInt(query.page || '1');
      const limit = Math.min(parseInt(query.limit || '50'), 100);
      const skip = (page - 1) * limit;

      const where = { did: { userId }, type: 'FIDO2' as const };
      const [bindings, total] = await Promise.all([
        fastify.prisma.biometricBinding.findMany({
          where,
          skip,
          take: limit,
          include: {
            did: { select: { did: true } },
          },
        }),
        fastify.prisma.biometricBinding.count({ where }),
      ]);

      return reply.send({
        credentials: bindings.map((b) => ({
          id: b.id,
          credentialId: b.fido2CredentialId,
          did: b.did.did,
          createdAt: b.createdAt.toISOString(),
          metadata: b.metadata,
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

  // DELETE /credentials/:id - Remove a passkey
  fastify.delete('/credentials/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const binding = await fastify.prisma.biometricBinding.findFirst({
        where: { id, did: { userId } },
      });

      if (!binding) {
        throw new AppError(404, 'not-found', 'Passkey not found');
      }

      await fastify.prisma.biometricBinding.delete({ where: { id } });

      logger.info('WebAuthn credential removed', { bindingId: id, userId });

      return reply.send({
        message: 'Passkey removed successfully',
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default webauthnRoutes;
