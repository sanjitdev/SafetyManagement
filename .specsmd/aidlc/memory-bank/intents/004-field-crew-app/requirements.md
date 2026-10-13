---
intent: 004-field-crew-app
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-12T20:00:00Z
---

# Requirements: Field Crew App (WO-003)

## Intent Overview

Build the **WO-003 field crew surface** — the
mobile-first, narrow-viewport-optimized surface a
field crew member uses while on the road. The crew
member sees their assigned tickets, navigates to
each one, updates the status, and adds a resolution
note + an "after" photo.

This intent is **draft**. It captures the
inception-stage framing; the units and stories will be
decomposed when WO-002 ships and this intent is
unblocked.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Today's assignments | Crew sees today's list in < 10s | Must |
| Resolve in the field | Resolve a ticket in < 60s | Must |
| After photo | Capture "after" photo as evidence | Must |
| Offline-ish (read) | Read-only when network is flaky | Should |
| Audit | Every action writes an `AuditEntry` | Must |

## Functional Requirements

### CREW-REQ-001 — Auth + scope

- **Description**: A crew member signs in via the
  shared auth funnel; the session is bound to
  `(cityId, wardId?, departmentId?)` at login time
  (the dispatcher pre-creates the account).
- **Acceptance Criteria**:
  - `User.role = 'crew'`.
  - `Session.wardId?` and `Session.departmentId?` are
    set.
  - `requireScope(session)` rejects out-of-scope.
- **Priority**: Must

### CREW-REQ-002 — Today's assignments

- **Description**: A list of tickets where
  `assignedCrewId = session.userId` and `status ∈
  {routed, in_progress}`. Sorted by routing time.
- **Acceptance Criteria**:
  - `app/crew/page.tsx` exists.
  - 30s polling.
  - Each item: status, category, distance from
    current location.
- **Priority**: Must

### CREW-REQ-003 — Resolve in the field

- **Description**: A single ticket page with the full
  record, the map / navigation, and the "Mark in
  progress" / "Mark resolved" / "Capture after photo"
  buttons.
- **Acceptance Criteria**:
  - `app/crew/tickets/[id]/page.tsx` exists.
  - Crew serializer exposes the full record.
  - "Mark in progress" / "Mark resolved" transitions.
  - "Capture after photo" adds to `Ticket.photoUrls`.
  - Each action writes an `AuditEntry` and a
    `TicketTrailEntry`.
- **Priority**: Must

### CREW-REQ-004 — Resolution note

- **Description**: A short text area for the crew to
  describe what they did.
- **Acceptance Criteria**:
  - The note is stored in
    `TicketTrailEntry.note` (visible to citizens as a
    "what the crew did" entry).
  - Optional but encouraged.
- **Priority**: Must

### CREW-REQ-005 — Map + navigate

- **Description**: A "Navigate" CTA that opens the
  device's default maps app with the ticket's
  location as the destination.
- **Acceptance Criteria**:
  - "Navigate" opens the OS maps app via URL scheme.
- **Priority**: Should

### CREW-REQ-006 — Read-only on flaky network

- **Description**: The crew app caches the day's
  assignments and a ticket's last-known state for
  read-only display when the network is down.
- **Acceptance Criteria**:
  - A simple cache (`localStorage` or service worker)
  is in place.
  - Writes fail loudly (no silent queue).
- **Priority**: Should

## Non-Functional Requirements

| Requirement | Metric | Target |
|-------------|--------|--------|
| Today's list load | p95 latency | < 1s on 3G |
| Resolve action | p95 latency | < 500ms |
| Audit completeness | % of state changes audited | 100% |

## Constraints

- 390×844 viewport is the design target; the crew app
  MUST work there.
- WebAuthn is **not** required for crew.
- The "after" photo is stored alongside the
  "before" photo in v1; v1.1 may add a separate
  field.

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Offline writes (queue + retry) | Engineering | WO-003 PRD | Defer if not in PRD |
| Geofence check on "Mark in progress" | Product owner | WO-003 PRD | Defer if not in PRD |

## Status notes

This intent is **draft**. The units and stories will
be decomposed when WO-002 ships.
