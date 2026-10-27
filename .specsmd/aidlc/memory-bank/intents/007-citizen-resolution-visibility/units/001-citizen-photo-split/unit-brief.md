---
unit: 001-citizen-photo-split
intent: 007-citizen-resolution-visibility
phase: inception
status: complete
created: 2026-10-13T20:10:00Z
updated: 2026-10-27T00:00:00Z
priority: must
---

# Unit 001 — Citizen Photo Split

## Purpose

Make the citizen-visible `/reports/[id]` page render a resolved
ticket's photos as two clearly-labelled groups — "Before" (citizen
photos from submission) and "After" (crew photos from resolution) —
instead of a single flat grid. The data model gains a discriminator
so the citizen serializer can return `beforePhotoUrls` and
`afterPhotoUrls` as two separate arrays. The migration is
additive and backwards-compatible with the dev store.

## Scope

### In Scope
- Prisma schema change for `Ticket` photo storage
  (additive `TicketPhoto` row with `uploadedByRole` + `uploadedAt`,
  OR split columns `beforePhotoUrls` / `afterPhotoUrls` on `Ticket`).
- Dev-store mirror of the same change in `lib/dev-store.ts`.
- Citizen serializer (`lib/serializers/ticket.ts`) exposes
  `beforePhotoUrls` and `afterPhotoUrls` on the citizen branch
  (and the matching fields on the non-citizen and public branches).
- Page render on `/reports/[id]` (`app/reports/[id]/page.tsx`):
  two labelled groups, English + Bangla labels, empty-state for
  the Before group when the citizen attached no photos, hidden
  After group when no crew photo exists.
- `lib/i18n/keys.ts` gains "Before" + "After" + "No photo" labels
  in both locales.
- Test pyramid: unit + Playwright E2E + visual baseline.

### Out of Scope
- The crew photo-upload write path (`POST
  /api/v1/crew/tickets/[id]/photos`) — unchanged.
- The citizen photo-upload write path during submission — unchanged
  (it just needs to set the new `uploadedByRole: 'citizen'` if the
  additive row model is chosen; this is captured in the
  Implementation Notes).
