---
unit: 003-dispatcher-crew-picker
intent: 007-citizen-resolution-visibility
phase: inception
status: draft
created: 2026-10-13T20:10:00Z
updated: 2026-10-13T20:10:00Z
priority: must
---

# Unit 003 — Dispatcher Crew Picker

## Purpose

Let a dispatcher assign a specific crew member to a ticket from
the dispatcher ticket-detail page, without bouncing to an admin.
The picker lists every crew user whose `homeWardId` matches the
ticket's `wardId` (ward-scoped per Checkpoint 1, Q1). Every
write goes through `writeAudit(...)` and writes an audit row
with before/after `assignedCrewId` (matching the existing
admin-only pure-reassign pattern). The admin-only pure-reassign
path is preserved (no role-escalation).

## Scope

### In Scope
- New sibling endpoint OR guarded extension of the existing
  dispatcher PATCH route. Shape (sibling vs extension) finalized
  at bolt-plan time.
  - **Sibling (preferred):** `PATCH
    /api/v1/dispatcher/tickets/[id]/assign-crew` accepts a
    `body.assignedCrewId: string | null`. Server-side guard:
    the ticket MUST be in a state that allows assignment
    (`routed` or `in_progress`), the dispatcher MUST have role
    `dispatcher`, and the chosen `assignedCrewId` (if non-null)
    MUST be a crew user whose `homeWardId` equals the ticket's
    `wardId`. Writes `AuditEntry` via `writeAudit(...)`.
  - **Extension:** the existing dispatcher PATCH route
    (`/api/v1/dispatcher/tickets/[id]/route.ts`) accepts
    `assignedCrewId` only when the body contains no `toStatus`
    field (matching the admin-only pattern's "no `toStatus`"
    rule). Same ward-scope and audit rules.
- UI control on `app/dispatcher/tickets/[id]/page.tsx`:
  `<select>` (or equivalent list control) of crew users scoped
  to the ticket's `wardId`. Selecting `null` clears the
  assignment.
- i18n keys in `lib/i18n/keys.ts`: "Assign crew" + the empty
  option "No crew assigned" in both locales.
- Test pyramid: unit (picker logic + audit shape + ward-scope
  guard), Playwright E2E (dispatcher drives the picker →
  `assignedCrewId` updates → audit row written), visual
  baseline (picker open + selected states).

### Out of Scope
- The admin-only pure-reassign path (`/api/tickets/[id]/transition`
  with no `toStatus`). Unchanged.
- A role-escalation path. The endpoint is dispatcher-only; an
  admin hitting it must get a clear `403 role_cannot_assign_crew`
  response, NOT a success.
- Crew auto-assignment or any logic that picks a crew member
  without dispatcher input.
- Department-scoped assignment (deferred — Checkpoint 1, Q1
  settled on ward-scoped).
