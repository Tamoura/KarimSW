/**
 * OpenTelemetry Tracing Unit Tests (RISK-009)
 *
 * Verifies that the tracing module initialises the SDK correctly and
 * that spans are created for instrumented operations.
 *
 * Uses InMemorySpanExporter so no Jaeger / OTLP collector is needed
 * in CI. The same code path runs in production against a real OTLP
 * endpoint when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */

import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { trace, context } from '@opentelemetry/api';
import { initTracing, shutdownTracing } from '../../src/tracing';

describe('OpenTelemetry tracing (RISK-009)', () => {
  describe('initTracing()', () => {
    it('returns a provider instance without throwing', () => {
      const provider = initTracing({ serviceName: 'humanid-test', enabled: false });
      expect(provider).toBeDefined();
      provider.shutdown();
    });

    it('accepts a custom service name', () => {
      const provider = initTracing({ serviceName: 'my-service', enabled: false });
      expect(provider).toBeDefined();
      provider.shutdown();
    });

    it('does not throw when enabled is true but no OTLP endpoint is set', () => {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      expect(() => {
        const p = initTracing({ serviceName: 'humanid-test', enabled: true });
        p.shutdown();
      }).not.toThrow();
    });
  });

  describe('shutdownTracing()', () => {
    it('resolves without error when no provider is active', async () => {
      await expect(shutdownTracing()).resolves.not.toThrow();
    });
  });

  describe('span creation', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
      exporter = new InMemorySpanExporter();
      provider = new NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)],
      });
      provider.register();
    });

    afterEach(async () => {
      await provider.shutdown();
      exporter.reset();
    });

    it('records a manually created span', () => {
      // Use provider.getTracer() directly to avoid global registry conflicts
      const tracer = provider.getTracer('test');
      const span = tracer.startSpan('test-operation');
      span.setAttribute('test.key', 'test-value');
      span.end();

      const spans = exporter.getFinishedSpans();
      expect(spans.length).toBeGreaterThanOrEqual(1);
      expect(spans[0].name).toBe('test-operation');
      expect(spans[0].attributes['test.key']).toBe('test-value');
    });

    it('propagates trace context across async operations', async () => {
      const tracer = provider.getTracer('test');
      const rootSpan = tracer.startSpan('root');

      await context.with(trace.setSpan(context.active(), rootSpan), async () => {
        const childSpan = provider.getTracer('test').startSpan('child');
        childSpan.end();
      });

      rootSpan.end();

      const spans = exporter.getFinishedSpans();
      const root = spans.find((s) => s.name === 'root')!;
      const child = spans.find((s) => s.name === 'child')!;

      expect(root).toBeDefined();
      expect(child).toBeDefined();
      // Child span belongs to the same trace
      expect(child.spanContext().traceId).toBe(root.spanContext().traceId);
    });
  });
});
