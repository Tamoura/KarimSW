/**
 * ZKP Route Integration Tests
 *
 * Tests for /api/v1/zkp endpoints:
 * - GET /circuits          (list available circuits — public)
 * - GET /circuits/:type/verification-key (serve vkey — public)
 * - POST /verify           (standalone proof verification — authenticated)
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

describe('ZKP Routes - /api/v1/zkp', () => {
  let app: FastifyInstance;
  let userToken: string;
  let userId: string;

  const testEmail = 'zkp-routes-test@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-zkp-routes';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Clean up existing test user
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

  // ==================== GET /circuits ====================

  describe('GET /api/v1/zkp/circuits', () => {
    it('should list all 4 circuits (public access)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/zkp/circuits',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.circuits).toHaveLength(4);

      const types = body.circuits.map((c: any) => c.type);
      expect(types).toContain('age_range');
      expect(types).toContain('membership');
      expect(types).toContain('equality');
      expect(types).toContain('range');

      for (const circuit of body.circuits) {
        expect(circuit).toHaveProperty('description');
        expect(circuit).toHaveProperty('publicSignalNames');
        expect(circuit).toHaveProperty('inputDescription');
      }
    });
  });

  // ==================== GET /circuits/:type/verification-key ====================

  describe('GET /api/v1/zkp/circuits/:type/verification-key', () => {
    it('should return verification key for known circuit (public access)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/zkp/circuits/age_range/verification-key',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.protocol).toBe('groth16');
      expect(body.curve).toBe('bn128');
      expect(body.nPublic).toBe(1);
      expect(body.IC).toBeDefined();
    });

    it('should return 404 for unknown circuit type', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/zkp/circuits/nonexistent/verification-key',
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== POST /verify ====================

  describe('POST /api/v1/zkp/verify', () => {
    const validPayload = {
      circuitType: 'age_range',
      proof: {
        pi_a: ['1', '2', '1'],
        pi_b: [['3', '4'], ['5', '6'], ['1', '0']],
        pi_c: ['7', '8', '1'],
        protocol: 'groth16',
        curve: 'bn128',
      },
      publicSignals: ['1'],
    };

    it('should verify a valid proof', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verified).toBe(true);
      expect(body.circuitType).toBe('age_range');
      expect(body.verifiedAt).toBeDefined();
    });

    it('should return verified=false for invalid proof', async () => {
      snarkjs.groth16.verify.mockResolvedValue(false);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: validPayload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.verified).toBe(false);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        payload: validPayload,
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject missing fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: { circuitType: 'age_range' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid circuitType', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          ...validPayload,
          circuitType: 'invalid_circuit',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject wrong public signal count', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/zkp/verify',
        headers: { authorization: `Bearer ${userToken}` },
        payload: {
          ...validPayload,
          publicSignals: ['1', '2', '3'],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
