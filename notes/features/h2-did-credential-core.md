# Horizon 2: DID & Credential Core (Phase 2A)

## Branch
`feature/humanid/h2-did-credential-core`

## Goal
Make the identity core end-to-end functional: create DID → issue credential → present credential (selective disclosure) → verify presentation → anchor on-chain.

## Tasks
- [x] 2A.1: DID Key Rotation (POST /api/v1/dids/:id/rotate)
- [ ] 2A.2: DID Service Endpoints (POST/DELETE /api/v1/dids/:id/services)
- [ ] 2A.3: Credential Presentation Flow (POST/GET /api/v1/presentations)
- [ ] 2A.4: Verification Request Response (POST /api/v1/verify/requests/:id/respond)
- [ ] 2A.5: Auto-Anchoring Integration Points

## Key Design Decisions
- buildDidDocument() extended with optional params for multi-key and services
- Key rotation creates new DID document version with both old (deactivated) and new key
- Selective disclosure uses SHA-256 hashes for hidden fields
- Presentations signed with holder's Ed25519 key
- Auto-anchor queues PENDING BlockchainAnchor records (actual submission is Phase 2B)

## Existing Code Reused
- `generateEd25519KeyPair()` from did-crypto.ts
- `buildEd25519Proof()` / `verifyEd25519Proof()` from did-crypto.ts
- `encryptPrivateKey()` / `decryptPrivateKey()` from encryption.ts
- `encryptClaims()` / `decryptClaims()` from encryption.ts
- Test pattern: buildApp() + inject from existing integration tests
