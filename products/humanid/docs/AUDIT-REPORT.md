# HumanID API — Professional Code Audit Report

**Product**: HumanID — Self-Sovereign Identity Platform
**Audit Date**: February 21, 2026
**Auditor**: Code Reviewer Agent (KarimSW)
**Branch**: `test/humanid/coverage-boost`
**Commit**: `4796322`

---

# PART A — EXECUTIVE MEMO

*Audience: CEO, Board, Investors, Regulators. No file references or code snippets.*

---

## Section 0: Methodology and Limitations

### Audit Scope

| Dimension | Detail |
|-----------|--------|
| Directories scanned | `apps/api/src/`, `apps/api/tests/`, `apps/api/prisma/`, `apps/web/`, `.github/` |
| File types included | `.ts`, `.tsx`, `.prisma`, `.yml`, `.json`, `.env*`, `Dockerfile`, `docker-compose.yml` |
| Total source files reviewed | 41 TypeScript source files |
| Total test files reviewed | 38 test files |
| Total lines of source code | 32,508 |
| Total lines of test code | 29,583 |
| Database schema | 36 tables, 27 enums, 1,178 lines |

### Methodology

- **Static analysis**: Manual code review of all source files across routes, plugins, utilities, and types
- **Schema analysis**: Prisma schema review including indexes, constraints, relations, cascading behavior
- **Dependency audit**: `package.json` review for known vulnerabilities and outdated packages
- **Configuration review**: Environment files, Docker configs, CI/CD pipelines
- **Test analysis**: Coverage measurement (Jest), test quality assessment, gap identification
- **Architecture review**: Dependency graph, plugin registration order, layering analysis
- **Cryptography review**: All encryption, hashing, signing, and key management implementations

### Out of Scope

- Dynamic penetration testing (no live exploit attempts)
- Runtime performance profiling (no load tests executed)
- Third-party SaaS integration internals
- Infrastructure-level security (cloud IAM, network policies)
- Generated code (Prisma client)
- Third-party library internals (but vulnerable versions noted)

### Limitations

- This audit is based on static code review; some issues may only manifest at runtime
- Compliance assessments are technical gap analyses, not formal certifications
- Scores reflect code state at time of audit

---

## Section 1: Executive Decision Summary

| Question | Answer |
|----------|--------|
| **Can this go to production?** | Conditionally — after Phase 0 and Phase 1 items resolved |
| **Is it salvageable?** | Yes — the product is well-architected and needs targeted hardening |
| **Risk if ignored** | High — governance race condition and missing CI/CD create deployment risk |
| **Recovery effort** | 1-2 weeks with 1 engineer for Phase 0+1 |
| **Enterprise-ready?** | No — missing CI/CD pipeline and automated quality gates |
| **Compliance-ready?** | OWASP Top 10: 8/10 Pass. SOC2: Partial. ISO 27001: Partial |

### Top 5 Risks in Plain Language

1. **Vote manipulation risk**: The governance voting system can produce incorrect vote counts when multiple users vote at the same time, because votes are counted in a way that allows parallel operations to overwrite each other.

2. **No automated safety net before deployment**: There is no CI/CD pipeline, meaning code changes can be deployed without any automated testing or quality checks. A single developer mistake could ship broken code.

3. **Webhook signing secrets stored unprotected**: If someone gains read access to the database, they could forge webhook messages that appear to come from HumanID, potentially tricking downstream systems.

4. **Biometric login implementation is incomplete**: The WebAuthn (passkey/fingerprint) feature registers devices but does not fully verify authentication, meaning this security feature provides a false sense of protection.

5. **Error responses sometimes leak internal details**: Some API endpoints expose Fastify internal error formats instead of the standard error format, which could help attackers understand the system internals.

---

## Section 2: Stop / Fix / Continue

