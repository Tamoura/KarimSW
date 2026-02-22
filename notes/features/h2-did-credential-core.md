# Horizon 2: DID & Credential Core (Phase 2A)

## Branch
`feature/humanid/h2-did-credential-core`

## Status: COMPLETE
All 5 sub-tasks delivered. Test count: 987 → 1030 (+43 new tests, 0 regressions).

## Tasks
- [x] 2A.1: DID Key Rotation (POST /api/v1/dids/:id/rotate) — 8 tests
- [x] 2A.2: DID Service Endpoints (POST/DELETE /api/v1/dids/:id/services) — 8 tests
- [x] 2A.3: Credential Presentation Flow (POST/GET /api/v1/presentations) — 15 tests
- [x] 2A.4: Verification Request Response (POST /api/v1/verify/requests/:id/respond) — 6 tests
- [x] 2A.5: Auto-Anchoring Integration Points — 3 tests

## New Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/v1/dids/:id/rotate | Key rotation with document versioning |
| POST | /api/v1/dids/:id/services | Add service endpoint |
| DELETE | /api/v1/dids/:id/services/:serviceId | Remove service endpoint |
| POST | /api/v1/presentations | Create FULL or SELECTIVE presentation |
| GET | /api/v1/presentations | List holder's presentations |
| GET | /api/v1/presentations/:id | Get presentation details |
| POST | /api/v1/presentations/:id/revoke | Revoke presentation |
| POST | /api/v1/verify/requests/:id/respond | Respond to verification request |

## New Files
- `src/routes/v1/presentations.ts` — Presentation CRUD
- `tests/integration/did-key-rotation.test.ts`
- `tests/integration/did-services.test.ts`
- `tests/integration/presentations.test.ts`
- `tests/integration/verify-respond.test.ts`
- `tests/integration/auto-anchoring.test.ts`

## Modified Files
- `src/routes/v1/dids.ts` — Key rotation, service endpoints, auto-anchor
- `src/utils/did-crypto.ts` — Multi-key DID documents, ServiceEntry type
- `src/routes/v1/credentials.ts` — Auto-anchor on issue/revoke
- `src/routes/v1/verify.ts` — Respond to verification requests
- `src/app.ts` — Register presentation routes

## Key Design Decisions
- buildDidDocument() extended with optional VerificationMethodEntry[] and ServiceEntry[]
- Key rotation creates new DID document version with old keys marked `revoked: true`
- Selective disclosure: disclosed attributes in cleartext, hidden as SHA-256(field_name:value)
- Presentations signed with holder's Ed25519 key
- Auto-anchor queues PENDING BlockchainAnchor records on POLYGON chain
- Verification response runs full 4-step pipeline inline (signature, issuer trust, revocation, expiry)
