/**
 * Observability Plugin
 *
 * Provides comprehensive observability for production monitoring:
 * - Request/response logging with correlation IDs
 * - Performance tracking (request duration)
 * - Error rate monitoring
 * - Prometheus metrics via prom-client at GET /metrics (RISK-008)
 * - Correlation IDs via X-Request-ID header
 * - Sensitive data sanitization in logs
 *
 * Prometheus scraping makes metrics survive API restarts because the
 * time-series data is stored externally in the Prometheus server.
 */

import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Prometheus registry + metrics
// ---------------------------------------------------------------------------

// Use a dedicated registry (not the default global) so that multiple
// buildApp() calls in tests don't double-register metrics.
const promRegistry = new Registry();

collectDefaultMetrics({ register: promRegistry, prefix: 'humanid_' });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'status_code', 'route'] as const,
  registers: [promRegistry],
});

const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'status_code', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [promRegistry],
});

// ---------------------------------------------------------------------------
// Legacy in-memory metrics (kept for /internal/metrics JSON endpoint)
// ---------------------------------------------------------------------------

class CircularBuffer {
  private data: number[];
  private index = 0;
  private _size = 0;
  constructor(private maxSize: number) {
    this.data = new Array(maxSize).fill(0);
  }
  push(value: number): void {
    this.data[this.index] = value;
    this.index = (this.index + 1) % this.maxSize;
    if (this._size < this.maxSize) this._size++;
  }
  toArray(): number[] {
    if (this._size < this.maxSize) return this.data.slice(0, this._size);
    return [...this.data.slice(this.index), ...this.data.slice(0, this.index)];
  }
  get length(): number { return this._size; }
}

interface LegacyMetrics {
  requests: { total: number; byStatus: Record<number, number>; byMethod: Record<string, number> };
  errors: { total: number; byType: Record<string, number> };
  performance: { totalDuration: number; requestCount: number; durations: CircularBuffer };
}

const legacyMetrics: LegacyMetrics = {
  requests: { total: 0, byStatus: {}, byMethod: {} },
  errors: { total: 0, byType: {} },
  performance: { totalDuration: 0, requestCount: 0, durations: new CircularBuffer(1000) },
};

function trackLegacyMetrics(request: FastifyRequest, reply: FastifyReply, duration: number): void {
  legacyMetrics.requests.total++;
  legacyMetrics.requests.byStatus[reply.statusCode] =
    (legacyMetrics.requests.byStatus[reply.statusCode] || 0) + 1;
  legacyMetrics.requests.byMethod[request.method] =
    (legacyMetrics.requests.byMethod[request.method] || 0) + 1;

  if (reply.statusCode >= 400) {
    legacyMetrics.errors.total++;
    const errorType = reply.statusCode >= 500 ? '5xx' : '4xx';
    legacyMetrics.errors.byType[errorType] = (legacyMetrics.errors.byType[errorType] || 0) + 1;
  }

  legacyMetrics.performance.totalDuration += duration;
  legacyMetrics.performance.requestCount++;
  legacyMetrics.performance.durations.push(duration);
}

function calculatePercentile(buf: CircularBuffer, percentile: number): number {
  if (buf.length === 0) return 0;
  const sorted = buf.toArray().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const observabilityPlugin: FastifyPluginAsync = async (fastify) => {
  // Assign correlation ID on every request
  fastify.addHook('onRequest', async (request, reply) => {
    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();
    request.id = requestId;
    reply.header('x-request-id', requestId);
    request.startTime = Date.now();

    logger.debug('Incoming request', {
      request_id: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      user_agent: request.headers['user-agent'],
    });
  });

  // Response logging + metrics tracking
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());
    const durationSeconds = duration / 1000;

    // Normalise route: use routeOptions.url when available to avoid high-cardinality
    const route = (request.routeOptions as any)?.url ?? request.url ?? 'unknown';
    const labels = {
      method: request.method,
      status_code: String(reply.statusCode),
      route,
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);

    trackLegacyMetrics(request, reply, duration);

    const statusCode = reply.statusCode;
    const logData: Record<string, unknown> = {
      request_id: request.id,
      method: request.method,
      url: request.url,
      status: statusCode,
      duration_ms: duration,
      ip: request.ip,
    };

    if (request.currentUser) {
      logData.user_id = request.currentUser.id;
    }

    if (statusCode >= 500) {
      logger.error('Request completed with error', undefined, logData);
    } else if (statusCode >= 400) {
      logger.warn('Request completed with client error', logData);
    } else {
      logger.info('Request completed', logData);
    }
  });

  // ── GET /metrics — Prometheus scrape endpoint (RISK-008) ──────────────────
  fastify.get('/metrics', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
      return reply.code(500).send({ error: 'Metrics endpoint not configured' });
    }

    const expectedValue = `Bearer ${expectedKey}`;
    const suppliedValue = authHeader || '';
    const isValid =
      suppliedValue.length === expectedValue.length &&
      crypto.timingSafeEqual(Buffer.from(suppliedValue), Buffer.from(expectedValue));

    if (!isValid) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const output = await promRegistry.metrics();
    return reply
      .header('Content-Type', promRegistry.contentType)
      .send(output);
  });

  // ── GET /internal/metrics — Legacy JSON endpoint (kept for compatibility) ─
  fastify.get('/internal/metrics', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const expectedKey = process.env.INTERNAL_API_KEY;

    if (!expectedKey) {
      return reply.code(500).send({ error: 'Metrics endpoint not configured' });
    }

    const expectedValue = `Bearer ${expectedKey}`;
    const suppliedValue = authHeader || '';
    const isValid =
      suppliedValue.length === expectedValue.length &&
      crypto.timingSafeEqual(Buffer.from(suppliedValue), Buffer.from(expectedValue));

    if (!isValid) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const buf = legacyMetrics.performance.durations;
    const avgDuration =
      legacyMetrics.performance.requestCount > 0
        ? legacyMetrics.performance.totalDuration / legacyMetrics.performance.requestCount
        : 0;

    return reply.send({
      requests: {
        total: legacyMetrics.requests.total,
        by_status: legacyMetrics.requests.byStatus,
        by_method: legacyMetrics.requests.byMethod,
      },
      errors: {
        total: legacyMetrics.errors.total,
        error_rate:
          legacyMetrics.requests.total > 0
            ? ((legacyMetrics.errors.total / legacyMetrics.requests.total) * 100).toFixed(2) + '%'
            : '0%',
        by_type: legacyMetrics.errors.byType,
      },
      performance: {
        avg_duration_ms: Math.round(avgDuration),
        p50_ms: Math.round(calculatePercentile(buf, 50)),
        p95_ms: Math.round(calculatePercentile(buf, 95)),
        p99_ms: Math.round(calculatePercentile(buf, 99)),
      },
      timestamp: new Date().toISOString(),
    });
  });
};

export default fp(observabilityPlugin, {
  name: 'observability',
});
