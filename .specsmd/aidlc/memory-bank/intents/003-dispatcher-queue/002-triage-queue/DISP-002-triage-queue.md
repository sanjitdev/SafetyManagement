---
story: DISP-002-triage-queue
unit: 002-triage-queue
intent: 003-dispatcher-queue
phase: inception
status: in-progress
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
---

# Story: DISP-002 — Triage Queue

## Given / When / Then

### Acceptance 1 — In-scope ticket visible

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher opens `/dispatcher`
**Then** the queue lists all tickets in
`(submitted, routed)` status in
`city_dhaka_north / ward_14 / dept_streetlight`,
sorted oldest-first.

### Acceptance 2 — Out-of-scope ticket hidden

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher opens `/dispatcher`
**Then** the queue does NOT include any ticket
in `ward_15` or `dept_water`, even if those
tickets are in `(submitted, routed)` status.

### Acceptance 3 — Status filter

**Given** a dispatcher session
**When** the dispatcher toggles the status
filter to "Submitted only"
**Then** the queue lists only tickets with
`status === 'submitted'`.

### Acceptance 4 — Cross-city denial

**Given** a dispatcher session bound to
`city_dhaka_north`
**When** the dispatcher calls
`GET /api/v1/dispatcher/queue` with a
`?cityId=city_chittagong` query
**Then** the API returns `403` with
`{ error: 'cross_city_access_denied' }`.

### Acceptance 5 — Polling

**Given** the dispatcher is on `/dispatcher`
**When** 30 seconds elapse
**Then** the queue refreshes with the latest
ticket list (any newly-submitted ticket in
the dispatcher's scope appears).

### Acceptance 6 — Click-through to detail

**Given** the queue lists a ticket
**When** the dispatcher clicks the row
**Then** the dispatcher navigates to
`/dispatcher/tickets/[id]`.

## Technical Notes

- The queue's full record is the dispatcher
  branch of `serializeTicketForRole`:
  `internalNote`, `assignedCrewId`, real
  `actorId` on trail entries.
- The query string is Zod-validated:
  `status?: 'submitted' | 'routed'`, `limit?:
  number` (default 50, max 100).
- The dispatcher's redirect after dev login
  changes from `/home` to `/dispatcher`.
- The page is a client component; uses
  `setInterval` for polling (no shared hook
  yet; the citizen home uses a per-page
  `useEffect` + `setInterval`).

## Out of Scope

- The ticket detail page (Unit 003).
- The dedup-decline review (Unit 004).
- The map view (Unit 005, deferred).
- Real-time updates via WebSocket / SSE
  (v1.1 candidate).

## Dependencies

- Intent 001 (Unit 003) — `db.ticket.findMany`.
- Intent 001 (Unit 001) — serializer.
- Intent 003 (Unit 001) — `requireScope`.
- Intent 002 (Unit 002) — polling pattern.
- Intent 002 (Unit 005) — theme + i18n.

## Cross-references

- `app/api/v1/dispatcher/queue/route.ts` —
  new API (Bolt 003-002 deliverable).
- `app/dispatcher/page.tsx` — new page.
- `lib/serializers/ticket.ts` — `serializeTicketForRole`.
- `lib/auth/guards.ts` — `requireScope`.
- `tests/10-dispatcher-queue-light.spec.ts` —
  Playwright route spec.
- `tests-mockups/baselines/10-dispatcher-queue-light.spec.ts/
  dispatcher-queue-1440x900.png` — visual
  baseline.
