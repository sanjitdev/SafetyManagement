---
unit: 001-ci-unblock
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:15:00Z
updated: 2026-11-02T18:20:00Z
---

# Unit 001 — CI Unblock (unit-brief)

## Goal

Make CI a usable gate before the redesign begins. CI had failed
18/18 runs since it landed, so every later wave would have been
shipped against a gate that reported nothing.

## Root Causes

1. **`lib/db.ts` — module-load DB guard.** `assertProductionDatabaseConfig()`
   ran at import time. CI sets `DATABASE_URL` to a loopback URL, so
   (a) the unit step failed — `tests/unit/webauthn-prod-guard.test.ts`
   flips `NODE_ENV=production` and re-imports
   `lib/auth/webauthn → lib/db-switch → lib/db`, tripping the guard
   (5 failures); and (b) the build failed collecting page data for
   `/api/dev/list-users`. This contradicted the guard's own docstring
   ("a module-load throw would fail the build before the app ever
   serves a request"). Vercel escaped it only because its
   `DATABASE_URL` is the Neon host.

2. **`tests/28-role-walkthrough.spec.ts:242`** — `let
   streetlightCategoryId` is never reassigned → `prefer-const` error.

## Fix

Assert on **first real DB use** (a lazy proxy over the Prisma client)
instead of at import: loud-fail on the first request, never on the
build. The guard is not weakened — it still fires, just at the moment
the connection would actually be made.

## Files

- `lib/db.ts` — lazy proxy over the Prisma client; the guard runs on
  first property access.
- `tests/28-role-walkthrough.spec.ts` — `let` → `const`.
- `tests/unit/db-lazy-guard.test.ts` — new unit test covering the
  lazy path.

## Story

### 001-lazy-production-db-guard

**As a** CI runner
**I want** the production database guard to fire on the first real
database use rather than at module import
**So that** the build and the unit suite are not blocked by a
connection check that only matters when a connection is made.

**Given** `DATABASE_URL` points at a loopback address and
`NODE_ENV=production`
**When** the module is imported
**Then** no throw occurs
**And** **When** the Prisma client is first accessed
**Then** the guard throws with its original message.

## Acceptance

- `npm run lint` → 0 errors.
- `npx tsc --noEmit` → clean.
- `npm run test:unit` → green.
- `npm run build` → green.
- CI green on `main`.

## Status

Shipped — commit `45062d1` ("fix(ci): unblock CI — lazy production DB
guard and lint cleanup").