| Category | Items |
|----------|-------|
| **STOP** | Deploying without CI/CD quality gates. Relying on WebAuthn as a real authentication factor until attestation verification is complete. |
| **FIX** | Governance vote race condition. Error handler scoping for routes without try/catch. CI/CD pipeline. Webhook secret encryption. Branch test coverage (59% to 80%+). |
| **CONTINUE** | Cryptographic architecture (Ed25519, AES-256-GCM). Domain-driven route organization. Real-database integration testing. RFC 7807 error standard. Plugin-based Fastify architecture. PII log redaction. |

---

## Section 3: System Overview

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENTS                                │
│   Browser (Next.js :3117)  │  SDK  │  API Keys  │  Mobile    │
└────────────────┬─────────────┬──────────┬──────────┬─────────┘
                 │             │          │          │
                 ▼             ▼          ▼          ▼
┌──────────────────────────────────────────────────────────────┐
│                    FASTIFY API (:5013)                        │
│  ┌─────────┐ ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │ Helmet  │ │ CORS │ │Rate Limit│ │  JWT   │ │API Key   │ │
│  │  +CSP   │ │Strict│ │  Redis   │ │ HS256  │ │HMAC-SHA  │ │
│  └─────────┘ └──────┘ └──────────┘ └────────┘ └──────────┘ │
│                                                              │
│  28 Route Groups (89+ endpoints) under /api/v1               │
│  ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────────────────┐   │
│  │  Auth  │ │   DIDs   │ │Creds   │ │ Verify/WebAuthn  │   │
│  │  SSO   │ │Federation│ │Issuers │ │ Wallet/Offline   │   │
│  │  Orgs  │ │Governance│ │Agents  │ │ Compliance/Audit │   │
│  │  Dev   │ │Webhooks  │ │i18n    │ │ Security/Fraud   │   │
│  └────────┘ └──────────┘ └────────┘ └──────────────────┘   │
└─────────┬────────────────────────────────┬───────────────────┘
          │                                │
          ▼                                ▼
┌──────────────────┐            ┌──────────────────┐
│  PostgreSQL 15   │            │    Redis 7       │
│  36 tables       │            │  Rate limits     │
│  27 enums        │            │  Sessions        │
│  Prisma ORM      │            │  Challenges      │
└──────────────────┘            └──────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ |
| Language | TypeScript 5.9 |
| Backend | Fastify 5.7 |
| Frontend | Next.js 14 + React 18 |
| Database | PostgreSQL 15 (Prisma 5.22) |
| Cache | Redis 7 (ioredis 5.9) |
| Crypto | Ed25519 (@noble/ed25519 3.0), AES-256-GCM, bcrypt 6.0 |
| Testing | Jest 29.7, 380 integration tests |
| Container | Docker multi-stage (non-root user) |

### Key Flows

- **Identity**: User registers, creates DID (Ed25519 key pair), keys encrypted at rest
- **Credentials**: Issuer issues VC, claims AES-256-GCM encrypted, Ed25519 signed
- **Verification**: 4-step pipeline (signature, issuer trust, revocation, expiry)
- **Auth**: JWT sessions (15m access, 7d refresh) + API key integrations

---

## Section 4: Critical Issues (Top 10)

### RISK-001: Governance Vote Race Condition
- **Severity**: High
- **Likelihood**: Medium (concurrent voting)
- **Blast Radius**: Product (incorrect governance outcomes)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: Governance proposals could pass or fail based on incorrect vote counts, undermining trust in the platform's democratic process.
- **Compliance Impact**: SOC2 Processing Integrity

### RISK-002: No CI/CD Pipeline
- **Severity**: High
- **Likelihood**: High (every deployment)
- **Blast Radius**: Organization (unvalidated code reaches production)
- **Risk Owner**: DevOps
- **Category**: Process
- **Business Impact**: No automated testing gate means any code change, including ones with bugs or security flaws, can ship to production without validation.
- **Compliance Impact**: SOC2 Security, ISO 27001 A.14

### RISK-003: Error Handler Scoping Issue
- **Severity**: Medium
- **Likelihood**: High (affects multiple routes)
- **Blast Radius**: Product (inconsistent API behavior)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: Some API endpoints return Fastify's default error format instead of the standard RFC 7807 format, creating inconsistency for API consumers and potentially leaking internal details.
- **Compliance Impact**: OWASP A05 Security Misconfiguration

