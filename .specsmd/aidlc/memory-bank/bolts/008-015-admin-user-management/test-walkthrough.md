---
stage: test
bolt: 008-015-admin-user-management
created: 2026-10-27T00:00:00Z
---

## Test Report: 005-user-management — Bolt 008-015

### Summary

- **Tests**: 3 new suites, all green.
  `tests/unit/admin-users.test.ts` (the pure
  domain logic), `tests/unit/admin/users-db.test.ts`
  (the db access layer's dev-store path), and
  `tests/27-admin-users-adoption.spec.ts` (the
  shared route + API Playwright spec, which
  also carries Bolt 008-016's assertions).
- **Coverage**: 90.89% lines / 80.85% branches
  / 94.11% functions across the suite — above
  the 80% floor.
- **Visual baseline**: NONE. The new page
  ships without a pixel baseline, by decision
  (see "Visual regression" below).

### Verification results

| Gate | Result |
|---|---|
| `npm run build` | Compiled successfully, 58/58 static pages generated |
| `npx tsc --noEmit` | clean, 0 errors |
| `npm run lint` | 0 errors, 53 warnings |
| `npm run test:unit` | 825 passed across 58 test files |
| `npm run test:unit:coverage` | 90.89% lines / 80.85% branches / 94.11% functions (80% floor) |
| `npm run test:mockups` | 15 passed, no baseline regenerated |

### Test Files

- [x] `tests/unit/admin-users.test.ts` — the
  domain logic:
  - **Role mapping** — the spec roles map
    onto the Prisma `Role` enum (with
    `supervisor` → `admin`), the Prisma roles
    map back, and the Bangla + English CSV
    role spellings parse.
  - **Name derivation** — the Bangla column is
    preferred, the plain name is the fallback.
  - **Status derivation** — the explicit
    `status` column wins; with no column the
    session state decides (no sessions ⇒
    `invited`, a live session ⇒ `active`, only
    lapsed sessions ⇒ `disabled`).
  - **Last-login derivation** — the column
    wins; the fallback is MAX(`Session.lastSeenAt`);
    null when there is nothing to derive from.
  - **Identifier derivation** — the email is
    preferred, then the phone.
  - **Identifier classification** — a mobile
    and an email are accepted; an empty, an
    over-long and a malformed identifier are
    rejected with their distinct codes.
  - **Password policy** — the four failure
    codes; the generator always produces a
    policy-compliant password.
  - **Crew resolution** — the `Crew`-model
    path and the synthetic (ward, department)
    fallback.
  - **`buildUsersList`** — citizens are
    excluded, the per-role counts are right, the
    `canLaunch` gate needs one dispatcher AND
    one crew, and the tab filter narrows the
    cards.
  - **CSV** — CRLF / LF, quoted cells with
    embedded commas, a leading BOM, doubled
    quotes, the optional header row, the
    1-based row numbering, blank-line skipping,
    the per-row scope validation (the ward /
    crew / department rules and the unknown-id
    codes), the independent per-row validation,
    and the cell escaping.
- [x] `tests/unit/admin/users-db.test.ts` —
  the db access layer, exercised on the
  dev-store path:
  - `listCityUsers` — the city filter, the
    empty case, the nullable normalisation, and
    the optional provisioning columns read off
    the row.
  - `listCityCrews` — the dev path returns `[]`.
  - `listCitySessions` — the city filter, the
    `userIds` filter and the empty-match case.
  - `listCityWards` — sorted by ward number,
    the other city excluded.
  - `listCityDepartments`.
  - `findCityUser` — the city-scope guard and
    the unknown-id case.
  - `findUserByIdentifier` — the phone match,
    the email match, the whitespace trim, the
    empty guard and the no-match case.
  - `createCityUser` / `updateCityUser` —
    the write path and the unknown-id case.
  - `deleteCityUser` — the plain delete, the
    session drop, and the two refusal cases
    (the user reported a ticket; the user is
    the assigned crew).
  - `listCityTickets` — the ISO normalisation,
    the other-city exclusion, the from-bound,
    the to-bound, both bounds, and the
    unparseable-date skip.
  - `listTicketTrail` — the empty-set guard and
    the ticket-id filter.
  - `listCityCitizens` / `listCityStaff` — the
    role partition and the epoch fallback.
- [x] `tests/27-admin-users-adoption.spec.ts` —
  the shared Playwright spec. This bolt's
  assertions:
  - **API** — GET users 200 with the list, the
    counts and `canLaunch`; GET users 401
    unauthenticated; GET users 403
    `forbidden_role` for a citizen; POST users
    201 with a `user.create` audit entry; POST
    users 400 `invalid_input` for a malformed
    body; POST users 400 `identifier_invalid`;
    POST users 400 `dispatcher_needs_ward`;
    POST users 409 `identifier_taken`; POST
    users/import 200 with the per-row report
    (2 imported, 2 failed, the file row numbers
    3 and 4); POST users/import 401.
  - **Route** — the users page renders the
    header, the tabs, the list, the form, the
    form's name and role inputs and the launch
    button.

### Acceptance Criteria Validation

- ✅ **The provisioned-user list with the role
  tabs**: pinned by the GET users 200 case
  (the list, the counts, the `canLaunch` flag)
  and by the route case (the tabs and the list
  are visible).
- ✅ **Create a dispatcher / crew member /
  supervisor with the scope rules enforced**:
  pinned by the POST users 201 case and the 400
  `dispatcher_needs_ward` case; the full scope
  matrix is covered by the unit suite's CSV row
  validation.
- ✅ **The identifier rules**: pinned by the 400
  `identifier_invalid` case, the 409
  `identifier_taken` case, and the unit suite's
  classification and match cases.
- ✅ **Update and delete, with the delete
  blocked by ticket history**: pinned by the unit
  suite's `deleteCityUser` refusal cases and the
  `updateCityUser` cases.
- ✅ **The hardware-key requirement on every
  write**: enforced by `requireWebAuthn` in all
  four write handlers; the page maps the
  `webauthn_required` / `webauthn_assertion_expired`
  error to the localized
  `admin.users.webauthn.required` copy.
- ✅ **Every write records an `AuditEntry`**
  (PLAT-REQ-007): pinned by the POST users 201
  case, which reads back `/api/v1/admin/audit`
  and asserts a `user` / `user.create` entry for
  the new user.
- ✅ **CSV bulk import with per-row reporting**:
  pinned by the POST users/import 200 case (the
  imported and failed counts and the file row
  numbers) and by the unit suite's CSV pipeline.
- ✅ **The launch gate**: pinned by the GET users
  200 case (`canLaunch` is true for the seeded
  city) and by the unit suite's `buildUsersList`
  `canLaunch` cases (one dispatcher AND one
  crew).
- ✅ **Cross-role denial**: pinned by the 401 and
  403 `forbidden_role` API cases, and by the
  page's `status.session?.role !== 'admin'`
  redirect.
- ✅ **Unit coverage of the domain logic and the
  db layer**: all three suites pass.

### Visual regression

**No baseline was added or regenerated.**
`npm run test:mockups` reports 15 passed with
no baseline regenerated. The new page's
content depends on the seeded dev store, which
the other admin specs mutate, so a pixel
baseline would be flaky across the suite's
execution order. The team rule "never merge
with failing visual regression tests" is
honoured by NOT introducing a baseline that
could fail; the route is covered by structural
assertions instead.

### Issues Found

None blocking.

Two notes recorded for follow-up:

1. **The Prisma migration
   `20261027140000_platform_gaps` is authored
   but NOT applied to any database.** The
   configured Neon instance was unreachable
   (`P1001: Can't reach database server`) when
   the migration was authored, so
   `prisma migrate dev` could not run. Apply
   with:
   ```
   npx prisma migrate deploy
   ```
   Every statement in the migration is additive
   (new columns with defaults, new tables, new
   indexes) and is safe against the
   pre-migration schema. Until it is applied,
   the surface reads the provisioning columns
   defensively and derives the missing values
   (the status and last-login derivations, the
   `nameBn` fallback and the synthetic crew
   keys), so it works against the current
   schema. **The production behaviour on the
   real database has not been exercised** — the
   verified runs above are the dev-store path.
2. **There is no per-user WebAuthn enrolment
   flag on the list card.** The page surfaces
   the `webauthn_required` error the API
   returns as a page-level banner, but the
   list payload does not carry the user's
   WebAuthn credential state, so a card cannot
   show a "not enrolled" badge. The unit brief
   files this as a v1.1 follow-up.

### Notes

- The Playwright spec is shared with Bolt
  008-016 (`tests/27-admin-users-adoption.spec.ts`)
  and covers both admin surfaces; it resets the
  dev store in `beforeEach` so each case starts
  from the demo seed.
- The bolt added no package dependency.
- `npm run lint` reports 0 errors and 53
  warnings; the warnings are pre-existing
  repo-wide and not introduced by this bolt.
