/**
 * OpenTelemetry Tracing (RISK-009)
 *
 * Initialises the Node.js OTel SDK with:
 *   - OTLP HTTP exporter (sends to Jaeger / Grafana Tempo / any OTLP collector)
 *   - HTTP + Fastify + PostgreSQL + ioredis auto-instrumentation
 *
 * Configuration via environment variables:
 *   OTEL_EXPORTER_OTLP_ENDPOINT  e.g. http://localhost:4318  (OTLP/HTTP)
 *   OTEL_SERVICE_NAME            defaults to "humanid-api"
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is absent the SDK still initialises
 * (using a NoopSpanExporter) so that instrumented code never throws.
 * This allows the same binary to run in dev/test without a collector.
 *
 * Call initTracing() BEFORE importing any other module so that
 * auto-instrumentation can patch require() calls at startup.
 */

import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor, NoopSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { registerInstrumentations } from '@opentelemetry/instrumentation';

export interface TracingOptions {
  serviceName?: string;
  serviceVersion?: string;
  enabled?: boolean;
}

let _provider: NodeTracerProvider | null = null;

/** Return the active provider, or null if none is initialised. */
export function getProvider(): NodeTracerProvider | null {
  return _provider;
}

/**
 * Initialise the OTel SDK. Call once at process startup.
 * If a provider already exists it is shut down first to prevent leaks (RISK-028).
 * Returns the provider so callers can shut it down cleanly.
 */
export function initTracing(opts: TracingOptions = {}): NodeTracerProvider {
  // Guard: shut down any existing provider to prevent singleton leak (RISK-028)
  if (_provider) {
    _provider.shutdown();
    _provider = null;
  }

  const serviceName = opts.serviceName ?? process.env.OTEL_SERVICE_NAME ?? 'humanid-api';
  const serviceVersion = opts.serviceVersion ?? process.env.npm_package_version ?? '1.0.0';
  const enabled = opts.enabled ?? true;

  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    'deployment.environment': process.env.NODE_ENV ?? 'development',
  });

  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  const spanProcessors = enabled && otlpEndpoint
    ? [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` }))]
    : [new NoopSpanProcessor()];

  const provider = new NodeTracerProvider({ resource, spanProcessors });
  provider.register();

  if (enabled && otlpEndpoint) {
    registerInstrumentations({
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (req) =>
            // Skip health checks and metrics scrapes from traces
            req.url === '/health' || req.url === '/metrics',
        }),
        new FastifyInstrumentation(),
        new PgInstrumentation(),
        new IORedisInstrumentation(),
      ],
    });
  }

  _provider = provider;
  return provider;
}

/**
 * Flush pending spans and shut down the SDK.
 * Call during graceful shutdown.
 */
export async function shutdownTracing(): Promise<void> {
  if (_provider) {
    await _provider.shutdown();
    _provider = null;
  }
}
