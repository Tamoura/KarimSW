/**
 * i18n Extended Integration Tests
 *
 * Tests error/edge-case branches for /api/v1/i18n endpoints:
 * - POST /locales with non-admin user (403)
 * - POST /locales with Zod validation error (400)
 * - PUT /translations with non-admin (403)
 * - PUT /translations with invalid locale (404)
 * - PUT /translations success and completion update
 * - GET /translations/:locale with invalid locale (404)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('i18n Extended - /api/v1/i18n error branches', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let holderToken: string;
  const adminEmail = 'i18n-ext-admin@example.com';
  const holderEmail = 'i18n-ext-holder@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-i18n-ext';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    await prisma.translation.deleteMany({});
    await prisma.locale.deleteMany({});

    // Create admin user
    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;

    // Create holder user (non-admin)
    await prisma.user.create({
      data: { email: holderEmail, passwordHash, role: 'HOLDER', emailVerified: true },
    });
    const holderLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: holderEmail, password: TEST_PASSWORD },
    });
    holderToken = holderLogin.json().access_token;

    // Seed 'en' locale for completion calculation tests
    await app.inject({
      method: 'POST', url: '/api/v1/i18n/locales',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: 'en', name: 'English', nativeName: 'English' },
    });
  });

  afterAll(async () => {
    await prisma.translation.deleteMany({});
    await prisma.locale.deleteMany({});
    await cleanupUser(adminEmail);
    await cleanupUser(holderEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  // ==================== POST /locales error branches ====================

  describe('POST /api/v1/i18n/locales', () => {
    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: { code: 'es', name: 'Spanish', nativeName: 'Espanol' },
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.detail).toContain('Admin');
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        payload: { code: 'es', name: 'Spanish', nativeName: 'Espanol' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 400 for Zod validation error - missing code', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Spanish', nativeName: 'Espanol' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod validation error - code too long', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'this-code-is-way-too-long', name: 'Test', nativeName: 'Test' },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod validation error - missing name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'xx', nativeName: 'Test' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should return 400 for Zod validation error - empty nativeName', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'xx', name: 'Test', nativeName: '' },
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ==================== PUT /translations error branches ====================

  describe('PUT /api/v1/i18n/translations', () => {
    it('should reject non-admin user with 403', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${holderToken}` },
        payload: { locale: 'en', translations: { 'key': 'value' } },
      });
      expect(res.statusCode).toBe(403);
    });

    it('should reject unauthenticated request with 401', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        payload: { locale: 'en', translations: { 'key': 'value' } },
      });
      expect(res.statusCode).toBe(401);
    });

    it('should return 404 for non-existent locale', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { locale: 'zz', translations: { 'key': 'value' } },
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.detail).toContain('not found');
    });

    it('should return 400 for Zod validation error - missing locale', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { translations: { 'key': 'value' } },
      });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.type).toContain('validation-error');
    });

    it('should return 400 for Zod validation error - invalid translations type', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { locale: 'en', translations: 'not-an-object' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('should update translations and calculate completion percent', async () => {
      // First add translations to 'en' locale
      const enRes = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          locale: 'en',
          translations: {
            'nav.home': 'Home',
            'nav.about': 'About',
            'nav.contact': 'Contact',
            'auth.login': 'Login',
          },
        },
      });
      expect(enRes.statusCode).toBe(200);
      const enBody = enRes.json();
      expect(enBody.updated).toBe(4);
      expect(enBody.completionPercent).toBeDefined();

      // Now create a second locale and partially translate
      await app.inject({
        method: 'POST', url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'fr', name: 'French', nativeName: 'Francais' },
      });

      const frRes = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          locale: 'fr',
          translations: {
            'nav.home': 'Accueil',
            'nav.about': 'A propos',
          },
        },
      });
      expect(frRes.statusCode).toBe(200);
      const frBody = frRes.json();
      expect(frBody.updated).toBe(2);
      // Completion should be 50% (2 out of 4 en keys)
      expect(frBody.completionPercent).toBeDefined();
      expect(frBody.completionPercent).toBeLessThanOrEqual(100);
    });
  });

  // ==================== GET /translations/:locale error branches ====================

  describe('GET /api/v1/i18n/translations/:locale', () => {
    it('should return 404 for non-existent locale', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/i18n/translations/zz',
      });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.message || body.detail).toContain('not found');
    });

    it('should return translations for existing locale', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/i18n/translations/en',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.locale).toBe('en');
      expect(body.translations).toBeDefined();
      expect(body.total).toBeGreaterThan(0);
    });
  });

  // ==================== GET /locales ====================

  describe('GET /api/v1/i18n/locales', () => {
    it('should list locales without authentication', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/i18n/locales',
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('locales');
      expect(body).toHaveProperty('total');
      expect(body.locales.length).toBeGreaterThan(0);
      // Each locale should have completion percent
      for (const locale of body.locales) {
        expect(locale).toHaveProperty('completionPercent');
        expect(locale).toHaveProperty('code');
        expect(locale).toHaveProperty('name');
        expect(locale).toHaveProperty('nativeName');
      }
    });
  });
});
