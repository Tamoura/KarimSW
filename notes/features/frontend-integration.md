# Frontend Integration Gap Closure

## Branch: `feature/humanid/frontend-integration`

## Scope
Close the H1 frontend integration gap: fix contract mismatches, add missing endpoints, build admin sub-pages.

## Key Findings
- Developer API Keys page: **already fully built** (not a placeholder)
- Developer Sandbox page: **already fully built** (not a placeholder)
- Admin audit/users/issuers pages: **don't exist yet**, need creation

## Work Items
1. Fix Admin Dashboard - backend stats endpoint + frontend API path fixes
2. Add Wallet Sharing endpoints - GET/DELETE /wallet/sharing
3. Build Admin Audit Log page - frontend only (backend exists)
4. Build Admin Users page - backend + frontend
5. Build Admin Issuers page - backend + frontend
6. Update all documentation

## Backend Field Mappings (audit events)
- `createdAt` → `timestamp`
- `userId` → `actor`
- `entityType` → `resource`
- `ipAddress` → `ip`
- `action` stays same

## Test Patterns
- Backend: `buildApp()` + `app.inject()` + real Prisma DB
- Frontend: RTL with mocked fetch
- Cleanup: delete test user data in afterAll
