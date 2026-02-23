# Horizon 2: Blockchain Anchoring with Polygon (Phase 2B)

## Branch
`feature/humanid/h2-blockchain-anchoring`

## Status: COMPLETE
All 5 sub-tasks delivered. Test count: 990 → 1011 (+21 new tests, 0 regressions).

## Tasks
- [x] 2B.0: Add SUBMITTED to AnchorStatus enum + migration
- [x] 2B.1: Anchoring service (submit, confirm, retry) — 11 tests
- [x] 2B.2: Background anchor processor — 6 tests
- [x] 2B.3: On-chain verification enhancement — 4 tests
- [x] 2B.4: Environment config + Solidity contract + final verification

## New Files
- `src/services/anchoring.service.ts` — Core anchoring logic (submit, confirm, retry)
- `src/services/anchor-processor.ts` — Background processor (30s setInterval)
- `contracts/HumanIDAnchor.sol` — Minimal Solidity contract (reference)
- `tests/integration/anchoring-service.test.ts` — 11 tests
- `tests/integration/anchor-processor.test.ts` — 6 tests
- `tests/integration/anchoring-onchain.test.ts` — 4 tests

## Modified Files
- `prisma/schema.prisma` — Added SUBMITTED to AnchorStatus enum
- `src/routes/v1/anchoring.ts` — Enhanced verify (onChainVerified) + chains (rpcConnected)
- `src/app.ts` — Register anchor processor hooks (onReady/onClose)
- `src/utils/env-validator.ts` — Blockchain env validation (POLYGON_RPC_URL, etc.)
- `package.json` — Added ethers@^6.0

## Key Design Decisions
- ethers v6 for Polygon interaction via Contract interface
- setInterval-based processor (30s cycle, configurable)
- Mocked ethers in tests (no real RPC calls)
- Processor only starts when POLYGON_RPC_URL is configured (no test interference)
- Max 3 retries for failed anchors
- PENDING → SUBMITTED → CONFIRMED lifecycle with FAILED state
- On-chain verification: dynamic import of ethers in route handler
- Contract: events-only (no storage), minimal gas cost

## Anchor Lifecycle
```
PENDING → (submitAnchor) → SUBMITTED → (checkConfirmation) → CONFIRMED
                                  ↓ (receipt.status=0)
                               FAILED → (retryFailed, retryCount<3) → PENDING → ...
                                  ↓ (retryCount>=3)
                            Permanently FAILED
```

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| POLYGON_RPC_URL | No | Polygon RPC endpoint (Amoy testnet or mainnet) |
| POLYGON_PRIVATE_KEY | No | Private key for signing transactions (0x-prefixed) |
| POLYGON_CONTRACT_ADDRESS | No | Deployed HumanIDAnchor contract address |

All three must be set together, or none. Processor and on-chain features are disabled when unset.
