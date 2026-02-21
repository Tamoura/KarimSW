/**
 * Webhook Routes - /api/v1/webhooks
 *
 * Real-time event notification system with HMAC-SHA256 signing.
 * Events: credential.issued, credential.verified, credential.revoked,
 *         did.created, did.deactivated
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { randomBytes, createHmac } from 'crypto';
import dns from 'dns/promises';
import { AppError } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { encrypt, decrypt } from '../../utils/encryption.js';

const VALID_EVENTS = [
  'credential.issued',
  'credential.verified',
  'credential.revoked',
  'did.created',
  'did.deactivated',
  'did.suspended',
  'verification.completed',
  'webhook.test',
];

const createWebhookSchema = z.object({
  url: z.string().url('Invalid URL'),
  events: z.array(z.string()).min(1, 'At least one event required'),
  description: z.string().max(500).optional(),
});

/**
 * Check if an IP address is private/reserved.
 */
function isPrivateIp(ip: string): boolean {
  const patterns = [
    /^127\.\d+\.\d+\.\d+$/,          // 127.0.0.0/8
    /^10\.\d+\.\d+\.\d+$/,           // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\./,    // 172.16.0.0/12
    /^192\.168\.\d+\.\d+$/,          // 192.168.0.0/16
    /^169\.254\.\d+\.\d+$/,          // link-local
    /^0\.0\.0\.0$/,
    /^::1$/,                          // IPv6 loopback
    /^fe80:/i,                        // IPv6 link-local
    /^fc00:/i,                        // IPv6 unique local
    /^fd/i,                           // IPv6 unique local
  ];
  return patterns.some(p => p.test(ip));
}

/**
 * SSRF protection: reject URLs pointing to private/internal networks.
 * Validates both hostname patterns and resolved DNS IPs.
 * Returns the resolved IP to enable DNS-pinned delivery (prevents DNS rebinding).
 */
