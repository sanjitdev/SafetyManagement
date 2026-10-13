---
story: CREW-003-resolve
unit: 003-ticket-detail-and-resolve
intent: 004-field-crew-app
phase: construction
status: done
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T03:00:00Z
---

# Story: CREW-003 — Resolve in the Field

## Given / When / Then

### Acceptance 1 — Mark in progress

**Given** a crew session
**And** a ticket where
`assignedCrewId = session.userId` AND
`status = 'routed'`
**When** the crew member taps "Mark in
progress"
**Then** the API returns `200` and the
ticket is now in `status = 'in_progress'`
with a new trail entry whose `toStatus` is
`'in_progress'` and `actorId` is the
crew member.

### Acceptance 2 — Mark resolved (with a resolution note)

**Given** a crew session
**And** a ticket where
`assignedCrewId = session.userId` AND
`status = 'in_progress'`
**And** a non-empty resolution note
**When** the crew member taps "Mark
resolved"
**Then** the API returns `200`, the
ticket is now in `status = 'resolved'`,
`resolvedAt` is set to the current time,
and a new trail entry is written with
`note = <the resolution note>` and
`toStatus = 'resolved'`.

(See CREW-004 for the "empty note"
denial: the page disables the button, and
the API also rejects an empty note with
400 `invalid_input`.)

### Acceptance 3 — Cancel denied

**Given** a crew session
**When** the crew member POSTs a
transition with `toStatus: 'cancelled'`
**Then** the API returns `403` with
`{ error: 'role_cannot_perform_transition' }`
(the crew cannot cancel a ticket; the
dispatcher owns cancellation).

### Acceptance 4 — Cross-role denial

**Given** a dispatcher / citizen / admin
session
**When** the dispatcher / citizen / admin
calls the crew transition endpoint
**Then** the API returns `403` with
`{ error: 'forbidden_role' }`.

### Acceptance 5 — Out-of-scope ticket → 404

**Given** a crew session
**And** a ticket where
`assignedCrewId != session.userId` (i.e.
assigned to another crew member)
**When** the crew member issues a
transition for that ticket
**Then** the API returns `404` with
`{ error: 'not_found' }` (NOT 403) so the
crew member cannot probe ticket
existence outside their assignment.

### Acceptance 6 — Illegal transition (e.g. `routed → resolved`)

**Given** a crew session
**And** a `routed` ticket (not yet
`in_progress`)
**When** the crew member POSTs a
transition with `toStatus: 'resolved'`
**Then** the API returns `422` with
`{ error: 'illegal_transition',
from_status: 'routed', to_status:
'resolved' }` (the engine's edge map
rejects it; the role-allowed check
passes because `resolved` is in the
crew's allowed set, so the engine fires).

## Technical Notes

- The transition endpoint is a
  generalisation of the dispatcher's
  transition route (Bolt 003-003). The
  shape is identical; the only
  differences are `requireRole(session,
  'crew')` and `ALLOWED_CREW_TRANSITIONS
  = ['in_progress', 'resolved']`.
- The transition engine
  (`lib/platform/transitions.ts`) is
  unchanged. The engine validates the
  edge; the role-allowed check is a
  coarser gate that fires first.
- Out-of-scope id → 404: the route
  wraps `requireSameCity` +
  `requireScope` in a `loadInScope()`
  helper. The crew's `assignedCrewId`
  is the additional check: the helper
  also verifies `ticket.assignedCrewId
  === session.userId` and returns `null`
  if not. (This is the new "I can only
  act on my own assignments" check
  that doesn't exist on the dispatcher
  side; the dispatcher's scope is by
  ward + department, not by per-ticket
  assignment.)
- On success:
  `sendTicketPush(...)` (best-effort)
  + return the refreshed, crew-serialised
  ticket.
- The page enables / disables transition
  buttons based on the intersection of
  the engine's valid edges from the
  current status AND the role-allowed
  set. The page does NOT trust the API
  for this — it derives the buttons
  client-side from the response.

## Out of Scope

- The list page (Unit 002) — the list
  row links to this page; it does not
  own the action bar.
- The resolution note textarea (CREW-004)
  — owned by the same surface; the
  story is split because the textarea
  has its own acceptance criteria.
- The "Capture after photo" upload
  (CREW-003 was originally the parent
  story but the photo upload is its
  own endpoint; the trail entry is
  written separately from the
  transition).
- The "Navigate" CTA (CREW-005).
- Geofence check on "Mark in progress"
  (PRD-silent; deferred to v1.1).
- Real-time updates via WebSocket / SSE.

## Dependencies

- Intent 001 (Unit 002) — `requireRole`
  / `requireScope` guards.
- Intent 001 (Unit 003) — the
  `transitionTicket` engine.
- Intent 003 (Unit 003) — the
  dispatcher's transition route is the
  pattern this story generalises.

## Cross-references

- `app/api/v1/crew/tickets/[id]/transition/route.ts`
  (new, POST) — Bolt 004-003
  deliverable.
- `app/crew/tickets/[id]/page.tsx` (new)
  — Bolt 004-003 deliverable.
- `lib/i18n/keys.ts` — new
  `crew.detail.*` + `crew.transition.*`
  keys (≈8 keys).
- `tests/15-crew-ticket-light.spec.ts`
  (new) — Playwright spec.
- Visual baselines:
  `tests-mockups/baselines/15-crew-ticket-light.spec.ts/crew-ticket-{routed|in_progress}-390x844.png`.
