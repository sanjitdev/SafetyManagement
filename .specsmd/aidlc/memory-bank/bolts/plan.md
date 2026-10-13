---
standard: bolt-plan
phase: standards
status: draft
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Bolt Plan — Intent 002 (Citizen Report Flow)

The Inception → Construction bridge for Intent 002.
The Construction Agent reads this plan first; it
describes how the 5 units of Intent 002 decompose
into construction bolts, the suggested bolt type, the
stage-by-stage scope, and the per-bolt exit criteria.

## Bolt summary

| # | Bolt ID | Unit | Bolt Type | Stories | Objective |
|---|---------|------|-----------|---------|-----------|
| 1 | `002-001-auth-and-profile` | 001-auth-and-profile | `ddd-construction-bolt` | 001-splash-welcome, 002-registration-otp, 003-login | Citizen auth funnel (splash → welcome → register → verify-OTP → login) |
| 2 | `002-002-home-and-activity` | 002-home-and-activity | `ddd-construction-bolt` | 004-home-activity, 015-citizen-serializer-wiring | Home / city activity feed (1.6) |
| 3 | `002-003-submit-report-flow` | 003-submit-report-flow | `ddd-construction-bolt` | 005-report-location, 006-report-photo, 007-report-category, 008-report-note, 009-dedup-prompt, 010-confirmation, 017-bootstrap-endpoint | 5-step report flow + dedup prompt + confirmation + bootstrap |
| 4 | `002-004-my-reports` | 004-my-reports | `ddd-construction-bolt` | 011-my-reports, 012-report-detail | My reports + report detail with status trail |
| 5 | `002-005-theme-and-i18n` | 005-theme-and-i18n | `ddd-construction-bolt` | 013-bilingual-ui, 014-theme-appearance, 016-push-subscribe (deferred) | Bilingual UI + theme (push-subscribe deferred to v1.1) |

## Code-reality starting state

The codebase is already substantially built (see
`../REFINEMENT.md` for the per-story reality matrix).

The Construction Agent's job is to: (a) capture the DDD
paperwork (`ddd-01-domain-model.md`, `ddd-02-technical-design.md`,
`ddd-03-test-report.md`), (b) capture Playwright visual
baselines for any new route, (c) close the gaps recorded
in `REFINEMENT.md`, and (d) sweep for regressions.

## Per-bolt source pointers

These are the files the Construction Agent opens first
for each Bolt. They already exist; the Bolt is paperwork +
small refinements + baselines, not a from-scratch build.

| Bolt | Source files (already-built) | Refinement obligation |
|------|-------------------------------|------------------------|
| 002-001-auth-and-profile | `app/{splash,welcome,register,verify-otp,login}/page.tsx`, `app/api/v1/auth/**` | Decide on G2 (login throttle) per Bolt Decision; capture light-theme baselines. |
| 002-002-home-and-activity | `app/home/page.tsx`, `app/feed/page.tsx`, `app/api/v1/activity/route.ts` | Visual baselines for the 4 filter pills; serializer wiring test. |
| 002-003-submit-report-flow | `app/report/{location,photo,category,note,summary}/page.tsx`, `app/report/[id]/submitted/page.tsx`, `app/api/report/bootstrap/route.ts`, `app/api/tickets/route.ts` | Close **G1** (polygon-based geofence); capture per-step visual baselines. May split into 3a (1.7/1.8/1.9) + 3b (1.10/1.10b/1.11 + 017 bootstrap) — the Bolt Decision records the call. |
| 002-004-my-reports | `app/reports/page.tsx`, `app/reports/[id]/page.tsx`, `app/api/tickets/[id]/route.ts` | Status-trail integration test (submitted → routed → in_progress → resolved). |
| 002-005-theme-and-i18n | `lib/i18n/keys.ts`, `lib/theme/{appearance,ThemeProvider}.ts`, `lib/theme/ThemeProvider.tsx`, `app/appearance-boot.tsx` | Close **G5** (dark-theme baselines); story `016-push-subscribe` stays `pending` (v1.1). |

## Per-bolt stage guidance

Each bolt runs through the 5-stage DDD process:

1. **Domain Model** — entities, value objects,
   aggregates, events, services, repository
   interfaces, ubiquitous language.
2. **Technical Design** — architecture pattern, layer
   structure, API contracts, data persistence, security,
   NFRs, integrations.
3. **ADR Analysis** (optional) — only when an
   ADR-worthy decision is identified. Most bolts
   inherit decisions from `decision-index.md` and do
   not need new ADRs.
4. **Implement** — write the source code per the
   design.
5. **Test** — Vitest unit tests + Playwright route
   specs + visual regression baselines.

The 5 stages are gated by human checkpoints per
`.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.

## Per-bolt exit criteria

A bolt is "done" when:

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green (new tests for any
  `lib/` change).
- `npm run test:mockups` is green (new visual
  baselines for any new mockup / `tokens.css` change).
- `curl -fs http://localhost:3000/` returns 200 for
  any new top-level route.
- The bolt's `ddd-03-test-report.md` is committed.
- The intent's `units.md` story statuses are
  updated to `done`.

## Cross-references

- **Active intent**: `../intents/002-citizen-report-flow/`.
- **Bolt folder layout**: `./README.md`.
- **Per-bolt template**:
  `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.
- **Construction Agent**: `.specsmd/aidlc/agents/construction-agent.md`.
