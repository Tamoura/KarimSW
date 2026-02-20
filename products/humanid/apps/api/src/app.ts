/**
 * HumanID API - Main Application Builder
 *
 * Registers all plugins in order and configures the Fastify instance.
 * Export `buildApp()` for use in index.ts and integration tests.
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import compress from '@fastify/compress';
import { ZodError } from 'zod';
import crypto from 'crypto';

// Plugins
import prismaPlugin from './plugins/prisma.js';
import redisPlugin from './plugins/redis.js';
import observabilityPlugin from './plugins/observability.js';
import authPlugin from './plugins/auth.js';

// Routes
import authRoutes from './routes/v1/auth.js';
import didRoutes from './routes/v1/dids.js';
import credentialRoutes from './routes/v1/credentials.js';
import walletRoutes from './routes/v1/wallet.js';
import verifyRoutes from './routes/v1/verify.js';
import issuerRoutes from './routes/v1/issuers.js';
import templateRoutes from './routes/v1/templates.js';
import webauthnRoutes from './routes/v1/webauthn.js';
import developerRoutes from './routes/v1/developer.js';
import organizationRoutes from './routes/v1/organizations.js';
import webhookRoutes from './routes/v1/webhooks.js';
import auditRoutes from './routes/v1/audit.js';
import ssoRoutes from './routes/v1/sso.js';
import eidasRoutes from './routes/v1/eidas.js';
import marketplaceRoutes from './routes/v1/marketplace.js';
import complianceRoutes from './routes/v1/compliance.js';
import regionRoutes from './routes/v1/regions.js';
import agentRoutes from './routes/v1/agents.js';
import governmentRoutes from './routes/v1/government.js';
import securityRoutes from './routes/v1/security.js';
import offlineRoutes from './routes/v1/offline.js';
import anchoringRoutes from './routes/v1/anchoring.js';
import federationRoutes from './routes/v1/federation.js';
import fraudRoutes from './routes/v1/fraud.js';
import orgDidRoutes from './routes/v1/org-dids.js';
import issuanceDelegationRoutes from './routes/v1/issuance-delegation.js';
import governanceRoutes from './routes/v1/governance.js';
import i18nRoutes from './routes/v1/i18n.js';

// Utils
import { logger } from './utils/logger.js';
import { AppError } from './types/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    trustProxy: true,
    bodyLimit: 1048576, // 1MB
    logger: process.env.NODE_ENV === 'development' ? {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    } : false,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'request_id',
    routerOptions: {
      maxParamLength: 256,
    },
  });

  // 1. Compress + Helmet (security headers)
  await fastify.register(compress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  });

  // 2. CORS
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3117')
    .split(',')
    .map((origin) => origin.trim().toLowerCase());

  const isProduction = process.env.NODE_ENV === 'production';

  await fastify.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        if (isProduction) {
          callback(new Error('Origin required'), false);
          return;
        }
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin.toLowerCase())) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 3. JWT (HS256 pinned)
  await fastify.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  // 4. Observability (register first to track all requests)
  await fastify.register(observabilityPlugin);

  // 5. Prisma
  await fastify.register(prismaPlugin);

  // 6. Redis
  await fastify.register(redisPlugin);

  // 7. Rate limiting (Redis-backed when available)
  const rateLimitConfig: Record<string, unknown> = {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'),
    allowList: (request: FastifyRequest) => {
      const url = request.url.split('?')[0];
      return url === '/health' || url === '/ready';
    },
    addHeadersOnExemption: false,
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    keyGenerator: (request: FastifyRequest) => {
      const req = request as FastifyRequest & { currentUser?: { id: string }; apiKey?: { id: string } };
      if (req.currentUser?.id) {
        return `user:${req.currentUser.id}`;
      }
      if (req.apiKey?.id) {
        return `apikey:${req.apiKey.id}`;
      }
      return `ip:${request.ip}`;
    },
  };

  if (fastify.redis) {
    logger.info('Rate limiting configured with Redis distributed store');
  } else {
    logger.warn('Redis not configured - rate limiting uses in-memory store');
  }

  await fastify.register(rateLimit, rateLimitConfig);

  // 8. Auth plugin
  await fastify.register(authPlugin);

  // 9. Health route
  fastify.get('/health', async (request, reply) => {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
    let overallStatus = 'healthy';

    // Check database connectivity
    const dbStart = Date.now();
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'healthy',
        latency: Date.now() - dbStart,
      };
    } catch (error) {
      checks.database = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      overallStatus = 'unhealthy';
    }

    // Check Redis connectivity (if configured)
    if (fastify.redis) {
      const redisStart = Date.now();
      try {
        await fastify.redis.ping();
        checks.redis = {
          status: 'healthy',
          latency: Date.now() - redisStart,
        };
      } catch (error) {
        checks.redis = {
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        // Redis is optional, don't mark overall as unhealthy
      }
    } else if (process.env.REDIS_URL) {
      checks.redis = { status: 'not-connected' };
    }

    const statusCode = overallStatus === 'healthy' ? 200 : 503;

    // Only expose infrastructure details to authenticated internal callers
    const internalKey = process.env.INTERNAL_API_KEY;
    const providedKey = request.headers['x-internal-api-key'] as string | undefined;
    const isAuthorized = internalKey && providedKey &&
      internalKey.length === providedKey.length &&
      crypto.timingSafeEqual(Buffer.from(internalKey), Buffer.from(providedKey));

    if (isAuthorized) {
      return reply.code(statusCode).send({
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks,
      });
    }

    return reply.code(statusCode).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // 9b. Readiness probe (lightweight DB check for k8s/load balancers)
  fastify.get('/ready', async (_request, reply) => {
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ready' });
    } catch {
      return reply.code(503).send({ status: 'not-ready' });
    }
  });

  // Register API routes under /api/v1 prefix
  await fastify.register(authRoutes, { prefix: '/api/v1/auth' });
  await fastify.register(didRoutes, { prefix: '/api/v1/dids' });
  await fastify.register(credentialRoutes, { prefix: '/api/v1/credentials' });
  await fastify.register(walletRoutes, { prefix: '/api/v1/wallet' });
  await fastify.register(verifyRoutes, { prefix: '/api/v1/verify' });
  await fastify.register(issuerRoutes, { prefix: '/api/v1/issuers' });
  await fastify.register(templateRoutes, { prefix: '/api/v1/templates' });
  await fastify.register(webauthnRoutes, { prefix: '/api/v1/webauthn' });
  await fastify.register(developerRoutes, { prefix: '/api/v1/developer' });
  await fastify.register(organizationRoutes, { prefix: '/api/v1/orgs' });
  await fastify.register(webhookRoutes, { prefix: '/api/v1/webhooks' });
  await fastify.register(auditRoutes, { prefix: '/api/v1/audit' });
  await fastify.register(ssoRoutes, { prefix: '/api/v1/sso' });
  await fastify.register(eidasRoutes, { prefix: '/api/v1/eidas' });
  await fastify.register(marketplaceRoutes, { prefix: '/api/v1' });
  await fastify.register(complianceRoutes, { prefix: '/api/v1/compliance' });
  await fastify.register(regionRoutes, { prefix: '/api/v1/regions' });
  await fastify.register(agentRoutes, { prefix: '/api/v1/agents' });
  await fastify.register(governmentRoutes, { prefix: '/api/v1/government' });
  await fastify.register(securityRoutes, { prefix: '/api/v1/security' });
  await fastify.register(offlineRoutes, { prefix: '/api/v1/offline' });
  await fastify.register(anchoringRoutes, { prefix: '/api/v1/anchoring' });
  await fastify.register(federationRoutes, { prefix: '/api/v1/federation' });
  await fastify.register(fraudRoutes, { prefix: '/api/v1/fraud' });
  await fastify.register(orgDidRoutes, { prefix: '/api/v1/org-dids' });
  await fastify.register(issuanceDelegationRoutes, { prefix: '/api/v1/issuance-delegation' });
  await fastify.register(governanceRoutes, { prefix: '/api/v1/governance' });
  await fastify.register(i18nRoutes, { prefix: '/api/v1/i18n' });

  // /.well-known/security.txt - RFC 9116
  fastify.get('/.well-known/security.txt', async (_request, reply) => {
    const securityTxt = [
      'Contact: security@humanid.dev',
      'Encryption: https://humanid.dev/.well-known/pgp-key.txt',
      'Acknowledgments: https://humanid.dev/security/hall-of-fame',
      'Policy: https://humanid.dev/security/bug-bounty',
      'Preferred-Languages: en',
      `Expires: ${new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()}`,
    ].join('\n');

    return reply.type('text/plain').send(securityTxt);
  });

  // OpenAPI spec endpoint
  fastify.get('/api/v1/openapi.json', async (_request, reply) => {
    return reply.send({
      openapi: '3.0.3',
      info: {
        title: 'HumanID API',
        version: '1.0.0',
        description: 'Universal Digital Identity Platform — Decentralized identity, verifiable credentials, and zero-knowledge proofs.',
        contact: { name: 'HumanID', url: 'https://humanid.dev' },
        license: { name: 'Proprietary' },
      },
      servers: [
        { url: 'http://localhost:5013', description: 'Local development' },
        { url: 'https://api.humanid.dev', description: 'Production' },
      ],
      paths: {
        '/api/v1/auth/register': {
          post: { summary: 'Register a new user', tags: ['Auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 8 }, role: { type: 'string', enum: ['HOLDER', 'ISSUER', 'DEVELOPER'] } } } } } }, responses: { '201': { description: 'User created' }, '409': { description: 'Email already registered' } } },
        },
        '/api/v1/auth/login': {
          post: { summary: 'Login', tags: ['Auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } } }, responses: { '200': { description: 'JWT token pair' }, '401': { description: 'Invalid credentials' } } },
        },
        '/api/v1/auth/refresh': {
          post: { summary: 'Refresh token', tags: ['Auth'], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['refresh_token'], properties: { refresh_token: { type: 'string' } } } } } }, responses: { '200': { description: 'New token pair' } } },
        },
        '/api/v1/dids': {
          post: { summary: 'Create a new DID', tags: ['DIDs'], security: [{ BearerAuth: [] }], responses: { '201': { description: 'DID created with Ed25519 key pair' } } },
          get: { summary: 'List user DIDs', tags: ['DIDs'], security: [{ BearerAuth: [] }], responses: { '200': { description: 'List of DIDs' } } },
        },
        '/api/v1/dids/{id}': {
          get: { summary: 'Resolve a DID', tags: ['DIDs'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }], responses: { '200': { description: 'DID with document' } } },
          patch: { summary: 'Update DID status', tags: ['DIDs'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED'] } } } } } }, responses: { '200': { description: 'DID updated' } } },
          delete: { summary: 'Deactivate a DID', tags: ['DIDs'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'DID deactivated' } } },
        },
        '/api/v1/credentials': {
          post: { summary: 'Issue a credential', tags: ['Credentials'], security: [{ BearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['holderDidId', 'issuerDidId', 'credentialType', 'claims'], properties: { holderDidId: { type: 'string', format: 'uuid' }, issuerDidId: { type: 'string', format: 'uuid' }, credentialType: { type: 'string' }, claims: { type: 'object' }, expiresAt: { type: 'string', format: 'date-time' } } } } } }, responses: { '201': { description: 'Credential issued' } } },
          get: { summary: 'List credentials', tags: ['Credentials'], security: [{ BearerAuth: [] }], parameters: [{ name: 'role', in: 'query', schema: { type: 'string', enum: ['holder', 'issuer'] } }], responses: { '200': { description: 'Credential list' } } },
        },
        '/api/v1/credentials/{id}': {
          get: { summary: 'Get credential details', tags: ['Credentials'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Credential with decrypted claims' } } },
        },
        '/api/v1/credentials/{id}/revoke': {
          post: { summary: 'Revoke a credential', tags: ['Credentials'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Credential revoked' } } },
        },
        '/api/v1/verify/credentials': {
          post: { summary: 'Verify a credential (4-step)', tags: ['Verification'], security: [{ BearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['credentialId'], properties: { credentialId: { type: 'string', format: 'uuid' } } } } } }, responses: { '200': { description: 'Verification result with checks' } } },
        },
        '/api/v1/wallet/credentials': {
          get: { summary: 'List wallet credentials', tags: ['Wallet'], security: [{ BearerAuth: [] }], responses: { '200': { description: 'Holder credentials' } } },
        },
        '/api/v1/developer/keys': {
          post: { summary: 'Create API key', tags: ['Developer'], security: [{ BearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name', 'environment'], properties: { name: { type: 'string' }, environment: { type: 'string', enum: ['SANDBOX', 'PRODUCTION'] } } } } } }, responses: { '201': { description: 'API key created (key shown once)' } } },
          get: { summary: 'List API keys', tags: ['Developer'], security: [{ BearerAuth: [] }], responses: { '200': { description: 'API key list' } } },
        },
        '/api/v1/developer/keys/{id}/rotate': {
          post: { summary: 'Rotate API key', tags: ['Developer'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'New key (old revoked)' } } },
        },
        '/api/v1/developer/keys/{id}': {
          delete: { summary: 'Revoke API key', tags: ['Developer'], security: [{ BearerAuth: [] }], parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Key revoked' } } },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'JWT access token or API key' },
        },
      },
      tags: [
        { name: 'Auth', description: 'Authentication and session management' },
        { name: 'DIDs', description: 'Decentralized Identifier management' },
        { name: 'Credentials', description: 'Verifiable credential lifecycle' },
        { name: 'Verification', description: 'Credential verification engine' },
        { name: 'Wallet', description: 'Holder credential wallet' },
        { name: 'Developer', description: 'API key and developer tools' },
      ],
    });
  });

  // Validate :id path parameters
  const SAFE_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
  fastify.addHook('preValidation', async (request, reply) => {
    const params = request.params as Record<string, string> | undefined;
    if (params?.id && !SAFE_ID_RE.test(params.id)) {
      return reply.code(400).send({
        type: 'https://humanid.dev/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: 'Invalid ID format',
      });
    }
  });

  // 10. Global error handler
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send(error.toJSON());
    }

    // Validation errors from Zod
    if (error instanceof ZodError ||
        (error as Record<string, unknown>).name === 'ZodError' ||
        (error as Record<string, unknown>).validation) {
      return reply.code(400).send({
        type: 'https://humanid.dev/errors/validation-error',
        title: 'Validation Error',
        status: 400,
        detail: error instanceof Error ? error.message : 'Validation failed',
        request_id: request.id,
      });
    }

    // Log unexpected errors
    logger.error('Unexpected error', error, {
      request_id: request.id,
      url: request.url,
      method: request.method,
    });

    if (process.env.NODE_ENV === 'production') {
      return reply.code(500).send({
        type: 'https://humanid.dev/errors/internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred',
        request_id: request.id,
      });
    }

    return reply.code(500).send({
      type: 'https://humanid.dev/errors/internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: error instanceof Error ? error.message : 'Unknown error',
      request_id: request.id,
      stack: error instanceof Error ? error.stack : undefined,
    });
  });

  // 11. Not-found handler
  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      type: 'https://humanid.dev/errors/not-found',
      title: 'Not Found',
      status: 404,
      detail: `Route ${request.method} ${request.url} not found`,
      request_id: request.id,
    });
  });

  return fastify;
}
