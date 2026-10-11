---
unit: 002-triage-queue
intent: 003-dispatcher-queue
phase: inception
status: ready
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
---

# Unit Brief: Triage Queue

## Purpose

Stand up the dispatcher's primary surface — the
triage queue. The queue is the list of tickets
in `(submitted, routed)` status, scoped to the
dispatcher's `(cityId, wardId?, departmentId?)`
and sorted by age (oldest first). The queue is
the dispatcher's home (`/dispatcher`); it
polls every 30s for new arrivals and status
transitions.

## Scope

### In Scope

- New API: `GET /api/v1/dispatcher/queue`.
  Query: `?status=submitted|routed` (optional;
  both by default). Returns the
  `SerializedTicket` for each row, filtered by
  the dispatcher's session scope.
- New page: `app/dispatcher/page.tsx`. Renders
  the queue as a list (similar to the citizen
  home's side panel but with dispatcher-only
  fields: `internalNote`, the real `actorId` on
  trail entries). Each row links to
  `/dispatcher/tickets/[id]`.
- 30s polling on the page.
- Cross-ward / cross-department denial on the
  API (the `requireScope` guard is
  Unit 001's deliverable; this unit's API
  calls it).

### Out of Scope

- The ticket detail page (Unit 003).
- The dedup-decline review (Unit 004).
- The map view (Unit 005, deferred).
- The 30s polling pattern is identical to the
  citizen home's 15s polling (Unit 002 of
  Intent 002). The shared polling hook
  (`lib/use-polling.ts` if one exists; else a
  per-page `useEffect` + `setInterval`) is
  owned by Unit 002 of Intent 002; this unit
  reuses it.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| DISP-REQ-002 | Triage queue | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Ticket` | (inherited) | `id`, `cityId`, `wardId`, `departmentId?`, `categoryId`, `status`, `createdAt`, `locationLat`, `locationLng`, `note`, `photoUrls`, `internalNote`, `assignedCrewId` |
| `Trail` | (inherited) | `toStatus`, `actorId`, `note`, `timestamp` |
| `Category` | (inherited) | `id`, `slug`, `name`, `nameBn`, `departmentId?` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `GET /api/v1/dispatcher/queue?status=submitted` | List tickets in the queue, scoped to session | query | `{ tickets: SerializedTicket[] }` |
| `serializeTicketForRole('dispatcher', ticket, trail)` | Full record (internal fields visible) | role, ticket, trail | `SerializedTicket` |

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
| DISP-002-triage-queue | Dispatcher triage queue | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `db.ticket.findMany` |
| Intent 001 (Unit 001) | `serializeTicketForRole` |
| Intent 003 (Unit 001) | `requireRole` + `requireScope` |
| Intent 002 (Unit 002) | Polling hook (reuse) |
| Intent 002 (Unit 005) | Theme + i18n |

### Depended By

| Unit | Reason |
|------|--------|
| 003-ticket-detail-and-transitions | The queue is the entry to the detail page |
| 004-dedup-decline-review | The dispatcher's "Open queue" CTA in the dedup view links back here |

## Technical Context

### Suggested Technology

- New API route: `app/api/v1/dispatcher/queue/
  route.ts`. Zod-validated query string.
- New page: `app/dispatcher/page.tsx`. Client
  component with 30s polling.
- Use `serializeTicketForRole` from
  `lib/serializers/ticket.ts` (the dispatcher
  branch already exposes the full record).

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/dispatcher/page.tsx` → `GET /api/v1/dispatcher/queue` | HTTP | GET (30s polling) |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `Ticket` rows in `(submitted, routed)` | SQL | medium (per-city) | until `resolved` / `closed` / `cancelled` |

## Constraints

- Queue filter is `(cityId, status in
  [submitted, routed], wardId?, departmentId?)`.
- Sort: `createdAt ASC` (oldest first).
- Per-row serializer: dispatcher (full record).
- 30s polling cadence.
- The page is a client component because the
  polling requires `window`.

## Success Criteria

### Functional

- [ ] `GET /api/v1/dispatcher/queue` returns
      `{ tickets: SerializedTicket[] }` filtered
      to the dispatcher's scope.
- [ ] A dispatcher bound to
      `(city_dhaka_north, ward_14, dept_streetlight)`
      does NOT see ward_15 / dept_water tickets.
- [ ] Tickets are sorted oldest-first.
- [ ] `app/dispatcher/page.tsx` renders the
      queue with category icon, ward, age, status
      pill, link to detail.
- [ ] Polling cadence is 30s.
- [ ] The page redirects to `/login` if the
      session is missing.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.
- [ ] `npm run test:mockups` is green.
- [ ] Queue p95 latency < 200ms.
- [ ] Visual regression baseline for the queue
      page captured (light theme, 1440x900).

### Quality

- [ ] Unit test for the queue filter.
- [ ] Playwright route spec
      `tests/10-dispatcher-queue-light.spec.ts`.
- [ ] Visual baseline committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit
because the work is one API + one page + one
test spec.

## Notes

The dispatcher queue is the post-login landing
for the dispatcher persona. The
`REDIRECT_BY_ROLE` map in
`app/api/dev/login/route.ts` currently routes
`dispatcher` to `/home`; this bolt changes
the dispatcher redirect to `/dispatcher` and
adds the auth-guard redirect for an
unauthenticated visit.
