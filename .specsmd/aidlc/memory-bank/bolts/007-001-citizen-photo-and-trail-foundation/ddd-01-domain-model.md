---
unit: 001-citizen-photo-split
bolt: 007-001-citizen-photo-and-trail-foundation
stage: model
status: complete
created: 2026-10-13T20:55:00Z
---

# Static Model — Citizen Photo Split + Trail Marker Filter

## Bounded Context

The bounded context is **Citizen Resolution Visibility** — the slice
of the CityFix ticket lifecycle that a reporter sees on `/reports/[id]`
after submission. The reporter needs two signals they don't have
today:

1. A clear before/after split in the photo grid so the "fix" is
   visible at a glance.
2. A status trail that does not surface internal audit markers
   (the `after_photo:<url>` marker the crew endpoint writes).

Both signals live in the same serializer file (`lib/serializers/ticket.ts`)
and share the same boundary: the citizen-facing branch of the
serialized payload. The dispatcher / crew / admin branches are out
of context for this unit — they see the full record, including
internal markers and internal note, and the changes here MUST NOT
expose new fields to those branches beyond what is already visible.

Adjacent contexts (referenced but not modified):
- **Audit pipeline** — `lib/platform/audit.ts` consumes the
  `after_photo:` marker prefix by grep. The marker format is
  stable per Bolt 004-003 line 113-117. The fix lives in the
  citizen serializer; the marker is never renamed.
- **Crew after-photo write** — `app/api/v1/crew/tickets/[id]/photos/route.ts`
  writes `Ticket.photoUrls` and a `TicketTrailEntry` with
  `note: 'after_photo:<url>'`. The write path is unchanged.

## Domain Entities

- **TicketPhoto** (new) — One row per photo with a discriminator. Properties: `id` (cuid), `ticketId` (FK to `Ticket.id`), `url` (string), `uploadedByRole` (string, `'citizen' | 'crew'`), `uploadedAt` (DateTime). Business rules: every photo is associated with exactly one ticket; the role is set at write time and never updated; the `(ticketId, uploadedAt)` index is the canonical ordering for citizen render.

- **Ticket** (existing, modified) — Still the aggregate root. Properties unchanged except: the `photoUrls: string[]` field is **removed** and the photo storage is delegated to the new `TicketPhoto` rows. The denormalised `beforePhotoUrls` and `afterPhotoUrls` arrays on the serializer output are derived (not stored) — they are the result of `TicketPhoto.findMany({ where: { ticketId }, orderBy: { uploadedAt: 'asc' } })` partitioned by `uploadedByRole`.

- **TicketTrailEntry** (existing, contract unchanged on the wire) — The internal `note` field may contain a marker prefix like `after_photo:`. The `note` field's **DB shape** is unchanged; only the citizen serializer's view of it is filtered. Business rule: the marker format is stable; the audit pipeline greps on it.

## Value Objects

- **PhotoRole** — Discriminator on `TicketPhoto`. Values: `'citizen'` (the reporter attached the photo during submission) | `'crew'` (a field crew member attached the photo during resolution). Constraint: must be one of the two literals; an unknown value is treated as `'citizen'` defensively so a malformed legacy row never bleeds into the After group.

- **BeforeAfterSplit** — The derived (non-stored) value object the citizen serializer returns. Properties: `beforePhotoUrls: string[]` (the citizen's photos, ordered by `uploadedAt` ascending), `afterPhotoUrls: string[]` (the crew's photos, ordered by `uploadedAt` ascending). Constraint: an empty `beforePhotoUrls` is valid (citizen attached no photos); an empty `afterPhotoUrls` is valid (ticket not yet resolved); a missing ticket has both empty.

- **LocalizedTrailNote** — The citizen-visible `note` value. Properties: original `note` string, a localized replacement string (`trail.afterPhotoAdded` i18n key), and the language. Constraint: a `note` matching `^[a-z_]+:` is rewritten to the localized "After photo added" string; a `note` not matching the marker regex passes through unchanged.

## Aggregates

- **Ticket** (aggregate root) — Members: `TicketPhoto` rows, `TicketTrailEntry` rows. Invariants: every `TicketPhoto` references a valid `Ticket.id`; the `uploadedByRole` is one of the two literals; the `Ticket.assignedCrewId` is the load-bearing field for the dispatcher crew-picker bolt (007-002) and is unchanged here. Trail entries are append-only; the citizen serializer may rewrite their `note` field for the citizen branch but never for the internal branches.

