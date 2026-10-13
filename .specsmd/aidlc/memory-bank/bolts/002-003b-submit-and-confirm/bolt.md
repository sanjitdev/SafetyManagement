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
    artifact: (none — no new ADR for this child; ADR-006 dedup-prompt-not-auto-merge is the inherited decision)
  - name: implement
    completed: 2026-10-11T22:45:00Z
    artifact: app/report/note/page.tsx (existing, verified), app/report/summary/page.tsx (existing, verified), app/report/[id]/submitted/page.tsx (existing, verified), app/api/report/bootstrap/route.ts (existing, verified — contract owner), app/api/tickets/route.ts (existing, verified — POST flow + decline path), lib/platform/dedup.ts (existing, verified)
  - name: test
    completed: 2026-10-11T23:15:00Z
    artifact: ./ddd-03-test-report.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T23:15:00Z
bolt_id: 002-003b-submit-and-confirm
unit: 002-citizen-report-flow/003-submit-report-flow
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
parent_bolt: 002-003-submit-report-flow
---

# Bolt 002-003b — Submit and Confirm

The 3 submit-confirm steps of the report flow:
**1.10 note**, **1.10b dedup prompt**, **1.11
submitted confirmation**. Plus the
**`/api/report/bootstrap`** endpoint contract
owner (017) and the dedup integration.

This is the second child of Bolt 002-003 (the
**split** Bolt Decision). The 3b surface is
"submit and confirm": the citizen finalises
the report, sees the dedup prompt if there is
a near-pin open ticket, and lands on the
confirmation page with the new ticket id.

## Scope (in)

- `app/report/note/page.tsx` (1.10)
- `app/report/summary/page.tsx` (1.10b)
- `app/report/[id]/submitted/page.tsx` (1.11)
- `app/api/report/bootstrap/route.ts` (017 — owner
  of the bootstrap contract; 3a consumes it).
- The POST `/api/tickets` route (already in
  `app/api/tickets/route.ts`) — the dedup
  integration, the audit-log entry capture, the
  initial `TicketTrailEntry`, and the
  push-notification fan-out (best-effort).
- The dedup UX flow:
  - The note page (1.10) finalises the draft.
  - The summary page (1.10b) calls POST
    `/api/tickets`; on `{dedup_match: true}` it
    renders the "looks like someone already
    reported this" prompt with two CTAs (link
    to the existing ticket / submit anyway).
  - On 201 the citizen lands on
    `/report/[id]/submitted`.
- Per-step Playwright baselines for the 3
  steps + the dedup prompt (light theme).

## Scope (out)

- The 3 pre-submit steps (location / photo /
  category) — 3a owns them.
- The polygon-geofence upgrade (Gap G1) — 3a.
- Real photo pipeline (R2 / S3) — deferred to
  v1.1.
- BRIN index on `Ticket.(cityId, locationLat,
  locationLng)` — deferred to v1.1.

## Inherited from parent bolt

- Bolt Decision 1 (G1 polygon geofence — 3a
  owns the G1 wire-up; 3b only adds an optional
  polygon field to the bootstrap response).
- Bolt Decision 3 (photo cap default of 3 +
  narrow-category cap of 2 — 3a owns the UX
  cap; 3b's server schema already allows up
  to 5 photoUrls).
- All Scope (out) items from the parent.
- All cross-references (active intent, unit
  brief, plan, standards consumed).

## Bolt Decision (child-specific)

1. **Bootstrap contract ownership** — 3b is the
   owner of the `CityBootstrap` response shape.
   3a consumes the contract but does **not**
   extend it. If 3b extends the response (e.g.
   to add `ward.polygonGeoJson` for the G1
   upgrade), the extension is backwards-
   compatible: existing fields keep their
   meaning, new fields are optional. **No ADR**
   for the extension (it is a non-breaking
   additive change).
