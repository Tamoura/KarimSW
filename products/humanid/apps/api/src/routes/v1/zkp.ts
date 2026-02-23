/**
 * ZKP Routes - /api/v1/zkp
 *
 * Zero-knowledge proof circuit discovery, verification, and optimization.
 *
 * - GET  /circuits                         (public)  List available circuits
 * - GET  /circuits/:type/verification-key  (public)  Get verification key
 * - POST /verify                           (auth)    Verify a Groth16 proof
 * - POST /verify-batch                     (auth)    Batch verify proofs
 * - POST /benchmark                        (auth)    Report client benchmark
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import {
  verifyProof,
  verifyProofBatch,
  getVerificationKey,
  listCircuits,
  isValidCircuitType,
} from '../../services/zkp.service.js';

// ==================== Zod Schemas ====================

const circuitTypeEnum = z.enum(['age_range', 'membership', 'equality', 'range']);

const proofSchema = z.object({
  pi_a: z.array(z.string()),
  pi_b: z.array(z.any()),
  pi_c: z.array(z.string()),
  protocol: z.literal('groth16'),
  curve: z.literal('bn128'),
});

const verifyProofSchema = z.object({
  circuitType: circuitTypeEnum,
  proof: proofSchema,
  publicSignals: z.array(z.string()).min(1),
});

const verifyBatchSchema = z.object({
  proofs: z.array(verifyProofSchema).min(1).max(10),
});

const benchmarkSchema = z.object({
  circuitType: circuitTypeEnum,
  proofGenerationMs: z.number().min(0),
  platform: z.string().min(1).max(100),
  deviceCategory: z.enum(['mobile', 'tablet', 'desktop', 'server']),
  wasmUsed: z.boolean().optional(),
  userAgent: z.string().max(500).optional(),
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

  // POST /api/v1/zkp/verify-batch — Batch proof verification (authenticated)
  fastify.post('/verify-batch', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = verifyBatchSchema.parse(request.body);

      const batchResult = await verifyProofBatch(body.proofs);

      return reply.send(batchResult);
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

  // POST /api/v1/zkp/benchmark — Client benchmark reporting (authenticated)
  fastify.post('/benchmark', async (request, reply) => {
    try {
      await fastify.authenticate(request);

      const body = benchmarkSchema.parse(request.body);
      const userId = request.currentUser!.id;

      logger.info('ZKP benchmark received', {
        userId,
        circuitType: body.circuitType,
        proofGenerationMs: body.proofGenerationMs,
        platform: body.platform,
        deviceCategory: body.deviceCategory,
        meetsTarget: body.proofGenerationMs <= 5000,
      });

      return reply.code(201).send({
        recorded: true,
        meetsTarget: body.proofGenerationMs <= 5000,
        targetMs: 5000,
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

export default zkpRoutes;
