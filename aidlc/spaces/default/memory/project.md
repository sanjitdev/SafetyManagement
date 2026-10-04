# Project-Level Rules — CityFix

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance; contradictions with broader policy
> are rejected. Populated by practices-discovery and the self-learning loop.

**Project**: CityFix — citizen-powered city issue reporting & tracking platform
**Repo folder**: `SafetyManagement` (project name is CityFix)
**Product Brief**: `docs/idea.md` and `design-artifacts/A-Product-Brief/`
**Active space**: `default`
**Conversation language**: English (orchestrator resolves per human turn; project surfaces target Bangla-first per design log)

---

## Way of Working  (inherits team.md)

No project-level specialisation beyond team.md.

## Walking Skeleton  (inherits team.md)

Construction Verification Command for this project:
`npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`

## Testing Posture  (inherits team.md)

Project-specific test-floor additions:
- Vitest unit tests live under `tests/unit/`; path alias `@/`.
- Playwright mockup baselines live under
  `tests-mockups/baselines/01-mockups.spec.ts/`; per-WO route specs
  extend this directory with `tests/<NN-wo-slug>.spec.ts` files.

## Guard Policy

<!-- Project-specific. Mode: strict, relaxed, or off. Strict here holds for every intent and cannot be changed from chat. -->

Mode: strict

Operational notes (inherits team.md's strict mode).

## Deployment  (inherits team.md)

Hosting target deferred to WO-001 PRD.

## Code Style  (additive to team.md)

- **TypeScript strict**: `tsc --noEmit` must be clean on every commit.
- **Path alias**: `@/` → repo root.
- **Imports**: ESM-style; `isolatedModules: true` — no const-enum access.

## Tech Stack (pinned by `design-artifacts/E-Development/000-tech-audit.md` 2026-10-04)

- **Framework**: Next.js 14 (App Router) + TypeScript strict + Tailwind v3 + `tokens.css` (design-token source of truth).
- **Runtime**: Node.js 20 LTS.
- **Map**: MapLibre GL JS + OpenStreetMap raster tiles (dev); Mapbox tiles in prod if load justifies. GeoJSON ward polygons from city config endpoint.
- **Push**: Web Push API (VAPID) for v1; service-worker delivery. FCM/APNs deferred.
- **Auth**: HTTP-only signed session cookies; four-role model (`citizen / dispatcher / crew / admin`); citizen phone+NID+password+SMS-OTP; admin WebAuthn mandatory for writes. Libraries: `argon2`, `@simplewebauthn/{server,browser}`, `otpauth`.
- **Data**: PostgreSQL 16 + Prisma (TypeScript types, migrations). R2/MinIO/S3 for blobs.
- **Testing**: Playwright (mockup baselines + per-WO route specs) + Vitest (unit).
- **i18n**: Bangla-first, English-secondary; typed key registry `lib/i18n/keys.ts`.

## Decided

- **DECIDED**: Four-role auth model (citizen / dispatcher / crew / admin) is fixed for v1. (Inception, 2026-09-18)
- **DECIDED**: Web-first responsive design; Rashid's pages retain 390×844 phone fallback. (Inception Phase B, 2026-10-04)
- **DECIDED**: Spec-as-contract pattern replaces wireframes (per user decision, 2026-09-18).
- **DECIDED**: Next.js 14 App Router + Prisma + Postgres stack (tech-audit, 2026-10-04).
- **DECIDED**: WO-000 platform layer is gating; persona WOs cannot begin until WO-000 PRD is signed off. (Delivery Planning, 2026-10-04)
- **DECIDED**: WO-000 platform layer is **complete** as of 2026-10-04 — Prisma schema, auth (password/OTP/session/guards), serializers, rate limit, audit, dedup, transitions, push, and 5 API routes wired. 14/14 unit tests passing.
- **DECIDED**: OTP SMS provider stubbed in WO-000; real provider chosen in WO-004. (tech-audit, 2026-10-04)
- **DECIDED**: Photo retention policy + dedup radius (50m default) are PRD-level decisions, not tech-audit decisions. (tech-audit, 2026-10-04)
- **DECIDED**: Multi-photo capture defaults: cap 3, narrow-category cap 2, mandatory minimum 1. (UX Review revision #6, 2026-09-18)
- **DECIDED**: Status trail `Submitted → Routed → In progress → Resolved` shared across all surfaces. (UX Design, 2026-09-18)
- **DECIDED**: First AIDLC intent in this space is `261004-wo-001-citizen-report-fl` (2026-10-04), scope `feature`, target: build WO-001 against the live platform layer.

## Scope Overrides

- Default scope for new feature work in this project is **feature**.
- For bug/security patches targeting this codebase, prefer **bugfix**
  (short-circuits to RE/RA/CG/BT/DP/DE stages only).
- For platform-layer rebuilds (e.g., swapping auth, changing data layer),
  prefer **refactor** (no ideation, RE→FD→CG→BT→DP→DE).

## Forbidden

- NEVER throw exceptions across service-layer boundaries (inherits team.md).
- NEVER edit `aidlc-state.md` directly — only the engine's state-transition hooks write state.
- NEVER bypass plan approval in Construction — even quick fixes go through the approval gate.
- NEVER delete the `documentkb/` tree — identity and tombstones are gone forever.
- NEVER use const-enum access in TypeScript — `isolatedModules: true` forbids it; use numeric/string literals.
- NEVER drop citizen-facing serializer changes without re-running serializers tests in `tests/unit/`.
- NEVER change the four-role model, WebAuthn-mandatory-for-admin, or dedup-not-merge without re-running UX Review + Work Order revision.

## Mandated

- ALWAYS localize user-facing copy through `lib/i18n/keys.ts` (inherits team.md).
- ALWAYS run `npx tsc --noEmit` before declaring a Bolt complete (inherits team.md).
- ALWAYS run `npm run test:mockups` before declaring any UI work complete (inherits team.md).
- ALWAYS run `npm run test:unit` after adding/editing files under `lib/` (inherits team.md).
- ALWAYS use the platform serializer `lib/serializers/ticket.ts` when exposing tickets to citizens (inherits team.md).
- ALWAYS commit Bolt work with the Bolt slug as the commit message; preserve Bolt history on source branch.

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->

- The AIDLC CLI for this workspace is `.puku-cli/tools/aidlc.ts`; invoke
  it directly via Bun with `AWS_AIDLC_DEFAULT_SCOPE=feature` set in the
  environment (learned 2026-10-04).

## WO-001 intent framing
- Civic observability is the visibility layer that makes silence unmaintainable; trust signals (status trail, push, feel-heard feedback) are how observability translates into restored trust. (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:intent-capture:b54d837568c29f3df7572e1f07cfa8e60239f9489feeb380366aeb0f85fd57e4 -->

## WO-001 target customer
- The design optimisation target is the Rahim archetype (Persona 02); the broader Dhaka-tech-comfortable cohort is the post-pilot acceptance population, not the v1 surface. (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:intent-capture:f53c31c2e5fc31a019b1c5b56ea89058bc4d6816f64ae4c4758a641928785151 -->

## Per-Bolt cadence
- For feature-scope work, the per-Bolt design-log entry is the leanest cadence that still satisfies team.md Mandated; no additional daily or weekly cadence is required. (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:intent-capture:ea5db07361267c262e8cd76ab78c83eb8dbf74f49bb0fd5e557242c8e604f752 -->
