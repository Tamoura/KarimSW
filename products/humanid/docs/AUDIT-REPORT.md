# HumanID Audit Report v4.0

**Product**: HumanID — Universal Digital Identity Platform
**Audit Date**: 2026-02-21
**Auditor**: Code Reviewer Agent (KarimSW)
**Version**: 4.0 (Post-Remediation Audit — all Phase 0-3 fixes from v3.0 applied)
**Previous Version**: 3.0 (2026-02-21, scored 7.8/10)

---

# PART A — EXECUTIVE MEMO

---

## Section 0: Methodology & Limitations

### Audit Scope

| Category | Details |
|----------|---------|
| Directories scanned | `apps/api/src/`, `apps/api/prisma/`, `apps/api/tests/`, `apps/web/src/`, `.github/workflows/` |
| File types included | `.ts`, `.tsx`, `.prisma`, `.yml`, `.json`, `.env*` |
| Total source files reviewed | 41 (src) + 56 (tests) = 97 files |
| Total lines of code analyzed | 9,229 (src) + 20,399 (tests) = 29,628 lines |

### Methodology

- **Static analysis**: Manual code review of all source files in routes, plugins, utils, types, and services
- **Schema analysis**: Prisma schema (36 models), database indexes, relations, cascade rules
- **Dependency audit**: `package.json` and lock file review for known vulnerabilities
- **Configuration review**: Environment validation, Docker Compose, CI/CD pipelines
- **Test analysis**: Full test suite execution (932 tests), coverage measurement, test quality assessment
- **Architecture review**: Plugin registration order, dependency graph, layering, coupling analysis
- **Cryptographic review**: Ed25519 key management, AES-256-GCM encryption, HMAC operations, timing-safe comparisons

### Out of Scope

- Dynamic penetration testing (no live exploit attempts were made)
- Runtime performance profiling (no load tests executed)
- Third-party SaaS integrations (only code-level integration points reviewed)
- Infrastructure-level security (cloud IAM, network policies, firewall rules)
- Generated code (Prisma client) unless it poses a security risk
- Third-party library internals (but vulnerable versions are noted)

### Limitations

- This audit is based on static code review. Some issues (memory leaks, race conditions under load, intermittent failures) may only manifest at runtime.
- Compliance assessments are technical gap analyses, not formal certifications.
- Scores reflect the state of the code at the time of audit and may change with subsequent commits.
- The frontend (Next.js web app) is in placeholder stage and is scored accordingly.

---

## Section 1: Executive Decision Summary

| Question | Answer |
|----------|--------|
| **Can this go to production?** | Conditionally — backend API is production-quality; frontend is placeholder |
| **Is it salvageable?** | Yes — this is a strong codebase |
| **Risk if ignored** | Low — no critical vulnerabilities remain after v3 remediation |
| **Recovery effort** | 2-3 weeks with 1 engineer for remaining medium-priority items |
| **Enterprise-ready?** | Yes for API; frontend needs implementation |
| **Compliance-ready?** | SOC2: Partial (technical controls strong, process docs needed). OWASP Top 10: Pass |

### Top 5 Risks in Plain Language

1. **The public vulnerability report endpoint has no rate limiting** — an attacker could flood the system with thousands of fake reports, wasting admin time and potentially filling the database.

2. **The SAML single sign-on configuration accepts any URL without checking if it points to an internal server** — a malicious admin could configure it to probe internal infrastructure.

3. **The system tracks performance metrics in server memory** — on a long-running server, this could gradually consume memory because the duration array is bounded but cumulative counters grow indefinitely.

4. **The audit export feature does not fully sanitize data for spreadsheet import** — user-controlled fields could contain formulas that execute when opened in Excel.

5. **The frontend is not functional** — all pages are placeholders. The API is production-ready but the web interface is not usable by end users.

---

## Section 2: Stop / Fix / Continue

| Category | Items |
|----------|-------|
| **STOP** | Nothing requires immediate cessation. All critical issues from v3 audit have been remediated. |
| **FIX** | (1) Add rate limiting to public security report endpoint. (2) Validate SAML metadata URL against private IPs. (3) Implement frontend components. (4) Add E2E tests with Playwright. |
| **CONTINUE** | (1) Excellent security architecture with real Ed25519 crypto and AES-256-GCM encryption. (2) 932 passing integration tests with 92% coverage. (3) Professional CI/CD pipeline with enforced security gates and coverage thresholds. (4) Consistent RFC 7807 error handling across all 28 route modules. |

---

## Section 3: System Overview

