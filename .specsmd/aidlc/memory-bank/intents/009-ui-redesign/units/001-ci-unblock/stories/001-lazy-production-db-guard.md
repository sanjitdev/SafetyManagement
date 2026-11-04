---
story: 001-lazy-production-db-guard
unit: 001-ci-unblock
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:15:00Z
updated: 2026-11-02T18:20:00Z
implemented: true
---

# Story 001 — Lazy Production DB Guard

## User Story

**As a** CI runner
**I want** the production database guard to fire on the first real
database use rather than at module import
**So that** the build and the unit suite are not blocked by a
connection check that only matters when a connection is made.

## Acceptance Criteria

- **Given** `DATABASE_URL` points at a loopback address and
  `NODE_ENV=production`
- **When** `lib/db.ts` is imported
- **Then** no throw occurs

- **And** **When** the Prisma client is first accessed
- **Then** the guard throws with its original message

- **And** `npm run lint` reports 0 errors
- **And** `npx tsc --noEmit` is clean
- **And** `npm run test:unit` is green
- **And** `npm run build` is green
- **And** CI is green on `main`

## BDD Scenarios

### Scenario 1: Import does not trip the guard

```gherkin
Given NODE_ENV=production
  And DATABASE_URL is a loopback address
When I import lib/db.ts
Then no error is thrown
```

### Scenario 2: First use does trip the guard

```gherkin
Given NODE_ENV=production
  And DATABASE_URL is a loopback address
When I access the Prisma client for the first time
Then the guard throws
  And the message names the offending variable
```

## Out of Scope

- Changing the guard's policy — it still refuses a non-Neon URL in
  production. Only the *timing* changed.
- The `prefer-const` lint fix in `tests/28-role-walkthrough.spec.ts`,
  which ships in the same commit.

## Linked Files

- `lib/db.ts`
- `tests/unit/db-lazy-guard.test.ts`
- `tests/28-role-walkthrough.spec.ts`

## Status

Shipped — commit `45062d1`.
