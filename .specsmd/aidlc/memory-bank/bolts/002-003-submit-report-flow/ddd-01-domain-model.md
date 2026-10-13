---
standard: ddd-01-domain-model
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-003-submit-report-flow
---

# Bolt 002-003 — Domain Model (parent)

The submit-report-flow domain spans 3 pre-submit
steps (location / photo / category), 3
submit-confirm steps (note / summary / submitted),
plus the bootstrap endpoint and the dedup
pre-filter. The parent bolt anchors the model
shared by both child bolts; the per-step details
live in each child's `ddd-01-domain-model.md`.

## Bounded context

**Reporter**. The Reporter bounded context owns
the citizen's report lifecycle from "I want to
report an issue" through "I see my submission
landed". It re-uses the `Ticket` aggregate root
from the Platform layer (Bolt 002-000) and the
`TicketStatus` state machine from
`lib/platform/transitions.ts` (PLAT-REQ-005). The
context does not own the dispatcher's view of
the same ticket (that is the Dispatcher context,
WO-002).

## Aggregate root

### `Ticket` (inherited)

Already in `prisma/schema.prisma` and mirrored in
`lib/dev-store.ts` (`DevTicket`). The Reporter
context creates new `Ticket`s and reads its own
citizen projection. Field set is unchanged; the
serializer (`lib/serializers/ticket.ts`) is the
boundary the context crosses to project a citizen-
safe view.

### State machine

Owned by `lib/platform/transitions.ts`. The
Reporter context only ever sees the **first**
transition — `→ submitted` — when a citizen
creates a new report. Every other transition
(routed / in_progress / resolved / closed /
cancelled) is the dispatcher's responsibility.

## Value objects

### `ReportDraft`

`lib/report-draft.ts` is the canonical
representation.

| Field | Type | Notes |
|-------|------|-------|
| `cityId` | `string` | Copied from the session; immutable for the life of the draft. |
| `wardId` | `string` | Copied from the session. |
| `locationLat` / `locationLng` | `number` | Set at the location step; default is `DHAKA_CENTER`. |
| `locationLabel` / `locationLabelBn` | `string \| null` | Free-text label; the geocoder reverse-resolves the pin. |
| `categoryId` | `string \| null` | Set at the category step. |
| `photoUrls` | `string[]` | Data URLs in v1; v1.1 stores S3 keys. Cap = 3 (default) or 2 (narrow category). |
| `note` | `string` | Max 280 chars (per spec); the server allows up to 2000 in the schema; the UI enforces 280. |
| `step` | `'location' \| 'photo' \| 'category' \| 'note' \| 'summary' \| 'submitted'` | The current step; advances monotonically. |

The draft lives in `sessionStorage` (key
`cityfix.reportDraft.v1`). v1.1 may add
IndexedDB-backed persistence for cross-tab drafts.

### `DedupMatch`

Returned by `lib/platform/dedup.ts →
checkDedup`.

| Field | Type | Notes |
|-------|------|-------|
| `existingTicketId` | `string` | The id of the nearby open ticket. |
| `existingTicketStatus` | `'submitted' \| 'routed' \| 'in_progress'` | One of the three open statuses; `closed` / `cancelled` / `resolved` are NOT considered. |
| `distanceMeters` | `number` | Haversine distance from the candidate pin. |
| `existingLocationLat` / `existingLocationLng` | `number` | The matched ticket's pin. |
| `existingCreatedAt` | `string` (ISO) | The matched ticket's createdAt. |

A `null` result means "no nearby open ticket" and
the submit path proceeds to creation.

### `CityBootstrap`

The shape returned by `GET /api/report/bootstrap`.
Consumed by both Bolt 002-002 (home page reads
city/ward/categories for the citizen UI chrome)
and Bolt 002-003 (report flow reads the same for
the category step).

| Field | Type | Notes |
|-------|------|-------|
| `city` | `{ id, name, nameBn, defaultLanguage }` | The citizen's city. |
| `ward` | `{ id, cityId, number, name, nameBn } \| null` | The citizen's default ward. |
| `categories` | `CategorySummary[]` | The city's category list. |

### `CategorySummary`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Category id. |
| `slug` | `string` | URL slug. |
| `name` / `nameBn` | `string \| null` | Localised label. |
| `narrowCategoryPhotoCap` | `number \| null` | If set, the photo cap is this value (overrides the default of 3). |

