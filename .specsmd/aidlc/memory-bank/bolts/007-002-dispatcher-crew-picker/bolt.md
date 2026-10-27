---
id: 007-002-dispatcher-crew-picker
unit: 003-dispatcher-crew-picker
intent: 007-citizen-resolution-visibility
type: simple-construction-bolt
status: complete
stories:
  - 004-patch-assign-crew-endpoint-with-ward-gate-and-audit
  - 005-dispatcher-ticket-detail-picker-ui-and-visual-baseline
created: 2026-10-13T20:20:00Z
started: 2026-10-13T21:45:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-13T21:45:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-13T22:00:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-13T22:30:00Z
    artifact: test-walkthrough.md
requires_bolts:
  - 007-001-citizen-photo-and-trail-foundation
enables_bolts: []
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
estimated_files: 6
---

# Bolt 007-002 — Dispatcher Crew Picker

## Purpose

Land the **dispatcher-side handoff** of the resolution-visibility
loop in one bolt: a new dispatcher-only endpoint that lets a
dispatcher set or clear `assignedCrewId` on a ticket (with a
server-side ward-scope guard and an `AuditEntry` per write), and
the matching UI control on `/dispatcher/tickets/[id]` that lists
crew users scoped to the ticket's `wardId`.

The bolt is a self-contained feature: it does not depend on the
serializer changes from Bolt 007-001. The `requires_bolts` field
captures the team's per-bolt design-log rhythm (one bolt at a
time on `main`), not a compile-time dependency.

## Stories

### From Unit 003 (dispatcher crew picker)
| Story ID | Title | FR |
|----|-------|----|
| 004-patch-assign-crew-endpoint-with-ward-gate-and-audit | `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` endpoint with ward gate + audit | FR-3 (endpoint half) |
| 005-dispatcher-ticket-detail-picker-ui-and-visual-baseline | Dispatcher ticket-detail picker UI + visual baseline | FR-3 (UI half) |

## Files Created

- `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts` —
  new sibling route (if Sibling shape is chosen).
- `lib/dispatcher/assign-crew.ts` — service-layer function with
  `Result<Ticket, ApiError>` return shape.
- `lib/dispatcher/list-crew-for-ward.ts` — service-layer
  function.
- `tests/unit/dispatcher/assign-crew.test.ts` — ward-scope,
  role gate, audit shape, clear-assignment path.
- `tests/<NN-dispatcher-crew-picker>.spec.ts` — Playwright E2E
  (dispatcher drives the picker → `assignedCrewId` updates →
  audit row written → cross-ward reject path).
- `tests-mockups/baselines/01-mockups.spec.ts/<NN>-dispatcher-crew-picker*.png`
  — visual regression baseline (open + selected states at
  1280×800).

## Files Modified

- `app/dispatcher/tickets/[id]/page.tsx` — replace the
  read-only monospace `assignedCrewId` display with the
  labelled `<select>` picker; honour dark/high contrast
  tokens; bilingual labels.
- `lib/i18n/keys.ts` — new keys: `dispatcher.assignCrew`,
  `dispatcher.noCrewAssigned`, `dispatcher.saveAssignment`
  (English + Bangla).

## Implementation Notes

### Endpoint shape (sibling vs extension, finalized at bolt-plan)

The unit-brief leaves both shapes documented. The construction
agent picks one and records the choice in the bolt's "Decision
Log" with a single-line rationale.

**Recommendation:** Sibling route. Clean separation from the
existing dispatcher PATCH (`wardId` / `categoryId` /
`internalNote`); the existing PATCH's behaviour is preserved
unchanged; the new endpoint has its own body-validation Zod
schema and its own audit calls. Easier unit tests, no risk of
accidentally extending the existing PATCH.

### Service layer (team.md Mandated)

- `lib/dispatcher/assign-crew.ts` returns
  `Result<Ticket, ApiError>`. No throws across service
  boundaries.
- The function takes `(ticketId, assignedCrewId, actor)` and:
  1. Loads the ticket.
  2. Verifies the ticket's current `toStatus` is one the
     dispatcher can reassign in (per the existing
     `ALLOWED_BY_ROLE` map).
  3. If `assignedCrewId` is non-null, loads the crew user and
     verifies their `homeWardId` equals the ticket's `wardId`.
     Returns `403 role_cannot_assign_cross_ward` on mismatch.
  4. Writes `Ticket.assignedCrewId` (and clears it for
     `unassign_crew`).
  5. Calls `writeAudit(ticketId, actor, action, before, after)`.
  6. Returns the updated ticket.