### RISK-004: Webhook Secrets Stored in Plaintext
- **Severity**: High
- **Likelihood**: Low (requires DB access)
- **Blast Radius**: Product (webhook forgery)
- **Risk Owner**: Security
- **Category**: Code
- **Business Impact**: A database breach would expose all webhook signing secrets, allowing an attacker to forge webhook deliveries to all registered endpoints.
- **Compliance Impact**: OWASP A02 Cryptographic Failures, SOC2 Confidentiality

### RISK-005: Incomplete WebAuthn Implementation
- **Severity**: Medium
- **Likelihood**: Medium (users may rely on it)
- **Blast Radius**: Feature (false security assurance)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: Users who register passkeys believe they have strong biometric authentication, but the system does not fully verify attestation signatures, meaning a sophisticated attacker could bypass this check.
- **Compliance Impact**: OWASP A07 Identification and Authentication Failures

### RISK-006: Branch Coverage at 59%
- **Severity**: Medium
- **Likelihood**: High (untested error paths)
- **Blast Radius**: Product (hidden bugs in error handling)
- **Risk Owner**: Dev
- **Category**: Testing
- **Business Impact**: 41% of code branches (error conditions, edge cases) are not tested, meaning bugs in error handling could go undetected until they affect users in production.
- **Compliance Impact**: ISO 27001 A.14

### RISK-007: Environment Validator Untested (0% Coverage)
- **Severity**: Medium
- **Likelihood**: Medium (deployment configuration changes)
- **Blast Radius**: Product (app may start with bad config)
- **Risk Owner**: Dev
- **Category**: Testing
- **Business Impact**: The startup validation that prevents the app from running with missing or weak configuration has zero test coverage, meaning changes to this critical safety mechanism could silently break.

### RISK-008: No Key Rotation Mechanism
- **Severity**: Medium
- **Likelihood**: Low (requires proactive rotation)
- **Blast Radius**: Organization (all encrypted data at risk)
- **Risk Owner**: Security
- **Category**: Architecture
- **Business Impact**: If the encryption key needs to be rotated (compromise, compliance requirement), there is no mechanism to re-encrypt existing data, requiring a custom migration.
- **Compliance Impact**: ISO 27001 A.10, SOC2 Security

### RISK-009: Federation Resolve Privacy Leak
- **Severity**: Low
- **Likelihood**: Medium (publicly accessible endpoint)
- **Blast Radius**: Feature (user enumeration)
- **Risk Owner**: Dev
- **Category**: Code
- **Business Impact**: The federation resolve endpoint returns user IDs, allowing enumeration of which users have federated identities.
- **Compliance Impact**: GDPR/PDPL

### RISK-010: Missing Pagination on Several Endpoints
- **Severity**: Low
- **Likelihood**: Medium (grows with usage)
- **Blast Radius**: Product (performance degradation)
- **Risk Owner**: Dev
- **Category**: Performance
- **Business Impact**: Several list endpoints have no pagination limits, meaning as data grows they could return increasingly large response payloads, degrading performance.

---

## Section 5: Risk Register

