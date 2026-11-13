---
standard: construction-handoff
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Handoff: Inception → Construction

This document closes the Inception phase and hands the
memory-bank to the Construction Agent. The Construction
Agent works the 5 Bolts in `bolts/plan.md` and produces
`ddd-01-domain-model.md` / `ddd-02-technical-design.md`
/ `adr-*.md` / `ddd-03-test-report.md` per Bolt, per
the bolt template in
`../templates/construction/bolt-types/ddd-construction-bolt.md`.

## Active intent

`intents/002-citizen-report-flow/` is the active intent
(WO-001, Citizen Report Flow). It is `in-progress` per
`intents/index.md` and contains 5 units, 17 stories.

## Bolt plan

See `bolts/plan.md`. The plan decomposes the 5 units into
5 Bolts:

1. `002-001-auth-and-profile` — splash / welcome / register / verify-OTP / login
2. `002-002-home-and-activity` — home / city activity feed
3. `002-003-submit-report-flow` — 5-step report flow + dedup prompt + confirmation + bootstrap
4. `002-004-my-reports` — my reports + report detail
5. `002-005-theme-and-i18n` — bilingual UI + theme (push-subscribe deferred)

## Code-reality baseline

The repo is **substantially built** (see `REFINEMENT.md`
for the per-story matrix). WO-000 (Platform Foundation,
Intent 001) is complete and all 11 stories are `done`.
WO-001 (Intent 002) has 16/17 stories `in-progress`; only
`016-push-subscribe` is `pending` (deferred to v1.1).

The Construction Agent's job is therefore **paperwork,
visual-baseline capture, gap closure, and regression
sweeps** — not a from-scratch build. Each Bolt's
`bolt.md` `## Bolt Decision` section records the call on
optional splits (e.g., bolt 3 into 3a + 3b) and on
gaps to close or defer.

## Standards the Construction Agent must read first

Before opening any Bolt, the Construction Agent reads:

1. `standards/tech-stack.md` — pinned stack (Next.js 14
   App Router, TypeScript strict, Tailwind v3, Prisma 5.22
   + PostgreSQL 16, MapLibre, etc.).
2. `standards/coding-standards.md` — named exports,
   `Result<T, E>` for service layer, Zod at API
   boundaries, no hard-coded user copy.
3. `standards/api-conventions.md` — Zod-validated routes,
   citizen-facing serializer always used, audit log on
   state-changing operations.
4. `standards/system-architecture.md` — DDD boundaries,
   bolt plan, decision index, error envelope.
5. `standards/data-stack.md` — Prisma + the
   backend-agnostic `lib/db-switch.ts` facade; the dev
   store is selected when `CITYFIX_DEV_STORE=1`.
6. `standards/decision-index.md` — the 8 ADRs
   (four-role model, dedup-prompt, Bangla-first i18n,
   spec-as-contract, Prisma+Postgres, WO-000 gates
   persona WOs, WO-000 complete, OTP SMS provider
   stubbed in WO-000).

## Open gaps the Construction Agent owns

These are the active decisions in `REFINEMENT.md`:

- **G1 — Geofence is hard-coded** (close in Bolt
  002-003 by reading `Ward.polygonGeoJson` from the
  bootstrap payload).
- **G2 — Login throttle** (decide in Bolt 002-001;
  either add a second token bucket keyed on
  `(ip, 'login')` with 5/min cap or defer to v1.1).
- **G3 — `requireSameWard` / `requireSameDepartment`**
  (defer; not needed until Intent 003 ships).
- **G4 — VAPID stubbed** (defer; PRD-deferred to v1.1).
- **G5 — Dark-theme baselines** (close in Bolt 002-005
  by adding `02-dark-theme.spec.ts`).
- **G6 — Audit dashboard** (defer; Intent 005 /
  ADM-007 deliverable).

## Per-Bolt exit criteria (recap)

From `bolts/plan.md`:

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green (new tests for any
  `lib/` change).
- `npm run test:mockups` is green (new visual
  baselines for any new mockup / `tokens.css` change).
- `curl -fs http://localhost:3000/` returns 200 for
  any new top-level route.
- The Bolt's `ddd-03-test-report.md` is committed.
- The intent's `units.md` story statuses are updated
  to `done` as their acceptance criteria close.

## Construction Verification Command

`npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`

(Recorded in `standards/rules/team.md` and
`standards/rules/project.md`.)

## Conventions the Construction Agent must follow

Per `standards/rules/{org,team,project}.md`:

- **Trunk branch is `prd-development`** (specialises
  org.md's `main`).
- **Squash-merge Bolts into trunk**; commit message
  uses the Bolt slug.
- **Result types** for service layer; **never throw
  across service boundaries**.
- **Zod schemas** at every API boundary.
- **Citizen serializer** at every citizen-facing
  endpoint.
- **i18n via `lib/i18n/keys.ts` only** — never hard-code
  user copy.
- **Audit log** via `writeAudit(...)` on every
  state-changing operation.
- **Trunk-based short branches (1-2 days)**; no
  long-lived release branches.
- **Visual regression baselines are gating** — never
  merge a Bolt with failing Playwright tests.

## When the Inception Agent resumes

The Inception Agent's job here is done. The Construction
Agent now owns the bolt folders in `bolts/`. The Inception
Agent picks up again when:

- A Bolt ships and unlocks the next WO (e.g., Intent 002
  done → Intent 003 `units.md` decomposed into stories).
- A discovery during Construction requires a new
  story / decision / unit split; the Inception Agent
  writes the new spec and the Construction Agent
  re-plans.

## Cross-references

- **Active intent**: `intents/002-citizen-report-flow/`.
- **Bolt plan**: `bolts/plan.md`.
- **Bolt folder layout**: `bolts/README.md`.
- **Story index**: `story-index.md`.
- **Decision index**: `standards/decision-index.md`.
- **Refinement notes**: `REFINEMENT.md`.
- **Bolt template**:
  `../templates/construction/bolt-types/ddd-construction-bolt.md`.
- **Construction Agent**:
  `../aidlc/agents/construction-agent.md`.
