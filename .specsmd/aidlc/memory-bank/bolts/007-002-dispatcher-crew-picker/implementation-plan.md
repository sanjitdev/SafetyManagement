---
stage: plan
bolt: 007-002-dispatcher-crew-picker
created: 2026-10-13T21:45:00Z
---

## Implementation Plan: Dispatcher Crew Picker

### Objective

Land the **dispatcher-side handoff** of the resolution-visibility
loop in one bolt. A new dispatcher-only endpoint lets the
dispatcher set or clear `assignedCrewId` on a ticket, with a
server-side ward-scope guard and an `AuditEntry` per write. The
matching UI on `/dispatcher/tickets/[id]` lists crew users scoped
to the ticket's `wardId`.

This completes Intent 007 (citizen resolution visibility) — the
three FRs from the intent are all delivered (FR-1 + FR-2 from
Bolt 007-001; FR-3 from this bolt).

### Deliverables

- `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts` —
  new sibling POST endpoint (dispatcher-only, body
  `{ assignedCrewId: string | null }`).
- `lib/dispatcher/assign-crew.ts` — service-layer function.
  Throws `ApiError` on every documented failure (matches the
  existing dispatcher PATCH pattern — see
  `app/api/v1/dispatcher/tickets/[id]/route.ts` for the
  established shape; team.md's "Result<T, E>" preference is
  unwritten at this layer, so we follow the codebase).
- `lib/dispatcher/list-crew-for-ward.ts` — service-layer
  function that returns the `{ id, name }[]` of crew users
  bound to a (cityId, wardId) pair. Used by both the endpoint
  (to validate the chosen crew is in the ward) and the page
  (to populate the picker dropdown).
- `lib/dev-store.ts` — add `user.findMany({ where: { cityId,
  role, wardId? } })` and the matching `db.user.findMany` switch
  in `lib/db-switch.ts` so the picker can list crew users. The
  Prisma path uses `prisma.user.findMany({ where: { cityId,
  role: 'crew', wardId } })`.
- `app/dispatcher/tickets/[id]/page.tsx` — add a new
  "Assign crew" section in the actions sidebar; on save, POST
  to the new endpoint; on success, refresh the ticket snapshot.
  The existing read-only monospace `assignedCrewId` field stays
  in the record list (it's still the "what" view; the picker is
  the "how" view).
- `lib/i18n/keys.ts` — new keys:
  - `dispatcher.assignCrew.heading` (en + bn)
  - `dispatcher.assignCrew.label` (en + bn)
  - `dispatcher.assignCrew.placeholder` (en + bn) — the
    "Unassigned" option in the dropdown
  - `dispatcher.assignCrew.save` (en + bn)
  - `dispatcher.assignCrew.saving` (en + bn)
  - `dispatcher.assignCrew.error.cross_ward` (en + bn)
  - `dispatcher.assignCrew.success` (en + bn)
- `tests/unit/dispatcher/assign-crew.test.ts` — service-layer
  unit tests (6 cases: happy-path assign, clear via null,
  cross-ward reject, non-existent crew, non-dispatcher actor,
  audit shape).
- `tests/unit/dispatcher/list-crew-for-ward.test.ts` — service
  unit tests (4 cases: returns only crew role, only the
  requested ward, empty when none seeded, omits admins/citizens).
- `tests/21-dispatcher-crew-picker.spec.ts` — Playwright E2E
  (4 cases: open page → see picker, pick crew → save →
  assignedCrewId updates, clear → assignedCrewId is null,
  cross-ward reject surfaces an error).
- `tests-mockups/baselines/21-dispatcher-crew-picker.spec.ts/dispatcher-crew-picker-1280x800.png` —
  visual regression baseline for the new picker section at
  desktop.

### Dependencies

- `db.user.findMany` — does not exist; must be added to
  `lib/dev-store.ts` + `lib/db-switch.ts` (additive, no
  schema change).
- `requireRole(session, 'dispatcher')` — existing.
- `writeAudit(...)` from `lib/platform/audit.ts` — existing.
- The existing `lib/auth/guards.ts` `requireScope` for the
  cross-ward reject (already used in
  `app/api/v1/dispatcher/tickets/[id]/route.ts`).
- The existing `ALLOWED_BY_ROLE` map is for status transitions
  and is NOT relevant here — the picker is a separate concern.

### Technical Approach

**Endpoint shape: Sibling.** Per the bolt's recommendation
(clean separation from the existing PATCH; own Zod schema;
own audit calls; easier unit tests). Method: `POST
/api/v1/dispatcher/tickets/[id]/assign-crew` with body
`{ assignedCrewId: string | null }`. Returns the refreshed
ticket payload via the existing `serializeTicketForRole`
dispatcher branch.

**Service layer.** `lib/dispatcher/assign-crew.ts` exports
`assignCrew(args, session)` which:
1. Loads the ticket with `getTicketWithTrail(id)`.
2. Runs `requireSameCity(session, ticket.cityId)` +
   `requireScope(session, ticket.wardId, ticket.departmentId)`.
   Both throw `ApiError` (caught in the route).
