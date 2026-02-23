# Phase 2C: ZKP Engine

**Branch:** `feature/humanid/h2c-zkp-engine`
**Status:** Complete
**Date:** 2026-02-23

## Summary

Server-side Groth16 zero-knowledge proof verification for HumanID.
Enables holders to prove predicates about credential attributes
(e.g., "age >= 18") without revealing the underlying data.

## What Was Built

### ZKP Verification Service (`src/services/zkp.service.ts`)
- `verifyProof()` — wraps snarkjs.groth16.verify with vkey caching
- `getVerificationKey()` — loads and caches vkey JSON per circuit
- `listCircuits()` — returns metadata for all 4 circuits
- `validatePublicSignals()` — validates signal count per circuit
- `isValidCircuitType()` — type guard

### ZKP Routes (`src/routes/v1/zkp.ts`)
- `GET /api/v1/zkp/circuits` — list circuits (public)
- `GET /api/v1/zkp/circuits/:type/verification-key` — serve vkey (public)
- `POST /api/v1/zkp/verify` — standalone proof verification (auth)

### ZKP Presentation Flow (`src/routes/v1/presentations.ts`)
- Extended Zod schema: `proofType` now accepts `'ZKP'`
- ZKP branch in POST handler: verify Groth16 proof, store in DB
- ZKP presentations disclose no attributes (predicates only)
- GET /:id includes `zkpProof` data for ZKP presentations

### Circuits
| Circuit | Public Signal | Description |
|---------|--------------|-------------|
| age_range | ageOverThreshold | Prove age above threshold |
| membership | isMember | Prove set membership |
| equality | matches | Prove attribute matches hash |
| range | inRange | Prove value in range |

## Files Created
- `src/services/zkp.service.ts`
- `src/routes/v1/zkp.ts`
- `src/zkp/verification-keys/*.vkey.json` (4 files)
- `contracts/circuits/*.circom` (4 reference files)
- `tests/integration/zkp-service.test.ts`
- `tests/integration/zkp-routes.test.ts`
- `tests/integration/zkp-presentations.test.ts`

## Files Modified
- `src/app.ts` — registered zkpRoutes
- `src/routes/v1/presentations.ts` — ZKP proof type support
- `package.json` — added snarkjs@^0.7.6
- `jest.config.cjs` — snarkjs CJS mapping

## Testing Notes
- snarkjs is mocked in all tests (same pattern as ethers in anchoring)
- Jest CJS mapping: `'^snarkjs$': '<rootDir>/node_modules/snarkjs/build/main.cjs'`
- 29 new tests across 3 test files

## Decisions
- snarkjs `import.meta.url` not supported in Jest/ts-jest CJS mode;
  used `__dirname` for vkey path resolution
- ZKP presentations skip Ed25519 signing (ZKP replaces Ed25519 proof)
- `disclosedAttributes = []` for ZKP (nothing disclosed, only predicates)
