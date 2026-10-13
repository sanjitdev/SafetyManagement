---
standard: ddd-01-domain-model
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-002-home-and-activity
---

# Bolt 002-002 — Domain Model

The home / city activity feed. The Bolt's domain
model is **narrow on purpose**: the home page is a
view-projection over the `Ticket` aggregate that the
report flow (Bolt 002-003) creates and the my-reports
flow (Bolt 002-004) reads. The only domain surface
this Bolt adds is the **ActivityItem projection** and
the **filter** that narrows it.

## Ubiquitous language

| Term | Definition |
|------|------------|
| **Activity feed** | The 20 most-recent `Ticket` rows in the citizen's `cityId`, projected to the citizen-facing `ActivityItem` shape, ordered `createdAt DESC`. The home page renders this as the side panel. |
| **ActivityItem** | The citizen-facing projection of a `Ticket`. Field-stripped via `lib/serializers/ticket.ts → serializeTicketForRole(role='citizen', lang='bn')`. The internal `reporterId` is replaced by `isOwnReport: boolean`. |
| **Status filter** | The pill in the side panel header. Four values: `all`, `submitted` (UI label "New"), `in_progress`, `resolved`. `all` is the default and means "no filter". |
| **Polling** | v1 fetches `/api/v1/activity?limit=20` every 15 s while the home page is open. The "new" badge highlights items that appeared on the second-and-later fetches. |
| **Empty state** | The render when the filtered list is empty. Surfaces a primary Report CTA. |
| **Offline banner** | The render when a fetch throws (network failure). Does not stop polling. |
| **Own report** | A `Ticket` whose `reporterId === session.userId`. The home page tags the card with the "new" badge if it was created by the citizen. |
| **Bootstrap** | The payload of `GET /api/report/bootstrap`: `{ city, ward, categories }`. The home page reads the citizen's `ward` (singular) for the row's ward label; cross-ward filing is v1.1. |
| **Notification prompt** | The one-time banner that asks the citizen to enable browser push. Suppressed after accept or after `'dismissed'`. The actual `POST /api/v1/push/subscribe` is wired to the `accept` handler in a v1.1 Bolt (story `016-push-subscribe` is `pending`). |
| **Map (v1)** | The SVG placeholder that projects each ticket's `(locationLat, locationLng)` to a 600×360 viewbox. v1.1 swaps to MapLibre + OSM raster. |

## Bounded contexts

This Bolt lives entirely inside the **Reporter
context** that Bolt 002-003 will formalize. The home
page consumes the `Ticket` aggregate's **read** model
only; it never mutates a ticket.

The home page's contracts are:

- `GET /api/auth/status` → `{ authenticated, session? }`
  (re-used from Bolt 002-001).
- `GET /api/report/bootstrap` → `{ city, ward,
  categories }` (Bolt 002-003 owns this endpoint but
  ships the contract in its unit-brief).
- `GET /api/v1/activity?status=&limit=` → `{ tickets:
  ActivityItem[] }`.

The home page is the **first authenticated surface**
the citizen reaches after the auth funnel; its
correctness is the proof that Bolt 002-001 works
end-to-end and that the citizen serializer strips
internal fields from the feed.

## Aggregates and value objects

### `ActivityItem` (value object)