| Issue ID | Title | Domain | Severity | Owner | SLA | Dependency | Verification | Status |
|----------|-------|--------|----------|-------|-----|------------|--------------|--------|
| RISK-001 | Governance vote race condition | Code | High | Dev | Phase 1 (1-2w) | None | Run concurrent vote test | Open |
| RISK-002 | No CI/CD pipeline | Process | High | DevOps | Phase 0 (48h) | None | PR triggers automated tests | Open |
| RISK-003 | Error handler scoping | Code | Medium | Dev | Phase 1 (1-2w) | None | All error responses match RFC 7807 | Open |
| RISK-004 | Webhook secrets plaintext | Code | High | Security | Phase 1 (1-2w) | None | Secrets encrypted in DB | Open |
| RISK-005 | Incomplete WebAuthn | Code | Medium | Dev | Phase 2 (2-4w) | None | Attestation signature verified | Open |
| RISK-006 | Branch coverage 59% | Testing | Medium | Dev | Phase 1 (1-2w) | None | Branch coverage at 80%+ | Open |
| RISK-007 | env-validator 0% coverage | Testing | Medium | Dev | Phase 1 (1-2w) | None | env-validator tests pass | Open |
| RISK-008 | No key rotation | Architecture | Medium | Security | Phase 2 (2-4w) | None | Key rotation script exists | Open |
| RISK-009 | Federation privacy leak | Code | Low | Dev | Phase 2 (2-4w) | None | Resolve returns no userId | Open |
| RISK-010 | Missing pagination | Performance | Low | Dev | Phase 2 (2-4w) | None | All list endpoints paginated | Open |

---

## Scores

### Technical Dimensions

| Dimension | Score | Assessment |
|-----------|-------|------------|
| Security | 8/10 | Strong crypto, auth, headers. Webhook secrets and race condition are gaps. |
| Architecture | 8/10 | Clean plugin-based Fastify, RFC 7807, dual auth. Error handler scoping needs fix. |
| Test Coverage | 7/10 | 380 tests with real DB. 80% lines but 59% branches. No E2E or frontend tests. |
| Code Quality | 8/10 | Clean TypeScript, Zod validation, structured logging. Minor inconsistencies. |
| Performance | 7/10 | Good DB indexing and pooling. Missing pagination on some endpoints, in-memory metrics. |
| DevOps | 5/10 | Docker multi-stage build good. No CI/CD pipeline, no monitoring export. |
| Runability | 8/10 | Full stack starts, health OK, real data, Docker ready. |

**Technical Score**: 7.3/10

### Readiness Scores

| Dimension | Score | Assessment |
|-----------|-------|------------|
| Security Readiness | 7/10 | Strong foundation, needs CI/CD gate and targeted hardening |
| Product Potential | 8/10 | Solid domain logic, comprehensive features, good architecture |
| Enterprise Readiness | 6/10 | No CI/CD, compliance controls exist but not automated |

### Overall Score: 7.1/10 — Needs Work

---

## Compliance Summary

**OWASP Top 10**: 8/10 Pass, 2/10 Partial
- Partial: A02 (webhook secrets), A05 (error handler inconsistency)

**SOC2 Type II**: Not Ready
- Gaps: No CI/CD (Security), vote race condition (Processing Integrity)

**ISO 27001**: Not Ready
- Gaps: No key rotation (A.10), no CI/CD (A.14)

---

# PART B — ENGINEERING APPENDIX

*Audience: Engineering team only. Contains file:line references and code examples.*

---

## Section 6: Architecture Problems

### 6.1 Error Handler Scoping (RISK-003)

**Location**: `src/app.ts:392-435` (global error handler) vs routes without try/catch

**Problem**: The global `setErrorHandler` at `app.ts:392` handles `AppError` instances by returning RFC 7807 format. However, routes that `throw new AppError(...)` without a local try/catch (e.g., `src/routes/v1/i18n.ts:133`, `src/routes/v1/governance.ts:156`) produce Fastify's default error serialization instead of the custom format.

**Evidence**: `GET /api/v1/i18n/translations/zz` returns:
```json
{"statusCode":404,"code":"not-found","error":"Not Found","message":"Locale not found"}
```
Instead of:
```json
{"type":"https://humanid.dev/errors/not-found","title":"Not Found","status":404,"detail":"Locale not found"}
```

**Fix**: Add try/catch blocks to routes that throw AppError without catching, OR investigate Fastify error handler plugin scoping to ensure the global handler catches all AppError instances from child scopes.

**Affected routes**: `i18n.ts:127` (GET /translations/:locale), `governance.ts:148` (GET /results)

### 6.2 Polymorphic Foreign Keys Without Enforcement

