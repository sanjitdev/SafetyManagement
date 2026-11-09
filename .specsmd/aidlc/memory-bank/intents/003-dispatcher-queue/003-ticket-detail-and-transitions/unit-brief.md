---
unit: 003-ticket-detail-and-transitions
intent: 003-dispatcher-queue
phase: inception
status: complete
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
---

# Unit Brief: Ticket Detail and Transitions

## Purpose

Stand up the dispatcher's per-ticket surface —
the page that shows the full ticket record
(internal fields visible), the status trail, the
photo gallery, the transition buttons, the
reassign UI, and the internal note field. This
is the workhorse surface of the dispatcher
persona.

## Scope

### In Scope

- New API: `GET /api/v1/dispatcher/tickets/[id]`
  (full record + trail).
- New API: `POST /api/v1/dispatcher/tickets/
  [id]/transition` (calls
  `transitionTicket(...)` from
  `lib/platform/transitions.ts`; dispatcher
  role allowed; the engine already validates
  the transition is legal).
- New API: `PATCH /api/v1/dispatcher/tickets/
  [id]` (reassign: change `wardId` and
  `categoryId`; set `internalNote`). Writes
  `AuditEntry` rows for each change.
- New page: `app/dispatcher/tickets/[id]/
  page.tsx`. Renders the full record, the
  status trail, the photo gallery, the
  transition buttons (one per valid
  `toStatus`), the reassign UI (ward +
  category dropdowns), the internal note
  textarea.
- Cross-ward / cross-department denial on
  every API. Out-of-scope ticket id returns
  404 (not 403, to avoid leaking ticket
  existence).

### Out of Scope

- The triage queue (Unit 002).
- The dedup-decline review (Unit 004).
- The map view (Unit 005, deferred).
- Crew-side view (Intent 004, deferred).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| DISP-REQ-003 | Ticket detail + transitions | Must |
| DISP-REQ-004 | Re-assign to ward / department | Must |
| DISP-REQ-005 | Internal notes | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Ticket` | (inherited) | full record; `internalNote` is exposed for non-citizen roles |
| `Trail` | (inherited) | `toStatus`, `actorId` (real, not anonymized for non-citizen), `note`, `timestamp` |
| `Ward` | (inherited) | `id`, `cityId`, `number`, `name`, `nameBn` |
| `Category` | (inherited) | `id`, `cityId`, `slug`, `name`, `nameBn`, `departmentId?` |
| `AuditEntry` | (inherited) | `entityType='ticket'`, `action='ticket.transition' | 'reassign' | 'internal_note'`, `beforeValue`, `afterValue` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `GET /api/v1/dispatcher/tickets/[id]` | Full ticket record + trail | path id | `SerializedTicket` |
| `POST /api/v1/dispatcher/tickets/[id]/transition` | Transition the ticket | `{ toStatus, note? }` | `{ status, trail }` |
| `PATCH /api/v1/dispatcher/tickets/[id]` | Reassign or set internal note | `{ wardId?, categoryId?, internalNote? }` | `{ ... }` |
| `serializeTicketForRole('dispatcher', ticket, trail)` | Full record | role, ticket, trail | `SerializedTicket` |
| `transitionTicket({ ticketId, toStatus, actorId, note? })` | Engine | input | `void` (writes audit + trail) |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 3 |
| Must Have | 3 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| DISP-003-ticket-detail | Dispatcher ticket detail (full record + trail + transitions) | Must | in-progress |
| DISP-004-reassign | Re-assign to ward / department | Must | in-progress |
| DISP-005-internal-notes | Internal notes (dispatcher-only field) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `db.ticket.findUnique`, `transitionTicket` |
| Intent 001 (Unit 001) | `serializeTicketForRole` |
| Intent 003 (Unit 001) | `requireScope` |
| Intent 002 (Unit 004) | `app/reports/[id]/page.tsx` (the citizen-side detail; the dispatcher reuses the trail-blame component but with a different serializer branch) |
| Intent 002 (Unit 005) | Theme + i18n |

### Depended By

| Unit | Reason |
|------|--------|
| 004-dedup-decline-review | The "View ticket" CTA in the dedup view links here |

## Technical Context

### Suggested Technology

- New API routes:
  - `app/api/v1/dispatcher/tickets/[id]/
    route.ts` (GET + PATCH).
  - `app/api/v1/dispatcher/tickets/[id]/
    transition/route.ts` (POST).
- New page: `app/dispatcher/tickets/[id]/
  page.tsx`. Client component for the
  interactive controls (transition buttons,
  reassign dropdowns, internal note
  textarea).
- Zod schemas at every API boundary (per
  team.md Mandated).
- `writeAudit(...)` for reassign +
  `internalNote` writes (per team.md
  Mandated).
- `transitionTicket(...)` for status
  transitions (the engine writes audit +
  trail atomically).

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/dispatcher/tickets/[id]/page.tsx` → `GET /api/v1/dispatcher/tickets/[id]` | HTTP | GET (no polling; the detail page does not poll — the dispatcher re-fetches to see updates) |
| `app/dispatcher/tickets/[id]/page.tsx` → `POST /api/v1/dispatcher/tickets/[id]/transition` | HTTP | POST |
| `app/dispatcher/tickets/[id]/page.tsx` → `PATCH /api/v1/dispatcher/tickets/[id]` | HTTP | PATCH |
| `app/api/v1/dispatcher/tickets/[id]/transition/route.ts` → `lib/platform/transitions.ts` | in-process | function call |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `Ticket` rows | SQL | medium (per-city) | until terminal status |
| `TrailEntry` rows | SQL | one per transition | permanent (audit) |
| `AuditEntry` rows for `reassign` / `internal_note` | SQL | one per write | permanent (audit) |