3. If `args.assignedCrewId` is non-null:
   - Loads the crew user with `db.user.findUnique`.
   - Verifies `crew.role === 'crew'`.
   - Verifies `crew.wardId === ticket.wardId`. Throws
     `ApiError(403, 'cross_ward_access_denied')` on mismatch
     — this is the load-bearing ward-scope check.
4. Computes `beforeValue = { assignedCrewId: ticket.assignedCrewId }`
   and `afterValue = { assignedCrewId: args.assignedCrewId }`.
   Same → returns the ticket without an audit row (idempotent
   save).
5. Updates the ticket with `db.ticket.update`.
6. Writes the audit row with
   `action: assignedCrewId === null ? 'ticket.unassign_crew' : 'ticket.assign_crew'`.
7. Returns the refreshed ticket via `getTicketWithTrail`.

`lib/dispatcher/list-crew-for-ward.ts` exports
`listCrewForWard({ cityId, wardId })` which calls
`db.user.findMany({ where: { cityId, role: 'crew', wardId } })`
and returns `[{ id, name }, ...]` ordered by name ASC. The
dev store + Prisma both need the new `user.findMany` switch.

**Trust boundary.** The page is a hint; the service is the
authority. The endpoint MUST verify ward scope server-side.

**Audit shape.**

```ts
await writeAudit({
  entityType: 'ticket',
  entityId: ticket.id,
  action: assignedCrewId === null
    ? 'ticket.unassign_crew'
    : 'ticket.assign_crew',
  actorId: session.userId,
  beforeValue: { assignedCrewId: prev },
  afterValue: { assignedCrewId: next },
});
```

Two actions rather than one, so the audit dashboard can grep
on either. Same shape as the existing
`ticket.after_photo_added` action from Bolt 007-001.

**UI changes.** The `app/dispatcher/tickets/[id]/page.tsx`
adds a new section to the actions sidebar (the right column).
The section has:
- A heading (`dispatcher.assignCrew.heading`).
- A `<select>` (`dispatcher.assignCrew.label`) with:
  - One option per crew member from `listCrewForWard`.
  - A "Unassigned" placeholder option (`assignedCrewId === null`).
- A "Save" button (`dispatcher.assignCrew.save`).
- A "Saving" state (`dispatcher.assignCrew.saving`) while the
  POST is in flight.
- A success toast / inline confirmation
  (`dispatcher.assignCrew.success`).
- An error line for `cross_ward_access_denied` and other
  failures (`dispatcher.assignCrew.error.cross_ward` + the
  fallback generic error).

The existing read-only `assignedCrewId` row in the record list
is unchanged — the picker lives in the actions sidebar so the
record view stays stable.

The picker is rendered on every ticket status (the bolt
allows reassignment in any status the dispatcher can act on;
in v1 that's `['routed', 'cancelled']` per
`DISPATCHER_ALLOWED`, but the picker itself is always visible
because the dispatcher may want to assign a crew before
transitioning to `routed`).

### Acceptance Criteria

- [x] POST /api/v1/dispatcher/tickets/[id]/assign-crew with
      `{ assignedCrewId: 'user_crew_rashid' }` and a valid
      dispatcher session updates the ticket's `assignedCrewId`
      and returns the refreshed payload.
- [x] POST with `{ assignedCrewId: null }` clears the
      assignment.
- [x] POST with a crew user whose `wardId` ≠ ticket.wardId
      returns 403 `cross_ward_access_denied`.
- [x] Non-dispatcher session (citizen/crew/admin) gets 403
      `forbidden_role` / 401.
- [x] Out-of-scope ticket id (different city / ward) returns
      404 `not_found` (not 403) — same shape as the existing
      PATCH.
- [x] Each successful write produces one AuditEntry with the
      correct action (`ticket.assign_crew` or
      `ticket.unassign_crew`), `beforeValue`, `afterValue`,
      and `actorId`.
- [x] The picker is rendered on `/dispatcher/tickets/[id]`
      with only crew users from the ticket's ward.
- [x] Saving a selection updates the page (the `assignedCrewId`
      row in the record list and the picker's selected option).
- [x] All new i18n keys have both Bangla and English entries.
- [x] `npx tsc --noEmit` clean.
- [x] `npm run test:unit` green (10 new unit cases).
- [x] `npm run test:mockups` green (1 new visual baseline
      added; existing 15 mockups + 2 Bolt 007-001 baselines
      unaffected).
- [x] `curl -fs http://localhost:3000/` returns 200.

### Out of Scope

- Department-scoped assignment (deferred — the team decided
  department scope is a v1.1 concern).
- Bulk assign.
- Push to the crew member.
- A "high-priority override" that bypasses the ward gate.
- A pure-reassign admin path (admin already has one via
  `/api/tickets/[id]/transition` with `assignedCrewId`).
- The dispatcher PATCH extension for crew (we picked the
  Sibling shape; the existing PATCH is unchanged).
