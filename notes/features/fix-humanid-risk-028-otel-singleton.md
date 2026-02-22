# RISK-028: OTel Singleton Leaks Between Test Runs

## Problem
- `tracing.ts:37` has `let _provider: NodeTracerProvider | null = null`
- `initTracing()` replaces `_provider` silently if called multiple times
- Old provider's spans may not be flushed
- With `maxWorkers: 1` in Jest config, all test suites share one process
- If multiple suites call `initTracing()` without `shutdownTracing()`, state leaks

## Audit Finding
- Severity: Low
- File: `src/tracing.ts:37`
- The issue is test isolation, not a production bug

## Fix Strategy
1. Guard `initTracing()` — if `_provider` already exists, shut it down first before creating a new one
2. Export a `getProvider()` accessor so tests can check state without reaching into internals
3. Add `afterEach`/`afterAll` cleanup in the tracing test to call `shutdownTracing()`
4. Add a test that proves calling `initTracing()` twice doesn't leak the old provider

## Files to Change
- `products/humanid/apps/api/src/tracing.ts` — guard + accessor
- `products/humanid/apps/api/tests/unit/tracing.test.ts` — new test + cleanup
