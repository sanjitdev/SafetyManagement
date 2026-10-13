---
intent: 003-dispatcher-queue
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-12T01:30:00Z
---

# Requirements: Dispatcher Queue (WO-002)

## Intent Overview

Build the **WO-002 dispatcher surface** — the city-side
operations console where a dispatcher (the operator
bound to `(cityId, wardId?, departmentId?)`) triages
incoming reports, decides which department / ward
handles them, and transitions them through the status
pipeline. The dispatcher also sees the dedup-declines
flagged by the WO-001 citizen flow for a manual dedup
decision.

This intent is **draft**. It captures the
inception-stage framing; the units and stories will be
decomposed when WO-001 ships and this intent is
unblocked. The artifact today is a placeholder so the
specsmd tree is complete and the project has a single
planning source of truth.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Triage queue | Dispatcher can pick the next ticket in < 30s | Must |
| Re-assign to ward / department | Re-assign round-trip < 60s | Must |
| Status transitions | `routed → in_progress` and beyond in 2 clicks | Must |
| Dedup-decline review | Dispatcher can resolve a flagged duplicate in < 90s | Must |
| Internal notes | Dispatcher can leave a note visible only to crew + admin | Must |
| Audit | Every action writes an `AuditEntry` | Must |

## Functional Requirements

### DISP-REQ-001 — Auth + scope

- **Description**: A dispatcher signs in via the
  shared auth funnel (Intent 002) but is bound to
  `(cityId, wardId?, departmentId?)` at login time
  (admin pre-creates the account). The session is
  scope-aware: dispatcher A in ward 1 cannot read
  tickets in ward 2.
- **Acceptance Criteria**:
  - The dispatcher role is the same `User.role =
    'dispatcher'` enum value.
  - `Session.wardId?` and `Session.departmentId?` are
    set at login.
  - `requireScope(session)` rejects out-of-scope
    reads.
- **Priority**: Must

### DISP-REQ-002 — Triage queue

- **Description**: A list of tickets in
  `(submitted, routed)` status, scoped to the
  dispatcher's city and (optionally) ward /
  department. The list shows status, age, category,
  and a map preview.
- **Acceptance Criteria**:
  - `app/dispatcher/page.tsx` exists and renders the
    queue.
  - Tickets filtered by
    `(cityId, status, wardId?, departmentId?)`.
  - Sorted by age (oldest first).
  - 30s polling.
- **Priority**: Must

### DISP-REQ-003 — Ticket detail + transitions

- **Description**: A single ticket page with the full
  record (internal fields visible), the status trail,
  the photo gallery, and the transition buttons.
- **Acceptance Criteria**:
  - `app/dispatcher/tickets/[id]/page.tsx` exists.
  - Dispatcher serializer exposes the full record.
  - Buttons for each valid transition
  (see `lib/platform/transitions.ts`).
  - Each transition writes an `AuditEntry` and a
    `TicketTrailEntry`.
- **Priority**: Must

### DISP-REQ-004 — Re-assign to ward / department

- **Description**: The dispatcher can change the
  ticket's `wardId` and `categoryId` (and therefore
  the implied department). The change is auditable.
- **Acceptance Criteria**:
  - The re-assign UI shows ward + category dropdowns.
  - The change writes an `AuditEntry` with
    `action: 'reassign'` and a payload of the
    before/after values.
- **Priority**: Must

### DISP-REQ-005 — Internal notes

- **Description**: The dispatcher can leave a note
  visible only to crew + admin. Citizens never see
  internal notes.
- **Acceptance Criteria**:
  - The note is stored in `Ticket.internalNote?`.
  - The citizen serializer strips `internalNote`.
  - The dispatcher / crew serializers expose it.
- **Priority**: Must

### DISP-REQ-006 — Dedup-decline review

- **Description**: A view that lists all
  dedup-decline events the dispatcher has to
  arbitrate. The dispatcher can either link the two
  tickets (close the new one as a duplicate) or
  confirm the new ticket as a distinct report.
- **Acceptance Criteria**:
  - The view lists `AuditEntry` rows with
    `action: 'dedup_decline'`.
  - "Link" closes the new ticket with
    `status: 'closed'` and a note referencing the
    primary ticket.
  - "Confirm" leaves both tickets open and flags
    them for the crew.
- **Priority**: Must

### DISP-REQ-007 — Map view (optional)

- **Description**: A city map with all open tickets
  pinned. The dispatcher can click a pin to open the
  ticket detail.
- **Acceptance Criteria**:
  - The map uses MapLibre + OSM (dev) / Mapbox
    (prod).
  - Pins colored by status.
  - Click → ticket detail.
- **Priority**: Could

## Non-Functional Requirements

| Requirement | Metric | Target |
|-------------|--------|--------|
| Queue load | p95 latency | < 200ms |
| Triage throughput | Tickets / dispatcher / hour | 30 |
| Audit completeness | % of state changes audited | 100% |

## Constraints

- Dispatcher + crew sessions are bound to
  `(cityId, wardId?, departmentId?)` at login time.
- WebAuthn is **not** required for dispatchers (only
  for admins).
- Internal notes are filtered out for citizens; the
  dispatcher serializer exposes them.

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Single dispatcher per ward vs many | Product owner | WO-002 PRD | Pending |
| Re-assigning a ticket across cities | Product owner | WO-002 PRD | Out of scope (cross-city denial) |
| Map view in v1 vs v1.1 | Product owner | WO-002 PRD | Defer if not in PRD |

## Status notes

This intent is **draft**. The units and stories will
be decomposed when WO-001 ships.
