---
unit: 001-citizen-photo-split
bolt: 007-001-citizen-photo-and-trail-foundation
stage: design
status: complete
created: 2026-10-13T20:55:00Z
---

# Technical Design — Citizen Photo Split + Trail Marker Filter

## Architecture Pattern

**Selected**: Same modular-monolith Next.js 14 App Router pattern as the rest of the project (per ADR-002). No new architectural pattern is introduced.

**Rationale**: The bolt is a localised change to the citizen-facing serializer + page render. ADR-002 is affirmed; the new `TicketPhoto` model is one more Prisma table in the existing data layer, the new dev-store `Map` field is one more key in the existing in-memory store, and the page is a new render block in the existing `app/reports/[id]/page.tsx`.

## Open Implementation Choices — Finalized

The unit-brief surfaces two open choices. Both are finalized here with
a one-line rationale. They will not be re-litigated at implementation
time.

1 - **Migration shape: Option A — additive `TicketPhoto` row.**
   - Rationale: Option A generalises cleanly if a future photo needs
     EXIF / upload-IP metadata. The dev-store mirror is one new
     `Map<string, DevTicketPhoto[]>` field keyed by ticket id.
   - Trade-off accepted: a small amount of indirection on every
     read (`include: { photos: { orderBy: { uploadedAt: 'asc' } } }`).
     The dev store is a flat array under the hood, so the cost is
     O(n) per ticket where n ≤ 6 (the 3+3 photo cap).

2 - **Filter strategy: Replace** (keep the trail entry, rewrite the
   `note` to the localized "After photo added").
   - Rationale: The citizen benefits from the "feel heard" trust
     signal — they still see that a photo was added, but in natural
     prose, not as a raw URL. The trail's `createdAt` and `actorLabel`
     are preserved.
   - Trade-off accepted: the trail entry remains; the citizen does
     not see the URL. Internal branches continue to see the raw marker.

## Layer Structure

The bolt touches the existing four layers, with no new layer
introduced.

```text
┌─────────────────────────────────────────────────────────────┐
│  Presentation (UI)                                          │
│  - app/reports/[id]/page.tsx — two labelled photo groups    │
│    + localized "After photo added" in the trail             │
├─────────────────────────────────────────────────────────────┤
│  Application (Use Cases / Route Handlers)                   │
│  - app/api/tickets/[id]/route.ts — unchanged; the response   │
│    shape change is via the serializer                       │
│  - app/api/v1/crew/tickets/[id]/photos/route.ts — write path │
│    now writes a TicketPhoto row (in addition to the          │
│    existing after_photo: trail entry)                       │
│  - app/api/tickets/route.ts — citizen upload call site now  │
│    creates TicketPhoto rows with uploadedByRole='citizen'   │
│  - app/api/tickets/[id]/photos/[idx]/route.ts — DELETE      │
│    handler now deletes the matching TicketPhoto row         │
├─────────────────────────────────────────────────────────────┤
│  Domain (Business Logic)                                    │
│  - lib/serializers/ticket.ts — 3-branch serializer change   │
│    (citizen / non-citizen / public)                         │
│  - lib/serializers/trail.ts (new) — CitizenTrailFilter +    │
│    BeforeAfterBucketing as named pure functions, kept out of │
│    the page file so the page can stay presentation-only     │
├─────────────────────────────────────────────────────────────┤
│  Infrastructure (Database / External)                       │
│  - prisma/schema.prisma — new TicketPhoto model             │
│  - lib/dev-store.ts — new DevTicketPhoto + Map key          │
│  - lib/db-switch.ts — getTicketWithTrail joins photos       │
└─────────────────────────────────────────────────────────────┘
```

## API Design

The wire API is unchanged at the route level. The shape change is
in the serializer output and is internal to the response.