- A picker that bypasses the ward gate for high-priority
  tickets (deferred per the Won't list).
- Push notifications or any live update to the crew.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| FR-3 | Dispatcher crew picker on the dispatcher ticket-detail page | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `User` (role `crew`) | A crew member | `id`, `name`, `nameBn`, `homeWardId`, `role: 'crew'` |
| `Ticket.assignedCrewId` | The current crew assignment (nullable) | `string \| null` |
| `AuditEntry` | An audit row | `id`, `ticketId`, `actor`, `action`, `before`, `after`, `createdAt` |
| `Ward` | A ward boundary | `id`, `name`, `nameBn` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `listCrewForWard(wardId)` | Returns crew users whose `homeWardId === wardId` | `wardId` | `User[]` (role `crew`) |
| `assignCrew(ticketId, crewUserId, actor)` | Service-layer write; verifies ward scope; writes audit row | `(string \| null)` | `Result<Ticket, ApiError>` |
| `<AssignCrewControl />` | React component on `/dispatcher/tickets/[id]` | `ticket`, `crewList`, `locale` | rendered picker |
| `writeAudit(...)` | Existing platform helper from `lib/platform/audit.ts` | `(ticketId, actor, action, before, after)` | audit row |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 2 |
| Must Have | 2 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| S-003.1 | `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` endpoint with ward gate + audit | Must | Planned |
| S-003.2 | Dispatcher ticket-detail picker UI + visual baseline | Must | Planned |

## Dependencies

### Depends On
- Unit 001 + Unit 002 (Bolt 007-001 must land first because the
  citizen-side serializer changes are independent and don't
  block this Unit; the dependency is sequencing only, not
  compile-time).
- Existing dispatcher auth/role guard
  (`getDispatcherFromRequest` or equivalent).
- Existing `writeAudit(...)` from `lib/platform/audit.ts`.

### Depended By
- None.

### External Dependencies
- The existing `app/api/v1/dispatcher/tickets/[id]/route.ts`
  (read for the existing dispatcher PATCH behaviour; do not
  modify if Sibling shape is chosen).

## Technical Context

### Suggested Technology
- Next.js Route Handlers (`app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts`).
- Zod for body validation (per team.md Mandated "type-safe boundary").
- Service-layer function in `lib/dispatcher/assign-crew.ts`
  (per team.md Mandated "Result<T, E>" return shape; no throws
  across service boundaries).
- React component on the dispatcher detail page that uses the
  existing `<select>` primitive or `FilterChipGroup`.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` (NEW) | Write | HTTP — body `{ assignedCrewId: string \| null }`, returns updated ticket |
| `GET /api/v1/dispatcher/tickets/[id]` | Read | HTTP — returns the ticket + crew list (existing, may gain `crewList` field) |
| `writeAudit(...)` | Write | In-process — every assign / unassign writes an audit row |
| Prisma client | Read + Write | ORM — `User` lookup by `wardId + role`; `Ticket.assignedCrewId` update |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `User` (crew) | Postgres rows | ≤ 50 per ward in pilot | Indefinite |
| `Ticket.assignedCrewId` | Postgres column | nullable string | Indefinite |
| `AuditEntry` | Postgres rows | 1 row per assign/unassign | Indefinite |

## Implementation Notes

### Endpoint Shape (Sibling vs Extension)

**Sibling (preferred):**
- New file: `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts`.
- Clean separation from the existing dispatcher PATCH
  (`wardId` / `categoryId` / `internalNote`). Easier unit tests,
  no risk of accidentally extending the existing PATCH.
- The endpoint sets / clears `assignedCrewId` regardless of
  `toStatus`.

**Extension:**
- The existing dispatcher PATCH accepts an optional
  `assignedCrewId` field. Body validation rejects
  `assignedCrewId + toStatus` together.
- Slightly higher coupling risk: a future change to the
  dispatcher PATCH could change `assignedCrewId` semantics.

The Construction Agent picks based on their preferred code
organisation; both pass the same acceptance criteria.

### Server-side Ward-scope Guard

Critical: the picker UI lists only ward-scoped crew, but the
trust boundary is the endpoint. The endpoint MUST verify:

```
function verifyCrewWardScope(ticket, crewUser) {
  return ticket.wardId === crewUser.homeWardId;
}
```

If the verification fails, return `403
role_cannot_assign_cross_ward`. This guard exists independent of
the picker UI; the picker is a hint, not the trust boundary.

### Audit Entry Shape

```
{
  ticketId: ticket.id,
  actor: dispatcher.id,
  action: 'ticket.assign_crew' | 'ticket.unassign_crew',
  before: { assignedCrewId: ticket.assignedCrewId },
  after: { assignedCrewId: newCrewId | null },
  createdAt: now()
}
```

The `action` string is new — matches the existing pattern in
`lib/platform/audit.ts` (other `ticket.*` actions exist; this
adds `assign_crew` and `unassign_crew`).

### Files Touched

- `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts`
  (NEW, if sibling) — or `app/api/v1/dispatcher/tickets/[id]/route.ts`
  (if extension).
- `lib/dispatcher/assign-crew.ts` (NEW) — service-layer
  function with Result<T, E> return.
- `lib/dispatcher/list-crew-for-ward.ts` (NEW) — service-layer
  function.
- `app/dispatcher/tickets/[id]/page.tsx` — add the picker control.
- `lib/i18n/keys.ts` — new keys: `dispatcher.assignCrew`,
  `dispatcher.noCrewAssigned`, and the dispatcher's `Assign
  crew` heading in both locales.
- `tests/unit/dispatcher/assign-crew.test.ts` (NEW) — ward-scope,
  role gate, audit shape.
- `tests/<NN-dispatcher-crew-picker>.spec.ts` (NEW) — Playwright
  E2E.
- `tests-mockups/baselines/01-mockups.spec.ts/` (NEW baseline) —
  picker open + selected states.

### Constraints

- The endpoint MUST server-side verify ward scope (the picker UI
  is a hint only).
- The endpoint MUST write an `AuditEntry` via `writeAudit(...)`.
- The admin-only pure-reassign path is unchanged.
- The existing dispatcher PATCH (`wardId` / `categoryId` /
  `internalNote`) is unchanged if Sibling shape is chosen.
- Bilingual parity: both English and Bangla labels ship at the
  same time.

## Success Criteria

### Functional
- [ ] A dispatcher can pick a crew member from the picker on a
      `/dispatcher/tickets/[id]` page; the choice persists and
      shows up on subsequent loads.
- [ ] A dispatcher who picks the empty option clears
      `assignedCrewId` to `null`.
- [ ] The endpoint rejects a cross-ward assignment with `403
      role_cannot_assign_cross_ward`.
- [ ] An admin hitting the endpoint gets `403`, not a success.
- [ ] Every assign / unassign writes an `AuditEntry` with
      `before` / `after` `assignedCrewId`.

### Non-Functional
- [ ] Picker opens in < 300ms p95 (crew list is small per ward,
      ≤ 50 entries in pilot).
- [ ] The audit call uses the existing `writeAudit(...)`
      helper; no new audit channel.

### Quality
- [ ] Coverage ≥ 80% (org.md scope default for `feature`
      scope).
- [ ] `npx tsc --noEmit` clean.
- [ ] All existing dispatcher route tests pass.
- [ ] Playwright E2E drives the picker and asserts the
      `assignedCrewId` update + audit row.
- [ ] New visual-regression baseline for the picker open +
      selected states.
- [ ] Bilingual typed-registry check passes.

## Bolt Suggestions

| Bolt | Type | Stories | Objective |
|------|------|---------|-----------|
| Bolt 007-002 | simple-construction | S-003.1, S-003.2 | Dispatcher crew picker — endpoint + UI + audit + tests |

## Notes

- Sibling vs Extension is the only implementation choice.
  Sibling is preferred; the Construction Agent makes the call
  with a single-line rationale in the bolt record.
- The endpoint MUST verify the ticket's current `toStatus` is
  one the dispatcher is allowed to reassign in. The existing
  `ALLOWED_BY_ROLE` map (admin has `['routed', 'in_progress',
  'resolved', 'cancelled']`; dispatcher has subset) is the
  reference; the new endpoint respects the same allow-list.
- The unit tests should cover the cross-ward reject path
  explicitly — it's the load-bearing security boundary.
