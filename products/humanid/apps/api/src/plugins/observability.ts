/**
 * Observability Plugin
 *
 * Provides comprehensive observability for production monitoring:
 * - Request/response logging with correlation IDs
 * - Performance tracking (request duration)
 * - Error rate monitoring
 * - Correlation IDs via X-Request-ID header
 * - Sensitive data sanitization in logs
 */

import fp from 'fastify-plugin';
import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';

// Circular buffer for O(1) duration tracking (replaces shift()-based array)
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

// Metrics storage (in-memory; can be replaced with Prometheus/StatsD)
interface Metrics {
  requests: {
    total: number;
    byStatus: Record<number, number>;
    byMethod: Record<string, number>;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
  performance: {
    totalDuration: number;
    requestCount: number;
    durations: CircularBuffer;
  };
}

const metrics: Metrics = {
  requests: {
    total: 0,
    byStatus: {},
    byMethod: {},
  },
  errors: {
    total: 0,
    byType: {},
  },
  performance: {
    totalDuration: 0,
    requestCount: 0,
    durations: new CircularBuffer(1000),
  },
};

/**
 * Track request metrics.
 */
function trackMetrics(request: FastifyRequest, reply: FastifyReply, duration: number): void {
  metrics.requests.total++;
  metrics.requests.byStatus[reply.statusCode] =
    (metrics.requests.byStatus[reply.statusCode] || 0) + 1;
  metrics.requests.byMethod[request.method] =
    (metrics.requests.byMethod[request.method] || 0) + 1;

  if (reply.statusCode >= 400) {
    metrics.errors.total++;
    const errorType = reply.statusCode >= 500 ? '5xx' : '4xx';
    metrics.errors.byType[errorType] = (metrics.errors.byType[errorType] || 0) + 1;
  }

  metrics.performance.totalDuration += duration;
  metrics.performance.requestCount++;
  metrics.performance.durations.push(duration);
}

/**
 * Calculate percentiles from array.
 */
function calculatePercentile(buf: CircularBuffer, percentile: number): number {
  if (buf.length === 0) return 0;
  const sorted = buf.toArray().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

const observabilityPlugin: FastifyPluginAsync = async (fastify) => {
  // Assign correlation ID (X-Request-ID) on every request
  fastify.addHook('onRequest', async (request, reply) => {
    // Use incoming X-Request-ID or generate a new one
    const requestId = (request.headers['x-request-id'] as string) || crypto.randomUUID();
    request.id = requestId;

    // Set response header for correlation
    reply.header('x-request-id', requestId);

    // Track request start time
    request.startTime = Date.now();

    logger.debug('Incoming request', {
      request_id: request.id,
      method: request.method,
      url: request.url,
      ip: request.ip,
      user_agent: request.headers['user-agent'],
    });
  });

  // Response logging hook
  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - (request.startTime || Date.now());

    trackMetrics(request, reply, duration);

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

  // Internal metrics endpoint
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
      crypto.timingSafeEqual(
        Buffer.from(suppliedValue),
        Buffer.from(expectedValue),
      );

    if (!isValid) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const durationsBuf = metrics.performance.durations;
    const p50 = calculatePercentile(durationsBuf, 50);
    const p95 = calculatePercentile(durationsBuf, 95);
    const p99 = calculatePercentile(durationsBuf, 99);

    const avgDuration =
      metrics.performance.requestCount > 0
        ? metrics.performance.totalDuration / metrics.performance.requestCount
        : 0;

    return reply.send({
      requests: {
        total: metrics.requests.total,
        by_status: metrics.requests.byStatus,
        by_method: metrics.requests.byMethod,
      },
      errors: {
        total: metrics.errors.total,
        error_rate:
          metrics.requests.total > 0
            ? ((metrics.errors.total / metrics.requests.total) * 100).toFixed(2) + '%'
            : '0%',
        by_type: metrics.errors.byType,
      },
      performance: {
        avg_duration_ms: Math.round(avgDuration),
        p50_ms: Math.round(p50),
        p95_ms: Math.round(p95),
        p99_ms: Math.round(p99),
      },
      timestamp: new Date().toISOString(),
    });
  });
};

export default fp(observabilityPlugin, {
  name: 'observability',
});
