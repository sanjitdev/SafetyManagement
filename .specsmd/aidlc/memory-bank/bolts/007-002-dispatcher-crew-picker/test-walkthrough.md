---
stage: test
bolt: 007-002-dispatcher-crew-picker
created: 2026-10-13T22:30:00Z
---

## Test Report: 003-dispatcher-crew-picker — Bolt 007-002

### Summary

- **Tests**: 40 passed / 40 total
  - 20 new unit tests (Vitest)
  - 18 new Playwright route tests (1 visual baseline + 17 live API
    + UI flow checks)
  - 2 pre-existing visual baselines covering the broader dispatcher
    detail page (already in place before this Bolt)
- **Coverage**: bolt adds a backend-agnostic helper
  (`listCrewForWard`), a backend-agnostic write service
  (`assignCrew`), two new route handlers, and one new UI section
  (the picker). Every branch is covered by at least one test.
- **Visual baseline**: new file
  `tests-mockups/baselines/21-dispatcher-crew-picker.spec.ts/dispatcher-crew-picker-1280x800.png`
  captured at the dispatcher's 1280×800 desktop view of the
  ticket detail page; the picker is visible in the actions
  sidebar in its populated state.

### Test Files

- [x] `tests/unit/dispatcher/assign-crew.test.ts` — 13 unit
  cases covering happy-path assign, clear via null, same-value
  no-op (assign → assign same), same-value no-op (null → null),
  cross-ward reject, non-crew user reject, non-existent user,
  out-of-scope ticket (different ward), out-of-scope ticket
  (different city), missing ticket, audit row shape, reassign
  audit rows, round-trip with `getTicketWithTrail`.
- [x] `tests/unit/dispatcher/list-crew-for-ward.test.ts` — 7
  unit cases covering the helper service: ward-scoped results,
  cross-ward isolation, cross-ward scoped to the other ward,
  role filter (omits admin/citizen/dispatcher), empty when no
  crew seeded for the ward, empty for a different city, and the
  shape contract (only `id` + `name` keys).
- [x] `tests/21-dispatcher-crew-picker.spec.ts` — 18 Playwright
  cases: 5 GET crew-for-ward checks (happy path, cross-ward
  isolation, 401, 403 citizen, 400 missing wardId), 9 POST
  assign-crew checks (happy path, clear, same-value no-op,
  cross-ward reject, non-crew, non-existent, out-of-scope, bad
  body, missing ticket), 3 UI flow checks (picker renders,
  pick + save updates the ticket, clear via placeholder), and
  1 visual baseline at 1280×800.

### Acceptance Criteria Validation

- ✅ **The picker is a `<select>` of crew users scoped to the
  ticket's `(cityId, wardId)`**: confirmed by
  `tests/21-dispatcher-crew-picker.spec.ts:454` (picker
  renders with `['user_crew_karim', 'user_crew_rashid']`
  options; cross-ward `user_crew_jamal` is not in the list).
- ✅ **Choosing a crew and pressing Save calls a new POST
  endpoint that updates `Ticket.assignedCrewId`**: confirmed by
  `tests/21-dispatcher-crew-picker.spec.ts:493` (UI pick + save
  → ticket.assignedCrewId updates; visible via the API on
  next GET) and `tests/unit/dispatcher/assign-crew.test.ts:64`
  (assign crew → ticket.assignedCrewId === DEV_CREW_ID).
- ✅ **Cross-ward `Assign` is rejected with
  `cross_ward_access_denied` (403) on the server side**:
  confirmed by `tests/21-dispatcher-crew-picker.spec.ts:306`
  (cross-ward reject → 403 cross_ward_access_denied) and
  `tests/unit/dispatcher/assign-crew.test.ts:142`
  (cross_ward_access_denied is the load-bearing ward-scope
  check; the dispatcher cannot bypass the picker filter with a
  hand-crafted payload).
- ✅ **Non-crew user is rejected with `forbidden_role` (403)**:
  confirmed by `tests/21-dispatcher-crew-picker.spec.ts:330`
  (citizen → 403 forbidden_role) and
  `tests/unit/dispatcher/assign-crew.test.ts:159`
  (DEV_CITIZEN_ID → 403 forbidden_role).
- ✅ **Non-existent user returns 404 `not_found`**: confirmed
  by `tests/21-dispatcher-crew-picker.spec.ts:350` and
  `tests/unit/dispatcher/assign-crew.test.ts:176`.
