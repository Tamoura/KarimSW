# apiFetch Migration

## Goal
Replace raw `fetch()` + manual `API_BASE` + manual `Authorization` headers with `apiFetch()` across 32 frontend pages.

## Branch
`refactor/humanid/apifetch-migration`

## Pattern
- Add `apiFetch` to import from `@/lib/api-client`
- Remove local `const API_BASE = ...` line
- Replace `fetch(\`${API_BASE}/path\`, { headers: { Authorization: ... } })` → `apiFetch("/path")`
- Remove manual token/header construction used only for fetch
- Keep `getAccessToken()` calls used for auth checks (e.g., redirect if not logged in)
- Remove `credentials: 'include'` from individual calls (apiFetch adds it)

## Batches
1. Wallet (5 files)
2. Issuer (3 files)
3. Developer (5 files)
4. Organization (3 files)
5. Platform features (14 files)
6. Other (2 files)

## Progress
- [ ] Batch 1: Wallet
- [ ] Batch 2: Issuer
- [ ] Batch 3: Developer
- [ ] Batch 4: Organization
- [ ] Batch 5: Platform features
- [ ] Batch 6: Other
- [ ] Verification
