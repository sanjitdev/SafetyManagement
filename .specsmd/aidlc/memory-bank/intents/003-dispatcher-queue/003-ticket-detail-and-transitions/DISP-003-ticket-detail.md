---
story: DISP-003-ticket-detail
unit: 003-ticket-detail-and-transitions
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-11T23:55:00Z
updated: 2026-10-12T00:30:00Z
---

# Story: DISP-003 — Ticket Detail (full record + trail + transitions)

## Given / When / Then

### Acceptance 1 — In-scope full record

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher opens
`/dispatcher/tickets/<ticket_in_ward_14>`
**Then** the page renders:
- the full ticket record (all fields
  including `internalNote`,
  `assignedCrewId`, real `actorId` on
  trail entries);
- the status trail (every entry with the
  real `actorId` and `note`);
- the photo gallery (all photos in the
  carousel);
- one transition button per valid
  `toStatus` allowed by
  `lib/platform/transitions.ts` from the
  ticket's current status.

### Acceptance 2 — Cross-ward denial (404)

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher navigates to
`/dispatcher/tickets/<ticket_in_ward_15>`
**Then** the page returns 404 (not 403) —
a ticket that exists but is out of scope
is indistinguishable from a ticket that
does not exist, to avoid leaking ticket
existence.

### Acceptance 3 — Cross-department denial (404)

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
**When** the dispatcher navigates to
`/dispatcher/tickets/<ticket_in_ward_14_dept_water>`
**Then** the page returns 404.

### Acceptance 4 — Cross-role denial

**Given** a citizen session
**When** the citizen navigates to
`/dispatcher/tickets/<any_id>`
**Then** the API returns 403
(`forbidden_role`); the page redirects to
`/login`.

### Acceptance 5 — Anonymous denial

**Given** no session
**When** any visit to
`/dispatcher/tickets/<any_id>`
**Then** the page redirects to `/login`.

### Acceptance 6 — Transition: submit

**Given** a ticket in `submitted` status
in the dispatcher's scope
**When** the dispatcher clicks the
"Route" transition button (to `routed`)
**Then** the API
(`POST /api/v1/dispatcher/tickets/[id]/transition`)
calls `transitionTicket(...)`; the ticket
moves to `routed`; a `TrailEntry` is
written with the dispatcher's `actorId`
and an optional note; an `AuditEntry` is
written atomically; the page re-renders
with the new status and the new trail
entry visible.

### Acceptance 7 — Illegal transition rejected

**Given** a ticket already in
`in_progress` status
**When** the dispatcher clicks a button
labelled "Submit" (to `submitted`,
illegal)
**Then** that button is NOT rendered
(only valid `toStatus` per
`ALLOWED[fromStatus]`); the API rejects
any illegal transition with 422
(`illegal_transition`) — defence in
depth even if the UI gets out of sync.

### Acceptance 8 — Photo gallery

**Given** a ticket with 3 photos
**When** the dispatcher opens the detail
page
**Then** all 3 photos are visible in the
gallery (carousel or grid — same as the
citizen detail page).

## Technical Notes

- The serializer for the detail page is
  the dispatcher branch of
  `serializeTicketForRole('dispatcher',
  ticket, trail)` — already in place.
- The status trail rendering reuses the
  same component / template shape as the
  citizen detail page, but with the
  dispatcher serializer branch (real
  `actorId`).
- The `TicketTrailEntry` component may
  be extracted from
  `app/reports/[id]/page.tsx` into a
  shared `components/TicketTrail.tsx`
  during this bolt if both pages use the
  same shape; otherwise the dispatcher
  page renders its own list with the
  dispatcher branch.
- The transition API takes
  `{ toStatus, note? }` and passes them
  to `transitionTicket(...)` which writes
  trail + audit atomically.
- The page does NOT poll — the
  dispatcher explicitly re-fetches (or
  navigates back) to see updates.

## Out of Scope

- The reassign UI (DISP-004 — separate
  story, same unit).
- The internal-note UI (DISP-005 —
  separate story, same unit).
- The dedup-decline review (Unit 004).

## Dependencies

- Intent 001 (Unit 003) —
  `transitionTicket(...)`.
- Intent 001 (Unit 001) —
  `serializeTicketForRole`.
- Intent 003 (Unit 001) —
  `requireRole` / `requireScope`.
- Intent 002 (Unit 004) —
  `app/reports/[id]/page.tsx` (the
  citizen detail page; this story may
  extract the trail component from it).

## Cross-references

- `app/api/v1/dispatcher/tickets/[id]/route.ts` —
  new API (GET).
- `app/api/v1/dispatcher/tickets/[id]/transition/route.ts` —
  new API (POST).
- `app/dispatcher/tickets/[id]/page.tsx` —
  new page.
- `lib/platform/transitions.ts` —
  transition engine (inherited).
- `lib/serializers/ticket.ts` —
  `serializeTicketForRole` (inherited).
- `lib/auth/guards.ts` — `requireRole` +
  `requireScope` (inherited).
- `tests/11-dispatcher-detail-light.spec.ts` —
  Playwright route spec.
- `tests-mockups/baselines/11-dispatcher-detail-light.spec.ts/` —
  3 visual baselines
  (`submitted`/`routed`/`in_progress`).
