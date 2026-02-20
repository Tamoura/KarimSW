# HumanID API Coverage Boost

## Goal
Raise branch coverage from 53% to 80%+ by adding integration tests
for routes with low branch coverage.

## Priority Files (by branch coverage)
1. i18n.ts (16.66%) - admin auth, Zod errors, locale not found
2. issuance-delegation.ts (18.75%) - Zod errors, not-owner, chain access
3. agents.ts (27.58%) - DID not owned, inactive agent, expired delegation
4. governance.ts (33.33%) - double-vote, voting ended, proposal not active
5. anchoring.ts (35%) - entity not found, ownership, already anchored
6. org-dids.ts (35.29%) - role check, membership, not found
7. sso.ts (36.36%) - missing OIDC, org not found, SSO not enforced
8. fraud.ts (37.5%) - credential not found, Zod errors, alert not found
9. federation.ts (38.46%) - DID not owned, link not found, resolve no match
10. security.ts - Zod errors, not found, non-admin

## Test Files to Create
- tests/integration/i18n-extended.test.ts
- tests/integration/agents-extended.test.ts
- tests/integration/fraud-extended.test.ts
- tests/integration/federation-extended.test.ts
- tests/integration/governance-extended.test.ts
- tests/integration/compliance-extended.test.ts
- tests/integration/security-extended.test.ts

## Pattern
- Import buildApp from ../../src/app
- Create app instance, set JWT_SECRET etc.
- Create test users via prisma directly
- Login to get tokens
- Use app.inject() for requests
- Cleanup in afterAll