**Location**: `prisma/schema.prisma` — `BlockchainAnchor.entityId`, `AuditLog.entityId`

**Problem**: These fields reference multiple entity types (DIDs, Credentials, etc.) without database-level foreign key constraints. Orphaned references can accumulate if referenced entities are deleted.

**Impact**: Low — documented design pattern, but requires application-level cleanup.

---

## Section 7: Security Findings

### 7.1 Authentication and Authorization

**Strengths** (all verified in code):
- JWT HS256 pinned at `app.ts:129-134` (no algorithm negotiation attacks)
- Dual auth: JWT sessions + API key integrations at `plugins/auth.ts:36-97`
- Account lockout after 5 failed attempts at `routes/v1/auth.ts` (Redis-based, 900s window)
- Email enumeration prevention: generic "Invalid email or password" responses
- Token rotation: old refresh tokens invalidated on refresh
- Session tracking: device info, IP address captured
- API key one-time exposure: raw key shown only at creation

**Gaps**:
- WebAuthn (`routes/v1/webauthn.ts:130-186`): No attestation signature verification — CBOR parsing is basic JSON, not full FIDO2 spec
- No account lockout for API key authentication attempts

### 7.2 Data Security

**Strengths**:
- AES-256-GCM encryption for credential claims (`utils/encryption.ts:26-42`)
- Ed25519 private keys encrypted at rest (`utils/encryption.ts:68-91`)
- bcrypt 12 rounds for passwords (`utils/crypto.ts:5`)
- HMAC-SHA256 for API key storage (`utils/crypto.ts:38-50`)
- Timing-safe comparison for secrets (`utils/encryption.ts:107-110`)
- SHA256 hash chains for audit log integrity (`routes/v1/audit.ts`)

**Gaps**:
- Webhook secrets stored in plaintext (`prisma/schema.prisma` — Webhook model, `secret` field)
- Single encryption key for all data (CLAIMS_ENCRYPTION_KEY) — no key hierarchy
- No key rotation mechanism

### 7.3 API Security

**Strengths**:
- SSRF protection in webhooks (`routes/v1/webhooks.ts`) — blocks private IPs, localhost, internal domains
- ID parameter validation via pre-handler hook (`app.ts:377-389`) — regex `/^[a-zA-Z0-9_-]{1,128}$/`
- Zod input validation on all mutation endpoints
- Rate limiting with Redis distributed store (`app.ts:145-177`)

**Gaps**:
- Some endpoints missing pagination (credentials list, governance proposals)
- Federation resolve returns userId (privacy leak)

### 7.4 Infrastructure Security

**Strengths**:
- Helmet with CSP: `default-src 'self'`, HSTS 1-year preload (`app.ts:84-98`)
- CORS strict mode in production (`app.ts:100-127`)
- Docker non-root user (humanid:1001) in Dockerfile
- Environment validation at startup (`utils/env-validator.ts`)

**Gaps**:
- No CI/CD pipeline for automated security scanning
- CSP allows `style-src 'unsafe-inline'` (necessary for CSS-in-JS but widens surface)

---

## Section 8: Performance and Scalability

### 8.1 Database

**Strengths**:
- Comprehensive indexing across 36 tables (verified in schema)
- Configurable connection pool: 1-500, default 20 (`plugins/prisma.ts:25-38`)
- Connection timeout validation at startup

**Gaps**:
- Governance vote increment is not atomic (`routes/v1/governance.ts:125-130`) — two separate Prisma calls instead of a transaction
- Some list endpoints lack pagination limits (credentials, governance proposals)
- Org membership checks query DB each time (no caching)

### 8.2 Metrics and Monitoring

**Strengths**:
- In-memory metrics with P50/P95/P99 percentiles (`plugins/observability.ts:81-86`)
- Request correlation IDs (X-Request-ID)
- Internal metrics endpoint with HMAC protection

**Gaps**:
- Metrics stored in-memory only — lost on restart
- No Prometheus/CloudWatch export
- Redis health checks only at startup, no runtime pings

---

## Section 9: Testing Gaps