| Endpoint | Method | Change | Response delta |
|----------|--------|--------|----------------|
| `GET /api/tickets/[id]` | GET | Response `body.ticket` now includes `beforePhotoUrls: string[]` and `afterPhotoUrls: string[]`; the legacy `photoUrls: string[]` is **kept as a deprecated convenience** for the v1 public feed that still consumes it (no public feed currently consumes it, but the citizen detail page is the only consumer and will move to the new fields). Trail `note` on the citizen branch rewrites marker-shaped strings. | `body.ticket.photoUrls` (legacy), `body.ticket.beforePhotoUrls`, `body.ticket.afterPhotoUrls`, `body.ticket.trail[*].note` (citizen) |
| `GET /api/v1/crew/tickets/[id]/photos` | POST (write) | The write now persists the URL to a `TicketPhoto` row with `uploadedByRole: 'crew'`. The audit `before/after` of the `photoUrls` field is replaced with a `before/after` of the `photos` array (or kept on `photoUrls` for back-compat — decision: keep the audit shape unchanged; the `photoUrls` array is removed in this PR so the audit also references the new field). | unchanged on the wire |
| `GET /api/report/bootstrap` | GET | unchanged | unchanged |
| `DELETE /api/tickets/[id]/photos/[idx]` | DELETE | Index now references the citizen's photo positions (the citizen can only delete their own). The handler maps `[idx]` to the matching `TicketPhoto.id` where `uploadedByRole = 'citizen'`. | unchanged on the wire |

The legacy `photoUrls` field is **removed** from `SerializedTicket`
in this PR; the citizen detail page is the only consumer and
already moves to the new fields. Internal surfaces (dispatcher,
crew, admin) also see the new fields, with the full un-split list
preserved as `photoUrls: [...before, ...after]` for any internal
consumer that depends on the legacy field. (Audit page in Bolt
005-004 only reads `audit.beforeValue.photoUrls` for historical
rows; the new write shape uses the same key so historical diffs
remain readable.)

**Zod schemas**: no new request schema is needed (the route bodies
are unchanged). The new fields on the response are derived
(serializer output), not validated.

## Data Persistence

### New Prisma model

```prisma
model TicketPhoto {
  id              String   @id @default(cuid())
  ticketId        String
  url             String
  uploadedByRole  String   // 'citizen' | 'crew'
  uploadedAt      DateTime @default(now())
  ticket          Ticket   @relation(fields: [ticketId], references: [id], onDelete: Cascade)

  @@index([ticketId, uploadedAt])
}
```

`Ticket.photoUrls: String[]` is removed in the same migration.

### Dev-store mirror

```ts
// lib/dev-store.ts (additive)
export interface DevTicketPhoto {
  id: string;
  ticketId: string;
  url: string;
  uploadedByRole: 'citizen' | 'crew';
  uploadedAt: string; // ISO
}

// Store (additive key)
ticketPhotos: Map<string, DevTicketPhoto[]>; // keyed by ticketId
```

### Backfill strategy

The dev store seeds with the existing five `seedTickets`. The
backfill step is a one-shot loop in `seed()` that, for every
existing ticket, copies any pre-existing `photoUrls[]` (currently
empty in seed) into `TicketPhoto` rows with `uploadedByRole: 'citizen'`.
Production backfill is a one-shot `INSERT … SELECT` in the Prisma
migration script (out of scope of this PR — the dev store is
the v1 path).

### `getTicketWithTrail` change

`lib/db-switch.ts` extends the `include` to pull `photos: { orderBy: { uploadedAt: 'asc' } }`. The Prisma path uses the relation; the dev-store path reads the `Map` and returns a sorted array. The `TicketLike` shape gains an optional `photos?: DevTicketPhoto[]` field (or `TicketPhoto[]` from Prisma) — the serializer reads it and partitions.

## Security Design

| Concern | Approach |
|---------|----------|
| Authorization | The new fields on the citizen serializer are derived from `Ticket.photos` filtered to the citizen's own ticket. No new authorization is required — the existing `/api/tickets/[id]` route already scopes to the reporter's own ticket via `requireRole(session, 'citizen')` + ownership check. |
| Internal field stripping | The citizen branch continues to null out `assignedCrewId` and `internalNote`. The new `beforePhotoUrls` and `afterPhotoUrls` are SAFE to expose to citizens. The regression-guard regex test asserts no `^[a-z_]+:` marker-shaped string reaches the citizen branch unless explicitly handled. |
| Marker format stability | The `after_photo:` prefix on `TicketTrailEntry.note` is unchanged on the wire and in the database. The audit pipeline's grep-based detection (Bolt 004-003 line 113-117) keeps working without code changes. |
| Photo URL safety | Photos are user-supplied URLs; the existing URL validation in the upload routes (`z.string().url().max(2000)`) is unchanged. The dev store currently accepts data URLs; production swaps to S3/R2 keys in v1.1. No new attack surface is introduced. |

