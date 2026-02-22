/**
 * Credential Presentation Integration Tests
 *
 * Tests for /api/v1/presentations endpoints:
 * - POST /   (create presentation — FULL or SELECTIVE)
 * - GET /    (list holder's presentations)
 * - GET /:id (get presentation details)
 * - POST /:id/revoke (revoke a presentation)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('Presentation Routes - /api/v1/presentations', () => {
  let app: FastifyInstance;
  let holderToken: string;
  let holderUserId: string;
  let holderDidId: string;
  let holderDid: string;
  let issuerToken: string;
  let issuerUserId: string;
  let issuerDidId: string;
  let credentialId: string;

  const holderEmail = 'presentation-holder@example.com';
  const issuerEmail = 'presentation-issuer@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-presentations';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);

    // Clean up and create holder user
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
      await prisma.session.deleteMany({
        where: { userId: existingHolder.id },
      });
      await prisma.dID.deleteMany({ where: { userId: existingHolder.id } });
      await prisma.user.delete({ where: { email: holderEmail } });
    }

    // Clean up and create issuer user
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
      await prisma.session.deleteMany({
        where: { userId: existingIssuer.id },
      });
      await prisma.dID.deleteMany({ where: { userId: existingIssuer.id } });
      await prisma.user.delete({ where: { email: issuerEmail } });
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

    // Login both users
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

    // Issue a credential from issuer to holder
    const issueRes = await app.inject({
      method: 'POST',
      url: '/api/v1/credentials',
      headers: { authorization: `Bearer ${issuerToken}` },
      payload: {
        holderDidId,
        issuerDidId,
        credentialType: 'IdentityCredential',
        claims: {
          name: 'Alice Smith',
          dateOfBirth: '1990-01-15',
          nationality: 'British',
          idNumber: 'ID-12345',
        },
      },
    });
    credentialId = issueRes.json().id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.credentialPresentation.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { holderDid: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.credential.deleteMany({
      where: {
        OR: [
          { holderDid: { userId: holderUserId } },
          { issuerDid: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.dIDDocument.deleteMany({
      where: {
        OR: [
          { did: { userId: holderUserId } },
          { did: { userId: issuerUserId } },
        ],
      },
    });
    await prisma.dID.deleteMany({
      where: { userId: { in: [holderUserId, issuerUserId] } },
    });
    await prisma.session.deleteMany({
      where: { userId: { in: [holderUserId, issuerUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [holderUserId, issuerUserId] } },
    });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST / (create presentation) ====================

  describe('POST /api/v1/presentations', () => {
    it('should create a FULL presentation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'FULL',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body).toHaveProperty('id');
      expect(body.proofType).toBe('FULL');
      expect(body.status).toBe('ACTIVE');
      expect(body.disclosedAttributes).toBeDefined();
      // FULL should include all claims
      expect(body.disclosedAttributes).toContain('name');
      expect(body.disclosedAttributes).toContain('dateOfBirth');
      expect(body.disclosedAttributes).toContain('nationality');
      expect(body.disclosedAttributes).toContain('idNumber');
    });

    it('should create a SELECTIVE presentation with chosen attributes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'SELECTIVE',
          disclosedAttributes: ['name', 'nationality'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.proofType).toBe('SELECTIVE');
      expect(body.disclosedAttributes).toEqual(['name', 'nationality']);
    });

    it('should store presentation in CredentialPresentation table', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'FULL',
        },
      });

      const body = res.json();
      const record = await prisma.credentialPresentation.findUnique({
        where: { id: body.id },
      });
      expect(record).not.toBeNull();
      expect(record!.credentialId).toBe(credentialId);
      expect(record!.holderDidId).toBe(holderDidId);
      expect(record!.proofType).toBe('FULL');
      expect(record!.status).toBe('ACTIVE');
    });

    it('should require SELECTIVE to include disclosedAttributes', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'SELECTIVE',
          // Missing disclosedAttributes
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject if credential does not belong to holder', async () => {
      // Issuer tries to create presentation of a credential they issued
      // but the holderDidId belongs to the issuer (wrong)
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${issuerToken}` },
        payload: {
          credentialId,
          holderDidId: issuerDidId,
          proofType: 'FULL',
        },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        payload: {
          credentialId,
          holderDidId,
          proofType: 'FULL',
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== GET / (list presentations) ====================

  describe('GET /api/v1/presentations', () => {
    it('should list holder presentations', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.presentations)).toBe(true);
      expect(body.presentations.length).toBeGreaterThan(0);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('page');
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/presentations',
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== GET /:id (get presentation) ====================

  describe('GET /api/v1/presentations/:id', () => {
    let presentationId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'SELECTIVE',
          disclosedAttributes: ['name'],
        },
      });
      presentationId = res.json().id;
    });

    it('should get presentation details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/presentations/${presentationId}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBe(presentationId);
      expect(body.proofType).toBe('SELECTIVE');
      expect(body.disclosedAttributes).toEqual(['name']);
      expect(body).toHaveProperty('presentationData');
      // Selective presentation should have disclosed and hashed attributes
      expect(body.presentationData.disclosed).toHaveProperty('name');
      expect(body.presentationData.hashed).toBeDefined();
    });

    it('should return 404 for non-existent presentation', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/presentations/00000000-0000-0000-0000-000000000000',
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/presentations/${presentationId}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== POST /:id/revoke ====================

  describe('POST /api/v1/presentations/:id/revoke', () => {
    let revokePresentationId: string;

    beforeAll(async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'FULL',
        },
      });
      revokePresentationId = res.json().id;
    });

    it('should revoke a presentation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/presentations/${revokePresentationId}/revoke`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe('REVOKED');
      expect(body).toHaveProperty('revokedAt');
    });

    it('should reject revoking an already revoked presentation', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/presentations/${revokePresentationId}/revoke`,
        headers: { authorization: `Bearer ${holderToken}` },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/presentations/${revokePresentationId}/revoke`,
      });

      expect(res.statusCode).toBe(401);
    });
  });

  // ==================== Selective Disclosure Verification ====================

  describe('Selective Disclosure', () => {
    it('should hash non-disclosed attributes with SHA-256', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/presentations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: {
          credentialId,
          holderDidId,
          proofType: 'SELECTIVE',
          disclosedAttributes: ['name'],
        },
      });

      expect(res.statusCode).toBe(201);

      // Fetch presentation details
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/presentations/${res.json().id}`,
        headers: { authorization: `Bearer ${holderToken}` },
      });
      const body = getRes.json();

      // Disclosed field should be in cleartext
      expect(body.presentationData.disclosed.name).toBe('Alice Smith');
      // Non-disclosed fields should be SHA-256 hashes
      const hashedFields = body.presentationData.hashed;
      expect(hashedFields).toHaveProperty('dateOfBirth');
      expect(hashedFields).toHaveProperty('nationality');
      expect(hashedFields).toHaveProperty('idNumber');
      // Verify hash format (64 hex chars)
      expect(hashedFields.dateOfBirth).toMatch(/^[0-9a-f]{64}$/);
      // Verify hash is correct
      const expectedHash = createHash('sha256')
        .update('dateOfBirth:1990-01-15')
        .digest('hex');
      expect(hashedFields.dateOfBirth).toBe(expectedHash);
    });
  });
});