## Domain services

### `checkDedup`

`lib/platform/dedup.ts`. Inputs: a candidate pin
(`cityId`, `categoryId`, `locationLat`,
`locationLng`). Output: a `DedupMatch` or
`null`. Algorithm: bounding-box pre-filter on
`(lat, lng)` (radius → degree delta) + Haversine
on the candidate set, picking the closest within
the city's `dedupRadiusMeters` (default 50 m).
The dedup engine only considers open tickets
(`submitted` / `routed` / `in_progress`).

### `submitTicket` (the POST flow)

`app/api/tickets/route.ts → POST`. Inputs: a
`CreateTicketInput` Zod-validated body. Output:
201 with the new citizen-projection ticket, or
200 with `{dedup_match: true, ...}`. The flow:

1. Auth + role guard.
2. Zod parse.
3. Per-city isolation (citizen's `session.cityId`
   must match `input.cityId`).
4. Dedup check (skipped if
   `dedupDeclineTicketId` is set — the citizen
   already saw the match in the summary step and
   explicitly declined).
5. On dedup match: write `ticket.dedup_detected`
   audit entry; return 200 with the match shape.
6. On no match: `db.ticket.create` → initial
   `TicketTrailEntry(toStatus: 'submitted')` →
   `ticket.create` audit → `sendTicketPush`
   (best-effort) → serialize → return 201.
7. If `dedupDeclineTicketId` is set: write
   `ticket.dedup_declined` audit entry.

### `getCityBootstrap`

`app/api/report/bootstrap/route.ts → GET`.
Auth-required, citizen-only. Returns the
`CityBootstrap` shape.

## Domain events (audit log)

| Action | When | `entityId` | `afterValue` |
|--------|------|------------|--------------|
| `ticket.create` | New ticket created | new ticket id | `{cityId, wardId, categoryId}` |
| `ticket.dedup_detected` | Dedup match found | existing ticket id | `{candidateLat, candidateLng, distanceMeters}` |
| `ticket.dedup_declined` | Citizen declined the match and re-submitted | new ticket id | `{declinedMatchTicketId}` |

The audit log is the privacy-respecting dedup
signal the WO-002 dispatcher surfaces for manual
review; the **decline** path is a structured
event AND a flag (per the WO-001 feasibility
decision recorded in
`aidlc/spaces/default/memory/project.md →
Corrections`).

## Photo strategy

v1: photos are read via `FileReader` →
`data:image/...;base64,...` URLs in
sessionStorage; the POST stores them in
`Ticket.photoUrls` (string array). v1.1
swaps to S3 + signed uploads (deferred; v1 ships
base64 per the existing implementation).

## Cross-context invariants

1. The Reporter context **only** creates tickets
   with `status: 'submitted'`. The state machine
   is the only thing that flips the status.
2. The `Ticket.reporterId` is set from
   `session.userId`; the citizen cannot file on
   behalf of another user.
3. The `Ticket.wardId` is the citizen's
   default ward at the time of submission (v1
   does not support cross-ward filing; deferred
   to v1.1).
4. The `reporterId` is **visible** to the citizen
   in their own session (so the home page can
   derive `isOwnReport`); it is **not** visible
   to other citizens (no cross-citizen leak in
   the citizen projection).

## What 3a vs 3b owns

- **3a — see and pick** owns the value objects
  `ReportDraft` (location / photo / category
  partial state), the `CategorySummary` consumer
  surface, the photo-cap invariants, and the
  polygon-based geofence value object (Gap G1).
- **3b — submit and confirm** owns the
  `DedupMatch` consumer surface, the
  `submitTicket` domain service, the dedup
  prompt UX, the confirmation page rendering,
  and the `getCityBootstrap` endpoint.

## Cross-references

- **bolt.md**: `./bolt.md`.
- **Child 3a**: `./002-003a-see-and-pick/ddd-01-domain-model.md`.
- **Child 3b**: `./002-003b-submit-and-confirm/ddd-01-domain-model.md`.
- **Standards**:
  - `../../standards/tech-stack.md`
  - `../../standards/coding-standards.md`
  - `../../standards/api-conventions.md`
  - `../../standards/decision-index.md`
