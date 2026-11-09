---
unit: 002-todays-assignments
intent: 004-field-crew-app
phase: construction
status: complete
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T01:30:00Z
---

# Unit Brief: Today's Assignments (the crew's home)

## Purpose

The crew's primary surface — the mobile-first
list of tickets currently assigned to the
signed-in crew member. A field crew member
opens the app, sees their list, taps a ticket
to open the detail page (Unit 003), and
resolves the ticket in the field.

This unit stands up:

- `GET /api/v1/crew/tickets` — list tickets
  where `assignedCrewId = session.userId` and
  `status ∈ {routed, in_progress}`. Sorted
  oldest-first (the crew should always see
  the most-aged assignment at the top so
  they don't miss SLAs).
- `app/crew/page.tsx` — the mobile-first
  list view. Each row shows status, category,
  location label, age, and (when the browser
  Geolocation API grants permission) the
  distance from the device's current location.
  30s polling.

## Scope

### In Scope

- The list API + the list page.
- The dev login redirect map: `?role=crew`
  now lands on `/crew` (was `/home` per the
  Bolt 003-002 default).
- The Vitest unit test for the route
  handler's filter logic.
- The Playwright route spec for the
  end-to-end list flow.
- 1 visual baseline for the empty state
  (no assignments) + 1 for the populated
  state (3 assignments).

### Out of Scope

- The ticket detail page (Unit 003).
- The "Mark in progress" / "Mark resolved"
  transitions (Unit 003).
- The "Capture after photo" upload (Unit
  003).
- The "Navigate" CTA (Unit 003).
- The offline cache (Unit 004). The Unit
  002 page is the *source* of the cache —
  Unit 004 hooks the cache into the page
  render and a few key fields.
- Real-time updates via WebSocket / SSE.
  The page polls every 30s, same as the
  dispatcher queue. v1.1 may add push
  delivery for new assignments.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CREW-REQ-002 | Today's assignments (list of `assignedCrewId = me AND status ∈ {routed, in_progress}`, sorted by routing time) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Ticket` | (inherited) | `id`, `status`, `assignedCrewId`, `categoryId`, `wardId`, `cityId`, `locationLat`, `locationLng`, `createdAt` |
| `TicketTrailEntry` | (inherited) | `ticketId`, `toStatus`, `actorId`, `timestamp`, `note` |
| `Category` | (inherited) | `id`, `slug`, `name`, `nameBn` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `GET /api/v1/crew/tickets` | List the crew's assigned tickets in (routed, in_progress) | session | `{ tickets: SerializedTicket[] }` |
| `devMintSession('crew')` (delta) | Redirect target now `/crew` | role | `{ cookieValue, expiresAt, userId }` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 1 |
| Must Have | 1 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| CREW-002-todays-assignments | Today's assignments list (assignedCrewId = me, status in {routed, in_progress}) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| 001-auth-and-scope | The list endpoint enforces `requireRole(session, 'crew')` + `requireScope(...)` |
| Intent 001 (Unit 003) | `Ticket` / `Category` / `Trail` models |
| Intent 002 (Unit 003) | The citizen submit flow writes the `Ticket` row; the dispatcher Unit 003 sets `assignedCrewId` |

### Depended By

| Unit | Reason |
|------|--------|
| 003-ticket-detail-and-resolve | The detail page lists the same set; the link from the list is `tickets/${id}` |
| 004-offline-read | The cache is keyed off the list response |

## Technical Context

### Suggested Technology

- New API route
  `app/api/v1/crew/tickets/route.ts` (GET).
  Zod-validated `limit` query (1-100, default
  50) and optional `status` filter
  (`'routed' | 'in_progress'`, default both).
- New page `app/crew/page.tsx` (client
  component, 390x844 viewport target).
  Header: brand + ward · department badge +
  lang toggle + theme toggle + sign-out. Main:
  heading + 30s polling list of assignment
  rows. Each row: category icon + location
  label + age + status pill + "Open" chevron.
  The row is a link to
  `/crew/tickets/[id]`.
- Geolocation: on first mount, the page
  requests `navigator.geolocation`. If
  granted, the device's current position is
  cached in component state and the haversine
  distance to each ticket's coords is shown
  in metres. If denied / unavailable, the
  distance column is hidden — the page
  degrades gracefully.
- Dev login redirect map: edit
  `app/api/dev/login/route.ts` to point
  `crew` at `/crew` (was `/home`).

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `GET /api/v1/crew/tickets` | HTTP | JSON |
| `serializeTicketForRole('crew', ...)` | in-process | function call |
| `requireRole(session, 'crew')` + `requireScope(...)` | in-process | function call |

### Data Storage

None new. The list query reads `Ticket` rows
where `assignedCrewId = session.userId`. The
field is already on the Ticket model (set
by the dispatcher's PATCH in Bolt 003-003).

## Constraints

- The page MUST work at 390x844 (the
  design-target phone viewport). The layout
  collapses to a single column on small
  screens.
- 30s polling. The page re-fetches on focus
  AND every 30s. The polling interval is a
  constant exported from the page module so
  a future bolt can tune it.
- Out-of-scope tickets are not in the
  list — the route filters by
  `assignedCrewId = session.userId`, so a
  crew member cannot see another crew
  member's assignments even if the id is
  in their URL.

## Success Criteria

### Functional

- [ ] `GET /api/v1/crew/tickets` returns
      tickets where
      `assignedCrewId = session.userId` AND
      `status ∈ {routed, in_progress}`,
      sorted by `createdAt` asc.
- [ ] Cross-role denial: dispatcher / citizen
      / anonymous cookies all return 401 or
      403 as appropriate.
- [ ] No assigned tickets → empty-state
      card with a friendly message.
- [ ] The dev login redirect now points
      `?role=crew` at `/crew`.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.
- [ ] `npm run test:mockups` is green.
- [ ] 30s polling is wired (the visible
      "Last refreshed Xs ago" indicator
      updates after each poll).

### Quality

- [ ] Vitest unit test pinned for the
      filter logic (mocked session + real
      dev store).
- [ ] Playwright route spec covers
      happy-path + 401/403 + empty state.
- [ ] 2 visual baselines committed (empty
      state, populated state at 390x844
      light theme).

## Bolt Suggestions

A single `ddd-construction-bolt` for this
unit. The bolt is one new API + one new
page + a small test suite.

## Notes

The 30s polling cadence mirrors the
dispatcher queue. The crew's first render is
synchronous (the API is fast — the dev store
returns in <10ms; Prisma with a 50-row
indexed query is also <50ms). v1.1 may add
SSE for "new assignment" push notifications.

The Geolocation API is opt-in: the page
requests it on first mount, but if the
user denies the permission, the list
renders without the distance column. The
denial is silent — no error banner — so the
list is always usable. v1.1 may add a manual
"Set my location" CTA.
