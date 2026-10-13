---
standard: bolt-instance
phase: construction
status: complete
current_stage: done
stages_completed:
  - name: model
    completed: 2026-10-11T18:00:00Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-11T18:00:00Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-10-11T18:00:00Z
    note: No new ADRs. All decisions inherit from ADR-001/004/005/006/007.
  - name: implement
    completed: 2026-10-11T18:00:00Z
    artifacts:
      - lib/home-filter.ts
      - app/home/page.tsx (refactor only)
      - lib/dev-store.ts (4 seed tickets)
      - tests/unit/home-filter.test.ts
      - tests/06-home-feed-light.spec.ts
      - ddd-02-technical-design.md (reporterId drift fix)
  - name: test
    completed: 2026-10-11T18:00:00Z
    artifact: ddd-03-test-report.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-002-home-and-activity
unit: 002-citizen-report-flow/002-home-and-activity
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
---

# Bolt 002-002 — Home and Activity

The home / city activity feed. This Bolt is the
**first citizen-facing authenticated surface** after
the auth funnel — it is the page that proves the
funnel works end-to-end and that the citizen serializer
strips internal fields from the feed.

## Scope (in)

- `app/home/page.tsx` (1.6)
- `app/feed/page.tsx` (legacy / parallel route; verify
  the active route is `/home`).
- `app/api/v1/activity/route.ts`
- `app/api/report/bootstrap/route.ts` (the home page
  reads this for city / ward / categories)
- Per-story DDD artifacts.
- Playwright visual baselines for the 4 status filter
  pills (All / New / In progress / Resolved) and the
  empty-state variant.

## Scope (out)

- The notification permission POST to
  `/api/v1/push/subscribe` (deferred to v1.1; story
  `016-push-subscribe` is `pending`).
- Cross-ward filing (deferred to v1.1; the home page
  surfaces the citizen's own ward only).
- The SVG `CityMap` placeholder → MapLibre swap
  (deferred to v1.1; v1 ships the SVG so the visual
  story is consistent across the demo).
- Mapbox tiles in production (deferred to v1.1; dev
  ships OSM raster only).

## Bolt Decision

The decisions made in Stage 3 (ADR Analysis):

1. **Active route is `/home`, not `/feed`**. The
   specsmd unit-brief names `/home`; the existing
   source ships `app/home/page.tsx` as the active
   surface and `app/feed/page.tsx` as a legacy
   parallel route. v1 baselines target `/home` only;
   `app/feed/page.tsx` is left as a v1.1 cleanup
   item. **No ADR required** — the unit-brief
   already names the canonical path.
2. **Filter pill semantics** (All / New / In
   progress / Resolved) — recorded in
   `ddd-02-technical-design.md` per-route table. No
   new ADR; the i18n key path (`home.filter.new` →
   API `submitted`) is the same convention every
   other surface uses.
3. **Polling cadence (15s)** — recorded as a
   per-bolt NFR target in
   `ddd-02-technical-design.md`. **No new ADR** —
   this is a per-bolt choice, not a project-wide
   policy.
4. **No new ADR for this Bolt.** All decisions
   inherit from ADR-001 (four-role model),
   ADR-004 (spec-as-contract), ADR-005 (status
   pipeline — used by the status filter pills),
   ADR-006 (dedup is a prompt, not auto-merge — the
   home feed is downstream of the dedup path), and
   ADR-007 (citizen serializer).

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 004-home-activity | `../../intents/002-citizen-report-flow/002-home-and-activity/004-home-activity.md` | `done` |
| 015-citizen-serializer-wiring | `../../intents/002-citizen-report-flow/002-home-and-activity/015-citizen-serializer-wiring.md` | `done` |

## Per-bolt exit criteria — actuals

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green — 67 / 67 across 9 files
      (incl. 10 new tests in
      `tests/unit/home-filter.test.ts`).
- [x] `npm run test:mockups` is green — 15 / 15 design
      mockup baselines; 5 / 5 new home-feed baselines
      under `tests/06-home-feed-light.spec.ts`; 5 / 5
      carry-over auth-funnel baselines.
- [x] `curl -fs http://localhost:3000/` returns 200.
- [x] `ddd-03-test-report.md` lists every baseline +
      every unit test that owns the serializer contract.

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — `tests/unit/serializer.test.ts`
  covers the citizen anonymisation rules; add a
  per-pill test for the home filter logic.
- `npm run test:mockups` is green — new baselines for
  `/home` × 4 filter pills + the empty-state.
- `curl -fs http://localhost:3000/` returns 200 (the
  `/` route redirects to `/splash` → `/home` once authed).
- `ddd-03-test-report.md` lists every baseline + every
  unit test that owns the serializer contract.

## Stage checklist

1. [x] **Domain Model** — `ddd-01-domain-model.md`. Cover
   the `ActivityItem` value object, the polling-poll
   pattern, the citizen-vs-internal field distinction
   that drives the serializer, and the empty-state
   invariant.
2. [x] **Technical Design** — `ddd-02-technical-design.md`.
   Cover the polling cadence, the per-pill status
   mapping, the rate-limit plan for the activity route
   (the v1 plan is no extra throttle, but the design
   doc records that as a decision), the serializer
   wiring, and the citizen-ward-only scoping.
   **Drift fix during Stage 4**: the `reporterId`
   claim was corrected (the serializer **includes**
   `reporterId` for citizens so `isOwnReport` can be
   derived client-side; the design doc now matches
   the implementation).
3. [x] **ADR Analysis** — optional. Inherits
   ADR-002 (four-role) + ADR-004 (spec-as-contract).
   No new ADR.
4. [x] **Implement** — source already exists. The
   Bolt's implement phase is paperwork + per-pill
   test coverage + the empty-state test.
   - `lib/home-filter.ts` (3 pure helpers, 2 types).
   - `app/home/page.tsx` refactor to use the helpers.
   - `tests/unit/home-filter.test.ts` (10 tests).
   - `tests/06-home-feed-light.spec.ts` (5 baselines).
   - `lib/dev-store.ts` seed (4 demo tickets).
5. [x] **Test** — `ddd-03-test-report.md`. Per-bolt
   exit criteria met: `tsc --noEmit` clean,
   `test:unit` 67/67 green, `test:mockups` 15/15
   green, 5/5 new baselines green, end-to-end smoke
   against a real session green.

## Cross-references

- **Active intent**: `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/002-home-and-activity/unit-brief.md`.
- **Bolt plan**: `../plan.md`.
- **Story 015** is the **serializer contract** Bolt;
  the `lib/serializers/ticket.ts` test in
  `tests/unit/serializer.test.ts` is the canonical
  acceptance evidence.
- **Standards consumed**: `tech-stack.md`,
  `api-conventions.md`, `decision-index.md`
  (ADR-002 four-role model).
