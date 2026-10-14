---
id: 001-prisma-migration-and-serializer-exposes-before-and-after-photo-urls
unit: 001-citizen-photo-split
intent: 007-citizen-resolution-visibility
status: ready
priority: must
created: 2026-10-13T20:15:00Z
assigned_bolt: 007-001-citizen-photo-and-trail-foundation
implemented: false
---

# Story: Prisma migration + serializer exposes `beforePhotoUrls` and `afterPhotoUrls`

## User Story

**As a** citizen reading my own report on `/reports/[id]`
**I want** the data the page renders to clearly separate my
submission photos from the photos the field crew attached
**So that** the page can show two labelled groups (a future
consumer of this story) instead of a single flat grid.

(This story is the data + serializer foundation; the page
render is the second story `002-page-renders-two-labelled-photo-groups`.) From a user's perspective this story is invisible — the user sees the result of story 002. From an engineering perspective this story is the load-bearing schema and serializer change.

## Acceptance Criteria

- [ ] **Given** a Prisma migration has been applied (Option A — additive `TicketPhoto` row with `uploadedByRole` + `uploadedAt`, OR Option B — split columns `beforePhotoUrls` / `afterPhotoUrls` on `Ticket`), **When** the migration runs against the dev store and the seeded fixtures, **Then** the dev store's existing tickets continue to be readable as a valid citizen surface (all pre-existing photos land in `beforePhotoUrls`; `afterPhotoUrls` is empty until a crew upload arrives).
- [ ] **Given** the serializer is called for a citizen on a ticket with 2 citizen photos and 1 crew photo, **When** `serializeForCitizen(ticket)` runs, **Then** the returned `SerializedTicket` has `beforePhotoUrls` with the 2 citizen URLs and `afterPhotoUrls` with the 1 crew URL, in chronological order within each group.
- [ ] **Given** the serializer is called for a citizen on a ticket with only citizen photos and no crew photos, **When** `serializeForCitizen(ticket)` runs, **Then** the returned `SerializedTicket` has `beforePhotoUrls` with the citizen URLs and `afterPhotoUrls: []`.
- [ ] **Given** the serializer is called for a citizen on a ticket with 0 citizen photos and 1 crew photo, **When** `serializeForCitizen(ticket)` runs, **Then** the returned `SerializedTicket` has `beforePhotoUrls: []` and `afterPhotoUrls` with the 1 crew URL.
- [ ] **Given** the serializer is called for a non-citizen role (dispatcher / crew / admin) and a public consumer, **When** the appropriate non-citizen / public branch runs, **Then** `beforePhotoUrls` and `afterPhotoUrls` are also present (so the `SerializedTicket` type signature is consistent across all three branches).
- [ ] **Given** the citizen branch of the serializer, **When** the new `beforePhotoUrls` and `afterPhotoUrls` fields are populated, **Then** the existing citizen-branch invariants are still preserved (`assignedCrewId` is `null`, `internalNote` is `null`, `actorLabel` is "City corporation" / "সিটি কর্পোরেশন").
- [ ] **Given** a Vitest unit-test file `tests/unit/serializers/ticket.test.ts`, **When** the new test cases run, **Then** they pass and the existing trail + non-photo tests still pass.
- [ ] **Given** a TypeScript compile, **When** `npx tsc --noEmit` runs, **Then** the build is clean — adding the two new fields to `SerializedTicket` did not break any consumer.

## Technical Notes

- The Prisma migration is the load-bearing data-model change. Two acceptable shapes:
  - **Option A (preferred for cleanliness):** introduce a `TicketPhoto` model with `id`, `ticketId`, `url`, `uploadedByRole: 'citizen' | 'crew'`, `uploadedAt`. Remove `Ticket.photoUrls`. Each existing upload call site writes a `TicketPhoto` row with the appropriate `uploadedByRole`.
  - **Option B (preferred for query simplicity):** add `beforePhotoUrls: String[]` and `afterPhotoUrls: String[]` to `Ticket`. Backfill `Ticket.photoUrls` into `beforePhotoUrls`. Each existing upload call site appends to the appropriate column.
- The choice is finalized at the bolt-plan stage. Both pass all acceptance criteria.
- The dev store (`lib/dev-store.ts`) MUST mirror the same change so the dev path is consistent with the Prisma path.
- The migration MUST be backwards-compatible with existing dev-store rows and seeded fixtures.
- The `SerializedTicket` type signature MUST add `beforePhotoUrls: string[]` and `afterPhotoUrls: string[]` to all three branches; otherwise the type does not typecheck.

## Dependencies

### Requires
- None (first story of the intent).

### Enables
- `002-page-renders-two-labelled-photo-groups` (the page render in the same unit)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Existing row with N photos, no `uploadedByRole` | Backfilled to `beforePhotoUrls` (Option B) or rows with `uploadedByRole: 'citizen'` (Option A). The dev store mirror must do the same. |
| Crew uploads to a ticket with no citizen photos | `beforePhotoUrls: []` (valid empty state); `afterPhotoUrls` populated. |
| Photo URL contains special characters (query params, fragments) | Serializer passes through verbatim. |
| Concurrent citizen + crew upload race | Whichever lands first wins; the discriminator is set on write. The second write appends to its own group. |

## Out of Scope

- The page render — that is story `002`.
- The crew photo-upload write path's marker (`after_photo:` filtering) — that is Unit 002 / story `003-trail-marker-filter-with-i18n-and-regression-guard`.
- The dispatcher crew picker — Unit 003.
- The `after_photo:` marker format itself stays unchanged; the filter is on the read path in Unit 002.
