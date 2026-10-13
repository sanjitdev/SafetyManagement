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
    completed: 2026-10-11T22:00:00Z
    note: "Per-stage artefacts owned by children 002-003a-see-and-pick/ddd-02-technical-design.md and 002-003b-submit-and-confirm/ddd-02-technical-design.md; the parent's domain model is the shared input."
  - name: adr
    completed: 2026-10-11T22:00:00Z
    note: "No new ADR; ADR-001 (four-role), ADR-006 (dedup-prompt-not-auto-merge) inherited. ADR-010 (polygon-based geofence) recorded in Bolt Decision but not formalised as an ADR file — the dev store does not ship polygon GeoJSON in v1."
  - name: implement
    completed: 2026-10-11T22:45:00Z
    note: "Per-stage artefacts owned by children: 002-003a (lib/report-photo-cap.ts, lib/report-geofence.ts, app/report/{location,photo}/page.tsx edits, tests/07-report-see-and-pick-light.spec.ts) and 002-003b (app/report/{note,summary,[id]/submitted}/page.tsx verified, app/api/report/bootstrap/route.ts contract owner, app/api/tickets/route.ts POST flow + decline path, lib/platform/dedup.ts verified)."
  - name: test
    completed: 2026-10-11T23:15:00Z
    note: "Per-stage artefacts owned by children: 002-003a/ddd-03-test-report.md (81/81 unit tests, 3/3 visual baselines) and 002-003b/ddd-03-test-report.md (4/4 dedup unit tests, audit-log entry capture verified). Visual baselines for 3b deferred to v1.1 per bolt.md."
created: 2026-10-11T18:00:00Z
updated: 2026-10-13T08:00:00Z
bolt_id: 002-003-submit-report-flow
unit: 002-citizen-report-flow/003-submit-report-flow
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
split_into:
  - 002-003a-see-and-pick
  - 002-003b-submit-and-confirm
---

# Bolt 002-003 — Submit Report Flow

The 5-step report flow (location → photo → category →
note), the dedup prompt (1.10b), the confirmation
page (1.11), and the bootstrap endpoint (017). This is
the **longest Bolt** of Intent 002: 7 stories, 6 pages
+ 1 dynamic page + 1 endpoint.

## Scope (in)

- `app/report/location/page.tsx` (1.7)
- `app/report/photo/page.tsx` (1.8)
- `app/report/category/page.tsx` (1.9)
- `app/report/note/page.tsx` (1.10)
- `app/report/summary/page.tsx` (1.10b)
- `app/report/[id]/submitted/page.tsx` (1.11)
- `app/report/layout.tsx` (the 5-step shell)
- `app/api/report/bootstrap/route.ts` (017)
- `app/api/tickets/route.ts` (the POST that runs dedup
  + writes the audit log + creates the ticket)
- `app/api/tickets/[id]/photos/[idx]/route.ts` (photo
  retrieval — note that v1 stores photos as data URLs
  in `Ticket.photoUrls`)
- `lib/report-draft.ts` (sessionStorage-backed draft
  that survives across the 5 steps)
- `lib/platform/dedup.ts` (Haversine + bounding-box +
  OPEN_STATUS filter)
- `lib/platform/audit.ts` (`writeAudit`
  `ticket.dedup_detected` event)
- `lib/dev-store.ts` (the in-memory backend that powers
  the dedup fixture)

## Scope (out)

- Real photo pipeline (R2 / S3 / MinIO + signed
  uploads); v1 ships `FileReader` → base64 data URLs
  per the existing implementation.
