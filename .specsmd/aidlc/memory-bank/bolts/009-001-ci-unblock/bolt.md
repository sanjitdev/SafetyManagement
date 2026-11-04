---
id: 009-001-ci-unblock
unit: 001-ci-unblock
intent: 009-ui-redesign
type: simple-construction-bolt
status: complete
stories:
  - 001-lazy-production-db-guard
created: 2026-11-02T18:15:00Z
started: 2026-11-02T18:15:00Z
completed: 2026-11-02T18:20:00Z
updated: 2026-11-02T18:20:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-11-02T18:15:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-11-02T18:18:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-11-02T18:20:00Z
    artifact: test-walkthrough.md
requires_bolts: []
enables_bolts:
  - 009-002-design-foundation
requires_units: []
blocks: false
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 0
  testing_scope: 2
  estimated_files: 3
---

# Bolt 009-001 — CI Unblock

## Purpose

Make CI a usable gate before the redesign starts. CI had failed 18/18
runs since it landed, so every later wave would have shipped against a
gate that reported nothing.

## Stories

| Story ID | Title | FR |
|----------|-------|-----|
| 001-lazy-production-db-guard | Lazy production DB guard + `prefer-const` fix | FR-1 |

## Files Modified

- `lib/db.ts` — the production DB guard moved from module load to
  first real DB use, behind a lazy proxy over the Prisma client.
- `tests/28-role-walkthrough.spec.ts` — `let streetlightCategoryId` →
  `const`.
- `tests/unit/db-lazy-guard.test.ts` — new unit test covering the
  lazy path.

## Implementation Notes

### Why module load was wrong

`assertProductionDatabaseConfig()` ran at import time. In CI,
`DATABASE_URL` is a loopback URL, so:

- the unit step failed — `tests/unit/webauthn-prod-guard.test.ts`
  flips `NODE_ENV=production` and re-imports
  `lib/auth/webauthn → lib/db-switch → lib/db`, tripping the guard
  (5 failures reproduced locally);
- the build failed collecting page data for `/api/dev/list-users`.

This contradicted the guard's own docstring ("a module-load throw
would fail the build before the app ever serves a request"). Vercel
escaped it only because its `DATABASE_URL` is the Neon host — which
means **the guard had never actually been exercised on the real
production path**. The fix asserts on first real DB use: loud-fail on
the first request, never on the build. The guard's policy is
unchanged.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Lint | `npm run lint` | 0 errors |
| Unit | `npm run test:unit` | green |
| Build | `npm run build` | green |
| CI | — | green on `main` |

## Out of Scope

- Changing the guard's policy (a non-Neon URL in production is still
  refused).
- The `prefer-const` fix is in the same commit — it was the second of
  the two CI root causes.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The guard now fires later, so a bad `DATABASE_URL` reaches runtime before it is caught | The failure is still loud and immediate on the first request, and the unit test covers the lazy path explicitly. |
| A code path reads a Prisma property without going through the proxy | The proxy wraps the client object, so every property access triggers the check. |