### Coverage Summary

| Metric | Current | Target |
|--------|---------|--------|
| Statements | 78.83% | 80%+ |
| Branches | 59.04% | 80%+ |
| Functions | 81.23% | 80%+ |
| Lines | 80.09% | 80%+ |

### Critical Gaps

| File | Branch Coverage | Issue |
|------|----------------|-------|
| `utils/env-validator.ts` | 0% | Completely untested startup validation |
| `routes/v1/issuance-delegation.ts` | 15.38% | Critical delegation logic barely tested |
| `routes/v1/government.ts` | 16.66% | Government partnership routes untested |
| `routes/v1/org-dids.ts` | 14.28% | Organization DID management untested |
| `routes/v1/sso.ts` | 36.36% | SSO configuration error paths untested |
| `routes/v1/webauthn.ts` | 38.70% | Security-critical FIDO2 logic undertested |
| `app.ts` | 39.13% | Core app error handling and middleware |

### Missing Test Categories

- No E2E tests (Playwright)
- No frontend tests (apps/web/tests/ empty)
- No load/stress tests
- No security boundary tests (JWT expiration, CORS policy enforcement)

---

## Section 10: DevOps Issues

### CI/CD

- **No GitHub Actions workflow** — only `dependabot.yml` exists
- Tests must be run manually before merge
- No automated quality gate blocks bad code from shipping

### Deployment

- Docker multi-stage build present with health checks
- Non-root user (humanid:1001) — good security practice
- Graceful shutdown on SIGINT/SIGTERM with connection draining

### Monitoring

- Health endpoint: `/health` and `/ready` (with DB check)
- Internal metrics: `/internal/metrics` (HMAC-protected)
- PII redaction in all logs
- No external metrics export (Prometheus, CloudWatch, etc.)

---

## Section 11: Compliance Readiness

### OWASP Top 10 (2021)

| Control | Status | Evidence |
|---------|--------|----------|
| A01: Broken Access Control | Pass | Role-based auth on all protected endpoints, DID ownership checks, org membership validation |
| A02: Cryptographic Failures | Partial | AES-256-GCM for claims, Ed25519 for signatures. Gap: webhook secrets in plaintext |
| A03: Injection | Pass | Prisma parameterized queries throughout, Zod input validation, no raw SQL |
| A04: Insecure Design | Pass | Defense-in-depth: encryption + hashing + auth + rate limiting |
| A05: Security Misconfiguration | Partial | Helmet+CSP+HSTS configured. Gap: error handler inconsistency exposes Fastify internals |
| A06: Vulnerable Components | Pass | All dependencies at latest stable versions, no known CVEs |
| A07: Auth Failures | Pass | bcrypt 12, account lockout, token rotation, session management |
| A08: Data Integrity Failures | Pass | Ed25519 signatures, SHA256 audit chain, credential hashing |
| A09: Logging and Monitoring | Pass | Structured logging, PII redaction, audit trail with hash chains |
| A10: SSRF | Pass | Comprehensive SSRF protection in webhooks with private IP blocking |

### SOC2 Type II

| Principle | Status | Evidence |
|-----------|--------|----------|
| Security | Partial | Strong auth and encryption. Gap: no CI/CD gate, webhook secrets |
| Availability | Partial | Health checks and graceful shutdown. Gap: no monitoring export |
| Processing Integrity | Partial | Data validation and audit trails. Gap: governance race condition |
| Confidentiality | Pass | AES-256-GCM encryption, PII log redaction |
| Privacy | Pass | Minimal data collection, encrypted storage |

### ISO 27001 Annex A

| Control Area | Status | Evidence |
|-------------|--------|----------|
| A.9 Access Control | Pass | RBAC, JWT+API key auth, org-scoped permissions |
| A.10 Cryptography | Partial | Strong algorithms. Gap: no key rotation mechanism |
| A.12 Operations Security | Partial | Logging and monitoring. Gap: no automated deployment checks |
| A.14 Development Security | Partial | TDD approach, real DB testing. Gap: no CI/CD pipeline |