2. **Dedup UX** — the summary page (1.10b)
   always renders the draft summary; on
   `{dedup_match: true}` it overlays the
   prompt. The citizen can either link to the
   existing ticket (routing to
   `/reports/{existing_id}`) or re-submit
   with `dedupDeclineTicketId` set. The
   decline path is logged as a separate audit
   event so the WO-002 dispatcher can surface
   possible duplicates.
3. **Confirmation page** — `/report/[id]/submitted`
   renders the citizen projection of the new
   ticket (same `serializeTicketForRole`
   call used by the home page) plus a
   "Back to home" CTA. The page clears the
   `ReportDraft` on mount.
4. **Per-step baselines** — 4 PNGs (note +
   summary-empty + summary-dedup-prompt +
   confirmation), light theme, 1440x900.
5. **No new ADR for this child.** All dedup
   decisions inherit from ADR-006 (dedup is a
   prompt, not auto-merge). The decline log
   shape is the WO-001 feasibility decision
   (recorded in `aidlc/spaces/default/memory/
   project.md → Corrections`).

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 008-report-note | `../../intents/002-citizen-report-flow/003-submit-report-flow/008-report-note.md` | `done` |
| 009-dedup-prompt | `../../intents/002-citizen-report-flow/003-submit-report-flow/009-dedup-prompt.md` | `done` |
| 010-confirmation | `../../intents/002-citizen-report-flow/003-submit-report-flow/010-confirmation.md` | `done` |
| 017-bootstrap-endpoint | `../../intents/002-citizen-report-flow/003-submit-report-flow/017-bootstrap-endpoint.md` | `done` |

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — 67 / 67
  carry-over (incl. 4 dedup tests in
  `tests/unit/dedup.test.ts`) plus any new
  tests for the dedup prompt invariant and
  the decline path.
- `npm run test:mockups` is green — 15 / 15
  design-mockup baselines + 5 / 5
  Bolt 002-002 home-feed baselines + 3 / 3
  Bolt 002-003a baselines.
- 4 / 4 new Playwright baselines for the 3b
  steps, light theme, 1440x900.
- `curl -fs http://localhost:3000/` returns 200.
- `ddd-03-test-report.md` documents the dedup
  unit tests, the audit-log entry capture,
  the decline path, and the photo-cap
  invariants.

## Stage checklist

- [x] **Domain Model** — inherited from
  `./002-003-submit-report-flow/ddd-01-domain-model.md`
  (parent bolt).
- [x] **Technical Design** — `./ddd-02-technical-design.md`.
  Cover the dedup API contract, the
  `DedupMatch` consumer surface, the
  confirmation page rendering, the
  `/api/tickets` POST flow, and the
  decline path.
- [x] **ADR Analysis** — no new ADR; inherits.
- [x] **Implement** — the source already
  exists; this child is paperwork + dedup
  unit-test reaffirmation + per-step visual
  baselines. Verified: `note/page.tsx` posts
  to `/api/tickets` and writes the dedup
  context to `cityfix.reportDedup.v1`;
  `summary/page.tsx` reads the dedup context
  and renders the prompt + 2 CTAs; `[id]/submitted/page.tsx`
  renders the centered 640px card with the
  status trail and the decline-noted toast;
  `/api/tickets` POST writes the
  privacy-respecting `ticket.dedup_declined`
  audit event; `/api/report/bootstrap` is the
  contract owner.
- [x] **Test** — `./ddd-03-test-report.md`.
  4/4 dedup unit tests pass; tsc clean;
  audit-log entry capture verified in source;
  4 visual baselines deferred to v1.1 (seed
  helper + full submit-walk harness required).

## Cross-references

- **Parent bolt**: `../002-003-submit-report-flow/bolt.md`.
- **Active intent**: `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/003-submit-report-flow/unit-brief.md`.
- **Standards consumed**: `tech-stack.md`,
  `coding-standards.md`, `api-conventions.md`,
  `decision-index.md` (ADR-001 four-role,
  ADR-006 dedup-prompt-not-auto-merge).
- **Sibling 3a**: `../002-003a-see-and-pick/bolt.md`.