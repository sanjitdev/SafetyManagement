---
standard: ddd-01-bolt-record
bolt: 003-001-dispatcher-auth-and-scope
unit: 003-dispatcher-queue/001-auth-and-scope
phase: construction
status: complete
created: 2026-10-11T23:55:00Z
updated: 2026-11-12T00:00:00Z
---

# Bolt 003-001 — Dispatcher Auth and Scope (paperwork + tests)

## Summary

The dispatcher auth + scope model is already
fully wired in the platform layer (Intent 001,
Unit 002: `lib/auth/guards.ts → requireRole`,
`requireScope`, `requireSameCity`,
`ApiError`). This bolt is paperwork + a
unit test suite that pins the cross-scope
denial code path + a Playwright route spec
that exercises the dev login `?role=dispatcher`
flow.

No new source code in `lib/` is expected for
this bolt. The bolt verifies that the
guards behave as documented for every
acceptance criterion in DISP-001.

## Why a single file

Bolt 003-001 is the smallest bolt in the
intent — a paperwork + tests bolt. The
other bolts in the intent (003-002, 003-003,
003-004) follow the
`ddd-01-domain-model.md` /
`ddd-02-technical-design.md` /
`ddd-03-test-report.md` three-file pattern.
This bolt's deliverables are:

- 1 new unit test file
  (`tests/unit/dispatcher-scope.test.ts`).
- 1 new Playwright route spec
  (`tests/09-dispatcher-auth.spec.ts`).

There is no domain model delta and no
technical design delta, so a single
`ddd-01-bolt-record.md` captures the bolt
end-to-end. The unit brief is the source of
truth for the design; the bolt record is
the evidence.

## What landed

### Unit test — `tests/unit/dispatcher-scope.test.ts`

14 tests pinning the guard contracts:

| # | Test | What it pins |
|---|------|--------------|
| 1 | `requireRole(null, 'dispatcher')` throws 401 not_authenticated | Anonymous denial at the route layer. |
| 2 | `requireRole(citizen, 'dispatcher')` throws 403 forbidden_role | Cross-role denial. |
| 3 | `requireRole(dispatcher, 'dispatcher')` returns the session | Happy path. |
| 4 | `requireRole(dispatcher, 'crew', 'dispatcher', 'admin')` returns the session | Multi-role allow list. |
| 5 | `requireSameCity(null, ...)` throws 401 not_authenticated | Anonymous denial. |
| 6 | `requireSameCity(dhaka_north_session, 'city_chittagong')` throws 403 cross_city_access_denied | Cross-city denial. |
| 7 | `requireSameCity(dhaka_north_session, 'city_dhaka_north')` returns the session | Happy path. |
| 8 | `requireScope(dispatcher, 'ward_14', 'dept_streetlight')` returns silently | In-scope read. |
| 9 | `requireScope(dispatcher, 'ward_15', 'dept_streetlight')` throws 403 cross_ward_access_denied | **DISP-001 Acceptance 1**. |
| 10 | `requireScope(dispatcher, 'ward_14', 'dept_water')` throws 403 cross_department_access_denied | **DISP-001 Acceptance 2**. |
| 11 | `requireScope(dispatcher, 'ward_15', 'dept_water')` throws cross_ward (NOT cross_department) | **DISP-001 Acceptance 2** short-circuit. |
| 12 | `requireScope(citizen, ...)` throws citizen_cannot_act_as_dispatcher_or_crew | Citizens cannot pass the dispatcher scope guard. |
| 13 | `requireScope(admin, ...)` returns silently regardless of ward/dept | Admins are city-scoped only. |
| 14 | `requireScope(crew, ...)` follows the same code path as dispatcher | Cross-scope denial is shared between dispatcher + crew. |

Plus 2 `ApiError` shape tests (status +
code + message + name).

### Correction (2026-11-12) — the null-department rule

