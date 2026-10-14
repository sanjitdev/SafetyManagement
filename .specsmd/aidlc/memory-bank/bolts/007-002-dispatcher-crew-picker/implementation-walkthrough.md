---
stage: implement
bolt: 007-002-dispatcher-crew-picker
created: 2026-10-13T22:00:00Z
---

## Implementation Walkthrough: 003-dispatcher-crew-picker — Bolt 007-002

### Summary

Built the dispatcher's crew assignment picker on the ticket detail page. The
picker is a `<select>` of crew members scoped to the ticket's
`(cityId, wardId)`, driven by a new GET endpoint. Choosing a crew and pressing
Save calls a new POST endpoint that updates `Ticket.assignedCrewId` and writes
a `ticket.assign_crew` (or `ticket.unassign_crew`) audit row, with a
load-bearing server-side cross-ward check so a dispatcher cannot assign a
crew member from a different ward.

### Structure Overview

- **Picker data source** — `lib/dispatcher/list-crew-for-ward.ts` is a thin
  read service that filters `User` by `cityId + role='crew' + wardId` and
  returns `{ id, name }` sorted by name. The same query is reachable from the
  GET endpoint and from the page so the picker's options are always consistent
  with the load-bearing POST check.
- **Trust boundary** — `lib/dispatcher/assign-crew.ts` is the write service
  that re-validates the chosen crew on save. It loads the ticket with trail,
  re-checks `(cityId, wardId, departmentId)`, loads the chosen user, and
  rejects non-crew / cross-ward picks with `ApiError`. Out-of-scope tickets
  return 404 (NOT 403) so a dispatcher cannot probe ticket existence outside
  their scope. Same-value no-ops return the unchanged ticket without writing
  an audit row.
- **Endpoints** — Two new routes under `app/api/v1/dispatcher/`:
  `crew-for-ward` (GET, picker options) and `tickets/[id]/assign-crew` (POST,
  save).
- **UI** — The picker is rendered in the actions sidebar of
  `app/dispatcher/tickets/[id]/page.tsx`, between the existing "Ticket status"
  card and the transition buttons. It re-fetches crew options when the
  ticket's `wardId` changes (defensive — ticket page is normally one ticket
  per visit), reads the current `assignedCrewId` from the freshly fetched
  ticket so a stale UI never overwrites a newer state, and maps server error
  codes to localized copy via `lib/i18n/keys.ts`.
- **i18n** — 9 new keys under `dispatcher.assignCrew.*` in both `bn` and
  `en`, covering heading, label, placeholder, save, saving, success, and
  three error variants.

### Completed Work

- [x] `lib/dispatcher/list-crew-for-ward.ts` — Read service: filter
  `User` by `(cityId, role='crew', wardId)`, return `[{ id, name }]`
  ordered by name ASC.
- [x] `lib/dispatcher/assign-crew.ts` — Write service: load ticket with
  trail, scope-guard, load user, role + cross-ward check, no-op on
  same-value, write `Ticket.assignedCrewId` + one audit row, return
  refreshed ticket.
- [x] `lib/dev-store.ts` — Added two extra crew users
  (`user_crew_karim` for second picker option, `user_crew_jamal` for
  cross-ward reject test) and a `user.findMany({ where, orderBy })`
  method with empty-clauses match-anything semantics.
- [x] `lib/db-switch.ts` — Routed `db.user.findMany` to the active
  backend (Prisma or in-memory dev store).
- [x] `app/api/v1/dispatcher/crew-for-ward/route.ts` — GET endpoint:
  `requireRole('dispatcher')` + same-city guard, Zod-validated
  `?wardId=`, returns `{ crew: [{ id, name }] }`.
- [x] `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts` — POST
  endpoint: `requireRole('dispatcher')`, Zod-validated body
  `{ assignedCrewId: string | min(1) | null }`, catches `ApiError` and
  serializes `{ ticket, changed }` via the dispatcher branch of
  `serializeTicketForRole`.