## NFR Implementation

| Requirement | Design Approach |
|-------------|-----------------|
| Performance — first-paint < 200ms p95 on 4G throttle | The serializer now does an extra O(n) partition over ≤ 6 photos and an O(m) filter over ≤ 50 trail entries. The two are well under the 1.12 My Reports budget. No new I/O on the hot path. |
| Performance — no measurable /api/tickets/[id] latency added | The Prisma query gains one `LEFT JOIN LATERAL` (or its equivalent under the `include` shape) that is already indexed. The dev-store path is a single `Map.get` + sort (≤ 6 elements). |
| Bilingual parity | All new labels route through `lib/i18n/keys.ts`: `photo.before`, `photo.after`, `photo.emptyBefore`, `trail.afterPhotoAdded`. The new trail replacement uses `t('trail.afterPhotoAdded', lang)` with the active language. |
| Reliability — filter at serializer, not at render | The `CitizenTrailFilter` is a pure function in `lib/serializers/trail.ts`. Any future citizen-facing surface that reads the trail benefits from the same filter. The page file does no rewriting. |
| Reliability — defensive bucketing | An unknown `uploadedByRole` is bucketed as `'citizen'` (Before group) so it never accidentally appears in the After group. The `TrailEntryLike` defensive default for a missing role is `'citizen'`. |
| Test pyramid | Unit tests at the serializer + bucketing layers; one Playwright E2E for the grouped photo grid; one new visual-regression baseline (mobile + desktop); regression-guard regex test asserts no `^[a-z_]+:` marker leaks to the citizen branch. |

## Error Handling

| Error Type | Code | Response |
|------------|------|----------|
| Invalid `uploadedByRole` on legacy row | (none) | Treated as `'citizen'` so it appears in the Before group; logged once in dev console. |
| `getTicketWithTrail` returns no photos | (none) | Both `beforePhotoUrls` and `afterPhotoUrls` are `[]`; the Before group renders the empty state; the After group is hidden. |
| Trail rewrite failure (missing i18n key) | (none) | `t()` returns the key string itself, so the citizen sees `trail.afterPhotoAdded` instead of crashing. The typed registry check at compile time catches missing keys. |

## External Dependencies

| Service | Purpose | Integration |
|---------|---------|-------------|
| Prisma | New `TicketPhoto` model + migration | `prisma/schema.prisma` + `prisma/migrations/<timestamp>_add_ticket_photo/` |
| Dev store | In-memory mirror of the new model | `lib/dev-store.ts` (additive fields + backfill in `seed()`) |
| i18n registry | New keys (English + Bangla) | `lib/i18n/keys.ts` (additive entries only) |
| Audit pipeline | Unchanged; the marker format is stable | `lib/platform/audit.ts` (no edits) |
| Playwright | New E2E + new visual baseline | `tests/<NN-citizen-photo-groups>.spec.ts` + `tests-mockups/baselines/01-mockups.spec.ts/<NN>-citizen-photo-groups*.png` |
| Vitest | New unit tests | `tests/unit/serializers/ticket.test.ts` (additive) + `tests/unit/serializers/trail.test.ts` (new) + `tests/unit/serializers/bucket.test.ts` (new) |

## Files Created / Modified

**Created**:
- `prisma/migrations/20261013000000_add_ticket_photo/migration.sql` — the SQL migration.
- `lib/serializers/trail.ts` — `applyCitizenTrailFilter(trail, language)` + `bucketPhotosByRole(photos)` named exports.
- `tests/unit/serializers/trail.test.ts` — filter + regression-guard tests.
- `tests/unit/serializers/bucket.test.ts` — bucketing tests (3 branches + defensive unknown).
- `tests/<NN>-citizen-photo-groups.spec.ts` — Playwright E2E (one spec, two flows: with/without crew photo).
- `tests-mockups/baselines/01-mockups.spec.ts/<NN>-citizen-photo-groups-mobile.png` — visual baseline (mobile 390×844).
- `tests-mockups/baselines/01-mockups.spec.ts/<NN>-citizen-photo-groups-desktop.png` — visual baseline (desktop 1280×800).