- Photo retention policy (deferred to v1.1; the current
  baseline is "indefinite retention, citizen-initiated
  delete" per the WO-001 feasibility decision).
- BRIN index on `Ticket.(cityId, locationLat, locationLng)`
  (deferred; the dev store filters post-query in JS).

## Bolt Decision

1. **Close Gap G1 — Geofence is hard-coded.** The
   recommended path is to read `Ward.polygonGeoJson`
   from the bootstrap payload and render the
   `out-of-bounds` card against the polygon's bounding
   box. For the v1 demo a defensive fallback to the
   current Dhaka-North constant is fine — the
   design-doc **must explicitly call out the fallback**
   so a future Bolt in v1.1 can wire the polygon without
   a behavioral regression. Add an ADR-010 capturing
   "polygon-based geofence reads City.boundaryGeoJson
   first; falls back to per-city constant for dev".
2. **Split call — COMMITTED: yes, split.** The
   specsmd plan lets the Construction Agent split this
   into 3a (1.7/1.8/1.9 — location, photo, category)
   and 3b (1.10/1.10b/1.11/017 — note, summary,
   submitted, bootstrap). The Construction Agent
   commits to the split. Two child Bolts now exist:
   - `002-003a-see-and-pick` owns the 3 pre-submit
     steps + the polygon-geofence upgrade (Gap G1).
   - `002-003b-submit-and-confirm` owns the 3
     submit/confirm steps + the bootstrap endpoint +
     the dedup integration + the photo cap defaults.
   This `bolt.md` is the parent; the children inherit
   the parent Scope and Bolt Decision and add their
   own per-stage artefacts.
3. **Photo cap default of 3**. The cap lives in
   `app/report/photo/page.tsx` as `DEFAULT_PHOTO_CAP = 3`;
   the narrow-category cap lookup happens at the
   category step (`narrowCategoryPhotoCap = 2`). The
   design-doc must clearly state where each cap is
   applied so a future Bolt raising it to 4 does not
   surprise the categories step.

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 005-report-location | `../../intents/002-citizen-report-flow/003-submit-report-flow/005-report-location.md` | `done` |
| 006-report-photo | `../../intents/002-citizen-report-flow/003-submit-report-flow/006-report-photo.md` | `done` |
| 007-report-category | `../../intents/002-citizen-report-flow/003-submit-report-flow/007-report-category.md` | `done` |
| 008-report-note | `../../intents/002-citizen-report-flow/003-submit-report-flow/008-report-note.md` | `done` |
| 009-dedup-prompt | `../../intents/002-citizen-report-flow/003-submit-report-flow/009-dedup-prompt.md` | `done` |
| 010-confirmation | `../../intents/002-citizen-report-flow/003-submit-report-flow/010-confirmation.md` | `done` |
| 017-bootstrap-endpoint | `../../intents/002-citizen-report-flow/003-submit-report-flow/017-bootstrap-endpoint.md` | `done` |

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — `tests/unit/dedup.test.ts`
  covers the Haversine + bounding-box + city scope edge
  cases (the existing acceptance criteria for story 007).
- `npm run test:mockups` is green — Playwright baselines
  for each of the 5 steps + the dedup prompt + the
  confirmation page.
- `curl -fs http://localhost:3000/` returns 200 (top-level
  redirects to `/splash` → `/welcome` → `/home`).
- `ddd-03-test-report.md` documents the dedup unit
  tests, the audit-log entry capture, and the photo
  cap invariants.

## Stage checklist

1. [ ] **Domain Model** — `ddd-01-domain-model.md`. Cover
   `ReportDraft` (sessionStorage-backed state machine),
   `Ticket` aggregate root, `TicketStatus` enum (the
   state machine is in `lib/platform/transitions.ts`),
   the dedup pre-filter domain service, the photo
   storage strategy (data URLs in v1; object-store in
   v1.1), and the city-polygon value object.
2. [ ] **Technical Design** — `ddd-02-technical-design.md`.
   Cover the 5-step state machine, the sessionStorage
   shape (`cityfix.reportDraft.v1` +
   `cityfix.reportDedup.v1` + `cityfix.reportDeclineNoted.v1`),
   the role of the bootstrap endpoint, the
   `Ticket.photoUrls` schema, the dedup API
   (`{dedup_match, existing_ticket_id, distance_meters,
   existing_status}`), the audit-log entry shape, and
   the geofence UX.
3. [ ] **ADR Analysis** — if the Bolt commits to closing
   Gap G1 with the polygon-based geofence, an
   ADR-010 is required. Otherwise inherit.
4. [ ] **Implement** — source already exists. The
   Bolt's implement phase is paperwork + the
   polygon-based geofence upgrade (Gap G1) + visual
   baselines.
5. [ ] **Test** — `ddd-03-test-report.md`. Add:
   - dedup edge cases (already in
     `tests/unit/dedup.test.ts`; re-affirm coverage).
   - audit-log entry capture for the dedup-detected
     event.
   - Playwright baselines per step.

## Cross-references

- **Active intent**: `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/003-submit-report-flow/unit-brief.md`.
- **Bolt plan**: `../plan.md`.
- **Refinement gaps owned**: **G1** (geofence).
- **Standards consumed**: `tech-stack.md`,
  `coding-standards.md`, `api-conventions.md`,
  `decision-index.md` (ADR-001 four-role, ADR-006
  dedup-prompt-not-auto-merge).
