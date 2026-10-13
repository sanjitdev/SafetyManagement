---
standard: bolt-instance
phase: construction
status: complete
current_stage: done
stages_completed:
  - name: model
    completed: 2026-10-11T18:00:00Z
    artifact: ../002-003-submit-report-flow/ddd-01-domain-model.md (parent)
  - name: design
    completed: 2026-10-11T18:00:00Z
    artifact: ./ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-11T18:00:00Z
    artifact: (none — no new ADR for this child; parent Bolt Decision 1 owns the G1 polygon geofence)
  - name: implement
    completed: 2026-10-11T22:30:00Z
    artifact: lib/report-photo-cap.ts (CREATED), lib/report-geofence.ts (CREATED), app/report/photo/page.tsx (EDITED), app/report/location/page.tsx (EDITED), tests/07-report-see-and-pick-light.spec.ts (CREATED)
  - name: test
    completed: 2026-10-11T23:00:00Z
    artifact: ./ddd-03-test-report.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T23:00:00Z
bolt_id: 002-003a-see-and-pick
unit: 002-citizen-report-flow/003-submit-report-flow
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
parent_bolt: 002-003-submit-report-flow
---

# Bolt 002-003a — See and Pick

The 3 pre-submit steps of the report flow:
**1.7 location**, **1.8 photo**, **1.9 category**.
Plus the polygon-based geofence upgrade (Gap G1)
and the photo-cap invariants.

This is the first child of Bolt 002-003 (the
**split** Bolt Decision). The 3a surface is
"see and pick": the citizen is still deciding
what to report. Submission, dedup, and
confirmation are 3b.

## Scope (in)

- `app/report/location/page.tsx` (1.7)
- `app/report/photo/page.tsx` (1.8)
- `app/report/category/page.tsx` (1.9)
- The polygon-based geofence upgrade (Gap G1) —
  reads `Ward.polygonGeoJson` from the bootstrap
  payload, renders the `out-of-bounds` card
  against the polygon's bounding box. Falls
  back to the Dhaka-North constant when the
  polygon is absent.
- The photo cap default of 3 + narrow-category
  cap of 2.
- Per-step Playwright baselines for the 3
  pre-submit steps (light theme).

## Scope (out)

- The submit / dedup / confirmation steps (3b).
- The `POST /api/tickets` route — 3b owns the
  dedup integration.
- The push notification fan-out (3b owns the
  submit-side push wiring).
- Real photo pipeline (R2 / S3) — deferred to
  v1.1; v1 ships base64 data URLs.
- MapLibre swap for the v1 SVG placeholder —
  deferred to v1.1.

## Inherited from parent bolt

- Bolt Decision 1 (G1 polygon geofence).
- Bolt Decision 3 (photo cap default of 3 +
  narrow-category cap of 2).
- All Scope (out) items from the parent.
- All cross-references (active intent, unit
  brief, plan, standards consumed).

## Bolt Decision (child-specific)

1. **Geofence path** — read `Ward.polygonGeoJson`
   from the bootstrap payload when present; fall
   back to a defensive `DHAKA_NORTH_BBOX`
   constant when absent. The design doc
   **must** record the fallback explicitly
   (so a v1.1 Bolt wiring the polygon in
   production is a behaviour-preserving change).
   **No ADR** for v1 (the dev store doesn't
   ship polygon GeoJSON yet); the ADR-010
   capture in the parent bolt's decision is
   deferred to the v1.1 Bolt that wires the
   polygon for real.
2. **Photo cap surface** — the photo step enforces
   the default cap of 3; the category step
   narrows the cap to `narrowCategoryPhotoCap`
   when set (cat_streetlight is currently the
   only narrow category, cap 2). The
   narrowing is applied **at the photo step**
   on the citizen's next visit (the photo step
   reads the current category from the draft).
   The design doc must clearly state where each
   cap is applied.
3. **Per-step baselines** — 3 PNGs (one per
   step), light theme, 1440x900. The "draft
   has data" variant for each step is not
   baselined in this Bolt (v1.1 may add
   "draft with photo / category selected"
   baselines for the photo and category steps).
4. **No new ADR for this child.** The G1
   polygon decision is documented in the
   parent's Bolt Decision; no separate ADR
   file. The polygon wiring is a v1.1 Bolt.

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 005-report-location | `../../intents/002-citizen-report-flow/003-submit-report-flow/005-report-location.md` | `done` |
| 006-report-photo | `../../intents/002-citizen-report-flow/003-submit-report-flow/006-report-photo.md` | `done` |
| 007-report-category | `../../intents/002-citizen-report-flow/003-submit-report-flow/007-report-category.md` | `done` |

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — 67 / 67
  carry-over plus any new tests for the
  polygon-geofence helper (if extracted) +
  the photo-cap helpers (if extracted).
- `npm run test:mockups` is green — 15 / 15
  design-mockup baselines.
- 3 / 3 new Playwright baselines for the 3
  pre-submit steps, light theme, 1440x900.
- `curl -fs http://localhost:3000/` returns 200.
- `ddd-03-test-report.md` documents the
  per-step baselines and the geofence
  fallback.

## Stage checklist

1. [x] **Domain Model** — inherited from
   `./002-003-submit-report-flow/ddd-01-domain-model.md`
   (parent bolt).
2. [x] **Technical Design** — `./ddd-02-technical-design.md`.
   Cover the 3-step state machine, the
   `ReportDraft` shape, the polygon-geofence
   value object, the photo-cap invariants, the
   role of the bootstrap endpoint on the
   category step.
3. [x] **ADR Analysis** — no new ADR; inherits.
4. [x] **Implement** — the source already
   exists; this child is paperwork + the
   polygon-geofence upgrade + per-step
   visual baselines. `lib/report-photo-cap.ts`
   and `lib/report-geofence.ts` extracted as
   pure helpers; `app/report/photo/page.tsx`
   and `app/report/location/page.tsx` refactored
   to use them; `tests/07-report-see-and-pick-light.spec.ts`
   captures 3 PNGs.
5. [x] **Test** — `./ddd-03-test-report.md`.
   81/81 unit tests (14 new), 3/3 new visual
   baselines, 15/15 mockup baselines, tsc clean.
   Per-bolt exit criteria all PASS.

## Cross-references

- **Parent bolt**: `../002-003-submit-report-flow/bolt.md`.
- **Active intent**: `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/003-submit-report-flow/unit-brief.md`.
- **Standards consumed**: `tech-stack.md`,
  `coding-standards.md`, `api-conventions.md`,
  `decision-index.md` (ADR-001 four-role).
- **Sibling 3b**:
  `../002-003b-submit-and-confirm/bolt.md`.