- ✅ **Out-of-scope ticket returns 404 `not_found` (NOT 403)**:
  confirmed by `tests/21-dispatcher-crew-picker.spec.ts:369`
  (cross-ward ticket → 404 not_found) and
  `tests/unit/dispatcher/assign-crew.test.ts:194` (cross-ward
  + cross-city → 404 not_found; the route catches ApiError and
  serialises to 404 so a dispatcher cannot probe ticket
  existence outside their scope).
- ✅ **An audit row is written with action `ticket.assign_crew`
  / `ticket.unassign_crew` and `{ assignedCrewId: prev | next }`
  in before / after**: confirmed by
  `tests/unit/dispatcher/assign-crew.test.ts:64` (assign → row
  with `beforeValue: { assignedCrewId: null }, afterValue: {
  assignedCrewId: DEV_CREW_ID }`) and `:90` (clear → row with
  `ticket.unassign_crew` action + swapped prev/next).
- ✅ **Same-value no-op returns the unchanged ticket and writes
  no audit row**: confirmed by
  `tests/unit/dispatcher/assign-crew.test.ts:108` (assign →
  assign same → changed=false, no audit row) and `:124`
  (null → null → changed=false, no audit row).
- ✅ **`npx tsc --noEmit` clean**: confirmed by the
  Construction Stage 2 verification; the picker integration
  adds no new TypeScript errors.
- ✅ **All existing unit + mockup baselines remain green**:
  `npm run test:unit` reports 365/365 passing across 37 test
  files (no regression from this Bolt). `npm run test:mockups`
  reports 15/15 mockup baselines passing (no regression).
- ✅ **Visual baseline captured at
  `tests-mockups/baselines/21-dispatcher-crew-picker.spec.ts/dispatcher-crew-picker-1280x800.png`**:
  the dispatcher's full ticket detail page at 1280×800
  (English, light theme) showing the picker populated with the
  two ward-14 crew options in the actions sidebar.

### Issues Found

None blocking. Two findings from the test cycle:

1. **Dev-store `audit.findMany` sort is not stable for ties**:
  Two `assignCrew` calls landing in the same millisecond
  produce audit rows with identical timestamps, and the dev
  store's `audit.findMany` sort comparator
  `(a, b) => (a.timestamp < b.timestamp ? -1 : 1)` returns `1`
  on tie, reversing the array order. This is a pre-existing
  dev-store quirk, not a Bolt 007-002 regression. The
  `reassign from one crew to another` unit test resolves this
  by looking up rows by their `(before, after)` shape rather
  than by index. No production-side impact — Prisma's
  `findMany` orderBy is monotonic.
2. **Playwright dedup collision**: a fixed `(lat, lng)` for
  fresh cat_streetlight tickets collides with earlier tests'
  tickets after the dev store accumulates state. Resolved by
  adding a `test.beforeEach` that POSTs `/api/dev/reset` to
  wipe the dev store between tests; this is the same pattern
  Bolt 007-001's `20-citizen-photo-and-trail-light.spec.ts`
  would need if it runs alongside `21-` without isolation.
  The reset is dev-store-only (404 in prod) and is the same
  endpoint the human-tester hits when stepping through the
  demo multiple times.

### Notes

- The unit test for "reassign from one crew to another" was
  the only test that needed the dev-store-sort workaround;
  every other test passes via straightforward `expect(...).toBe`
  / `toEqual` assertions because the row index is unambiguous
  (only one audit row exists per call).
- The visual baseline test waits for the picker's crew fetch
  to resolve (`option[value="user_crew_rashid"]` becomes
  attached) before snapshotting. Without this wait, the
  baseline captures the picker in its empty / fetch-pending
  state, which is not a stable baseline. The wait is
  explicit in the test (`5_000ms`) so a regression in the
  picker fetch surfaces as a test failure, not a stale
  baseline.
- The Playwright spec uses `forceLightTheme(page)` to set
  the localStorage language + appearance preference, matching
  the established pattern in
  `tests/11-dispatcher-detail-light.spec.ts`. The visual
  baseline is therefore an "English light theme" snapshot,
  the same as every other dispatcher-detail baseline.
- The `cross_ward_access_denied` error code is the load-
  bearing check: even if a dispatcher crafts a request
  bypassing the UI's ward-scoped picker (e.g., by guessing
  another ward's crew id), the server rejects with 403. The
  unit test at `tests/unit/dispatcher/assign-crew.test.ts:142`
  and the Playwright test at
  `tests/21-dispatcher-crew-picker.spec.ts:306` both pin this
  contract.
- The same-value no-op is part of the contract: a dispatcher
  who hits Save without changing the picker selection should
  not pollute the audit log. The unit tests pin this for both
  `assign → assign same` and `null → null` flows.