/**
 * i18n (Internationalization) Integration Tests
 *
 * Tests for /api/v1/i18n endpoints:
 * - GET /locales          (list supported locales)
 * - POST /locales         (add locale - admin)
 * - GET /translations/:locale (get translations)
 * - PUT /translations     (update translations - admin)
 */

import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const TEST_PASSWORD = 'Test123!@#';
const BCRYPT_ROUNDS = 10;

describe('i18n - /api/v1/i18n', () => {
  let app: FastifyInstance;
  let adminToken: string;
  const adminEmail = 'i18n-admin@example.com';

  async function cleanupUser(email: string) {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.apiKey.deleteMany({ where: { userId: existing.id } });
      await prisma.session.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { email } });
    }
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-jwt-secret-for-i18n';
    process.env.INTERNAL_API_KEY = 'test-internal-api-key';
    process.env.CLAIMS_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    app = await buildApp();

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, BCRYPT_ROUNDS);
    await cleanupUser(adminEmail);
    await prisma.translation.deleteMany({});
    await prisma.locale.deleteMany({});

    await prisma.user.create({
      data: { email: adminEmail, passwordHash, role: 'ADMIN', emailVerified: true },
    });
    const adminLogin = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      payload: { email: adminEmail, password: TEST_PASSWORD },
    });
    adminToken = adminLogin.json().access_token;
  });

  afterAll(async () => {
    await prisma.translation.deleteMany({});
    await prisma.locale.deleteMany({});
    await cleanupUser(adminEmail);
    delete process.env.JWT_SECRET;
    delete process.env.INTERNAL_API_KEY;
    delete process.env.CLAIMS_ENCRYPTION_KEY;
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/v1/i18n/locales', () => {
    it('should add a locale (admin)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/i18n/locales',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { code: 'en', name: 'English', nativeName: 'English' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().code).toBe('en');
    });

    it('should add multiple locales', async () => {
      const locales = [
        { code: 'fr', name: 'French', nativeName: 'Français' },
        { code: 'de', name: 'German', nativeName: 'Deutsch' },
        { code: 'ja', name: 'Japanese', nativeName: '日本語' },
        { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
      ];
      for (const locale of locales) {
        const res = await app.inject({
          method: 'POST', url: '/api/v1/i18n/locales',
          headers: { authorization: `Bearer ${adminToken}` },
          payload: locale,
        });
        expect(res.statusCode).toBe(201);
      }
    });
  });

  describe('GET /api/v1/i18n/locales', () => {
    it('should list supported locales (public)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/i18n/locales',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('locales');
      expect(body.locales.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('PUT /api/v1/i18n/translations', () => {
    it('should update translations (admin)', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/i18n/translations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          locale: 'fr',
          translations: {
            'auth.login.title': 'Connexion',
            'auth.login.email': 'Adresse e-mail',
            'auth.login.password': 'Mot de passe',
            'nav.home': 'Accueil',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.updated).toBe(4);
    });
  });

  describe('GET /api/v1/i18n/translations/:locale', () => {
    it('should get translations for locale', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/i18n/translations/fr',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveProperty('locale', 'fr');
      expect(body).toHaveProperty('translations');
      expect(body.translations['auth.login.title']).toBe('Connexion');
    });
  });
});