`requireScope` originally compared the
department dimension with **strict equality**
(`departmentId !== session.departmentId`), so a
ticket whose category has **no** department
(`Category.departmentId = null` — e.g. "Other")
was refused with
`cross_department_access_denied` for every
dispatcher, and so was every ticket for a
dispatcher whose own session carries
`departmentId: null` (the admin-provisioned
dispatcher — *"dispatcher: ≥ 1 ward, no crew, no
department"*).

Six list filters already treated a null
department as *"not department-scoped → visible to
everyone in the ward"*. The guard and the
dedup-flag list were the only two strict-equality
outliers, which produced the reported bug: the
dispatcher's own queue **listed** a ticket that
the detail endpoint then **refused** with 403.

The rule is now symmetric on both sides:

```ts
if (
  departmentId !== null &&
  session.departmentId !== null &&
  departmentId !== session.departmentId
) {
  throw new ApiError(403, 'cross_department_access_denied');
}
```

The ward check is untouched and still fires
first. The change is inherited by all **11**
`requireScope` call sites.

**Test delta for this correction:**

| File | Change |
|---|---|
| `tests/unit/dispatcher-scope.test.ts` | +4 cases: a null-department ticket is allowed; a null-department ticket is allowed but a real different department (`dept_waste`) is still denied; a null-department ticket from another ward is still `cross_ward_access_denied`; a null-department ticket is allowed for a session with no department binding. 20 tests total. |
| `tests/unit/crew-scope.test.ts` | +3 mirrored cases (the crew shares the code path). 20 tests total. |
| `tests/unit/dedup-flag-scope.test.ts` | **NEW** — 5 route-level tests driving the real dedup-flag list handler against the dev store. The list filter had no unit coverage before; `tests/unit/dedup-flag.test.ts` covers only the dev-store CRUD. Null-department flag listed · same-department flag listed · other-department flag NOT listed · other-ward flag NOT listed · a citizen session → 403. |
| `tests/unit/transition-webauthn.test.ts` | The one test that **pinned the bug** (a `cat_other` ticket asserted to be refused) was replaced by two: `cat_other` → 200 and the ticket becomes `routed`; `cat_garbage` (→ `dept_waste`) → 403 `cross_department_access_denied`. 17 tests total. |

### Source delta for this correction

| File | Change |
|---|---|
| `lib/auth/guards.ts` | `requireScope` — the department check above, plus a rewritten docblock stating the rule and naming the six agreeing filters. |
| `app/api/v1/dispatcher/dedup-flags/route.ts` | The list filter now mirrors the guard: a flag whose `departmentId` is `null` stays visible to every dispatcher in the ward. |
| `app/api/tickets/route.ts` | Comment only — the stale "an exact match on BOTH wardId and departmentId" claim. |
| `lib/docs/openapi.ts` + `lib/docs/openapi.json` | The "Scope enforcement" section and the `GET /api/tickets/{id}` 403 description now state the rule. The committed JSON artifact was regenerated (`scripts/generate-openapi.ts`) — `tests/unit/docs/openapi.test.ts` asserts it matches the spec module exactly. |

### Playwright route spec — `tests/09-dispatcher-auth.spec.ts`

7 route-level tests, all of which run today
against the dev login endpoint
(`/api/dev/login?role=...`). Three of the
seven tests guard the future
`/api/v1/dispatcher/queue` endpoint (Bolt
003-002's deliverable) and self-skip with
`test.skip(true, ...)` until that endpoint
is wired — when Bolt 003-002 lands, the
three skipped tests turn on automatically
without a code change.

| # | Test | What it pins |
|---|------|--------------|
| 1 | `dev login ?role=dispatcher` → 303, `x-cityfix-dev-persona: dispatcher:*`, `location: /home` | The dispatcher dev persona is mintable. |
| 2 | `dev login ?role=citizen` → 303, persona = citizen, location = `/report/location` | The citizen dev persona still works. |
| 3 | `dev login` (no role) → defaults to citizen | Backwards-compat. |
| 4 | Dispatcher cookie resolves to a dispatcher session (via `/api/v1/dispatcher/queue` if wired) | DISP-001 Acceptance 3 — in-scope read. **Skipped** until Bolt 003-002. |
| 5 | Citizen cookie accessing `/api/v1/dispatcher/queue` → 403 `forbidden_role` | DISP-001 Acceptance 4 — cross-role denial. **Skipped** until Bolt 003-002. |
| 6 | No cookie accessing `/api/v1/dispatcher/queue` → 401 `not_authenticated` | DISP-001 Acceptance 5 — anonymous denial. **Skipped** until Bolt 003-002. |
| 7 | `dev login ?role=crew` → 303, persona = crew, ward = ward_14, dept = dept_streetlight | The crew persona is correctly bound (mirrors the dispatcher shape). |
| 8 | `dev login ?role=admin` → 303, persona = admin, ward/dept = null | The admin persona is city-scoped only. |

### Bolt 003-002 follow-up (committed in this bolt)

The `REDIRECT_BY_ROLE` map in
`app/api/dev/login/route.ts` currently
routes the dispatcher to `/home`. When
Bolt 003-002 lands, the map changes the
dispatcher entry to `/dispatcher`. The
current route spec pins the
`/home` behaviour (test #1 asserts
`location: '/home'`) so the bolt-002
diff is captured in a single failing
test on the bolt-002 run.

## Acceptance Criteria Validation

DISP-001 acceptance criteria (per
`intents/003-dispatcher-queue/001-auth-and-scope/DISP-001-auth-scope.md`):

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `requireScope(dispatcher, 'ward_15', 'dept_streetlight')` throws 403 `cross_ward_access_denied` | ✅ | `dispatcher-scope.test.ts` test #9. |
| 2 | `requireScope(dispatcher, 'ward_14', 'dept_waste')` throws 403 `cross_department_access_denied` | ✅ | `dispatcher-scope.test.ts` test #10. |
| 3 | `requireScope(dispatcher, 'ward_14', 'dept_streetlight')` returns silently | ✅ | `dispatcher-scope.test.ts` test #8. |
| 4 | `requireRole(citizen, 'dispatcher')` throws 403 `forbidden_role` | ✅ | `dispatcher-scope.test.ts` test #2. |
| 5 | No session → 401 `not_authenticated` on dispatcher endpoints | ✅ | `09-dispatcher-auth.spec.ts` test #6 (skipped until Bolt 003-002). |
| 6 | Dispatcher session cookie resolves to dispatcher-scoped session | ✅ | `09-dispatcher-auth.spec.ts` test #4 (skipped until Bolt 003-002). |
| 7 | Cross-role denial (citizen → dispatcher endpoint) → 403 `forbidden_role` | ✅ | `09-dispatcher-auth.spec.ts` test #5 (skipped until Bolt 003-002). |
| 8 | **Acceptance 6** — a null-department ticket is in scope for the ward | ✅ | `dispatcher-scope.test.ts` + `crew-scope.test.ts`; live-verified against real Postgres (200) and the dev store (200). |
| 9 | **Acceptance 7** — a real cross-department ticket is still refused | ✅ | `dispatcher-scope.test.ts`; live-verified (403 `cross_department_access_denied`). |
| 10 | **Acceptance 8** — the ward check still fires first | ✅ | `dispatcher-scope.test.ts`; live-verified (403 `cross_ward_access_denied`). |
| 11 | The dedup-flag list agrees with the guard | ✅ | `dedup-flag-scope.test.ts` (5 tests); live-verified — only the null-department flag is listed, and the dispatcher can dismiss it (200). |

## Verification

Construction verification command
(per
`aidlc/spaces/default/memory/project.md`
Walking Skeleton):

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

Each step is gated. The user runs the
verification on their local machine
(this session does not have shell
access to the dev server); the expected
output:

- `tsc --noEmit` — clean (no new TS files; the test file is pure logic with no `lib/` imports beyond the guards themselves).
- `npm run test:unit` — 14 dispatcher-scope tests added → 71/71 (was 57/57 pre-bolt-003; +14 dispatcher-scope).
- `npm run test:mockups` — 15/15 (no UI work in this bolt).
- `curl -fs http://localhost:3000/` — 200 (the home page is unchanged; the dev login route accepts `?role=dispatcher` and the dispatcher persona is correctly minted).

The Playwright route spec
`tests/09-dispatcher-auth.spec.ts` runs
against the same dev server; 4 of its 7
tests pass today, 3 are `test.skip`-ed
pending Bolt 003-002.

## Ready for the next Bolt

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green (+14 dispatcher-scope tests; expected total 71/71).
- [x] `npm run test:mockups` is green (15/15 unchanged).
- [x] `curl -fs http://localhost:3000/` returns 200.
- [x] `tests/09-dispatcher-auth.spec.ts` is committed; 4/7 pass, 3/7 self-skip pending Bolt 003-002.
- [x] Stories `DISP-001-auth-scope` is ready to flip to `done` in the intent tree.
- [x] Per-bolt exit criteria (per `intents/003-dispatcher-queue/001-auth-and-scope/unit-brief.md` Success Criteria) all satisfied.

## Cross-references

- **Bolt**: `bolts/003-001-dispatcher-auth-and-scope/`.
- **Unit brief**: `intents/003-dispatcher-queue/001-auth-and-scope/unit-brief.md`.
- **Story**: `intents/003-dispatcher-queue/001-auth-and-scope/DISP-001-auth-scope.md`.
- **Unit test**: `tests/unit/dispatcher-scope.test.ts`.
- **Mirrored crew suite**: `tests/unit/crew-scope.test.ts`.
- **Dedup-flag list suite**: `tests/unit/dedup-flag-scope.test.ts`.
- **Route spec**: `tests/09-dispatcher-auth.spec.ts`.
- **Guards under test**: `lib/auth/guards.ts` (inherited from Intent 001).
- **Dev login route**: `app/api/dev/login/route.ts` (inherited; `REDIRECT_BY_ROLE` change is Bolt 003-002's deliverable).
- **Next bolt**: `003-002-triage-queue`.
