# OpenAPI Spec Expansion — HumanID

## Branch
`feature/humanid/openapi-expansion`

## Scope
- Replace hardcoded inline spec at app.ts:304-379 with YAML loader
- Expand openapi.yaml from ~40 endpoints (~25%) to all 143+ endpoints (100%)
- Add tag definitions for all 20 undocumented route groups

## Key Decisions
- Using handwritten YAML (not @fastify/swagger) because routes use Zod, not Fastify JSON schemas
- `yaml` package installed as direct dependency (was transitive via OTel)
- Working in batches: A (Core Identity), B (Credential Ecosystem), C (Platform Ops), D (Org & Governance), E (Infrastructure & Privacy)

## Route File → Prefix Mapping
| File | Prefix | Endpoints |
|------|--------|-----------|
| developer.ts | /developer | 8 (keys CRUD, usage, sandbox seed/status, rotate-encryption-key, logs) |
| audit.ts | /audit | 3 (events, events/export, events/verify) |
| sso.ts | /sso | 4 (oidc POST/DELETE, saml POST, providers GET) |
| webauthn.ts | /webauthn | 6 (register options/verify, authenticate options/verify, credentials GET/DELETE) |
| eidas.ts | /eidas | 3 (status, convert, trust-framework) |
| marketplace.ts | /api/v1 (root) | 6 (issuers/apply, issuers/directory, admin/issuer-applications GET/PATCH, marketplace/templates GET, templates/:id/fork) |
| issuance-delegation.ts | /issuance-delegation | 4 (POST, GET, /:id/chain, DELETE /:id) |
| offline.ts | /offline | 4 (tokens POST/GET, verify, sync) |
| compliance.ts | /compliance | 5 (status, controls POST/GET/PATCH, controls/summary) |
| regions.ts | /regions | 4 (POST, GET, /:code/health, PATCH /:code) |
| fraud.ts | /fraud | 4 (scan, alerts GET/PATCH, stats) |
| security.ts | /security | 5 (reports POST/GET/PATCH, advisories POST/GET) |
| organizations.ts | /orgs | 6 (POST, GET /:id, members POST/GET/PATCH/DELETE) |
| org-dids.ts | /org-dids | 4 (POST, POST /:id/children, GET, GET /:id/tree) |
| governance.ts | /governance | 5 (proposals POST/GET, proposals/:id/vote, proposals/:id/results, params) |
| agents.ts | /agents | 7 (POST, GET, GET /:id, POST /:id/delegate, POST /:id/verify, DELETE /:id/delegations/:did, PATCH /:id) |
| webhooks.ts | /webhooks | 6 (POST, GET, GET /:id, POST /:id/test, GET /:id/deliveries, DELETE /:id) |
| federation.ts | /federation | 4 (links POST/GET/DELETE, resolve) |
| gdpr.ts | /me | 5 (GET /data, GET /export, DELETE /, PATCH /, POST /restrict) |
| i18n.ts | /i18n | 4 (locales POST/GET, translations PUT, translations/:locale GET) |
| government.ts | /government | 4 (partnerships/apply, partnerships GET, credential-schemes POST/GET) |
| anchoring.ts | /anchoring | 4 (submit, GET, /:id/verify, chains) |

## Status
- [x] Step 1: Replace inline spec endpoint (commit 6a3145a)
- [x] Step 2: Add missing tags (21 tag definitions)
- [x] Step 3: Document missing endpoints (Batches A-E) (commit 06e167b)
- [x] Step 4: Validation (990/990 tests pass, 115 paths, 32 schemas)

## Final Stats
- **Paths**: 115 (was ~37)
- **Schemas**: 32 (was 31, added OrgDidTreeNode)
- **Tags**: 30 (was 9)
- **File size**: 8,637 lines (was 2,074)
- **Stale paths removed**: 4 `/developers/` paths (wrong prefix, replaced by `/developer/`)
