---
id: 004-patch-assign-crew-endpoint-with-ward-gate-and-audit
unit: 003-dispatcher-crew-picker
intent: 007-citizen-resolution-visibility
status: ready
priority: must
created: 2026-10-13T20:15:00Z
assigned_bolt: 007-002-dispatcher-crew-picker
implemented: false
---

# Story: `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` endpoint with ward gate + audit

## User Story

**As a** dispatcher triaging a ticket at `/dispatcher/tickets/[id]`
**I want** to send a `PATCH` that assigns (or clears) the crew
member on a ticket
**So that** I can hand off the ticket to a specific crew member
without bouncing to an admin, and the assignment is auditable.

(This story is the API; the picker UI is the second story in
this unit, `005-dispatcher-ticket-detail-picker-ui-and-visual-baseline`.) From a user's perspective this story is invisible — the user sees the result of story 005. From an engineering perspective this story is the load-bearing endpoint and the trust boundary.

## Acceptance Criteria

- [ ] **Given** a dispatcher session and a ticket in `routed` state whose `wardId` is `ward_14`, **When** the dispatcher sends `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` with body `{ "assignedCrewId": "user_crew_rashid" }` AND `user_crew_rashid.homeWardId === "ward_14"`, **Then** the response is `200` with the updated ticket and `assignedCrewId: "user_crew_rashid"`.
- [ ] **Given** the same setup, **When** the dispatcher sends the same body with `assignedCrewId: null`, **Then** the response is `200` with `assignedCrewId: null` (cleared).
- [ ] **Given** a dispatcher session, **When** the dispatcher sends the endpoint with a `assignedCrewId` whose `homeWardId` is NOT equal to the ticket's `wardId`, **Then** the response is `403` with code `role_cannot_assign_cross_ward` (the picker UI is a hint, the trust boundary is the endpoint).
- [ ] **Given** an admin or crew session, **When** the admin/crew sends the endpoint, **Then** the response is `403` with code `role_cannot_assign_crew` (no role-escalation; only the `dispatcher` role may use this endpoint).
- [ ] **Given** a citizen session, **When** the citizen sends the endpoint, **Then** the response is `401` (auth required).
- [ ] **Given** the endpoint runs, **When** the assign/unassign completes, **Then** an `AuditEntry` is written via `writeAudit(...)` with `action: 'ticket.assign_crew'` or `'ticket.unassign_crew'`, `before: { assignedCrewId }`, `after: { assignedCrewId: newValue | null }`, `actor: dispatcher.id`, `ticketId`, `createdAt: now()`.
- [ ] **Given** a Vitest unit-test file `tests/unit/dispatcher/assign-crew.test.ts`, **When** the tests run, **Then** the following pass:
  - Same-ward assign → 200, ticket updated, audit written.
  - Cross-ward assign → 403, no ticket update, no audit.
  - Admin role → 403, no ticket update, no audit.
  - Citizen role → 401, no ticket update, no audit.
  - Clear assignment (`assignedCrewId: null`) → 200, ticket updated, audit written with `unassign_crew`.
- [ ] **Given** the existing dispatcher PATCH route (`app/api/v1/dispatcher/tickets/[id]/route.ts`), **When** the sibling endpoint is added, **Then** the existing route's behaviour for `wardId` / `categoryId` / `internalNote` is unchanged.
- [ ] **Given** the admin-only pure-reassign path (`/api/tickets/[id]/transition` with no `toStatus`), **When** the sibling endpoint is added, **Then** the admin-only behaviour is unchanged.
- [ ] **Given** a TypeScript compile, **When** `npx tsc --noEmit` runs, **Then** the build is clean.

## Technical Notes

- **Endpoint shape (sibling vs extension):**
  - **Sibling (preferred):** new file `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts`. Clean separation from the existing dispatcher PATCH.
  - **Extension:** the existing dispatcher PATCH accepts an optional `assignedCrewId` field; body validation rejects `assignedCrewId + toStatus` together.
  - The Construction Agent picks one with a single-line rationale in the bolt record. Both pass all acceptance criteria.
- **Service layer:** a new function in `lib/dispatcher/assign-crew.ts` returns `Result<Ticket, ApiError>` per team.md Mandated (no throws across service boundaries).
- **Body validation:** Zod schema at the route boundary per team.md Mandated.
- **Trust boundary:** the endpoint MUST verify the chosen crew member's `homeWardId` equals the ticket's `wardId` server-side. The picker UI is a hint, not the trust boundary.
- **Audit shape:** `writeAudit(ticketId, actor, action, before, after)` is the existing platform helper. The new `action` strings are `ticket.assign_crew` and `ticket.unassign_crew` — they follow the existing `ticket.*` action naming.
- **Status allow-list:** the existing `ALLOWED_BY_ROLE` map (admin has `['routed', 'in_progress', 'resolved', 'cancelled']`; dispatcher has subset) is the reference. The new endpoint only allows assignment when the ticket is in a state the dispatcher can reassign in.

## Dependencies

### Requires
- Existing dispatcher auth/role guard (e.g., `getDispatcherFromRequest` or equivalent).
- Existing `writeAudit(...)` from `lib/platform/audit.ts`.
- The citizen-side serializer changes (Unit 001 + 002) — sequencing only, not compile-time. The endpoint itself does not depend on the serializer.

### Enables
- `005-dispatcher-ticket-detail-picker-ui-and-visual-baseline` (the UI that calls this endpoint)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Ticket is in `resolved` or `cancelled` state | Endpoint rejects with `409 ticket_state_allows_no_reassign` (matching the existing `toStatus` rules). |
| Body has extra fields (e.g., `wardId`, `categoryId`) | Ignored or rejected (Zod schema rejects unknown fields — finalized at bolt-plan). |
| Concurrent assign requests from two dispatchers | Last-write-wins; both write audit rows. |
| `assignedCrewId` is an empty string `""` | Treated as `null` (clear assignment). |
| `assignedCrewId` is for a user whose role is NOT `crew` | Rejected with `400 assigned_crew_id_not_a_crew_user`. |
| Audit write fails | Endpoint returns `500`; the ticket update is rolled back (transaction). |

## Out of Scope

- The picker UI — that is story `005-dispatcher-ticket-detail-picker-ui-and-visual-baseline`.
- Crew auto-assignment or any logic that picks a crew member without dispatcher input.
- Department-scoped assignment (deferred per Checkpoint 1, Q1).
- A picker that bypasses the ward gate for high-priority tickets (explicit Won't).
- Push notifications to the crew.
- Bulk assign.
