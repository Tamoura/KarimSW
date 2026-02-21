/**
 * i18n Routes - /api/v1/i18n
 *
 * Internationalization support: locale management and translations.
 * Supports 20+ languages with translation management.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../types/index.js';

const createLocaleSchema = z.object({
  code: z.string().min(2).max(10).regex(/^[a-z]{2}(-[A-Z]{2})?(-[a-z]+)?$/, 'Invalid locale code format (e.g., en, en-US, en-US-variant)'),
  name: z.string().min(1),
  nativeName: z.string().min(1),
});

const updateTranslationsSchema = z.object({
  locale: z.string().min(2).max(10).regex(/^[a-z]{2}(-[A-Z]{2})?(-[a-z]+)?$/, 'Invalid locale code format'),
  translations: z.record(z.string()),
});

const i18nRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/i18n/locales - Add locale (admin)
  fastify.post('/locales', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      if (request.currentUser!.role !== 'ADMIN') {
        throw new AppError(403, 'forbidden', 'Admin access required');
      }

      const body = createLocaleSchema.parse(request.body);

      const locale = await fastify.prisma.locale.create({
        data: {
          code: body.code,
          name: body.name,
          nativeName: body.nativeName,
        },
      });

      return reply.code(201).send({
        id: locale.id,
        code: locale.code,
        name: locale.name,
        nativeName: locale.nativeName,
        isActive: locale.isActive,
        completionPercent: locale.completionPercent,
        createdAt: locale.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/i18n/locales - List locales (public)
  fastify.get('/locales', async (request, reply) => {
    const query = request.query as { page?: string; limit?: string };
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 100);
    const skip = (page - 1) * limit;

    const where = { isActive: true };
    const [locales, total] = await Promise.all([
      fastify.prisma.locale.findMany({
        where,
        orderBy: { code: 'asc' },
        skip,
        take: limit,
      }),
      fastify.prisma.locale.count({ where }),
    ]);

    return reply.send({
      locales: locales.map(l => ({
        code: l.code,
        name: l.name,
        nativeName: l.nativeName,
        completionPercent: l.completionPercent,
      })),
      total,
      page,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    });
  });

  // PUT /api/v1/i18n/translations - Update translations (admin)
  fastify.put('/translations', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      if (request.currentUser!.role !== 'ADMIN') {
        throw new AppError(403, 'forbidden', 'Admin access required');
      }

      const body = updateTranslationsSchema.parse(request.body);

      const locale = await fastify.prisma.locale.findUnique({
        where: { code: body.locale },
      });
      if (!locale) throw new AppError(404, 'not-found', 'Locale not found');

      let updated = 0;
      for (const [key, value] of Object.entries(body.translations)) {
        await fastify.prisma.translation.upsert({
          where: { localeId_key: { localeId: locale.id, key } },
          create: { localeId: locale.id, key, value },
          update: { value },
        });
        updated++;
      }

      // Update completion percentage
      const totalKeys = await fastify.prisma.translation.count({ where: { localeId: locale.id } });
      const enLocale = await fastify.prisma.locale.findUnique({ where: { code: 'en' } });
      const enKeys = enLocale
        ? await fastify.prisma.translation.count({ where: { localeId: enLocale.id } })
        : totalKeys;
      const completionPercent = enKeys > 0 ? Math.round((totalKeys / Math.max(enKeys, totalKeys)) * 100) : 100;

      await fastify.prisma.locale.update({
        where: { id: locale.id },
        data: { completionPercent },
      });

      return reply.send({ updated, locale: body.locale, completionPercent });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ type: 'https://humanid.dev/errors/validation-error', title: 'Validation Error', status: 400, detail: error.errors.map(e => e.message).join('; '), request_id: request.id });
      }
      throw error;
    }
  });

  // GET /api/v1/i18n/translations/:locale - Get translations for locale
  fastify.get('/translations/:locale', async (request, reply) => {
    try {
      const { locale: localeCode } = request.params as { locale: string };

      const locale = await fastify.prisma.locale.findUnique({
        where: { code: localeCode },
      });
      if (!locale) throw new AppError(404, 'not-found', 'Locale not found');

      const translations = await fastify.prisma.translation.findMany({
        where: { localeId: locale.id },
        orderBy: { key: 'asc' },
      });

      const translationMap: Record<string, string> = {};
      for (const t of translations) {
        translationMap[t.key] = t.value;
      }

      return reply.send({
        locale: localeCode,
        translations: translationMap,
        total: translations.length,
      });
    } catch (error) {
      if (error instanceof AppError) return reply.code(error.statusCode).send(error.toJSON());
      throw error;
    }
  });
};

export default i18nRoutes;
