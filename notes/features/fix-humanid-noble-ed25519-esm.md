# Fix @noble/ed25519 ESM Import in Jest

## Problem
- `@noble/ed25519@3.0.0` is pure ESM (`"type": "module"`)
- Jest uses CJS by default — `require()` fails on ESM modules
- `transformIgnorePatterns` excludes `@noble/ed25519` (so Jest transforms it)
- But the `.js` transform uses `ts-jest` with `useESM: false` which still chokes

## Impact
- 58 integration test suites fail to even load (all import `app.ts` → `dids.ts` → `did-crypto.ts` → `@noble/ed25519`)
- Only tests that don't touch the app (tracing, unit-coverage) work

## Fix Strategy
The `.js` transform uses `useESM: false` which prevents ts-jest from
handling ESM syntax. The fix: use a proper babel transform for `.js`
files from ESM packages, or switch to `@jest/transform` with ESM support.

Simplest approach: add `babel-jest` + `@babel/preset-env` to transpile
ESM `.js` files from node_modules into CJS.

## Files
- `products/humanid/apps/api/jest.config.cjs`
- `products/humanid/apps/api/package.json` (devDeps if needed)