- [x] `lib/i18n/keys.ts` — 9 new keys under `dispatcher.assignCrew.*`
  (heading, label, placeholder, save, saving, success,
  error.cross_ward, error.not_found, error.save_failed) in `bn` and
  `en`.
- [x] `app/dispatcher/tickets/[id]/page.tsx` — Picker section in the
  actions sidebar: heading + label + `<select data-testid="...">` with
  placeholder option + crew options + error (`role="alert"`) + success
  (`role="status"`, `data-testid="dispatcher-assign-success"`) + save
  button (`data-testid="dispatcher-assign-save"`, disabled while
  in-flight). Crew options refetched on `ticket.wardId` change; draft
  synced from the latest ticket fetch.

### Key Decisions

- **Sibling endpoint shape, not sub-resource**: chose
  `POST /api/v1/dispatcher/tickets/[id]/assign-crew` over patching the
  existing `PATCH /api/v1/dispatcher/tickets/[id]` because the
  existing PATCH already covers ward / category / internalNote with
  its own audit shape; adding `assignedCrewId` there would force the
  audit action to be a conditional, and the load-bearing cross-ward
  check deserves its own clearly-named handler. A sibling route makes
  the trust boundary obvious to a code reviewer and isolates the new
  audit actions (`ticket.assign_crew` / `ticket.unassign_crew`) so the
  dashboard can grep on them.
- **No-op on same-value**: a Save click that didn't actually change
  anything returns the unchanged ticket and writes no audit row.
  Mirrors the same-ward / same-category / same-internalNote no-op
  pattern in the existing PATCH route. Keeps the audit log noise-free
  when a dispatcher re-saves without changing the pick.
- **404 on out-of-scope, not 403**: an out-of-scope ticket
  (different city / ward / department) returns 404 so a dispatcher
  cannot probe ticket existence outside their scope. Matches the
  established `loadInScope` pattern in the existing PATCH route.
- **GET endpoint for picker options, not bundle into the ticket GET**:
  keeping the crew list out of the ticket GET response keeps that
  response shape stable and lets the page refetch crew options
  independently (e.g., if the ward is later editable). The helper
  service is backend-agnostic so the Prisma path picks up the same
  filter via `db.user.findMany`.
- **Picker lives in the actions sidebar**: the right column of the
  ticket detail page is where dispatchers already act (transitions).
  Co-locating the picker keeps the dispatcher's eyes on the same
  column and matches the established "actions sidebar" pattern.

### Deviations from Plan

None. The plan called for exactly this surface, and the implementation
followed it. The two pre-existing route bugs fixed in Bolt 007-001
(`requireScope(..., null)`) did not apply here — this Bolt only adds
new routes, not modifies existing ones.

### Dependencies Added

None — no new packages. The work uses only the already-installed
`zod`, `next`, and the platform helpers (`requireRole`, `requireScope`,
`requireSameCity`, `writeAudit`, `serializeTicketForRole`).

### Developer Notes

- `db.user.findMany` in `lib/dev-store.ts` is a new switch route. If
  another Bolt later needs additional user-list filters (e.g.,
  `departmentId`), the same method takes them via the `where` clause
  and they should Just Work. The dev-store implementation uses
  `Array.filter` over a `Map` and is O(n) — fine for tests, replace
  with a real index when scaling past the in-memory store.
- The picker's `crewOptions` is keyed on `ticket.wardId` via
  `useEffect`. The ticket page is normally one ticket per visit, so
  this fires once. The defensive fetch handles the case where a
  dispatcher opens a second ticket via the same client route without
  unmounting (e.g., a future "open in new tab" flow).
- Server error codes are mapped to localized copy in
  `app/dispatcher/tickets/[id]/page.tsx`'s `onSaveAssign` handler.
  New error codes thrown by `assign-crew` need a matching key in
  `dispatcher.assignCrew.error.*` and a switch case here.
- `lib/dev-store.ts` was extended with two more crew users
  (`user_crew_karim` in `ward_14`, `user_crew_jamal` in `ward_other`)
  specifically so the cross-ward test case has a real second ward
  to attempt to assign from.
