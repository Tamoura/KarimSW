/**
 * ZKP Presentation Integration Tests
 *
 * Tests for the ZKP proof type in /api/v1/presentations:
 * - POST / with proofType 'ZKP' (create ZKP presentation)
 * - GET /:id for ZKP presentations (includes zkpProof data)
 * - POST /:id/revoke for ZKP presentations
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

describe('ZKP Presentation Routes - /api/v1/presentations', () => {
  let app: FastifyInstance;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  let credentialId: string;

  const holderEmail = 'zkp-pres-holder@example.com';
  const issuerEmail = 'zkp-pres-issuer@example.com';

  const validZkpProof = {
    pi_a: ['1', '2', '1'],
    pi_b: [['3', '4'], ['5', '6'], ['1', '0']],
    pi_c: ['7', '8', '1'],
    protocol: 'groth16',
    curve: 'bn128',
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-zkp-pres';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Clean up holder
    const existingHolder = await prisma.user.findUnique({
      where: { email: holderEmail },
    });
    if (existingHolder) {
      await prisma.credentialPresentation.deleteMany({
        where: { holderDid: { userId: existingHolder.id } },
      });
      await prisma.credential.deleteMany({
        where: {
          OR: [
            { holderDid: { userId: existingHolder.id } },
            { issuerDid: { userId: existingHolder.id } },
          ],
        },
      });
      await prisma.dIDDocument.deleteMany({
        where: { did: { userId: existingHolder.id } },
      });
      await prisma.session.deleteMany({ where: { userId: existingHolder.id } });
      await prisma.dID.deleteMany({ where: { userId: existingHolder.id } });
      await prisma.user.delete({ where: { email: holderEmail } });
    }

    // Clean up issuer
    const existingIssuer = await prisma.user.findUnique({
      where: { email: issuerEmail },
    });
    if (existingIssuer) {
      await prisma.credentialPresentation.deleteMany({
        where: { holderDid: { userId: existingIssuer.id } },
      });
      await prisma.credential.deleteMany({
        where: {
          OR: [
            { holderDid: { userId: existingIssuer.id } },
            { issuerDid: { userId: existingIssuer.id } },
          ],
        },
      });
      await prisma.dIDDocument.deleteMany({
        where: { did: { userId: existingIssuer.id } },
      });
      await prisma.session.deleteMany({ where: { userId: existingIssuer.id } });
      await prisma.dID.deleteMany({ where: { userId: existingIssuer.id } });
      await prisma.user.delete({ where: { email: issuerEmail } });
    }

    // Create holder
    const holderUser = await prisma.user.create({
      data: {
        email: holderEmail,
        passwordHash,
        role: 'HOLDER',
        emailVerified: true,
      },
    });
    holderUserId = holderUser.id;

    // Create issuer
    const issuerUser = await prisma.user.create({
      data: {
        email: issuerEmail,
        passwordHash,
        role: 'ISSUER',
        emailVerified: true,
      },
    });

    // Login both
    const holderLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;

    const issuerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: issuerEmail, password: TEST_PASSWORD },
    });
    const issuerToken = issuerLogin.json().access_token;

    // Create DIDs
    const holderDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });
    holderDidId = holderDidRes.json().id;

    const issuerDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    const issuerDidId = issuerDidRes.json().id;

    // Issue a credential
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'IdentityCredential',
        claims: {
          name: 'Bob ZKP',
          dateOfBirth: '1995-06-20',
          nationality: 'German',
        },
      },
    });
    credentialId = issueRes.json().id;
  });

  afterAll(async () => {
    await prisma.credentialPresentation.deleteMany({
      where: { holderDid: { userId: holderUserId } },
    });
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { issuerDid: { userId: { in: [holderUserId] } } },
        ],
      },
    });
    // Clean all test users
    const userIds = (
      await prisma.user.findMany({
        where: { email: { in: [holderEmail, issuerEmail] } },
        select: { id: true },
      })
    ).map((u) => u.id);

    await prisma.credentialPresentation.deleteMany({
      where: { holderDid: { userId: { in: userIds } } },
    });
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: { in: userIds } } },
          { issuerDid: { userId: { in: userIds } } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: { did: { userId: { in: userIds } } },
    });
    await prisma.dID.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

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

  // ==================== POST / with ZKP ====================

  describe('POST /api/v1/presentations (ZKP)', () => {
    it('should create a ZKP presentation with valid proof', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'age_range',
            proof: validZkpProof,
            publicSignals: ['1'],
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.proofType).toBe('ZKP');
      expect(body.status).toBe('ACTIVE');
      expect(body.disclosedAttributes).toEqual([]);
    });

    it('should store zkpProof JSON in database', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'age_range',
            proof: validZkpProof,
            publicSignals: ['1'],
          },
        },
      });

      const body = res.json();
      const record = await prisma.credentialPresentation.findUnique({
        where: { id: body.id },
      });
      expect(record).not.toBeNull();
      expect(record!.zkpProof).toBeDefined();
      expect((record!.zkpProof as any).circuitType).toBe('age_range');
    });

    it('should reject invalid ZKP proof', async () => {
      snarkjs.groth16.verify.mockResolvedValue(false);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'age_range',
            proof: validZkpProof,
            publicSignals: ['0'],
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.detail).toContain('zkp-verification-failed');
    });

    it('should require zkpProof field for ZKP proof type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          // Missing zkpProof
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid circuitType in zkpProof', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'invalid_circuit',
            proof: validZkpProof,
            publicSignals: ['1'],
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject wrong signal count', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'age_range',
            proof: validZkpProof,
            publicSignals: ['1', '2', '3'],
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== GET /:id for ZKP ====================

  describe('GET /api/v1/presentations/:id (ZKP)', () => {
    let zkpPresentationId: string;

    beforeAll(async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'membership',
            proof: validZkpProof,
            publicSignals: ['1'],
          },
        },
      });
      zkpPresentationId = res.json().id;
    });

    it('should include zkpProof data in GET response', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/presentations/${zkpPresentationId}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.proofType).toBe('ZKP');
      expect(body.zkpProof).toBeDefined();
      expect(body.zkpProof.circuitType).toBe('membership');
      expect(body.zkpProof.verified).toBe(true);
    });
  });

  // ==================== POST /:id/revoke for ZKP ====================

  describe('POST /api/v1/presentations/:id/revoke (ZKP)', () => {
    let revokePresentationId: string;

    beforeAll(async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'range',
            proof: validZkpProof,
            publicSignals: ['1'],
          },
        },
      });
      revokePresentationId = res.json().id;
    });

    it('should revoke a ZKP presentation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/presentations/${revokePresentationId}/revoke`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('REVOKED');
      expect(body.revokedAt).toBeDefined();
    });
  });

  // ==================== Ownership Check ====================

  describe('Ownership check', () => {
    it('should reject if holderDid does not belong to user', async () => {
      snarkjs.groth16.verify.mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId: '00000000-0000-0000-0000-000000000000',
          proofType: 'ZKP',
          zkpProof: {
            circuitType: 'age_range',
            proof: validZkpProof,
            publicSignals: ['1'],
          },
        },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
