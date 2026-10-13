---
id: 008-status-transitions
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 008-status-transitions

## User Story

**As a** platform engineer
**I want** a single source of truth for the ticket
status pipeline
**So that** invalid transitions (e.g., `submitted →
resolved`) are rejected with a clear error code at the
service layer, not in scattered route handlers.

## Acceptance Criteria

- [x] **Given** `assertTransition(from, to)`, **When**
  the pair is valid, **Then** it returns `void`.
- [x] **Given** `assertTransition('submitted',
  'resolved')`, **When** called, **Then** it throws
  `ApiError({ error: 'invalid_transition' })`.
- [x] **Given** the valid pairs table, **When** a
  unit test runs, **Then** every valid + every invalid
  pair is exercised.

## Technical Notes

- Valid pairs (v1):
  - `submitted → routed`
  - `submitted → cancelled`
  - `routed → in_progress`
  - `routed → cancelled`
  - `in_progress → resolved`
  - `resolved → closed`
- `closed` and `cancelled` are terminal.
- `resolved` is terminal in the citizen view but the
  dispatcher can re-open (v1.1).
- The state machine is also exposed as a `validTransitions`
  constant for the UI (e.g., the dispatcher panel).

## Dependencies

### Requires
- 001-city-config-models (TicketStatus enum)

### Enables
- 011-first-five-endpoints (every status-changing
  endpoint)
- WO-002 dispatcher panel (transitions drive the
  buttons)
- WO-003 crew mobile (transitions drive the resolve
  action)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Same-status transition (`submitted → submitted`) | Rejected as `invalid_transition` |
| Reverse transition (`in_progress → routed`) | Rejected as `invalid_transition` |
| Cross-terminal transition (`closed → routed`) | Rejected as `invalid_transition` |
| Citizen tries to `submitted → routed` directly | Rejected as `forbidden` (role check) |
| Dispatcher tries `submitted → resolved` | Rejected as `invalid_transition` (state machine) |

## Out of Scope

- A visual state machine editor (deferred to v1.1 if
  needed).
- Per-category transition overrides (v1.1 if a category
  needs a custom path).

## Status

Done. Shipped in WO-000 (2026-10-04).