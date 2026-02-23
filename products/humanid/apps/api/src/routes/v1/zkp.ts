/**
 * ZKP Routes - /api/v1/zkp
 *
 * Zero-knowledge proof circuit discovery and standalone verification.
 *
 * - GET /circuits                         (public)  List available circuits
 * - GET /circuits/:type/verification-key  (public)  Get verification key
 * - POST /verify                          (auth)    Verify a Groth16 proof
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import {
  verifyProof,
  getVerificationKey,
  listCircuits,
  isValidCircuitType,
} from '../../services/zkp.service.js';

// ==================== Zod Schemas ====================

const verifyProofSchema = z.object({
  circuitType: z.enum(['age_range', 'membership', 'equality', 'range']),
  proof: z.object({
    pi_a: z.array(z.string()),
    pi_b: z.array(z.any()),
    pi_c: z.array(z.string()),
    protocol: z.literal('groth16'),
    curve: z.literal('bn128'),
  }),
  publicSignals: z.array(z.string()).min(1),
});

// ==================== Routes ====================

const zkpRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/zkp/circuits — List all available circuits (public)
  fastify.get('/circuits', async (_request, reply) => {
    const circuits = listCircuits();
    return reply.send({ circuits });
  });

  // GET /api/v1/zkp/circuits/:type/verification-key — Serve vkey (public)
  fastify.get('/circuits/:type/verification-key', async (request, reply) => {
    try {
      const { type } = request.params as { type: string };

      if (!isValidCircuitType(type)) {
        throw new AppError(400, 'invalid-circuit', `Unknown circuit type: ${type}`);
      }

      const vkey = await getVerificationKey(type);
      return reply.send(vkey);
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/zkp/verify — Standalone proof verification (authenticated)
  fastify.post('/verify', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = verifyProofSchema.parse(request.body);

      const result = await verifyProof(
        body.circuitType,
        body.proof,
        body.publicSignals
      );

      return reply.send(result);
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

export default zkpRoutes;
