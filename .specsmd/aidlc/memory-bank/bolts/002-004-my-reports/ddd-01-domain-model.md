---
standard: ddd-01-domain-model
phase: construction
status: complete
created: 2026-10-11T23:30:00Z
updated: 2026-10-11T23:30:00Z
bolt_id: 002-004-my-reports
---

# Bolt 002-004 — Domain Model

The MyReports read-side aggregate: the citizen's
report list + the per-report detail view + the
status trail. This is the **trust surface** of
Intent 002 — the citizen sees what happened to
every ticket they filed, and the actor-blame
labels are anonymised so internal staff are
hidden behind "City corporation" /
"সিটি কর্পোরেশন".

## Aggregates

### `Ticket` (inherited from WO-000)

Owned by the platform layer (WO-000). The
`Ticket` aggregate root carries:

- `id`, `cityId`, `wardId`, `categoryId`
- `reporterId` (the citizen)
- `status: 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled'`
- `locationLat`, `locationLng`, `locationLabel`, `locationLabelBn`
- `note`, `photoUrls: string[]` (ordered)
- `createdAt`, `updatedAt`, `resolvedAt` (nullable)

The MyReports bolt does **not** extend the
`Ticket` aggregate. It is a read-side projection.

## Value Objects

### `MyReportsListItem`

A derived view of a `Ticket` joined with
`Category` and `Ward`. The list page renders one
`MyReportsListItem` per row.

```typescript
interface MyReportsListItem {
  id: string;
  status: TicketStatus;
  categoryId: string;
  categoryName: string;       // EN, from Category.name
  categoryNameBn: string;     // BN, from Category.nameBn
  wardId: string;
  wardName: string;           // EN
  wardNameBn: string;         // BN
  note: string | null;
  photoUrls: string[];
  createdAt: string;          // ISO-8601
  reporterId: string;
}
```

The list view is filtered client-side to
`reporterId === session.userId`; the API endpoint
returns the city's full activity stream
(50-row cap), and the client filter is what makes
it "my reports".

### `TicketTrailEntry` (inherited from WO-000)

A single transition in the ticket's history.
Owned by the platform layer.

```typescript
interface TicketTrailEntry {
  id: string;
  ticketId: string;
  toStatus: TicketStatus;
  actorId: string;             // internal
  actorLabel: string;          // citizen sees "City corporation"; dispatcher/crew see real name
  note: string | null;         // optional crew note
  timestamp: string;           // ISO-8601
}
```

The **citizen-vs-internal serializer**
(`lib/serializers/ticket.ts`) is the value object
that turns a `TicketTrailEntry` into the
citizen-facing projection. The serializer
substitutes `actorLabel` for citizens; the
internal actors (dispatcher, crew) are hidden.

### `MyReportDetail`

A derived view of a single `Ticket` plus its
trail. The detail page renders one
`MyReportDetail`.

```typescript
interface MyReportDetail {
  ticket: SerializedTicket;     // citizen projection
  trail: SerializedTrailEntry[]; // ordered by timestamp ASC
  wardLabel: string;            // "ওয়ার্ড 14, মিরপুর"
  createdRel: string;           // "5 মিনিট আগে"
  resolvedRel: string | null;   // "3 দিন আগে" or null
  resolutionDays: string | null; // "3.2" or null
  canShowFeedback: boolean;     // ticket.status === 'resolved'
}
```

## Domain services

### `listMyReports(session)`

Returns the citizen's reports ordered by
`createdAt DESC`. Reads the activity stream and
filters to `reporterId === session.userId`. The
ordering is the same as the home feed (newest
first); the citizen has muscle memory for this
ordering from the home page.

### `getMyReportDetail(session, ticketId)`

Returns the citizen projection of the ticket +
trail. Enforces:
- the ticket is visible to the session
  (same-city + reporter-or-staff)
- the rate limit `(session.userId, ticketId) → 1/sec`
  (PLAT-REQ-008)
- the citizen serializer strips internal fields
  (PLAT-REQ-001)

### `deletePhoto(session, ticketId, photoIdx)`

Removes a photo from `Ticket.photoUrls`. The
remaining photos re-index; the trail does **not**
record the deletion (the trail is for status
transitions, not for content edits). The deletion
is logged as an `audit` event with
`{action: 'photo.delete', entityId: ticketId, actorId: session.userId, afterValue: {photoIdx}}` so the
WO-002 dispatcher can see the citizen's photo
edits if needed.

### `submitFeelHeardFeedback(session, ticketId, satisfied)`