---

## Section 12: Technical Debt Map

| Priority | Debt Item | Interest (Cost of Delay) | Owner | Payoff |
|----------|-----------|--------------------------|-------|--------|
| HIGH | No CI/CD pipeline | Every deployment is a risk | DevOps | Automated quality gate |
| HIGH | 59% branch coverage | Hidden bugs in error paths | Dev | Confidence in error handling |
| HIGH | Governance race condition | Incorrect vote counts at scale | Dev | Data integrity |
| MEDIUM | Error handler scoping | Inconsistent API for consumers | Dev | API reliability |
| MEDIUM | Webhook secrets plaintext | DB breach exposes signing keys | Security | Data protection |
| MEDIUM | env-validator 0% coverage | Startup safety untested | Dev | Configuration confidence |
| LOW | In-memory metrics only | Lost on restart | DevOps | Operational visibility |
| LOW | Missing pagination | Performance degrades with data | Dev | Scalability |
| LOW | No key rotation | Manual migration if key compromised | Security | Operational readiness |

---

## Section 13: Remediation Roadmap

### Phase 0 — Immediate (48 hours)

1. **Add CI/CD pipeline** — Create GitHub Actions workflow that runs tests on PR
   - Owner: DevOps
   - Gate: PRs blocked until tests pass

2. **Fix governance vote race condition** — Wrap vote + increment in Prisma transaction
   - Owner: Dev
   - Gate: Concurrent vote test passes

### Phase 1 — Stabilize (1-2 weeks)

3. **Fix error handler scoping** — Add try/catch to routes that throw without catching
   - Owner: Dev
   - Gate: All error responses match RFC 7807

4. **Boost branch coverage to 80%+** — Add error-path tests for low-coverage files
   - Owner: Dev
   - Gate: `jest --coverage` shows branches at 80%+

5. **Encrypt webhook secrets** — Use AES-256-GCM like credential claims
   - Owner: Security
   - Gate: Webhook secrets encrypted in DB

6. **Test env-validator** — Add tests for all validation paths
   - Owner: Dev
   - Gate: env-validator.ts at 90%+ coverage

### Phase 2 — Production-Ready (2-4 weeks)

7. **Complete WebAuthn attestation verification**
8. **Add key rotation mechanism**
9. **Fix federation privacy leak**
10. **Add pagination to all list endpoints**
11. **Add E2E tests with Playwright**

### Phase 3 — Excellence (4-8 weeks)

12. **Export metrics to Prometheus/CloudWatch**
13. **Add load testing**
14. **Add frontend test coverage**
15. **Implement event sourcing for audit trail**

---

## Section 14: Quick Wins (1-day fixes)

1. Add GitHub Actions CI workflow (`.github/workflows/ci.yml`)
2. Wrap governance vote in Prisma `$transaction` (`routes/v1/governance.ts:115-130`)
3. Add try/catch to `i18n.ts:127` GET /translations/:locale route
4. Add try/catch to `governance.ts:148` GET /proposals/:id/results route
5. Add `take: 100` default limit to credentials list and governance proposals list

---

## Section 15: AI-Readiness Score

| Sub-dimension | Score | Notes |
|---------------|-------|-------|
| Modularity | 2/2 | Clean plugin architecture, domain-driven routes |
| API Design | 2/2 | RFC 7807 errors, RESTful endpoints, OpenAPI spec |
| Testability | 1.5/2 | Real DB testing excellent. Branch coverage gap reduces confidence. |
| Observability | 1.5/2 | Structured logging, correlation IDs, PII redaction. Missing metrics export. |
| Documentation | 2/2 | PRD, ADRs, OpenAPI spec, security.txt, comprehensive README |

**AI-Readiness Score: 9/10**

---

## Score Gate

**FAIL** — Technical score 7.3/10 and Overall 7.1/10 are below 8/10 threshold.

**Improvement plan**: Execute Phase 0 and Phase 1 items to reach 9/10 target.
