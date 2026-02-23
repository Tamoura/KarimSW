/**
 * ZKP Optimization Tests
 *
 * Tests for performance optimizations:
 * - Proof caching (Redis-backed)
 * - Batch verification
 * - Verification timing metrics
 * - Benchmark reporting
 * - Enhanced circuit metadata
 */

jest.mock('snarkjs', () => ({
  groth16: {
    verify: jest.fn(),
  },
}));

const snarkjs = require('snarkjs');

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { clearProofCache } from '../../src/services/zkp.service';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('ZKP Optimization - /api/v1/zkp', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;

  const testEmail = 'zkp-opt-test@example.com';

  const validProof = {
    pi_a: ['1', '2', '1'],
    pi_b: [['3', '4'], ['5', '6'], ['1', '0']],
    pi_c: ['7', '8', '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-zkp-opt';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    const existing = await prisma.user.findUnique({
      where: { email: testEmail },
    });
    if (existing) {
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email: testEmail } });
    }

    const user = await prisma.user.create({
      data: {
        email: testEmail,
        passwordHash,
        role: 'HOLDER',
        emailVerified: true,
      },
    });
    userId = user.id;

    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: testEmail, password: TEST_PASSWORD },
    });
    userToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearProofCache();
  });

  // ==================== Verification Timing ====================

  describe('Verification timing', () => {
    it('should include verificationTimeMs in verify response', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          circuitType: 'age_range',
          proof: validProof,
          publicSignals: ['1'],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verificationTimeMs).toBeDefined();
      expect(typeof body.verificationTimeMs).toBe('number');
      expect(body.verificationTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ==================== Batch Verification ====================

  describe('POST /api/v1/zkp/verify-batch', () => {
    it('should verify multiple proofs in one request', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify-batch',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          proofs: [
            {
              circuitType: 'age_range',
              proof: validProof,
              publicSignals: ['1'],
            },
            {
              circuitType: 'membership',
              proof: validProof,
              publicSignals: ['1'],
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results).toHaveLength(2);
      expect(body.results[0].verified).toBe(true);
      expect(body.results[1].verified).toBe(true);
      expect(body.totalTimeMs).toBeDefined();
    });

    it('should report individual failures in batch', async () => {
      snarkjs.groth16.verify
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify-batch',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          proofs: [
            {
              circuitType: 'age_range',
              proof: validProof,
              publicSignals: ['1'],
            },
            {
              circuitType: 'equality',
              proof: validProof,
              publicSignals: ['0'],
            },
          ],
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.results[0].verified).toBe(true);
      expect(body.results[1].verified).toBe(false);
    });

    it('should reject empty proofs array', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify-batch',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { proofs: [] },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should limit batch size to 10', async () => {
      const proofs = Array(11).fill({
        circuitType: 'age_range',
        proof: validProof,
        publicSignals: ['1'],
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify-batch',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { proofs },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify-batch',
        payload: {
          proofs: [{
            circuitType: 'age_range',
            proof: validProof,
            publicSignals: ['1'],
          }],
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== Benchmark Reporting ====================

  describe('POST /api/v1/zkp/benchmark', () => {
    it('should accept client benchmark report', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/benchmark',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          circuitType: 'age_range',
          proofGenerationMs: 3200,
          platform: 'chrome-wasm',
          deviceCategory: 'mobile',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.recorded).toBe(true);
    });

    it('should reject invalid benchmark data', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/benchmark',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          circuitType: 'invalid_type',
          proofGenerationMs: -1,
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/benchmark',
        payload: {
          circuitType: 'age_range',
          proofGenerationMs: 3200,
          platform: 'chrome-wasm',
          deviceCategory: 'mobile',
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== Enhanced Circuit Metadata ====================

  describe('GET /api/v1/zkp/circuits (enhanced)', () => {
    it('should include optimization hints in circuit metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/zkp/circuits',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();

      for (const circuit of body.circuits) {
        expect(circuit).toHaveProperty('constraints');
        expect(circuit).toHaveProperty('proofSizeBytes');
        expect(circuit).toHaveProperty('estimatedProvingTimeMs');
        expect(circuit.proofSizeBytes).toBe(128);
      }
    });
  });

  // ==================== Proof Caching ====================

  describe('Proof caching', () => {
    it('should return cached result for identical proof on second call', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const payload = {
        circuitType: 'age_range',
        proof: validProof,
        publicSignals: ['1'],
      };

      // First call — verifies via snarkjs
      const res1 = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload,
      });
      expect(res1.statusCode).toBe(200);
      expect(res1.json().verified).toBe(true);

      // Second call — should be cached (snarkjs NOT called again)
      const res2 = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload,
      });
      expect(res2.statusCode).toBe(200);
      expect(res2.json().verified).toBe(true);
      expect(res2.json().cached).toBe(true);

      // snarkjs.verify should be called only once (second was cached)
      expect(snarkjs.groth16.verify).toHaveBeenCalledTimes(1);
    });
  });
});
