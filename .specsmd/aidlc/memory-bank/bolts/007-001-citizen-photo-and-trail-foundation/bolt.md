---
id: 007-001-citizen-photo-and-trail-foundation
unit: 001-citizen-photo-split
intent: 007-citizen-resolution-visibility
type: ddd-construction-bolt
status: complete
stories:
  - 001-prisma-migration-and-serializer-exposes-before-and-after-photo-urls
  - 002-page-renders-two-labelled-photo-groups
  - 003-trail-marker-filter-with-i18n-and-regression-guard
created: 2026-10-13T20:20:00Z
started: 2026-10-13T20:55:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: model
    completed: 2026-10-13T20:55:00Z
    artifact: ddd-01-domain-model.md
  - name: design
    completed: 2026-10-13T20:55:00Z
    artifact: ddd-02-technical-design.md
  - name: adr-analysis
    completed: 2026-10-13T20:55:00Z
    artifact: ddd-03-adr-analysis.md
  - name: implement
    completed: 2026-10-13T22:00:00Z
    artifact: ddd-03-test-report.md
  - name: test
    completed: 2026-10-13T22:30:00Z
    artifact: ddd-03-test-report.md
requires_bolts: []
enables_bolts:
  - 007-002-dispatcher-crew-picker
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
estimated_files: 8
---

# Bolt 007-001 — Citizen Photo & Trail Foundation

## Purpose

Land the **citizen-side foundation** of the resolution-visibility
loop in one bolt: a small Prisma migration that gives the photo
storage a discriminator, a three-branch serializer change that
exposes `beforePhotoUrls` and `afterPhotoUrls`, the
`/reports/[id]` page render that draws two labelled photo groups,
and the citizen-branch trail filter that strips the raw
`after_photo:<url>` marker.

Units 001 (photo split) and 002 (trail marker filter) ship
together because both touch `lib/serializers/ticket.ts`; the
serializer commits in one PR. Unit 003 (dispatcher crew picker)
is a separate bolt (`007-002`).

## Stories

### From Unit 001 (citizen photo split)
| Story ID | Title | FR |
|----|-------|----|
| 001-prisma-migration-and-serializer-exposes-before-and-after-photo-urls | Prisma migration + serializer exposes `beforePhotoUrls` and `afterPhotoUrls` | FR-1 (data + serializer half) |
| 002-page-renders-two-labelled-photo-groups | `/reports/[id]` renders two labelled photo groups | FR-1 (page half) |

### From Unit 002 (trail marker filter)
| Story ID | Title | FR |
|----|-------|----|
| 003-trail-marker-filter-with-i18n-and-regression-guard | Citizen trail filter + i18n key + regression-guard test | FR-2 |

## Files Created

- `lib/i18n/keys.ts` — new keys: `photo.before`, `photo.after`,
  `photo.emptyBefore`, `trail.afterPhotoAdded` (English + Bangla).
- `tests/unit/serializers/ticket.test.ts` — new tests for the
  array split (3 branches) and the trail-marker filter +
  regression-guard regex test.
- `tests/<NN-citizen-photo-groups>.spec.ts` — Playwright E2E for
  the two photo groups.
- `tests-mockups/baselines/01-mockups.spec.ts/<NN>-citizen-photo-groups*.png`
  — visual regression baseline for the grouped photo grid
  (mobile 390×844 + desktop 1280×800).

## Files Modified

- `prisma/schema.prisma` — schema change (Option A or B per
  `units/001-citizen-photo-split/unit-brief.md` Implementation
  Notes).
- `lib/dev-store.ts` — mirror the same change in the in-memory
  dev store; backfill step for existing rows.
- `lib/serializers/ticket.ts` — citizen / non-citizen / public
  branches all expose `beforePhotoUrls` and `afterPhotoUrls`; the
  citizen branch rewrites the `after_photo:` trail marker.
- `app/reports/[id]/page.tsx` — replace the single flat
  `photoUrls` grid with two labelled groups; honour dark/high
  contrast tokens; bilingual labels.
- `lib/i18n/keys.ts` — new keys (English + Bangla).

## Implementation Notes

