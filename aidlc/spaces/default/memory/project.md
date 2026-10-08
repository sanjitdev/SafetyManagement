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

- Feasibility pre-narrows hosting to Vercel because the WO-001 PRD gate is the right place to ratify a host, not later; the PRD gate still owns the final word (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:baa3ac2f79a0feba2849d580cb15d508fddf3507f69a72a49147a0159460966e -->

- Indefinite photo retention with citizen-initiated delete is the citizen-agency reading of the "feel heard" trust signal; PII cost is bounded by a 365-day unread-photo lifecycle policy, not by forced deletion (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:1402c1614e8efc60a805ed7d40dec65db7447e06e8655ed21039e687e4fdcf69 -->

- The 50m dedup radius and the city-boundary geofence are orthogonal: the geofence is a pre-submit guard, the dedup is a post-pin policy; the geofence reject UX path is the design gap flagged in R-1 (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:f55e6e4d535467686323df5ab339692611f735033f3bd892d2e42632bc31662e -->

- Bilingual toggle on splash/welcome is a surface deviation from the default Bangla-only read of project.md; both locales are fully authored, the toggle just lets the citizen pick (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:bd82a5c5f04219d0b15a755e0433054153e5217c97908e4880e93e0911572a69 -->

- OTP SMS provider selection was pulled into feasibility from tech-audit's "real provider chosen in WO-004" because the citizen registration flow needs an end-to-end testable SMS path; the provider interface in lib/ keeps WO-004 free to swap implementations (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:a4062fe005c23a97b2d6eb601f381070b0ea7d41ec8f1f669f07d483ab132431 -->

- Mapbox free → paid was chosen over OSM raster everywhere because the free tier covers the v1 pilot (50k loads/month) and the overage path (Mapbox usage alert + OSM brownout fallback) is cheap to operate (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:6fe39587317d4615cb2867e10f08036f3f56bf008db0958eaeb1f9f397c2cf0f -->

- Online-only submit was chosen over optimistic local draft / service-worker patterns because the ≤ 60s target assumes an active network and the cost of offline support (IndexedDB queue, sync conflict resolution) is high for a v1 surface (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:ea30c17ae0c82d0ff91d07a80ce7f5a5502e70a9a38569f24722be4694f417fb -->

- Dedup-decline is logged as a structured event AND flagged for city-side review; the structured event is privacy-respecting and the flag surfaces possible duplicates to the WO-002 dispatcher for a manual dedup decision (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:feasibility:e08a7ba5611437b6e6bf987f10f8438b544f48c9ea6763360303e3c5ee19f522 -->

## WO-001 intent framing
- Civic observability is the visibility layer that makes silence unmaintainable; trust signals (status trail, push, feel-heard feedback) are how observability translates into restored trust. (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:intent-capture:b54d837568c29f3df7572e1f07cfa8e60239f9489feeb380366aeb0f85fd57e4 -->

## WO-001 target customer
- The design optimisation target is the Rahim archetype (Persona 02); the broader Dhaka-tech-comfortable cohort is the post-pilot acceptance population, not the v1 surface. (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:intent-capture:f53c31c2e5fc31a019b1c5b56ea89058bc4d6816f64ae4c4758a641928785151 -->

## Per-Bolt cadence
- For feature-scope work, the per-Bolt design-log entry is the leanest cadence that still satisfies team.md Mandated; no additional daily or weekly cadence is required. (learned 2026-10-04) (learned 2026-10-04) <!-- cid:261004-wo-001-citizen-report-fl:intent-capture:ea5db07361267c262e8cd76ab78c83eb8dbf74f49bb0fd5e557242c8e604f752 -->