async function validateWebhookUrl(url: string): Promise<string | null> {
  const parsed = new URL(url);

  // Must be HTTPS in production
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new AppError(400, 'bad-request', 'Webhook URL must use HTTPS or HTTP');
  }

  // Enforce HTTPS in production
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new AppError(400, 'bad-request', 'Webhook URL must use HTTPS in production');
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block private hostnames
  const blockedPatterns = [
    /^localhost$/i,
    /^127\.\d+\.\d+\.\d+$/,
    /^10\.\d+\.\d+\.\d+$/,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^192\.168\.\d+\.\d+$/,
    /^169\.254\.\d+\.\d+$/,
    /^0\.0\.0\.0$/,
    /^\[?::1\]?$/,
    /^\[?fe80:/i,
    /^\[?fc00:/i,
    /^\[?fd/i,
    /\.internal$/i,
    /\.local$/i,
    /\.localhost$/i,
  ];

  for (const pattern of blockedPatterns) {
    if (pattern.test(hostname)) {
      throw new AppError(400, 'bad-request', 'Webhook URL must not point to a private or internal network');
    }
  }

  // DNS resolution check: resolve hostname and validate all IPs are public
  // Return the pinned IP to prevent DNS rebinding during actual delivery
  try {
    const addresses = await dns.resolve4(hostname).catch(() => [] as string[]);
    const addresses6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    const allIps = [...addresses, ...addresses6];

    for (const ip of allIps) {
      if (isPrivateIp(ip)) {
        throw new AppError(400, 'bad-request', 'Webhook URL resolves to a private network address');
      }
    }

    // Return first resolved IP for pinning (null if no IPs resolved — e.g. IP literal in URL)
    return addresses[0] || addresses6[0] || null;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'bad-request', 'Could not resolve webhook URL hostname');
  }
}

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/v1/webhooks - Create webhook
  // Rate limited: 20 per hour per user to prevent webhook spam (RISK-006)
  fastify.post('/', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const body = createWebhookSchema.parse(request.body);
      const userId = request.currentUser!.id;

      // SSRF protection: validate URL is not internal
      await validateWebhookUrl(body.url); // return value not needed here (only pinned for delivery)

      // Validate event types
      for (const event of body.events) {
        if (!VALID_EVENTS.includes(event)) {
          throw new AppError(400, 'bad-request', `Invalid event type: ${event}`);
        }
      }

      const secret = `whsec_${randomBytes(24).toString('hex')}`;
      const encryptedSecret = encrypt(secret);

      const webhook = await fastify.prisma.webhook.create({
        data: {
          userId,
          url: body.url,
          secret: encryptedSecret,
          events: body.events,
          status: 'ACTIVE',
          description: body.description,
        },
      });

      logger.info('Webhook created', { webhookId: webhook.id, userId, events: body.events });

      return reply.code(201).send({
        id: webhook.id,
        url: webhook.url,
        secret, // Only shown once at creation
        events: webhook.events,
        status: webhook.status,
        description: webhook.description,
        createdAt: webhook.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          type: 'https://humanid.dev/errors/validation-error',
          title: 'Validation Error',
          status: 400,
          detail: error.errors.map((e) => e.message).join('; '),
          request_id: request.id,
        });
      }
      throw error;
    }
  });

  // GET /api/v1/webhooks - List webhooks
  fastify.get('/', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const userId = request.currentUser!.id;

      const webhooks = await fastify.prisma.webhook.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          url: true,
          events: true,
          status: true,
          description: true,
          failureCount: true,
          lastDeliveredAt: true,
          createdAt: true,
        },
      });

      return reply.send({
        webhooks: webhooks.map((w) => ({
          ...w,
          lastDeliveredAt: w.lastDeliveredAt?.toISOString() || null,
          createdAt: w.createdAt.toISOString(),
        })),
        total: webhooks.length,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/webhooks/:id - Get webhook
  fastify.get('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const webhook = await fastify.prisma.webhook.findFirst({
        where: { id, userId },
        select: {
          id: true,
          url: true,
          events: true,
          status: true,
          description: true,
          failureCount: true,
          lastDeliveredAt: true,
          createdAt: true,
        },
      });

      if (!webhook) {
        throw new AppError(404, 'not-found', 'Webhook not found');
      }

      return reply.send({
        ...webhook,
        lastDeliveredAt: webhook.lastDeliveredAt?.toISOString() || null,
        createdAt: webhook.createdAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // POST /api/v1/webhooks/:id/test - Send test delivery
  fastify.post('/:id/test', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const webhook = await fastify.prisma.webhook.findFirst({
        where: { id, userId },
      });

      if (!webhook) {
        throw new AppError(404, 'not-found', 'Webhook not found');
      }

      const testPayload = {
        event: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook delivery from HumanID',
          webhookId: webhook.id,
        },
      };

      // Create delivery record
      const delivery = await fastify.prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          eventType: 'webhook.test',
          payload: testPayload,
          status: 'PENDING',
        },
      });

      // SSRF protection: re-validate URL before delivery and pin the resolved IP
      // to prevent DNS rebinding between validation and the actual HTTP request
      const resolvedIp = await validateWebhookUrl(webhook.url);

      // Attempt delivery (fire-and-forget for test)
      let deliveryStatus = 'FAILED';
      let httpStatusCode: number | null = null;
      let responseBody: string | null = null;

      try {
        const rawSecret = decrypt(webhook.secret);
        const signature = createHmac('sha256', rawSecret)
          .update(JSON.stringify(testPayload))
          .digest('hex');

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        // Build fetch URL: if we resolved an IP, replace hostname with pinned IP
        // and pass the original hostname in the Host header to prevent rebinding
        const parsedUrl = new URL(webhook.url);
        const deliveryUrl = resolvedIp
          ? `${parsedUrl.protocol}//${resolvedIp}${parsedUrl.port ? ':' + parsedUrl.port : ''}${parsedUrl.pathname}${parsedUrl.search}`
          : webhook.url;

        const res = await fetch(deliveryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Host': parsedUrl.host,
            'X-HumanID-Signature': `sha256=${signature}`,
            'X-HumanID-Event': 'webhook.test',
          },
          body: JSON.stringify(testPayload),
          signal: controller.signal,
          redirect: 'error',
        }).catch(() => null);

        clearTimeout(timeout);

        if (res) {
          httpStatusCode = res.status;
          responseBody = await res.text().catch(() => null);
          deliveryStatus = res.ok ? 'DELIVERED' : 'FAILED';
        }
      } catch {
        // Delivery failed, that's OK for test
      }

      await fastify.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: deliveryStatus as 'DELIVERED' | 'FAILED',
          httpStatusCode,
          responseBody,
          deliveredAt: deliveryStatus === 'DELIVERED' ? new Date() : null,
        },
      });

      return reply.send({
        deliveryId: delivery.id,
        status: deliveryStatus,
        httpStatusCode,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // GET /api/v1/webhooks/:id/deliveries - Delivery log
  fastify.get('/:id/deliveries', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const webhook = await fastify.prisma.webhook.findFirst({
        where: { id, userId },
      });

      if (!webhook) {
        throw new AppError(404, 'not-found', 'Webhook not found');
      }

      const query = request.query as { page?: string; limit?: string };
      const page = Math.max(1, parseInt(query.page || '1'));
      const limit = Math.max(1, Math.min(parseInt(query.limit || '50'), 100));
      const skip = (page - 1) * limit;

      const [deliveries, total] = await Promise.all([
        fastify.prisma.webhookDelivery.findMany({
          where: { webhookId: id },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          select: {
            id: true,
            eventType: true,
            status: true,
            httpStatusCode: true,
            attempt: true,
            deliveredAt: true,
            createdAt: true,
          },
        }),
        fastify.prisma.webhookDelivery.count({ where: { webhookId: id } }),
      ]);

      return reply.send({
        deliveries: deliveries.map((d) => ({
          ...d,
          deliveredAt: d.deliveredAt?.toISOString() || null,
          createdAt: d.createdAt.toISOString(),
        })),
        total,
        page,
        pageSize: limit,
      });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });

  // DELETE /api/v1/webhooks/:id - Delete webhook
  fastify.delete('/:id', async (request, reply) => {
    try {
      await fastify.authenticate(request);
      const { id } = request.params as { id: string };
      const userId = request.currentUser!.id;

      const webhook = await fastify.prisma.webhook.findFirst({
        where: { id, userId },
      });

      if (!webhook) {
        throw new AppError(404, 'not-found', 'Webhook not found');
      }

      // Delete deliveries first, then webhook
      await fastify.prisma.webhookDelivery.deleteMany({ where: { webhookId: id } });
      await fastify.prisma.webhook.delete({ where: { id } });

      logger.info('Webhook deleted', { webhookId: id, userId });

      return reply.send({ message: 'Webhook deleted' });
    } catch (error) {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send(error.toJSON());
      }
      throw error;
    }
  });
};

export default webhookRoutes;
