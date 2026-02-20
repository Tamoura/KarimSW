/**
 * Credential Verification Engine Integration Tests
 *
 * Tests for POST /api/v1/verify/credentials endpoint:
 * 4-step verification: signature, issuer trust, revocation, expiry
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Credential Verification Engine - POST /api/v1/verify/credentials', () => {
  let app: FastifyInstance;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  let validCredentialId: string;
  const issuerEmail = 'verify-issuer@example.com';
  const holderEmail = 'verify-holder@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-verify-engine';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    async function setupUser(email: string, role: 'HOLDER' | 'ISSUER') {
      const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        await prisma.credential.deleteMany({
          where: {
            OR: [
              { holderDid: { userId: existing.id } },
              { issuerDid: { userId: existing.id } },
            ],
          },
        });
        await prisma.dIDDocument.deleteMany({ where: { did: { userId: existing.id } } });
        await prisma.dID.deleteMany({ where: { userId: existing.id } });
        await prisma.session.deleteMany({ where: { userId: existing.id } });
        await prisma.user.delete({ where: { email } });
      }

      const user = await prisma.user.create({
        data: { email, passwordHash, role, emailVerified: true },
      });

      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email, password: TEST_PASSWORD },
      });
      const token = loginRes.json().access_token;

      const didRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      const didId = didRes.json().id;

      return { user, token, didId };
    }

    const issuer = await setupUser(issuerEmail, 'ISSUER');
    issuerToken = issuer.token;
    issuerUserId = issuer.user.id;
    issuerDidId = issuer.didId;

    const holder = await setupUser(holderEmail, 'HOLDER');
    holderToken = holder.token;
    holderUserId = holder.user.id;
    holderDidId = holder.didId;

    // Issue a valid credential
    const credRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'VerifyTestCred',
        claims: { name: 'Test', score: 100 },
      },
    });
    validCredentialId = credRes.json().id;
  });

  afterAll(async () => {
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { issuerDid: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: { did: { userId: { in: [issuerUserId, holderUserId] } } },
    });
    await prisma.dID.deleteMany({
      where: { userId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [issuerUserId, holderUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [issuerUserId, holderUserId] } },
    });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  it('should verify a valid credential and return all 4 checks passing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: { credentialId: validCredentialId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verified).toBe(true);
    expect(body.checks).toHaveProperty('signature');
    expect(body.checks).toHaveProperty('issuerTrust');
    expect(body.checks).toHaveProperty('revocation');
    expect(body.checks).toHaveProperty('expiry');
    expect(body.checks.signature.passed).toBe(true);
    expect(body.checks.issuerTrust.passed).toBe(true);
    expect(body.checks.revocation.passed).toBe(true);
    expect(body.checks.expiry.passed).toBe(true);
  });

  it('should fail verification for a revoked credential', async () => {
    // Issue and revoke a credential
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'RevokedVerifyCred',
        claims: { test: true },
      },
    });
    const revokedCredId = issueRes.json().id;

    await app.inject({
      method: 'POST',
      url: `/api/v1/credentials/${revokedCredId}/revoke`,
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: { reason: 'Test revocation' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: { credentialId: revokedCredId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verified).toBe(false);
    expect(body.checks.revocation.passed).toBe(false);
  });

  it('should fail verification for an expired credential', async () => {
    // Issue a credential with past expiry
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'ExpiredCred',
        claims: { test: true },
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // yesterday
      },
    });
    const expiredCredId = issueRes.json().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: { credentialId: expiredCredId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verified).toBe(false);
    expect(body.checks.expiry.passed).toBe(false);
  });

  it('should fail verification when issuer DID is deactivated', async () => {
    // Issue credential, then deactivate issuer DID
    const newDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    const tempIssuerDidId = newDidRes.json().id;

    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId: tempIssuerDidId,
        credentialType: 'DeactivatedIssuerCred',
        claims: { test: true },
      },
    });
    const credId = issueRes.json().id;

    // Deactivate the issuer DID
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/dids/${tempIssuerDidId}`,
      headers: { authorization: `Bearer ${issuerToken}` },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: { credentialId: credId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.verified).toBe(false);
    expect(body.checks.issuerTrust.passed).toBe(false);
  });

  it('should return 404 for non-existent credential', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: { credentialId: '00000000-0000-0000-0000-000000000000' },
    });

    expect(res.statusCode).toBe(404);
  });

  it('should require authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      payload: { credentialId: validCredentialId },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should require credentialId in payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/credentials',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
