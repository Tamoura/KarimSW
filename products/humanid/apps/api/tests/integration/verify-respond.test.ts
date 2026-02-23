/**
 * Verification Request Response Integration Tests
 *
 * Tests for POST /api/v1/verify/requests/:id/respond:
 * - Holder responds to a verification request with a presentation
 * - Auto-runs 4-step verification pipeline
 * - Updates request status to VERIFIED or FAILED
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Verification Request Response', () => {
  let app: FastifyInstance;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  let holderDid: string;
  let verifierToken: string;
  let verifierUserId: string;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let credentialId: string;

  const holderEmail = 'verify-resp-holder@example.com';
  const verifierEmail = 'verify-resp-verifier@example.com';
  const issuerEmail = 'verify-resp-issuer@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-verify-respond';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Clean up all test users
    for (const email of [holderEmail, verifierEmail, issuerEmail]) {
      const existing = await prisma.user.findUnique({
        where: { email },
      });
      if (existing) {
        await prisma.credentialPresentation.deleteMany({
          where: { holderDid: { userId: existing.id } },
        });
        await prisma.verificationRequest.deleteMany({
          where: { verifierId: existing.id },
        });
        await prisma.credential.deleteMany({
          where: {
            OR: [
              { holderDid: { userId: existing.id } },
              { issuerDid: { userId: existing.id } },
            ],
          },
        });
        await prisma.dIDDocument.deleteMany({
          where: { did: { userId: existing.id } },
        });
        await prisma.session.deleteMany({
          where: { userId: existing.id },
        });
        await prisma.dID.deleteMany({
          where: { userId: existing.id },
        });
        await prisma.user.delete({ where: { email } });
      }
    }

    // Create users
    const holderUser = await prisma.user.create({
      data: {
        email: holderEmail,
        passwordHash,
        role: 'HOLDER',
        emailVerified: true,
      },
    });
    holderUserId = holderUser.id;

    const verifierUser = await prisma.user.create({
      data: {
        email: verifierEmail,
        passwordHash,
        role: 'HOLDER',
        emailVerified: true,
      },
    });
    verifierUserId = verifierUser.id;

    const issuerUser = await prisma.user.create({
      data: {
        email: issuerEmail,
        passwordHash,
        role: 'ISSUER',
        emailVerified: true,
      },
    });
    issuerUserId = issuerUser.id;

    // Login all users
    const holderLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;

    const verifierLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: verifierEmail, password: TEST_PASSWORD },
    });
    verifierToken = verifierLogin.json().access_token;

    const issuerLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: issuerEmail, password: TEST_PASSWORD },
    });
    issuerToken = issuerLogin.json().access_token;

    // Create DIDs
    const holderDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });
    const hd = holderDidRes.json();
    holderDidId = hd.id;
    holderDid = hd.did;

    const issuerDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    issuerDidId = issuerDidRes.json().id;

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
          name: 'Bob Jones',
          dateOfBirth: '1985-03-20',
          nationality: 'American',
        },
      },
    });
    credentialId = issueRes.json().id;
  });

  afterAll(async () => {
    const allUserIds = [holderUserId, verifierUserId, issuerUserId];
    await prisma.credentialPresentation.deleteMany({
      where: { holderDid: { userId: { in: allUserIds } } },
    });
    await prisma.verificationRequest.deleteMany({
      where: { verifierId: { in: allUserIds } },
    });
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: { in: allUserIds } } },
          { issuerDid: { userId: { in: allUserIds } } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: { did: { userId: { in: allUserIds } } },
    });
    await prisma.dID.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: allUserIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: allUserIds } },
    });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  it('should complete full flow: verifier requests → holder responds → auto-verified', async () => {
    // Step 1: Verifier creates a verification request
    const requestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/requests',
      headers: { authorization: `Bearer ${verifierToken}` },
      payload: {
        holderDid,
        requestedAttributes: ['name', 'nationality'],
      },
    });
    expect(requestRes.statusCode).toBe(201);
    const verificationRequestId = requestRes.json().id;

    // Step 2: Holder responds with a presentation
    const respondRes = await app.inject({
      method: 'POST',
      url: `/api/v1/verify/requests/${verificationRequestId}/respond`,
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {
        credentialId,
        holderDidId,
        disclosedAttributes: ['name', 'nationality'],
      },
    });

    expect(respondRes.statusCode).toBe(200);
    const body = respondRes.json();
    expect(body.status).toBe('VERIFIED');
    expect(body.presentationId).toBeDefined();
    expect(body.verificationResult).toBeDefined();
    expect(body.verificationResult.verified).toBe(true);
  });

  it('should reject response to expired request', async () => {
    // Create an expired request
    const expiredRequest = await prisma.verificationRequest.create({
      data: {
        verifierId: verifierUserId,
        holderDid,
        requestedAttributes: ['name'],
        status: 'CREATED',
        expiresAt: new Date(Date.now() - 1000), // Already expired
      },
    });

    const respondRes = await app.inject({
      method: 'POST',
      url: `/api/v1/verify/requests/${expiredRequest.id}/respond`,
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {
        credentialId,
        holderDidId,
        disclosedAttributes: ['name'],
      },
    });

    expect(respondRes.statusCode).toBe(400);
  });

  it('should reject response to already-responded request', async () => {
    // Create a request and respond to it
    const requestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/requests',
      headers: { authorization: `Bearer ${verifierToken}` },
      payload: {
        holderDid,
        requestedAttributes: ['name'],
      },
    });
    const requestId = requestRes.json().id;

    // First response
    await app.inject({
      method: 'POST',
      url: `/api/v1/verify/requests/${requestId}/respond`,
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {
        credentialId,
        holderDidId,
        disclosedAttributes: ['name'],
      },
    });

    // Second response — should be rejected
    const secondRes = await app.inject({
      method: 'POST',
      url: `/api/v1/verify/requests/${requestId}/respond`,
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {
        credentialId,
        holderDidId,
        disclosedAttributes: ['name'],
      },
    });

    expect(secondRes.statusCode).toBe(400);
  });

  it('should reject if holder DID does not match request', async () => {
    // Create request for holder's DID
    const requestRes = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/requests',
      headers: { authorization: `Bearer ${verifierToken}` },
      payload: {
        holderDid,
        requestedAttributes: ['name'],
      },
    });
    const requestId = requestRes.json().id;

    // Try to respond with a different user's DID
    const otherDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${verifierToken}` },
      payload: {},
    });
    const otherDidId = otherDidRes.json().id;

    const respondRes = await app.inject({
      method: 'POST',
      url: `/api/v1/verify/requests/${requestId}/respond`,
      headers: { authorization: `Bearer ${verifierToken}` },
      payload: {
        credentialId,
        holderDidId: otherDidId,
        disclosedAttributes: ['name'],
      },
    });

    expect(respondRes.statusCode).toBe(403);
  });

  it('should require authentication', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/requests/00000000-0000-0000-0000-000000000000/respond',
      payload: {
        credentialId,
        holderDidId,
        disclosedAttributes: ['name'],
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for non-existent request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/verify/requests/00000000-0000-0000-0000-000000000000/respond',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {
        credentialId,
        holderDidId,
        disclosedAttributes: ['name'],
      },
    });

    expect(res.statusCode).toBe(404);
  });
});