Records the citizen's feel-heard response. v1
locally toggles `feedbackSent` on the detail
page; v1.1 persists the response as a structured
audit event so the WO-002 dispatcher can
surface satisfaction signals. (See
`app/reports/[id]/page.tsx:287-292` for the v1
local-only handler.)

## Ubiquitous language

| Term | Meaning |
|------|---------|
| **My reports** | The citizen's own tickets, filtered by `reporterId` from the city's activity stream. |
| **Status trail** | The ordered list of `TicketTrailEntry` records for a single ticket, rendered top-to-bottom on the detail page. |
| **Trail step** | A single `TicketTrailEntry` with its `toStatus`, timestamp, and anonymised actor label. |
| **Status pill** | The coloured badge on the list row / detail header that shows the current `toStatus`. |
| **Actor label** | The anonymised or real name shown next to a trail entry. Citizens see "City corporation" / "সিটি কর্পোরেশন"; staff see real names. |
| **Feel-heard prompt** | The green-bordered card on the detail page that fires when `status === 'resolved'`. It is the citizen-side analogue of the dispatcher's "mark resolved" action. |
| **Photo-delete confirm** | The modal that replaces `window.confirm()` for the photo-delete affordance. All copy is i18n-keyed. |
| **No-polling v1** | The detail page does **not** poll on a timer. Citizens re-fetch on focus / re-mount. |

## Status trail — the contract

The trail is the canonical citizen-side view of
"what happened to my report". The four-step order
is:

```
Submitted → Routed → In progress → Resolved
```

This order is **inherited from project.md** and
is a UX-Design decision from 2026-09-18. The
trail is rendered top-to-bottom (oldest first) so
the citizen reads it as a story; the current
status is highlighted with the primary colour
pill, and done steps are green-filled.

The trail does not record photo deletes, note
edits, or feel-heard feedback (v1.1 may add these
as separate "edit" trail entries; for now, they
are audit-only events).

## Photo URLs — the ordering invariant

`Ticket.photoUrls` is an ordered array. The order
is **the writer's order at submit time** — the
photo step (`app/report/photo/page.tsx`) appends
to the array as the citizen captures each photo;
the index 0 is the first photo, the last index is
the most recent.

The detail page renders photos in this order
(`photoUrls.map((url, idx) => ...)`); the
photo-delete handler removes by index, and the
remaining photos re-index automatically
(`photoUrls.filter((_, i) => i !== idx)`).

**Invariant**: a v1.1 photo pipeline that moves
photos to S3/MinIO must preserve the
`photoUrls` array order. The keys are stable
URLs, the order is the writer's order, and the
detail page renders them in that order.

## Photo retention — the policy

Photos live in `Ticket.photoUrls` indefinitely
until the citizen deletes them (the
"indefinite retention with citizen-initiated
delete" decision recorded in project.md
Corrections). A 365-day unread-photo lifecycle
policy is the v1.1 retention rule for unread
photos; v1 does not enforce the 365-day rule but
documents it for the dispatcher side.

## Photo delete — the domain event

A photo delete is **not** a trail entry (the
trail is for status transitions). The delete is:

1. A `DELETE /api/tickets/:id/photos/:idx` call
   (the API enforces citizen-only + same-city).
2. A `photo.delete` audit event with
   `{action: 'photo.delete', entityId: ticketId, actorId: session.userId, afterValue: {photoIdx}}`.
3. The detail page re-renders the photo gallery
   with the photo removed.

The audit log is the dispatcher-side visibility;
the trail is the citizen-side visibility; the
two are deliberately separated so the trail stays
focused on the status story.

## Disputes (out of scope, v1.1)

The detail page surfaces a "Dispute this
resolution" button when the ticket is resolved.
v1.1 wires the dispute path
(`/reports/[id]/dispute`); v1 ships the button
without a destination (it is the v1 affordance
for the v1.1 surface).

The button is a `router.push` to the not-yet-built
dispute page; for now, the citizen sees a 404 if
they tap it. This is an explicit v1 gap, not an
oversight.

## Cross-references

- `bolt.md`: `./bolt.md`.
- `../002-003-submit-report-flow/ddd-01-domain-model.md`:
  the parent bolt's domain model (the
  `ReportDraft` VO, the photo strategy).
- `../002-002-home-and-activity/ddd-01-domain-model.md`:
  the home feed's `ActivityItem` VO (the
  list page reuses the same projection).
- Standards:
  `../../standards/tech-stack.md`,
  `../../standards/data-stack.md`,
  `../../standards/decision-index.md`.