### Architecture Diagram

```
Clients (Browser / Mobile / SDK)
           |
           v
   +-------------------+
   |  Next.js Web App  |  Port 3117 (placeholder)
   |  (React 18, SSR)  |
   +-------------------+
           |
           v
   +-------------------+    +-----------+    +-----------+
   |  Fastify API      |----| Redis 7   |    | Polygon   |
   |  Port 5013        |    | (Cache,   |    | L2 Chain  |
   |                   |    |  Rate     |    | (Anchor)  |
   |  28 route modules |    |  Limit)   |    +-----------+
   |  4 plugins        |    +-----------+
   |  6 utils          |
   +-------------------+
           |
           v
   +-------------------+
   |  PostgreSQL 15    |
   |  36 tables        |
   |  10 domains       |
   |  Prisma ORM       |
   +-------------------+
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js + React + Tailwind | 14.2.0 / 18.3.0 / 3.4.0 |
| Backend | Fastify + TypeScript | 5.7.2 / 5.3.3 |
| Database | PostgreSQL via Prisma | 15 / 5.8.1 |
| Cache | Redis via ioredis | 7 / 5.3.2 |
| Identity | W3C DIDs, Verifiable Credentials | Ed25519 |
| Crypto | @noble/ed25519, AES-256-GCM, bcrypt | 3.0.0 / native / 6.0.0 |
| Testing | Jest (932 tests, 56 suites) | 29.7.0 |
| CI/CD | GitHub Actions | Gitleaks + coverage gates |

### Key Flows

1. **Identity Creation**: Register -> Create DID (Ed25519 keypair) -> Encrypt private key -> Store -> Anchor to blockchain
2. **Credential Issuance**: Authenticate -> Validate issuer DID ownership -> Sign claims (Ed25519) -> Encrypt claims (AES-256-GCM) -> Store with proof
3. **Verification**: Authenticate -> Load credential -> Reconstruct hash -> Verify Ed25519 signature -> Check issuer trust -> Check revocation -> Check expiry
4. **Developer Integration**: Register -> Create API key (HMAC-SHA256 hashed) -> Rate-limited access -> Usage tracking

---

## Section 4: Top 10 Issues

### Issue 1: No Rate Limiting on Public Security Report Endpoint

- **Severity**: Medium
- **Likelihood**: Medium — automated tools could easily abuse this
- **Blast Radius**: Feature (security reporting)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: Attacker could flood the vulnerability report database, overwhelming security team triage. Could also fill database storage.
- **Fix**: Add rate limiting (10 reports/hour per IP) via Redis or Fastify rate-limit plugin
- **Compliance Impact**: OWASP A04 (Insecure Design), SOC2 Availability

### Issue 2: SAML Metadata URL Not Validated Against SSRF

- **Severity**: Medium
- **Likelihood**: Low — requires org owner access to exploit
- **Blast Radius**: Product (could probe internal services)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: A malicious org owner could configure an SAML metadata URL pointing to internal infrastructure (169.254.x.x, 10.x.x.x) to probe internal services.
- **Fix**: Apply the same `validateWebhookUrl()` private IP check used in webhooks.ts
- **Compliance Impact**: OWASP A10 (SSRF), SOC2 Security

### Issue 3: CSV Injection Risk in Audit Export

- **Severity**: Low
- **Likelihood**: Low — requires opening exported CSV in Excel
- **Blast Radius**: Feature (audit export)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: User-controlled fields (userAgent, IP) exported to CSV could contain formulas (=CMD...) that execute when imported into Excel.
- **Fix**: Prefix cells starting with `=`, `+`, `-`, `@` with a single quote
- **Compliance Impact**: OWASP A03 (Injection)

### Issue 4: Metrics Duration Array Uses shift() Instead of Circular Buffer

- **Severity**: Low
- **Likelihood**: Low — only under sustained high traffic
- **Blast Radius**: Feature (metrics endpoint)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: The `shift()` on an array is O(n), so under very high traffic the metrics tracking becomes slightly less efficient. Cumulative counters (total, byStatus, byMethod) grow indefinitely but are numbers, not arrays, so memory impact is negligible.
- **Fix**: Replace with a circular buffer (pre-allocated array with index wrapping)
- **Compliance Impact**: None

### Issue 5: No Frontend Tests

- **Severity**: Medium
- **Likelihood**: High — frontend bugs will not be caught
- **Blast Radius**: Product (entire web UI)
- **Risk Owner**: Dev
- **Category**: Testing
- **Business Impact**: The frontend has no automated tests. Any regression in the web UI would go undetected until manual testing. All frontend pages are currently placeholders.
- **Fix**: Add React Testing Library tests and Playwright E2E tests
- **Compliance Impact**: SOC2 Processing Integrity

### Issue 6: No E2E Tests

- **Severity**: Medium
- **Likelihood**: Medium — integration bugs between frontend and API
- **Blast Radius**: Product
- **Risk Owner**: QA
- **Category**: Testing
- **Business Impact**: No end-to-end tests exist to verify that the full user journey (register, create DID, issue credential, verify) works across the frontend and API together.
- **Fix**: Add Playwright test suite covering critical user journeys
- **Compliance Impact**: SOC2 Processing Integrity

### Issue 7: reEncrypt() Does Not Validate Key Length

- **Severity**: Low
- **Likelihood**: Very Low — only callable by admin via key rotation endpoint
- **Blast Radius**: Feature (key rotation)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: The reEncrypt() function accepts keys without validating they are 64 hex characters. A misconfigured rotation could silently use truncated keys.
- **Fix**: Add the same `key.length !== 64` check used in getEncryptionKey()
- **Compliance Impact**: OWASP A02 (Cryptographic Failures)

### Issue 8: No SAST Tool in CI (CodeQL/Snyk)

- **Severity**: Low
- **Likelihood**: Low — existing code is clean
- **Blast Radius**: Organization (supply chain)
- **Risk Owner**: DevOps
- **Category**: Infrastructure
- **Business Impact**: While npm audit catches known vulnerable dependencies, there is no static application security testing (SAST) tool like CodeQL or Snyk to detect code-level vulnerabilities automatically.
- **Fix**: Add CodeQL GitHub Action or Snyk step to CI pipeline
- **Compliance Impact**: OWASP A06 (Vulnerable Components), SOC2 Security

### Issue 9: Locale Code Validation Missing Regex

- **Severity**: Low
- **Likelihood**: Very Low — admin-only endpoint
- **Blast Radius**: Feature (i18n)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: The i18n locale creation accepts any 2-10 character string as a locale code. Invalid codes like "zzzz" would be accepted.
- **Fix**: Add regex validation for BCP 47 language tags
- **Compliance Impact**: None

### Issue 10: Federation Link Fields Lack Max Length

- **Severity**: Low
- **Likelihood**: Very Low — authenticated endpoint
- **Blast Radius**: Feature (federation)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: The externalIssuer and externalSubject fields in federation links have no maximum length validation. A user could submit extremely long strings.
- **Fix**: Add `.max(1000)` to both Zod fields
- **Compliance Impact**: None

---

## Section 5: Risk Register

| Issue ID | Title | Domain | Severity | Owner | SLA | Dependency | Verification | Status |
|----------|-------|--------|----------|-------|-----|------------|--------------|--------|
| RISK-001 | No rate limit on public security report endpoint | Security | Medium | Dev | Phase 1 (1-2w) | None | POST 11 reports in 1 hour to /api/v1/security/reports; 11th should return 429 | Open |
| RISK-002 | SAML metadataUrl not validated against private IPs | Security | Medium | Dev | Phase 1 (1-2w) | None | Configure SAML with metadataUrl=http://169.254.169.254; should reject | Open |
| RISK-003 | CSV injection risk in audit export | Security | Low | Dev | Phase 2 (2-4w) | None | Export audit log containing userAgent "=CMD()|"; CSV cell should be prefixed with single quote | Open |
| RISK-004 | Metrics durations array uses shift() instead of circular buffer | Performance | Low | Dev | Phase 3 (4-8w) | None | Run 10K+ requests and verify metrics endpoint response time stays under 50ms | Open |
| RISK-005 | No frontend tests | Testing | Medium | Dev | Phase 2 (2-4w) | None | `npm test` in apps/web should report at least 20 test cases passing | Open |
| RISK-006 | No E2E tests (Playwright) | Testing | Medium | QA | Phase 2 (2-4w) | RISK-005 | `npx playwright test` should pass with at least 5 user journey tests | Open |
| RISK-007 | reEncrypt() missing key length validation | Security | Low | Dev | Phase 1 (1-2w) | None | Call reEncrypt with 32-char key; should throw "64 hex characters" error | Open |
| RISK-008 | No SAST tool in CI pipeline | DevOps | Low | DevOps | Phase 2 (2-4w) | None | CI pipeline includes CodeQL or Snyk step that passes | Open |
| RISK-009 | Locale code validation missing regex | Code | Low | Dev | Phase 3 (4-8w) | None | POST /api/v1/i18n/locales with code "!!!"; should return 400 | Open |
| RISK-010 | Federation link fields lack max length | Code | Low | Dev | Phase 3 (4-8w) | None | POST federation link with 10K char externalIssuer; should return 400 | Open |

---

## Scores

### Technical Dimension Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Security** | 8/10 | All critical/high issues from v3 remediated. Ed25519 real crypto, AES-256-GCM encryption at rest, timing-safe comparisons, SSRF protection on webhooks. Remaining: rate limiting gap on 1 public endpoint, SAML SSRF, CSV injection. |
| **Architecture** | 9/10 | Clean plugin-based Fastify architecture. 28 route modules, 4 plugins, 6 utility modules. Proper separation of concerns. Zod validation at route boundary. AppError with RFC 7807. |
| **Test Coverage** | 8/10 | 932 tests, 56 suites. 92.14% statements, 85.51% branches, 94.54% functions, 92.36% lines. Real PostgreSQL/Redis (no mocks). Missing: frontend tests, E2E tests. |
| **Code Quality** | 9/10 | TypeScript throughout. Consistent error handling. Structured logging with PII redaction. No hardcoded secrets. Clean imports and module organization. |
| **Performance** | 8/10 | Connection pooling (configurable, validated). Pagination on all list endpoints (capped at 100). Rate limiting with Redis (in-memory fallback). Metrics bounded to 1000 entries. Minor: shift() vs circular buffer, no query caching. |
| **DevOps** | 8/10 | GitHub Actions CI with: Gitleaks secret scanning, npm audit (HIGH level), tsc type checking, coverage gates (85% lines, 80% branches). Secrets via GitHub Secrets (not hardcoded). Missing: SAST, container scanning. |
| **Runability** | 8/10 | API starts, health check passes, all 37+ endpoints functional with real data. Frontend starts but serves placeholder pages. Docker Compose for local infra. |

**Technical Score**: (8 + 9 + 8 + 9 + 8 + 8 + 8) / 7 = **8.3/10**

### Readiness Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Security Readiness** | 8/10 | Strong auth (JWT + API key dual), real cryptography, SSRF protection, rate limiting, account lockout, timing-safe operations. Minor gaps: 1 unprotected public endpoint, SAML SSRF. |
| **Product Potential** | 9/10 | Comprehensive identity platform covering DIDs, VCs, ZKP, WebAuthn, governance, federation, offline, marketplace, compliance, i18n, agents, and more. 28 route modules with real business logic. |
| **Enterprise Readiness** | 8/10 | SSO (OIDC + SAML), RBAC, organizations, compliance tracking, audit logging, security advisories, API key management. Technical controls strong; process documentation needed for formal certification. |

**Readiness Score**: (8 + 9 + 8) / 3 = **8.3/10**

### Overall Score

**Overall Score**: (8.3 + 8.3) / 2 = **8.3/10 — Production-Ready**

### Compliance Summary

| Framework | Status | Key Gaps |
|-----------|--------|----------|
| OWASP Top 10 | 9/10 Pass, 1/10 Partial | A10 (SSRF) — SAML metadataUrl not validated |
| SOC2 Type II | Partial | Processing Integrity (no frontend/E2E tests), Availability (1 unrate-limited endpoint) |
| ISO 27001 | Partial | A.14 (no SAST in CI), A.12 (metrics memory management) |

---

# PART B — ENGINEERING APPENDIX

(This section contains file:line references, code examples, and technical detail. For engineering team only.)

---

## Section 6: Architecture

### Strengths

The architecture follows Fastify best practices with a clean plugin-based design:

1. **Plugin Registration Order** (`app.ts:58-85`): Observability -> Prisma -> Redis -> Rate Limit -> Auth -> CORS -> Helmet -> Compress -> Routes. Correct ordering ensures observability captures all requests and auth is available before routes.

2. **Route Module Isolation**: Each of the 28 route files is self-contained with its own Zod schemas, error handling, and authorization checks. No cross-route coupling.

3. **Utility Layer**: 6 utility modules (crypto, encryption, did-crypto, logger, middleware, env-validator) provide clean abstractions for security operations.

4. **Type System**: TypeScript with AppError hierarchy (NotFoundError, UnauthorizedError, ForbiddenError, ValidationError, ConflictError) at `types/index.ts`.

### Minor Issues

1. **Route File Size** — Three files exceed 400 lines:
   - `developer.ts`: 566 lines (7 endpoints + key rotation logic)
   - `webauthn.ts`: 501 lines (5 endpoints + CBOR parsing)
   - `webhooks.ts`: 433 lines (5 endpoints + SSRF validation)
   - `auth.ts`: 434 lines (5 endpoints + lockout logic)

   These are at the upper bound of acceptable size. If adding more features, consider extracting helper functions into dedicated service files.

2. **In-Memory State** — Two route modules use in-memory arrays:
   - `government.ts`: partnerships and credentialSchemes stored in JavaScript arrays (not persisted)
   - `observability.ts`: metrics stored in module-level variable

   These reset on server restart. For production, government data should be persisted to the database.

---

## Section 7: Security Findings

### Authentication & Authorization

**Status: STRONG**

All 28 route modules implement proper authentication. Summary:

| Pattern | Count | Status |
|---------|-------|--------|
| Routes requiring JWT auth | 24/28 modules | All verified |
| Routes with admin-only gates | 6 modules (compliance, fraud, admin, government, i18n, regions) | All use buildRequireAdmin() |
| Routes with org-level RBAC | 3 modules (organizations, org-dids, sso) | Proper role checks |
| Public endpoints | 6 (register, login, health, security reports, region list, i18n translations) | Intentional |

**Finding: SAML Metadata URL SSRF** (`sso.ts:24`)

The SAML configuration schema validates `metadataUrl` as a URL but does not check if it points to a private IP:

```typescript
const samlConfigSchema = z.object({
  orgId: z.string().uuid(),
  metadataUrl: z.string().url(),  // No private IP check
  entityId: z.string().min(1),
});
```

Fix: Apply `isPrivateIp()` check from `webhooks.ts:37-50` to the SAML metadataUrl before storing.

### Data Security

**Status: STRONG**

| Asset | Protection | Implementation |
|-------|-----------|----------------|
| Passwords | Bcrypt 12 rounds | `crypto.ts:13-26` |
| DID private keys | AES-256-GCM | `encryption.ts:89-91` |
| Credential claims | AES-256-GCM | `encryption.ts:75-77` |
| Webhook secrets | AES-256-GCM | `webhooks.ts` — encrypt() before storage |
| SSO client secrets | AES-256-GCM | `sso.ts:44` |
| API keys | HMAC-SHA256 | `crypto.ts:39-54` |
| Session tokens | SHA-256 hash | `auth.ts` — tokenHash stored |

**Finding: reEncrypt() Missing Key Validation** (`encryption.ts:137-139`)

```typescript
export function reEncrypt(encryptedStr: string, oldKeyHex: string, newKeyHex: string): string {
  const oldKey = Buffer.from(oldKeyHex, 'hex');  // No length check
  const newKey = Buffer.from(newKeyHex, 'hex');  // No length check
```

Fix: Add `if (oldKeyHex.length !== 64 || newKeyHex.length !== 64) throw new Error(...)` before Buffer conversion.

### API Security

**Finding: No Rate Limiting on Security Reports** (`security.ts:42`)

The vulnerability report submission endpoint is public (no auth required) and has no rate limiting:

```typescript
fastify.post('/reports', async (request, reply) => {
  // No auth check — intentional for bug bounty
  // No rate limit — RISK
  const body = reportSchema.parse(request.body);
```

Fix: Add `@fastify/rate-limit` per-route config: `{ max: 10, timeWindow: '1 hour' }`.

### Injection

**Finding: CSV Injection in Audit Export** (`audit.ts:~130`)

The audit export replaces commas with semicolons but does not protect against formula injection:

```typescript
const escapeCsv = (s: string) => s?.replace(/,/g, ';') || '';
```

Fix:
```typescript
const escapeCsv = (s: string) => {
  if (!s) return '';
  const cleaned = s.replace(/,/g, ';');
  if (/^[=+\-@\t\r]/.test(cleaned)) return `'${cleaned}`;
  return cleaned;
};
```

---

## Section 8: Performance & Scalability

### Database

1. **Connection Pooling** (`prisma.ts:25-38`): Configurable pool size (default 20, max 500) and timeout (default 10s). Validated at startup.

2. **Indexes**: Comprehensive coverage across all major tables:
   - User: email, role, status
   - DID: userId, did (unique), status
   - Credential: holderDidId, issuerDidId, status, issuedAt
   - Session: userId, tokenHash (unique), expiresAt (composite)
   - ApiKey: userId, keyHash (unique), status
   - AuditLog: createdAt DESC, userId, action
   - GovernanceProposal: votingEndsAt (added in v3 remediation)

3. **Pagination**: All list endpoints capped at 100 items per page with skip/take.

### Memory

1. **Metrics Storage** (`observability.ts:35-75`): Bounded to 1000 durations via shift(). Cumulative counters (total, byStatus) are numbers (negligible memory). The shift() is O(n) but only runs every 1000th request, so amortized cost is low.

2. **Request/Response**: Fastify bodyLimit set to 1MB (`app.ts`). No unbounded buffers.

### Caching

1. **Rate Limiting**: Redis-backed with in-memory fallback (`app.ts:147-178`).
2. **No Query Caching**: Every authenticated request hits the database for user/key lookup. Consider Redis caching for API key validation (15-min TTL) for high-throughput scenarios.

---

## Section 9: Testing Gaps

### Current Coverage

| Metric | Value | Threshold | Status |
|--------|-------|-----------|--------|
| Statements | 92.14% | 85% | PASS |
| Branches | 85.51% | 80% | PASS |
| Functions | 94.54% | — | PASS |
| Lines | 92.36% | 85% | PASS |
| Test Suites | 56 | — | All passing |
| Test Cases | 932 | — | All passing |

### Test Quality Assessment

**Strengths:**
- Real PostgreSQL and Redis (no mocks) — tests verify actual database behavior
- Proper cleanup with cascade-aware delete functions in every test file
- Comprehensive error path testing via `*-extended.test.ts` files (16 files, 9,332 lines)
- All HTTP status codes tested (201, 204, 400, 401, 403, 404, 409, 500)
- Security-specific test file (`audit-v3-remediation.test.ts`) covering all 17 remediated items
- No flakiness patterns detected (no timing, no ordering dependencies)

**Missing Test Categories:**

| Category | Status | Gap |
|----------|--------|-----|
| Backend unit tests | 1 file (did-crypto) | Could add more for crypto, encryption utils |
| Backend integration | 55 files, 932 tests | Comprehensive |
| Frontend component tests | 0 files | No React Testing Library tests |
| E2E tests | 0 files | No Playwright tests |
| Load/stress tests | 0 files | No k6/Artillery tests |
| Contract tests | 0 files | No Pact/OpenAPI validation tests |

---

## Section 10: DevOps Issues

### CI/CD Pipeline (`ci-humanid.yml`)

**Steps (all enforced, none bypassed):**

1. Checkout with full history (fetch-depth: 0)
2. Gitleaks secret scanning
3. Node 20 setup with npm cache
4. `npm ci` (clean install)
5. `npm audit --audit-level=high` (dependency audit)
6. Prisma generate
7. `npx tsc --noEmit` (type checking)
8. Prisma db push (migrations)
9. Jest with coverage
10. Coverage threshold enforcement (85% lines, 80% branches)

**Secrets Management:**
- JWT_SECRET: `${{ secrets.CI_JWT_SECRET }}` (GitHub Secrets)
- CLAIMS_ENCRYPTION_KEY: `${{ secrets.CI_CLAIMS_ENCRYPTION_KEY }}` (GitHub Secrets)
- INTERNAL_API_KEY: `${{ secrets.CI_INTERNAL_API_KEY }}` (GitHub Secrets)
- No hardcoded fallback values

**Missing Steps:**
- No SAST (CodeQL/Snyk) — only npm audit for known vulnerabilities
- No container image scanning
- No linting step (ESLint configured in package.json but not in CI)
- No frontend build/test step

### Deployment Safety

- Docker Compose for local development with health checks on both PostgreSQL and Redis
- Services bound to 127.0.0.1 (localhost only) — correct for development
- Graceful shutdown handling in `index.ts` (SIGTERM, SIGINT)
- Server timeouts configured (30s socket, 31s headers, 5s keep-alive)

---

## Section 11: Compliance Readiness

### OWASP Top 10 (2021) — Control-by-Control

| Control | Status | Evidence / Gap |
|---------|--------|----------------|
| A01: Broken Access Control | Pass | All routes authenticate via JWT or API key. Role-based gates on admin endpoints. Ownership verified on all resource operations. 932 tests cover auth boundaries. |
| A02: Cryptographic Failures | Pass | AES-256-GCM for data at rest, Ed25519 for signatures, bcrypt-12 for passwords, HMAC-SHA256 for API keys. Key length validated in getEncryptionKey() and deserializePrivateKey(). Minor: reEncrypt() missing key length check. |
| A03: Injection | Pass | Zod validation on all inputs, Prisma parameterized queries, no raw SQL. Minor: CSV export formula injection (Low severity). |
| A04: Insecure Design | Pass | Threat modeling evident in SSRF protection, timing-safe comparisons, account lockout, token rotation. Minor: 1 public endpoint without rate limiting. |
| A05: Security Misconfiguration | Pass | Environment validation at startup (env-validator.ts), no default secrets in production, Helmet security headers, CORS whitelist. |
| A06: Vulnerable and Outdated Components | Pass | npm audit --audit-level=high in CI, Gitleaks secret scanning. All dependencies at recent versions. Minor: no SAST tool. |
| A07: Identification and Authentication Failures | Pass | JWT with pinned HS256 algorithm, refresh token rotation, account lockout (5 attempts, 15min), email enumeration prevention, session tracking with hash. |
| A08: Software and Data Integrity Failures | Pass | Credential hash verification in verify pipeline, audit chain integrity verification, Ed25519 signature on all credentials. |
| A09: Security Logging and Monitoring Failures | Pass | Structured logging with PII redaction (logger.ts), request correlation IDs (observability.ts), metrics endpoint with auth, audit log table with export. |
| A10: Server-Side Request Forgery (SSRF) | Partial | Webhook URLs validated against private IPs with DNS resolution check. Gap: SAML metadataUrl not validated. |

### SOC2 Type II — Trust Service Principles

| Principle | Status | Evidence / Gap |
|-----------|--------|----------------|
| Security (Common Criteria) | Pass | JWT + API key dual auth, AES-256-GCM encryption at rest, RBAC, rate limiting, account lockout, security headers, secret scanning in CI. |
| Availability | Partial | Health check endpoints, graceful shutdown, Redis graceful degradation. Gap: 1 public endpoint without rate limiting could be abused for resource exhaustion. |
| Processing Integrity | Partial | 932 integration tests, credential verification pipeline with 4-step checks. Gap: No frontend tests, no E2E tests. |
| Confidentiality | Pass | PII redaction in logs, claims encrypted at rest, private keys encrypted, API key secrets hashed, webhook secrets encrypted. |
| Privacy | Pass | Selective disclosure via ZKP design, credential revocation, sharing history tracking, GDPR-aware data model. |

### ISO 27001 Annex A — Key Controls

| Control Area | Status | Evidence / Gap |
|-------------|--------|----------------|
| A.5 Information Security Policies | Partial | Security.txt RFC 9116 compliance, bug bounty program. Gap: No formal ISMS policy documents. |
| A.6 Organization of Information Security | Partial | Role-based access control, admin gates. Gap: No formal security team documentation. |
| A.8 Asset Management | Pass | 36-table schema with clear domain separation, credential lifecycle management, DID lifecycle management. |
| A.9 Access Control | Pass | JWT + API key dual auth, RBAC (4 roles), organization-level access, ownership verification on all resources. |
| A.10 Cryptography | Pass | Ed25519 for signatures, AES-256-GCM for encryption, bcrypt for passwords, HMAC-SHA256 for API keys. Key length validation enforced. |
| A.12 Operations Security | Partial | Structured logging, metrics, audit trail. Gap: No SAST in CI, metrics memory management could be improved. |
| A.14 System Acquisition, Development and Maintenance | Pass | 932 tests, 92% coverage, CI gates enforced, dependency audit, type checking. |
| A.16 Information Security Incident Management | Pass | Vulnerability report endpoint, security advisory publishing, audit log with integrity verification. |
| A.18 Compliance | Partial | Compliance tracking module (SOC2, ISO27001, GDPR frameworks). eIDAS routes. Gap: No formal compliance certification. |

---

## Section 12: Technical Debt Map

| Priority | Debt Item | Interest (cost of delay) | Owner | Payoff |
|----------|-----------|--------------------------|-------|--------|
| HIGH | No frontend tests | Bugs in web UI go undetected; blocks production launch | Dev | Catch regressions, enable confident deploys |
| HIGH | No E2E tests | Full user journey failures undetected | QA | Validate end-to-end flows work |
| MEDIUM | Rate limit on security reports | Potential DB spam, wasted admin time | Dev | 1 hour fix, prevents abuse |
| MEDIUM | SAML SSRF validation | Internal network probing possible | Dev | 30 min fix, reuse existing code |
| MEDIUM | SAST in CI | Code-level vulnerabilities not auto-detected | DevOps | Defense in depth for supply chain |
| LOW | CSV injection in audit export | Requires specific attack conditions | Dev | 15 min fix |
| LOW | reEncrypt key validation | Only affects admin key rotation | Dev | 5 min fix |
| LOW | Metrics circular buffer | Performance under extreme load | Dev | 30 min fix |
| LOW | Locale code regex | Admin-only, cosmetic | Dev | 10 min fix |
| LOW | Federation field length | Authenticated, low impact | Dev | 5 min fix |

---

## Section 13: Remediation Roadmap (Phased)

### Phase 0 — Immediate (48 hours)

No Phase 0 items. All critical issues from v3 audit have been remediated.

**Gate**: No blocking issues remain.

### Phase 1 — Stabilize (1-2 weeks)

| Item | Owner | Verification |
|------|-------|-------------|
| RISK-001: Add rate limiting to security report endpoint | Dev | POST 11 reports/hr; 11th returns 429 |
| RISK-002: Validate SAML metadataUrl against private IPs | Dev | Configure SAML with 169.254.x.x URL; should reject |
| RISK-007: Add key length validation to reEncrypt() | Dev | Unit test with 32-char key throws error |

**Gate**: All security findings at Medium or above resolved.

### Phase 2 — Production-Ready (2-4 weeks)

| Item | Owner | Verification |
|------|-------|-------------|
| RISK-005: Add frontend component tests | Dev | npm test in apps/web reports 20+ passing tests |
| RISK-006: Add Playwright E2E tests | QA | npx playwright test passes with 5+ journey tests |
| RISK-008: Add CodeQL or Snyk to CI | DevOps | CI pipeline includes SAST step |
| RISK-003: Fix CSV injection in audit export | Dev | Export with formula-like userAgent is quoted |

**Gate**: All scores >= 8/10, frontend has basic test coverage.

### Phase 3 — Excellence (4-8 weeks)

| Item | Owner | Verification |
|------|-------|-------------|
| RISK-004: Replace metrics shift() with circular buffer | Dev | Metrics endpoint responds in <50ms after 10K+ requests |
| RISK-009: Add locale code regex validation | Dev | POST invalid locale code returns 400 |
| RISK-010: Add max length to federation link fields | Dev | POST 10K-char field returns 400 |
| Add Redis query caching for API key lookups | Dev | API key auth does not hit DB on cache hit |

**Gate**: All scores >= 9/10, production-optimized.

---

## Section 14: Quick Wins (1-day fixes)

1. **Add rate limit to security report endpoint** — Add `config: { rateLimit: { max: 10, timeWindow: '1 hour' } }` to the route in `security.ts:42`. (15 minutes)

2. **Add SAML URL validation** — Import `isPrivateIp` from webhooks.ts (or extract to utils) and call `validateWebhookUrl(body.metadataUrl)` before storing in `sso.ts:35`. (30 minutes)

3. **Fix reEncrypt key validation** — Add `if (oldKeyHex.length !== 64 || newKeyHex.length !== 64) throw new Error(...)` at `encryption.ts:138`. (5 minutes)

4. **Fix CSV injection** — Update `escapeCsv()` in `audit.ts:~130` to prefix formula-starting characters with single quote. (15 minutes)

5. **Add locale code regex** — Change `code: z.string().min(2).max(10)` to `code: z.string().min(2).max(10).regex(/^[a-z]{2}(-[A-Z]{2})?(-[a-z]+)?$/)` in `i18n.ts:13`. (10 minutes)

6. **Add federation field max length** — Add `.max(1000)` to externalIssuer and externalSubject in `federation.ts` Zod schema. (5 minutes)

7. **Add ESLint step to CI** — Add `run: npx eslint src/ --ext .ts` step before test execution in `ci-humanid.yml`. (15 minutes)

---

## Section 15: AI-Readiness Score (0-10 with sub-scores)

| Sub-dimension | Score | Notes |
|---------------|-------|-------|
| Modularity | 2/2 | 28 self-contained route modules, 4 plugins, 6 utils. Clean boundaries. |
| API Design | 2/2 | RESTful, versioned (/api/v1/), consistent Zod validation, RFC 7807 errors, pagination. |
| Testability | 1.5/2 | 932 tests with real DB. Deducted 0.5 for no frontend/E2E tests. |
| Observability | 1.5/2 | Correlation IDs, structured logging, PII redaction, metrics endpoint. Deducted 0.5 for no distributed tracing (OpenTelemetry). |
| Documentation | 1.5/2 | PRD, architecture, security docs, ADRs, OpenAPI spec. Deducted 0.5 for placeholder README API examples. |

**AI-Readiness Score: 8.5/10**