### Trust boundary

The picker UI is a hint, not the trust boundary. The endpoint
MUST server-side verify the ward scope. The unit tests cover
the cross-ward reject path explicitly — it is the load-bearing
security boundary.

### Audit shape

`writeAudit(ticketId, actor, action, before, after)`:

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

The new `action` strings follow the existing `ticket.*` action
naming in `lib/platform/audit.ts`.

### Bilingual parity

New i18n keys ship in both English and Bangla at the same time
(per `team.md` Mandated). The typed i18n registry check runs
before the bolt merge.

## Test Strategy

Per Checkpoint 1, Q5 (test pyramid locked into `requirements.md`
NFR Compliance):

- **Unit tests:** ward-scope filter, role gate, audit-entry
  shape, clear-assignment path, cross-ward reject.
- **Playwright E2E:** one spec that drives a dispatcher session
  through the picker (open → select → save → reload → assert
  persist → clear → reload → assert cleared) and exercises the
  cross-ward reject path.
- **Visual baseline:** new baseline for the picker open +
  selected states (desktop 1280×800).

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`
- Manual: log in as a dispatcher, open
  `/dispatcher/tickets/<seeded-ticket-id>`, pick a crew
  member, save, reload, confirm the assignment persists and
  the audit row appears in the existing audit section.
- Manual: pick a crew member from a different ward (via
  dev-tools request edit), confirm the `403` response and the
  page surfaces the error message in the active locale.
- axe-core on `/dispatcher/tickets/[id]` shows zero serious
  or critical issues.
- The new visual-regression baseline is reviewed in the PR
  description (per `team.md` Forbidden).

## Out of Scope

- Citizen photo split / trail-marker filter — Bolt 007-001.
- The admin-only pure-reassign path (`/api/tickets/[id]/transition`
  with no `toStatus`). Unchanged.
- A role-escalation path. The endpoint is dispatcher-only;
  admin/citizen/crew sessions get `403` / `401`.
- Crew auto-assignment or any logic that picks a crew member
  without dispatcher input.
- Department-scoped assignment (deferred per Checkpoint 1, Q1).
- A picker that bypasses the ward gate for high-priority
  tickets (deferred per the Won't list).
- Push notifications to the crew.
- Bulk assign.

## Dependencies

### Bolt Dependencies (within intent)
- `007-001-citizen-photo-and-trail-foundation` — sequencing
  only, not compile-time. The dispatcher endpoint doesn't
  read the serializer's new fields; the order is per the
  team's per-bolt design-log rhythm (one bolt at a time on
  `main`).

### Cross-Unit Dependencies
- Existing dispatcher auth/role guard (e.g.,
  `getDispatcherFromRequest` or equivalent).
- Existing `writeAudit(...)` from `lib/platform/audit.ts`.
- Existing `ALLOWED_BY_ROLE` map from
  `app/api/tickets/[id]/transition/route.ts` — the new
  endpoint respects the same status allow-list.

### Enables (other bolts waiting on this)
- None. The intent's three FRs are all done after this bolt.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| Cross-ward assignment allowed by mistake | Server-side ward-scope guard is the load-bearing check; unit + E2E tests cover the reject path. |
| Admin escalates via the new endpoint | Endpoint is dispatcher-only by role guard; admin gets `403`. |
| Audit write fails silently | Audit is part of the same transaction; the ticket update is rolled back on audit failure. |
| Picker bypasses the ward gate via client-side manipulation | Server-side guard is the source of truth; the picker is a hint. |
| New i18n keys ship without Bangla translations | Typed registry check before each bolt merge (team.md Mandated). |
| New visual baseline hides a real regression | Per `team.md` Forbidden: baselines reviewed in PR; new PNG surfaced. |
| Touch targets < 44dp on the picker rows | Acceptance criteria enforce 48dp on the picker rows. |
| `prefers-reduced-motion: reduce` ignored on a picker open | No animations introduced; existing page transitions are unchanged. |
