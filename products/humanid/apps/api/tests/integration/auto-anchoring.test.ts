/**
 * Auto-Anchoring Integration Tests
 *
 * Tests that DID creation, credential issuance, and credential revocation
 * automatically queue BlockchainAnchor records with PENDING status.
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Auto-Anchoring Integration', () => {
  let app: FastifyInstance;
  let holderToken: string;
  let holderUserId: string;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;

  const holderEmail = 'anchor-holder@example.com';
  const issuerEmail = 'anchor-issuer@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-anchoring';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    for (const email of [holderEmail, issuerEmail]) {
      const existing = await prisma.user.findUnique({
        where: { email },
      });
      if (existing) {
        await prisma.blockchainAnchor.deleteMany({
          where: {
            entityId: {
              in: (
                await prisma.dID.findMany({
                  where: { userId: existing.id },
                  select: { id: true },
                })
              ).map((d) => d.id),
            },
          },
        });
        await prisma.credentialPresentation.deleteMany({
          where: { holderDid: { userId: existing.id } },
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

    const holderUser = await prisma.user.create({
      data: {
        email: holderEmail,
        passwordHash,
        role: 'HOLDER',
        emailVerified: true,
      },
    });
    holderUserId = holderUser.id;

    const issuerUser = await prisma.user.create({
      data: {
        email: issuerEmail,
        passwordHash,
        role: 'ISSUER',
        emailVerified: true,
      },
    });
    issuerUserId = issuerUser.id;

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
    issuerToken = issuerLogin.json().access_token;

    // Create issuer DID
    const issuerDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {},
    });
    issuerDidId = issuerDidRes.json().id;
  });

  afterAll(async () => {
    const allUserIds = [holderUserId, issuerUserId];
    // Clean up anchors by entity IDs
    const allDids = await prisma.dID.findMany({
      where: { userId: { in: allUserIds } },
      select: { id: true },
    });
    const allCredentials = await prisma.credential.findMany({
      where: {
        OR: [
          { holderDid: { userId: { in: allUserIds } } },
          { issuerDid: { userId: { in: allUserIds } } },
        ],
      },
      select: { id: true },
    });
    const entityIds = [
      ...allDids.map((d) => d.id),
      ...allCredentials.map((c) => c.id),
    ];
    await prisma.blockchainAnchor.deleteMany({
      where: { entityId: { in: entityIds } },
    });
    await prisma.credentialPresentation.deleteMany({
      where: { holderDid: { userId: { in: allUserIds } } },
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

  it('should auto-queue anchor on DID creation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });
    expect(res.statusCode).toBe(201);
    const did = res.json();

    // Check that a BlockchainAnchor record was created
    const anchor = await prisma.blockchainAnchor.findFirst({
      where: {
        entityType: 'DID',
        entityId: did.id,
      },
    });
    expect(anchor).not.toBeNull();
    expect(anchor!.status).toBe('PENDING');
    expect(anchor!.chain).toBe('POLYGON');
    expect(anchor!.dataHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should auto-queue anchor on credential issuance', async () => {
    // Create holder DID
    const holderDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });
    const holderDidId = holderDidRes.json().id;

    // Issue credential
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'TestCredential',
        claims: { test: 'value' },
      },
    });
    expect(issueRes.statusCode).toBe(201);
    const credential = issueRes.json();

    // Check that a BlockchainAnchor record was created for the credential
    const anchor = await prisma.blockchainAnchor.findFirst({
      where: {
        entityType: 'CREDENTIAL',
        entityId: credential.id,
      },
    });
    expect(anchor).not.toBeNull();
    expect(anchor!.status).toBe('PENDING');
    expect(anchor!.chain).toBe('POLYGON');
    expect(anchor!.dataHash).toBe(credential.credentialHash);
  });

  it('should auto-queue anchor on credential revocation', async () => {
    // Create holder DID
    const holderDidRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${holderToken}` },
      payload: {},
    });
    const holderDidId = holderDidRes.json().id;

    // Issue credential
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'RevokableCredential',
        claims: { data: 'test' },
      },
    });
    const credentialId = issueRes.json().id;

    // Revoke
    const revokeRes = await app.inject({
      method: 'POST',
      url: `/api/v1/credentials/${credentialId}/revoke`,
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: { reason: 'Testing revocation' },
    });
    expect(revokeRes.statusCode).toBe(200);

    // Check that a REVOCATION anchor was created
    const anchor = await prisma.blockchainAnchor.findFirst({
      where: {
        entityType: 'REVOCATION',
        entityId: credentialId,
      },
    });
    expect(anchor).not.toBeNull();
    expect(anchor!.status).toBe('PENDING');
    expect(anchor!.chain).toBe('POLYGON');
  });
});