The citizen-facing projection of a `Ticket`. The
shape is defined by the serializer
(`lib/serializers/ticket.ts → serializeTicketForRole`),
not by this Bolt. The home page consumes it
opaquely; the only per-page derivations are
`isOwnReport` (set on the client from
`session.userId === item.reporterId`) and the
`categoryName` / `wardName` lookups (resolved from
the bootstrap payload's `categories` and the
citizen's own `ward`).

| Field | Type | Source |
|-------|------|--------|
| `id` | string | `Ticket.id` |
| `status` | enum | `TicketStatus` (the same enum Bolt 002-001 uses) |
| `categoryId` | string | `Ticket.categoryId` |
| `wardId` | string | `Ticket.wardId` |
| `locationLat`, `locationLng` | number | `Ticket.locationLat`, `Ticket.locationLng` |
| `note` | string \| null | `Ticket.note` (truncated to 1 line on the client) |
| `photoUrls` | string[] | `Ticket.photoUrls` (the first is the card thumbnail) |
| `createdAt` | string | `Ticket.createdAt` (ISO 8601) |
| `categoryName` / `categoryNameBn` | string \| undefined | joined client-side from `bootstrap.categories` |
| `wardName` / `wardNameBn` | string \| undefined | joined client-side from `bootstrap.ward` (the citizen's own ward; v1.1 widens to the ticket's ward) |
| `isOwnReport` | boolean | derived: `userId === reporterId` |

**Invariants**:

- The citizen-facing shape **never** contains
  `reporterId`, `internalNote`, or `assignedCrewId`.
  The serializer enforces this.
- `isOwnReport` is a per-client computation; the
  server response does not contain it.
- The `wardName` for a ticket in a **different** ward
  than the citizen's own is the citizen's own ward
  label in v1 (cross-ward filing is v1.1). The
  ticket's wardId is preserved server-side; the UI
  label is the only thing that collapses.

### `StatusFilter` (value object)

```text
type StatusFilter = 'all' | 'submitted' | 'in_progress' | 'resolved';
```

The mapping from filter to the API's `status` query
parameter is `filter === 'all' ? no-status : filter`.
The UI label is `home.filter.<key>`; the special
case is `submitted → 'New'` in the i18n key. The
`closed` and `cancelled` statuses exist in the model
but are intentionally **not** surfaced as filter
pills — the citizen cannot filter to them.

### `Bootstrap` (read-model DTO)

```text
interface Bootstrap {
  city: { id: string; name: string; nameBn: string | null };
  ward: { id: string; name: string; nameBn: string | null; number: number } | null;
  categories: Array<{
    id: string;
    slug: string;
    name: string;
    nameBn: string | null;
  }>;
}
```

The contract is owned by Bolt 002-003; this Bolt
**consumes** it. The home page tolerates a missing
`ward` (returns the `home.map.location_pill` label
as a fallback) but requires `city` to render the
top-bar brand.

## Domain services

### `fetchActivity({ status?, limit })`

**Purpose**: read-side service. Wraps the
`GET /api/v1/activity?status=&limit=` call and
returns the citizen-facing projection.

**Behaviour**:

- Sends `credentials: 'include'` (the citizen
  session cookie is HTTP-only).
- Returns `{ tickets: ActivityItem[] }` on 200.
- Returns `null` (and the page surfaces
  `home.feed.error`) on 401, 4xx, 5xx, or network
  failure.
- Polled every 15 s by the home page; the second
  fetch and onward compute the `newIds` set (items
  not in the previous fetch are highlighted for 5 s).

**Errors**: every non-2xx response is treated the
same way (`home.feed.error`); the home page does
**not** distinguish between `not_authenticated` and
`rate_limited` from the user's perspective.

### `fetchBootstrap()`

**Purpose**: read-side service. Wraps the
`GET /api/report/bootstrap` call.

**Behaviour**: returns the `Bootstrap` DTO or `null`
on any non-2xx. A `null` bootstrap is treated as a
"feed error" by the home page (the brand label
collapses to just "CityFix"; the rest of the page
renders the skeleton + error message).

## Domain events

| Event | Emitted by | Consumed by |
|-------|-----------|-------------|
| `ticket.activity_polled` | `fetchActivity` (per poll) | Implicit; `newIds` is derived from the delta. **No** audit log entry — the feed is read-only. |
| `home.notification_prompt_accepted` | `acceptNotifications` | Persists `localStorage.cityfix.notification_prompt_seen.v1 = 'true'`. The real `POST /api/v1/push/subscribe` is a v1.1 Bolt. |
| `home.notification_prompt_dismissed` | `dismissNotifications` | Persists `localStorage.cityfix.notification_prompt_seen.v1 = 'dismissed'`. |

**v1 emits no auth-audit events from the home page**;
the home page is a read-only surface. The audit log
is touched only by the underlying `Ticket` mutations
(Bolt 002-003) and the auth funnel (Bolt 002-001).

## Ubiquitous constraints (the BDD acceptance language)

For the **Construction Verification Command** to be
green, the Bolt must demonstrate:

1. `GET /api/v1/activity` while authenticated as a
   citizen returns the citizen-facing projection
   (no `reporterId`, no `internalNote`, no
   `assignedCrewId`).
2. The home page renders the top bar with the brand
   and city, the centered Report CTA, the "My
   reports" link, the language toggle, the theme
   toggle, and the avatar.
3. The side panel renders the four filter pills
   (All / New / In progress / Resolved) and a 20-item
   activity list.
4. The empty state renders the "No reports yet" copy
   and the Report CTA.
5. The `all` filter returns the unfiltered list; the
   `submitted`/`in_progress`/`resolved` filters each
   return only the matching rows.
6. The polling cadence is 15 s; a 5-s "new" badge
   highlights items that appeared since the previous
   poll.
7. The notification prompt is shown at most once per
   browser (gated by `localStorage`).
8. The home page does not poll while the citizen is
   signed out (the auth-gate returns before the
   polling effect mounts).

## Notes for ddd-02

- The `/api/v1/activity` route already exists and is
  rate-limit-free in v1. The 15-s polling cadence
  means the worst-case request rate per tab is
  ~4 req/min; the existing per-IP login + per-IP
  register limits are unrelated. v1 has no
  activity-route throttle; v1.1 may add one if a
  user opens the home page in 10+ tabs.
- The "isOwnReport" detection is purely client-side
  because the server response intentionally does not
  include `reporterId` after the citizen serializer.
  This is the right place for it: the citizen
  already has the `userId` in their session; the
  per-row comparison is a single equality.
- The notification prompt's `accept` handler calls
  `Notification.requestPermission()` but does **not**
  subscribe. The `POST /api/v1/push/subscribe` POST
  is a v1.1 Bolt (story `016-push-subscribe`). This
  is recorded in the Bolt Decision so a v1.1 reviewer
  finds the seam.

## Cross-references

- **bolt.md**: `./bolt.md`.
- **Standards**:
  - `../../standards/tech-stack.md` (Next.js 14 +
    MapLibre/Mapbox + Push).
  - `../../standards/api-conventions.md` (citizen
    serializer).
  - `../../standards/coding-standards.md` (i18n
    through `t(...)`; Zod at boundaries).
  - `../../standards/decision-index.md` (ADR-001
    four-role, ADR-007 citizen serializer).
- **Active intent**:
  `../../intents/002-citizen-report-flow/`.
- **Bolt plan**: `../plan.md`.
- **Story 015** is the **serializer contract** Bolt;
  the `lib/serializers/ticket.ts` test in
  `tests/unit/serializer.test.ts` is the canonical
  acceptance evidence (per the unit-brief).