## Constraints

- The detail page does NOT poll. v1.1 may add
  polling or WebSocket. Recorded as an
  explicit v1 choice (not an oversight).
- The reassign UI shows ward + category
  dropdowns filtered to the dispatcher's
  city. Cross-city reassignment is denied.
- Out-of-scope ticket id returns 404 (not
  403) to avoid leaking ticket existence.
- Every state change writes an `AuditEntry`.

## Success Criteria

### Functional

- [ ] `GET /api/v1/dispatcher/tickets/[id]`
      returns the full record (incl.
      `internalNote`, real `actorId`).
- [ ] A dispatcher bound to ward_14 cannot
      read a ward_15 ticket (404).
- [ ] Transition buttons show only valid
      `toStatus` per `ALLOWED` in
      `lib/platform/transitions.ts`.
- [ ] Reassign writes `AuditEntry` with
      `action: 'reassign'` and
      `beforeValue` / `afterValue`.
- [ ] `internalNote` writes `AuditEntry` with
      `action: 'internal_note'`.
- [ ] The status trail renders every entry
      with the real `actorId`.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.
- [ ] `npm run test:mockups` is green.
- [ ] Visual regression baselines for the
      detail page (3 states: `submitted`,
      `routed`, `in_progress`; light theme,
      1440x900).

### Quality

- [ ] Unit tests for the transition engine
      (already in `lib/platform/transitions.ts`
      test surface; this unit may add a test
      for the dispatcher's branch).
- [ ] Playwright route spec
      `tests/11-dispatcher-detail-light.spec.ts`.
- [ ] Visual baselines committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit
because the work is one detail page + two API
routes + one test spec. The transition engine
+ serializer are inherited; no from-scratch
build.

## Notes

The dispatcher detail page reuses the
`TicketTrailEntry` rendering from
`app/reports/[id]/page.tsx` (the citizen
detail) but with the dispatcher branch of
`serializeTicketForRole` (real `actorId`).
The shared component is
`components/TicketTrail.tsx` (or the
inline-render variant used in the citizen
detail; this unit may extract the shared
component if the citizen detail is the
right shape).
