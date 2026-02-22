/**
 * DID Service Endpoints Integration Tests
 *
 * Tests for:
 * - POST /api/v1/dids/:id/services — Add service endpoint
 * - DELETE /api/v1/dids/:id/services/:serviceId — Remove service endpoint
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('DID Service Endpoints', () => {
  let app: FastifyInstance;
  let accessToken: string;
  let userId: string;
  let didId: string;
  let didString: string;
  const testEmail = 'did-services-test@example.com';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-services';
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

    // Create a DID for testing
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/dids',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {},
    });
    const created = createRes.json();
    didId = created.id;
    didString = created.did;
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

  describe('POST /api/v1/dids/:id/services', () => {
    it('should add a service endpoint to the DID document', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${didId}/services`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          type: 'MessagingService',
          serviceEndpoint: 'https://example.com/messaging',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.documentVersion).toBeGreaterThan(1);

      // Verify document has the service
      const resolveRes = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${didId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const doc = resolveRes.json().document;
      expect(doc.service).toHaveLength(1);
      expect(doc.service[0].type).toBe('MessagingService');
      expect(doc.service[0].serviceEndpoint).toBe(
        'https://example.com/messaging'
      );
      expect(doc.service[0].id).toMatch(
        new RegExp(`^${didString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}#service-`)
      );
    });

    it('should add multiple services', async () => {
      // Create a fresh DID for this test
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });
      const freshDid = createRes.json();

      // Add first service
      await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${freshDid.id}/services`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          type: 'MessagingService',
          serviceEndpoint: 'https://example.com/messaging',
        },
      });

      // Add second service
      await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${freshDid.id}/services`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          type: 'CredentialExchange',
          serviceEndpoint: 'https://example.com/exchange',
        },
      });

      const resolveRes = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${freshDid.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const doc = resolveRes.json().document;
      expect(doc.service).toHaveLength(2);
    });

    it('should reject invalid service payload', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${didId}/services`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: { type: '' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${didId}/services`,
        payload: {
          type: 'MessagingService',
          serviceEndpoint: 'https://example.com/messaging',
        },
      });

      expect(res.statusCode).toBe(401);
    });

    it('should reject for deactivated DID', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });
      const tempDid = createRes.json();

      await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${tempDid.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${tempDid.id}/services`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          type: 'MessagingService',
          serviceEndpoint: 'https://example.com/messaging',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v1/dids/:id/services/:serviceId', () => {
    it('should remove a service endpoint from the DID document', async () => {
      // Create a fresh DID and add a service
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/dids',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {},
      });
      const freshDid = createRes.json();

      const addRes = await app.inject({
        method: 'POST',
        url: `/api/v1/dids/${freshDid.id}/services`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          type: 'MessagingService',
          serviceEndpoint: 'https://example.com/messaging',
        },
      });
      const serviceId = addRes.json().serviceId;

      // Remove the service
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${freshDid.id}/services/${encodeURIComponent(serviceId)}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(delRes.statusCode).toBe(200);

      // Verify it's gone
      const resolveRes = await app.inject({
        method: 'GET',
        url: `/api/v1/dids/${freshDid.id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      const doc = resolveRes.json().document;
      expect(doc.service).toHaveLength(0);
    });

    it('should return 404 for non-existent service ID', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${didId}/services/${encodeURIComponent(didString + '#service-nonexistent')}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });

      expect(res.statusCode).toBe(404);
    });

    it('should require authentication', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/dids/${didId}/services/${encodeURIComponent(didString + '#service-1')}`,
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
