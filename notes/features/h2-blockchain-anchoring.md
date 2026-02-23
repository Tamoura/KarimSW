# Horizon 2: Blockchain Anchoring with Polygon (Phase 2B)

## Branch
`feature/humanid/h2-blockchain-anchoring`

## Status: IN PROGRESS

## Tasks
- [ ] 2B.0: Add SUBMITTED to AnchorStatus enum + migration
- [ ] 2B.1: Anchoring service (submit, confirm, retry) — TDD
- [ ] 2B.2: Background anchor processor — TDD
- [ ] 2B.3: On-chain verification enhancement — TDD
- [ ] 2B.4: Environment config + Solidity contract + final verification

## New Files
- `src/services/anchoring.service.ts` — Core anchoring logic
- `src/services/anchor-processor.ts` — Background processor
- `contracts/HumanIDAnchor.sol` — Reference Solidity contract
- `tests/integration/anchoring-service.test.ts`
- `tests/integration/anchor-processor.test.ts`

## Modified Files
- `prisma/schema.prisma` — SUBMITTED status
- `src/routes/v1/anchoring.ts` — Enhanced verify + chains
- `src/app.ts` — Processor hooks
- `src/utils/env-validator.ts` — Blockchain env vars

## Key Design Decisions
- ethers v6 for Polygon interaction
- setInterval-based processor (30s cycle)
- Mocked ethers in tests (no real RPC calls)
- Processor only starts when POLYGON_RPC_URL is configured
- Max 3 retries with 1.5x gas bump per retry
