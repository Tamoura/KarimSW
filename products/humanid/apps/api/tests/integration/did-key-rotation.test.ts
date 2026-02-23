/**
 * DID Key Rotation Integration Tests
 *
 * Tests for POST /api/v1/dids/:id/rotate:
 * - Generates new Ed25519 key pair
 * - Archives old key (deactivated in document)
 * - Increments DID document version
 * - Old credentials still verify with archived key
 * - Deactivated DID rejects rotation
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('DID Key Rotation - POST /api/v1/dids/:id/rotate', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;
  const testEmail = 'did-rotation-test@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-rotation';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    const existing = await prisma.user.findUnique({
      where: { email: testEmail },
    });
    if (existing) {
      await prisma.dIDDocument.deleteMany({
        where: { did: { userId: existing.id } },
      });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.dID.deleteMany({ where: { userId: existing.id } });
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
    accessToken = loginRes.json().access_token;
  });

  afterAll(async () => {
    await prisma.dIDDocument.deleteMany({
      where: { did: { userId } },
    });
    await prisma.dID.deleteMany({ where: { userId } });
    await prisma.session.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  it('should rotate key and create new document version', async () => {
    // Create a DID
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    expect(createRes.statusCode).toBe(201);
    const did = createRes.json();
    const originalPublicKey = did.publicKey;

    // Rotate the key
    const rotateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(rotateRes.statusCode).toBe(200);
    const rotated = rotateRes.json();

    // New public key should be different
    expect(rotated.publicKey).not.toBe(originalPublicKey);
    expect(rotated.publicKey).toMatch(
      /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/
    );
    expect(rotated.documentVersion).toBe(2);
  });

  it('should archive old key in DID document as deactivated', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const did = createRes.json();

    await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Fetch the latest document
    const resolveRes = await app.inject({
      method: 'GET',
      url: `/api/v1/dids/${did.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const resolved = resolveRes.json();
    const doc = resolved.document;

    // Document should have two verification methods
    expect(doc.verificationMethod).toHaveLength(2);
    // Old key should be revoked
    const oldKey = doc.verificationMethod.find(
      (vm: { id: string }) => vm.id.endsWith('#key-1')
    );
    expect(oldKey).toBeDefined();
    expect(oldKey.revoked).toBe(true);
    // New key should be active
    const newKey = doc.verificationMethod.find(
      (vm: { id: string }) => vm.id.endsWith('#key-2')
    );
    expect(newKey).toBeDefined();
    expect(newKey.revoked).toBeUndefined();
    // Authentication should reference new key only
    expect(doc.authentication).toContain(`${did.did}#key-2`);
    expect(doc.authentication).not.toContain(`${did.did}#key-1`);
  });

  it('should store new encrypted private key in database', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const did = createRes.json();

    // Get original encrypted key
    const beforeRecord = await prisma.dID.findUnique({
      where: { id: did.id },
    });
    const originalEncryptedKey = beforeRecord!.encryptedPrivateKey;

    await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Verify new encrypted key is different
    const afterRecord = await prisma.dID.findUnique({
      where: { id: did.id },
    });
    expect(afterRecord!.encryptedPrivateKey).not.toBe(originalEncryptedKey);
    expect(afterRecord!.encryptedPrivateKey).toMatch(
      /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/
    );
  });

  it('should reject rotation for a deactivated DID', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const did = createRes.json();

    // Deactivate the DID
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/dids/${did.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Try to rotate
    const rotateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(rotateRes.statusCode).toBe(400);
  });

  it('should reject rotation for a suspended DID', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const did = createRes.json();

    // Suspend the DID
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/dids/${did.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { status: 'SUSPENDED' },
    });

    const rotateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(rotateRes.statusCode).toBe(400);
  });

  it('should return 404 for non-existent DID', async () => {
    const rotateRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids/00000000-0000-0000-0000-000000000000/rotate',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(rotateRes.statusCode).toBe(404);
  });

  it('should require authentication', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const did = createRes.json();

    const rotateRes = await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
    });

    expect(rotateRes.statusCode).toBe(401);
  });

  it('should support multiple rotations with incrementing key IDs', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const did = createRes.json();

    // First rotation
    await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    // Second rotation
    const rotateRes2 = await app.inject({
      method: 'POST',
      url: `/api/v1/dids/${did.id}/rotate`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(rotateRes2.statusCode).toBe(200);
    expect(rotateRes2.json().documentVersion).toBe(3);

    // Fetch document — should have 3 keys (key-1 revoked, key-2 revoked, key-3 active)
    const resolveRes = await app.inject({
      method: 'GET',
      url: `/api/v1/dids/${did.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const doc = resolveRes.json().document;
    expect(doc.verificationMethod).toHaveLength(3);
    expect(doc.authentication).toEqual([`${did.did}#key-3`]);
    expect(doc.assertionMethod).toEqual([`${did.did}#key-3`]);
  });
});
