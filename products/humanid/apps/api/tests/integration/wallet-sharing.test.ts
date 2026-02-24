/**
 * Wallet Sharing Routes Integration Tests
 *
 * Tests for /api/v1/wallet/sharing endpoints:
 * - GET /sharing  (list credential presentations / sharing history)
 * - DELETE /sharing/:id (revoke a presentation)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Wallet Sharing - /api/v1/wallet/sharing', () => {
  let app: FastifyInstance;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  let verifierDidId: string;
  let credentialId: string;
  let presentationId: string;
  const holderEmail = 'sharing-holder@example.com';
  const issuerEmail = 'sharing-issuer@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Clean up presentations first (they reference credentials and DIDs)
      const userDids = await prisma.dID.findMany({ where: { userId: existing.id }, select: { id: true } });
      const didIds = userDids.map(d => d.id);
      if (didIds.length > 0) {
        await prisma.credentialPresentation.deleteMany({
          where: { OR: [{ holderDidId: { in: didIds } }, { verifierDidId: { in: didIds } }] },
        });
      }
      await prisma.credential.deleteMany({
        where: { OR: [{ holderDid: { userId: existing.id } }, { issuerDid: { userId: existing.id } }] },
      });
      await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.auditLog.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-wallet-sharing';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(holderEmail);
    await cleanupUser(issuerEmail);

    // Create holder
    const holder = await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    holderUserId = holder.id;

    // Create issuer user
    const issuer = await prisma.user.create({
      data: { email: issuerEmail, passwordHash, role: 'ISSUER', emailVerified: true },
    });

    // Login holder
    const holderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;

    // Create DIDs via API
    const holderDidRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });
    holderDidId = holderDidRes.json().id;

    // Create issuer DID directly
    const issuerLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: issuerEmail, password: TEST_PASSWORD },
    });
    const issuerToken = issuerLogin.json().access_token;
    const verifierDidRes = await app.inject({
      method: 'POST', url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    verifierDidId = verifierDidRes.json().id;

    // Create a credential
    const { encryptClaims } = await import('../../src/utils/encryption');
    const { createHash } = await import('crypto');
    const encryptedClaims = encryptClaims({ degree: 'BSc', university: 'Test U' });
    const credentialHash = createHash('sha256').update(JSON.stringify({ degree: 'BSc' })).digest('hex');

    const cred = await prisma.credential.create({
      data: {
        holderDidId,
        issuerDidId: verifierDidId,
        credentialType: 'UniversityDegree',
        encryptedClaims,
        proof: { type: 'Ed25519Signature2020' },
        credentialHash,
        status: 'ACTIVE',
      },
    });
    credentialId = cred.id;

    // Create a presentation (sharing record)
    const pres = await prisma.credentialPresentation.create({
      data: {
        credentialId,
        holderDidId,
        verifierDidId,
        disclosedAttributes: ['degree', 'university'],
        proofType: 'FULL',
        status: 'ACTIVE',
      },
    });
    presentationId = pres.id;
  });

  afterAll(async () => {
    await cleanupUser(holderEmail);
    await cleanupUser(issuerEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /api/v1/wallet/sharing', () => {
    it('should return sharing history for the holder', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/sharing',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('sessions');
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(body.sessions.length).toBeGreaterThanOrEqual(1);

      const session = body.sessions[0];
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('credentialTypes');
      expect(session).toHaveProperty('status');
      expect(session).toHaveProperty('sharedAt');
    });

    it('should handle disclosedAttributes stored as an object', async () => {
      // Create a presentation with disclosedAttributes as an object (not array)
      const objPres = await prisma.credentialPresentation.create({
        data: {
          credentialId,
          holderDidId,
          verifierDidId,
          disclosedAttributes: { degree: 'BSc', university: 'Test U' },
          proofType: 'FULL',
          status: 'ACTIVE',
        },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/sharing',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      const objSession = body.sessions.find((s: { id: string }) => s.id === objPres.id);
      expect(objSession).toBeDefined();
      // Object keys should be extracted
      expect(objSession.claimsDisclosed).toEqual(expect.arrayContaining(['degree', 'university']));

      // Cleanup
      await prisma.credentialPresentation.delete({ where: { id: objPres.id } });
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/sharing',
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/v1/wallet/sharing/:id', () => {
    it('should revoke an active presentation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/wallet/sharing/${presentationId}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('REVOKED');
    });

    it('should return 404 for non-existent presentation', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/wallet/sharing/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${holderToken}` },
      });
      expect(res.statusCode).toBe(404);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/wallet/sharing/${presentationId}`,
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