### Migration shape (finalized at bolt-plan time)

The unit-brief leaves both shapes documented (Option A: additive
`TicketPhoto` row with `uploadedByRole` + `uploadedAt`; Option B:
split columns `beforePhotoUrls` / `afterPhotoUrls` on `Ticket`).
The construction agent picks one and records the choice in a
single-line rationale in the bolt's `bolt.md` "Decision Log"
section. Both pass all FR-1 acceptance criteria.

**Recommendation:** Option A (additive row). It generalises
cleanly if future photo metadata is needed (EXIF, upload IP,
etc.), and the dev store's mirror is a single new
`Map<ticketId, TicketPhoto[]>` field.

### Filter strategy (finalized at bolt-plan time)

The unit-brief leaves two strategies (Replace vs Omit). The
construction agent picks one and records the choice in the
bolt's "Decision Log".

**Recommendation:** Replace. The citizen benefits from the
"feel heard" trust signal — the trail still mentions the
photo was added, but in natural prose.

### Migration safety

The Prisma migration MUST be backwards-compatible: existing
dev-store rows continue to read as a valid citizen surface
(citizen photos land in `beforePhotoUrls`). The dev-store
mirror includes a backfill step that copies the existing
`Ticket.photoUrls` into the new shape.

### Marker format stability

The `after_photo:<url>` marker on `TicketTrailEntry.note` MUST
stay stable (the audit pipeline greps on it per Bolt 004-003
line 113-117). The fix is at the citizen serializer, not a
marker rename.

## Test Strategy

Per Checkpoint 1, Q5 (test pyramid locked into `requirements.md`
NFR Compliance):

- **Unit tests:** serializer changes (3 branches), trail-marker
  filter, regression-guard regex test, i18n registry check.
- **Playwright E2E:** one spec for FR-1's grouped photo grid.
- **Visual baseline:** new baseline for the grouped photo
  grid (mobile + desktop).
- **FR-2 (trail-marker filter):** unit-only. No new E2E or
  visual baseline — no new user-visible control.

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`
- Manual: open `/reports/<seeded-ticket-id>` locally; confirm
  the two photo groups render; toggle English/Bangla and confirm
  the labels swap; confirm the trail does NOT contain a raw
  `after_photo:` string.
- axe-core on `/reports/[id]` shows zero serious or critical
  issues.
- The new visual-regression baseline is reviewed in the PR
  description (per `team.md` Forbidden).

## Out of Scope

- Dispatcher crew picker — Bolt 007-002.
- The `after_photo:` marker format change (kept stable for the
  audit pipeline).
- The crew photo-upload write path (unchanged).
- Any change to the dispatcher, crew, or admin surfaces.
- Push notifications, "Resolved!" celebration surface, real-time
  polling, photo annotations, multi-image crew upload beyond
  the existing 3-photo cap.
- Bilingual audit dashboard copy (admin surface — unchanged).

## Dependencies

### Bolt Dependencies (within intent)
- None. This is the foundation bolt of the intent.

### Cross-Unit Dependencies
- None. The serializer changes are localized to
  `lib/serializers/ticket.ts` and the `/reports/[id]` page.

### Enables (other bolts waiting on this)
- `007-002-dispatcher-crew-picker` — sequencing only, not
  compile-time. The dispatcher endpoint doesn't read the
  serializer's new fields; the order is per the team's
  per-bolt design-log rhythm (one bolt at a time on `main`).

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| Prisma migration breaks seeded dev-store fixtures | Migration is additive; backfill step in the dev-store mirror. |
| Regression-guard regex test false-positives on a free-text note | The regex `^[a-z_]+:` runs on existing trail fixtures first. |
| New visual baseline hides a real regression | Per `team.md` Forbidden: baselines reviewed in PR; new PNG surfaced. |
| New i18n keys ship without Bangla translations | Typed registry check before each bolt merge (team.md Mandated). |
| Touch targets < 44dp on the photo-grid thumbnails | Existing thumbnail sizing; no change unless flagged in PR. |
| `prefers-reduced-motion: reduce` ignored on a photo transition | No new animations introduced; existing transitions are unchanged. |
