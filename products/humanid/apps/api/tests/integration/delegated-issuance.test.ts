/**
 * Delegated Issuance Integration Tests
 *
 * Tests for /api/v1/issuance-delegation endpoints:
 * - POST /              (grant issuance rights)
 * - GET /               (list delegations)
 * - GET /:id/chain      (verify delegation chain)
 * - DELETE /:id         (revoke delegation)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Delegated Issuance - /api/v1/issuance-delegation', () => {
  let app: FastifyInstance;
  let parentToken: string;
  let parentIssuerId: string;
  let delegateIssuerId: string;
  let delegationId: string;
  const parentEmail = 'parent-issuer@example.com';
  const delegateEmail = 'delegate-issuer@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.issuer.deleteMany({ where: { userId: existing.id } });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-delegated';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await prisma.issuanceDelegation.deleteMany({});
    await cleanupUser(parentEmail);
    await cleanupUser(delegateEmail);

    // Create parent issuer
    const parent = await prisma.user.create({
      data: { email: parentEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    const parentLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: parentEmail, password: TEST_PASSWORD },
    });
    parentToken = parentLogin.json().access_token;

    const parentDid = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${parentToken}` }, payload: {},
    });

    const parentIssuer = await prisma.issuer.create({
      data: {
        userId: parent.id, didId: parentDid.json().id,
        organizationName: 'Parent University', trustStatus: 'TRUSTED', tier: 'VERIFIED',
      },
    });
    parentIssuerId = parentIssuer.id;

    // Create delegate issuer
    const delegate = await prisma.user.create({
      data: { email: delegateEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });
    const delegateLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: delegateEmail, password: TEST_PASSWORD },
    });

    const delegateDid = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${delegateLogin.json().access_token}` }, payload: {},
    });

    const delegateIssuer = await prisma.issuer.create({
      data: {
        userId: delegate.id, didId: delegateDid.json().id,
        organizationName: 'Delegate College', trustStatus: 'TRUSTED', tier: 'SELF_DECLARED',
      },
    });
    delegateIssuerId = delegateIssuer.id;
  });

  afterAll(async () => {
    await prisma.issuanceDelegation.deleteMany({});
    await cleanupUser(parentEmail);
    await cleanupUser(delegateEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/issuance-delegation', () => {
    it('should grant issuance rights', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/issuance-delegation',
        headers: { authorization: `Bearer ${parentToken}` },
        payload: {
          parentIssuerId,
          delegateIssuerId,
          allowedTypes: ['AcademicTranscript', 'CourseCertificate'],
          maxDepth: 1,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.status).toBe('ACTIVE');
      expect(body.allowedTypes).toContain('AcademicTranscript');
      delegationId = body.id;
    });
  });

  describe('GET /api/v1/issuance-delegation', () => {
    it('should list delegations', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/issuance-delegation?parentIssuerId=${parentIssuerId}`,
        headers: { authorization: `Bearer ${parentToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('delegations');
      expect(body.delegations.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/issuance-delegation/:id/chain', () => {
    it('should verify delegation chain', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/issuance-delegation/${delegationId}/chain`,
        headers: { authorization: `Bearer ${parentToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('valid', true);
      expect(body).toHaveProperty('chain');
      expect(body.chain.length).toBeGreaterThan(0);
    });
  });

  describe('DELETE /api/v1/issuance-delegation/:id', () => {
    it('should revoke delegation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/issuance-delegation/${delegationId}`,
        headers: { authorization: `Bearer ${parentToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().message).toMatch(/revoked/i);
    });
  });
});