**Modified**:
- `prisma/schema.prisma` — add `TicketPhoto` model; remove `Ticket.photoUrls`.
- `lib/dev-store.ts` — add `DevTicketPhoto` + `ticketPhotos` Map; backfill in `seed()`; remove `photoUrls` from `DevTicket`.
- `lib/db-switch.ts` — extend `getTicketWithTrail` to join photos; update the `db.ticket.create` and `db.ticket.update` call sites' types to accept either the new shape or the dev-store mirror.
- `lib/serializers/ticket.ts` — `TicketLike` gains `photos?: PhotoLike[]`; all three branches expose `beforePhotoUrls` and `afterPhotoUrls`; the citizen branch rewrites the trail `note`; the legacy `photoUrls: string[]` field is **kept** on all three branches (sourced from the union of the two arrays) for back-compat with any internal consumer.
- `app/reports/[id]/page.tsx` — replace the single flat `photoUrls` grid with two labelled groups; honour dark/high-contrast tokens; bilingual labels; empty-state for the Before group; hide the After group when empty; rewrite the trail `note` is no longer needed at the page (the serializer does it).
- `app/api/tickets/route.ts` — citizen upload now writes `TicketPhoto` rows with `uploadedByRole: 'citizen'` in addition to the existing audit.
- `app/api/tickets/[id]/photos/[idx]/route.ts` — DELETE handler now finds the matching `TicketPhoto.id` where `uploadedByRole: 'citizen'` and `orderBy: { uploadedAt: 'asc' }` and deletes that row.
- `app/api/v1/crew/tickets/[id]/photos/route.ts` — crew upload now writes a `TicketPhoto` row with `uploadedByRole: 'crew'` in addition to the existing trail + audit.
- `lib/i18n/keys.ts` — add `photo.before`, `photo.after`, `photo.emptyBefore`, `trail.afterPhotoAdded` (English + Bangla).
- `tests/unit/serializer.test.ts` — add new tests for the array split across all three branches + the trail-marker filter + the regression-guard regex.

## Test Strategy

Per the test pyramid locked into `requirements.md` (Checkpoint 1, Q5):

- **Unit tests** (Vitest):
  - `tests/unit/serializers/trail.test.ts`:
    - `applyCitizenTrailFilter` rewrites `after_photo:<url>` to the localized "After photo added" string.
    - `applyCitizenTrailFilter` is a no-op for `note: null` and for free-text notes.
    - Regression guard: any `^[a-z_]+:` marker-shaped string is rewritten (or omitted — Replace strategy rewrites).
    - Trail filter is a no-op on the non-citizen / public branches.
  - `tests/unit/serializers/bucket.test.ts`:
    - `bucketPhotosByRole` partitions correctly.
    - Empty input → two empty arrays.
    - Defensive: unknown role → bucketed as citizen.
    - 0 citizen + 1 crew → before is empty, after has 1.
    - 2 citizen + 1 crew → before has 2, after has 1, ordering preserved.
  - `tests/unit/serializer.test.ts` (additive):
    - All three branches expose `beforePhotoUrls` and `afterPhotoUrls`.
    - The legacy `photoUrls` field is the union of the two arrays (preserves order: before first, then after).
    - The citizen branch continues to null out `assignedCrewId` and `internalNote`.
    - The trail-marker filter is applied on the citizen branch only.
    - Public branch strips every internal field including any marker.

- **Playwright E2E** (one spec, two flows):
  - Flow 1 — seed a ticket with 2 citizen photos + 1 crew photo, open `/reports/[id]`, assert two groups with the correct labels in both locales.
  - Flow 2 — seed a ticket with 0 citizen photos + 1 crew photo, open `/reports/[id]`, assert Before group renders the empty state and After group renders the 1 thumbnail.

- **Visual baseline**:
  - Mobile 390×844 (the team's default phone fallback per project.md).
  - Desktop 1280×800 (the team's default desktop viewport).

- **Existing tests**: continue to pass. The `tests/unit/serializer.test.ts` shape changes (`photoUrls` semantics) are additive; existing assertions on `out.photoUrls` are updated to assert on the union of the new fields.

## Verification Command

Per project.md (Walking Skeleton → Construction Verification Command):

`npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`

(The `npm run test:mockups` is gating; the new visual baselines must
land in the same PR as the new render — `tests-mockups/baselines/01-mockups.spec.ts/`
is reviewed in the PR description per team.md Forbidden.)