- **CitizenSerializedTicket** (logical aggregate, derived) — The view the citizen sees. Composed of: `Ticket` + `Ticket.photos` (split into before/after) + `Ticket.trail` (with the citizen serializer's note rewrite). This is not a stored entity; it is the output of `serializeTicketForRole(ticket, trail, 'citizen', lang)`.

## Domain Events

- **CitizenPhotoAdded** — Trigger: a citizen upload call site writes a new `TicketPhoto` with `uploadedByRole: 'citizen'`. Payload: `{ ticketId, photoId, url, uploadedAt }`. No new domain event subscriber; this is a documentation anchor for future audit/eventing work.

- **CrewAfterPhotoAdded** — Trigger: `POST /api/v1/crew/tickets/[id]/photos` writes a new `TicketPhoto` with `uploadedByRole: 'crew'` and a `TicketTrailEntry` with `note: 'after_photo:<url>'`. Payload: `{ ticketId, photoId, url, uploadedAt, trailEntryId }`. Already audited via `writeAudit({ action: 'ticket.after_photo_added', ... })`; no new event subscriber.

## Domain Services

- **CitizenTrailFilter** — Operation: given a `TicketTrailEntry[]`, return a new array with the citizen-visible `note` field rewritten for any entry whose `note` matches `^[a-z_]+:`. Dependencies: `lib/i18n/keys.ts → t(key, lang)` for the localized replacement. Returns: a new array (does not mutate the input). Pure function, no I/O.

- **BeforeAfterBucketing** — Operation: given a `TicketPhoto[]` ordered by `uploadedAt` ascending, partition into `beforePhotoUrls` (role === 'citizen') and `afterPhotoUrls` (role === 'crew'). Dependencies: none. Returns: `{ beforePhotoUrls: string[], afterPhotoUrls: string[] }`. Pure function. Defensive fallback: an unknown `uploadedByRole` value is bucketed as `'citizen'` so it never appears in the After group by accident.

## Repository Interfaces

- **TicketRepository** — Entity: `Ticket`. Methods used by this bolt: `findUnique({ where: { id }, include: { photos: { orderBy: { uploadedAt: 'asc' } } } })`. The serializer is backend-agnostic via `lib/db-switch.ts → getTicketWithTrail`; the new shape flows through `lib/db-switch.ts` so the Prisma path and the dev-store path return the same `Ticket` with a `photos: TicketPhoto[]` field.

- **TicketPhotoRepository** — Entity: `TicketPhoto`. Methods used: `create({ data: { ticketId, url, uploadedByRole, uploadedAt } })` (from the citizen + crew upload call sites). No new query methods needed; the `findMany` is composed through `TicketRepository`.

## Ubiquitous Language

- **Before photo** — A photo the citizen attached to a report during the submission flow (the `report.photo` step, per WO-001 1.8). The reporter's evidence of the issue. Plural: **before photos**.

- **After photo** — A photo a field crew member attached during the resolution flow (`POST /api/v1/crew/tickets/[id]/photos`, per Bolt 004-003). The crew's evidence of the fix. Plural: **after photos**.

- **Photo group** — A labelled render of one of the two photo arrays on the citizen detail page. The "Before" group renders the before photos; the "After" group renders the after photos and is hidden when empty.

- **Trail marker** — A structured prefix on `TicketTrailEntry.note` that the system uses as an internal audit signal. In v1 the only marker is `after_photo:`; the regression-guard regex `^[a-z_]+:` is the safety net that catches any future marker.

- **Citizen branch** — The code path in `serializeTicketForRole` that handles `role === 'citizen'`. It is the only branch that (a) strips `assignedCrewId` / `internalNote`, (b) rewrites the trail marker, and (c) splits photos into before/after. The non-citizen and public branches are unchanged in behaviour.

- **Citizen-facing serializer** — `lib/serializers/ticket.ts → serializeTicketForRole(ticket, trail, 'citizen', lang)`. The single source of truth for the `/reports/[id]` payload.

## Decision Log (open implementation choices)

The unit-brief records two open implementation choices. The Domain
Model surfaces them; the Technical Design (Stage 2) finalizes
both with a one-line rationale.

1 - **Migration shape (Option A vs B)**: Option A is the additive
   `TicketPhoto` row with `uploadedByRole`; Option B is the split
   columns `beforePhotoUrls` / `afterPhotoUrls` on `Ticket`. The
   Domain Model is identical in either case (the value objects
   `BeforeAfterSplit` and `PhotoRole` are the same), so this is
   a Stage 2 decision.

2 - **Filter strategy (Replace vs Omit)**: Replace rewrites
   `note` to the localized "After photo added" string; Omit drops
   the trail entry entirely. The Domain Model supports both —
   the `CitizenTrailFilter` domain service can be implemented
   either way. This is also a Stage 2 decision.