- Any change to the dispatcher, crew, or admin surfaces.
- Push notifications, the "Resolved!" celebration surface,
  real-time polling, photo annotations, multi-image crew upload
  beyond the existing 3-photo cap.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Before/after photo split on the citizen report detail page | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Ticket.photoUrls` (current) | Single array of URLs on the ticket row | `string[]` |
| `TicketPhoto` (Option A — additive row) | One row per photo with role + timestamp | `id`, `ticketId`, `url`, `uploadedByRole` (`citizen` \| `crew`), `uploadedAt` |
| `Ticket.beforePhotoUrls` (Option B — split columns) | Citizen photos | `string[]` |
| `Ticket.afterPhotoUrls` (Option B — split columns) | Crew photos | `string[]` |
| `SerializedTicket` | Serializer output — gains two new fields on every branch | `beforePhotoUrls: string[]`, `afterPhotoUrls: string[]` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `serializeForCitizen(ticket)` | Returns a `SerializedTicket` with `beforePhotoUrls` (citizen photos) and `afterPhotoUrls` (crew photos) | `ticket` with photos | `SerializedTicket` |
| `renderPhotoGroups(serialized)` | `/reports/[id]` renders the two groups | `SerializedTicket` | React tree |
| `i18n.t('photo.before')` / `i18n.t('photo.after')` | Localized labels | none | string |
| Prisma migration | Apply additive schema change | none | migration row |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 2 |
| Must Have | 2 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| S-001.1 | Prisma migration + serializer exposes `beforePhotoUrls` / `afterPhotoUrls` | Must | Planned |
| S-001.2 | `/reports/[id]` renders two labelled photo groups | Must | Planned |

## Dependencies

### Depends On
- None — this is the foundation Unit of the intent.

### Depended By
- Unit 002 — lands in the same bolt (Bolt 007-001) and shares the
  serializer file.

### External Dependencies
- Prisma + the existing dev store (per project.md tech stack).
- Tokens + existing components from Intent 006
  (`<StatusPill>`, `<FilterChipGroup>`, `<ReportCard>`) — reused,
  not modified.

## Technical Context

### Suggested Technology
- Prisma schema migration (`prisma migrate dev`).
- Vitest unit tests for the serializer.
- Playwright E2E + visual-regression baselines.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `GET /api/tickets/[id]` | Read | HTTP — returns the serialized ticket; serializer output changes |
| Prisma client | Read | ORM — read of photos or arrays |
| Dev store (`lib/dev-store.ts`) | Read | In-memory — mirrors the Prisma shape |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `TicketPhoto` rows (Option A) | Postgres rows | ≤ 6 per ticket (3 citizen + 3 crew) | Indefinite (existing photo retention policy) |
| `Ticket.beforePhotoUrls` / `afterPhotoUrls` (Option B) | Postgres `text[]` | ≤ 3 each | Indefinite |

## Implementation Notes

### Migration shape (finalized at unit-brief stage)

**Option A — additive `TicketPhoto` row (preferred for cleanliness):**
```
model TicketPhoto {
  id              String   @id @default(cuid())
  ticketId        String
  url             String
  uploadedByRole  String   // 'citizen' | 'crew'
  uploadedAt      DateTime @default(now())
  ticket          Ticket   @relation(fields: [ticketId], references: [id])

  @@index([ticketId, uploadedAt])
}
```
- `Ticket.photoUrls` is removed in the migration.
- Both uploads (citizen + crew) write to `TicketPhoto` with the
  appropriate `uploadedByRole`.
- Serializer reads `TicketPhoto` rows ordered by `uploadedAt` and
  splits them by `uploadedByRole`.

**Option B — split columns on `Ticket` (preferred for query simplicity):**
```
model Ticket {
  ...
  beforePhotoUrls String[] @default([])
  afterPhotoUrls  String[] @default([])
}
```
- Citizen upload appends to `beforePhotoUrls`; crew upload
  appends to `afterPhotoUrls`.
- Backfill step: existing rows migrate `Ticket.photoUrls` into
  `beforePhotoUrls` (citizen photos) and leave `afterPhotoUrls`
  empty until a crew upload arrives.
- Serializer reads the two columns directly.

**Choice criterion:** Option A is preferable when the same photo
record needs metadata beyond role + timestamp (e.g., EXIF,
upload IP). Option B is preferable when the photo storage stays
flat-string and the discriminator is binary. For this intent,
the choice is cosmetic — both pass all FR-1 acceptance criteria.

The Construction Agent may pick either at bolt-plan time, with a
single-line rationale in the bolt record. The unit-brief keeps
both options documented so Construction can pivot without
re-deriving the criteria.

### Files Touched

- `prisma/schema.prisma` — schema change (Option A or B)
- `lib/dev-store.ts` — mirror the change in the in-memory store
- `lib/serializers/ticket.ts` — citizen / non-citizen / public branches all expose `beforePhotoUrls` and `afterPhotoUrls`
- `app/reports/[id]/page.tsx` — render two groups, hide After
  group when empty
- `lib/i18n/keys.ts` — `photo.before`, `photo.after`, `photo.empty.before`
- `tests/unit/serializers/ticket.test.ts` — new tests for the
  array split across all three branches
- `tests/<NN-citizen-photo-split>.spec.ts` — new Playwright E2E
- `tests-mockups/baselines/01-mockups.spec.ts/` — new visual
  baseline for the grouped photo grid

### Constraints

- The Prisma migration MUST be backwards-compatible: existing rows
  in the dev store and any seeded fixtures continue to read as a
  valid citizen surface (citizen photos land in
  `beforePhotoUrls`).
- The serializer change is a citizen-branch contract change.
  `beforePhotoUrls` and `afterPhotoUrls` MUST be added to all
  three branches (citizen / non-citizen / public), or the
  `SerializedTicket` type signature will not typecheck.
- Bilingual parity: both English and Bangla labels ship at the
  same time.

## Success Criteria

### Functional
- [ ] Given a ticket with 2 citizen photos and 1 crew photo, the
      `/reports/[id]` page renders two groups and the labels are
      visible in both locales.
- [ ] Given a ticket with only citizen photos, no After group
      renders.
- [ ] Given a ticket with 0 citizen photos and 1 crew photo, the
      Before group renders its empty-state in both locales.

### Non-Functional
- [ ] Page first-paint < 200ms p95 on the existing 4G throttle.
- [ ] Citizen branch of `SerializedTicket` still strips
      `assignedCrewId`, `internalNote`, and any other internal
      field.

### Quality
- [ ] Coverage ≥ 80% (org.md scope default for `feature`
      scope).
- [ ] `npx tsc --noEmit` clean.
- [ ] All existing trail + serializer tests still pass.
- [ ] Playwright E2E for the citizen photo-group render
      passes.
- [ ] New visual-regression baseline for the grouped photo grid
      passes.
- [ ] Bilingual typed-registry check passes.

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| Bolt 007-001 | DDD | S-001.1, S-001.2 (+ S-002.1 from Unit 002) | Photo split + trail marker filter, single PR |

## Notes

- The discriminator call (Option A vs Option B) is the only
  significant implementation choice. Both pass all acceptance
  criteria; Construction picks based on code-style cleanliness
  vs query ergonomics. No re-derivation needed at Construction.
- If Option A is picked, the citizen photo-upload write path
  (`POST /api/v1/tickets` and the step endpoints) needs to set
  `uploadedByRole: 'citizen'` on each new `TicketPhoto` row.
  This is a one-line change per upload call site.
- If Option B is picked, the migration backfill step is a single
  `UPDATE` query that copies `Ticket.photoUrls` into
  `beforePhotoUrls`.
