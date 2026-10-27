---
unit: 005-user-management
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Unit 005 — Admin User Management (Intent 005)

## Scope

The 4.6 User Provisioning surface from WO-004
§4.6: the internal Aamir surface for
provisioning a city's staff — dispatchers,
crew members and supervisors — and for
seeing who has been provisioned.

Two columns on
`/admin/cities/[id]/users`: the
provisioned-user list (left) with role
tabs, and the add / edit form (right). A
CSV bulk-import flow, a client-generated
initial password, a "Setup complete —
launch city" bar that is enabled only
once the city has at least one dispatcher
AND one crew, and the hardware-key
(WebAuthn) requirement on every
destructive write.

The unit was deferred to v1.1 when
Intent 005 was first decomposed (the
4.6 / 4.7 surfaces were named in the
WO-004 acceptance criteria but had no
unit). It ships now, in Bolt 008-015,
as Unit 005 of this intent.

The unit reads and writes the `User`
table, so it depends on the pending
platform-layer Prisma migration
`20261027140000_platform_gaps` (see
"Platform dependency" below).

## Stories owned

| Slug | Title | Status |
|------|-------|--------|
| ADM-008 | user-management | done |

## Bolt candidate

`008-015-admin-user-management` (one
`simple-construction-bolt`).

## Reuse references

- `lib/auth/guards.ts` — `requireRole`,
  `requireWebAuthn` and the `ApiError`
  class. Every write on this surface is
  gated by `requireRole(session, 'admin')`
  + `requireWebAuthn(session)`; the list
  is gated by `requireRole` only (WebAuthn
  is a write-side property).
- `lib/auth/password.ts` — `hashPassword`;
  the plaintext is never stored.
- `lib/platform/audit.ts` — `writeAudit(...)`;
  every create / update / delete writes an
  `AuditEntry` with `entityType: 'user'`.
- `lib/db-switch.ts` — the `db.user` /
  `db.ward` / `db.department` accessors the
  read paths use. `lib/admin/users-db.ts` is
  the only place that reaches the Prisma
  client for the provisioning field set.
- `lib/i18n/keys.ts` — the `admin.users.*`
  namespace (46 keys, `{ bn, en }`).
- `app/admin/cities/page.tsx` — the city
  overview table; the row links here.

## API surface (delta)

- **New**: `app/api/v1/admin/cities/[id]/users/route.ts`
  - **GET** — list the city's provisioned
    users. Returns
    `{ users: AdminUserCard[], counts: { all, dispatcher, crew, supervisor }, crews, wards, departments, canLaunch }`.
    Gated by `requireRole('admin')`.
  - **POST** — provision one user. Gated by
    `requireRole('admin')` + `requireWebAuthn`.
    Body (Zod): `nameBn`, `nameEn`,
    `identifier`, `email?`, `role`
    (`dispatcher | crew | supervisor`),
    `wardIds?`, `crewId?`, `departmentId?`,
    `password`, `status?`. Returns 201
    `{ user }` and writes a `user.create`
    audit entry.
- **New**: `app/api/v1/admin/cities/[id]/users/[userId]/route.ts`
  - **PATCH** — update a provisioned user.
    Same gates as POST. Writes a
    `user.update` audit entry with the
    before / after values.
  - **DELETE** — delete a provisioned user.
    Same gates (the 4.6 "hardware-key
    requirement" — deletion is destructive
    and irreversible). Writes a
    `user.delete` audit entry. A user who
    has reported or been assigned a ticket
    is NOT deleted: 409 `user_has_tickets`.
- **New**: `app/api/v1/admin/cities/[id]/users/import/route.ts`
  - **POST** — bulk-provision from a CSV
    document. Gated by `requireRole('admin')`
    + `requireWebAuthn` (a bad import can
    provision dozens of accounts at once).
    Body: `{ csv, password?, skipDuplicates? }`.
    Each row is validated independently: good
    rows are created, bad rows come back with
    their 1-based file row numbers and
    per-field error codes.

### Error codes

`unauthenticated` (401), `forbidden_role`
(403), `invalid_input` (400, Zod issues
attached), `identifier_required` /
`identifier_too_long` / `identifier_invalid`
(400), `identifier_email_conflict` (400),
`identifier_taken` (409),
`password_required` / `password_too_short` /
`password_needs_digit` /
`password_needs_lowercase` /
`password_needs_uppercase` (400),
`dispatcher_needs_ward` /
`crew_needs_crew` /
`crew_needs_department` /
`supervisor_takes_no_wards` /
`supervisor_takes_no_crew` /
`ward_unknown` / `crew_unknown` /
`department_unknown` (400),
`user_not_found` (404), `user_has_tickets`
(409), `webauthn_required` (401/403, from
the guard), `unhandled` (500).

## Pages (delta)

- **New**: `app/admin/cities/[id]/users/page.tsx`
  — client-only. Auth + role gate on
  `/api/auth/status`
  (`status.session?.role !== 'admin'` →
  redirect). Left column: the user list
  with the role tabs (All / Dispatchers /
  Crew / Supervisor) and the per-role
  counts, each card showing the Bangla and
  English name, the identifier, the role
  chip, the status chip, the ward labels,
  the crew label and the last-login time.
  Right column: a sticky add / edit form
  (nameBn, nameEn, identifier, email,
  role, role-conditional ward / crew /
  department selects, password with an
  "auto-generate" button, status). Bottom:
  the sticky launch bar. Overlays: the
  CSV bulk-import modal (textarea + the
  imported / failed counts + the per-row
  error list) and the "download template"
  action.
- **Link**: `app/admin/cities/page.tsx` —
  the city overview table's per-city link
  row. (The adoption page link is Bolt
  008-016's delta; the users page is
  reachable from the adoption dashboard's
  `stale_dispatchers` health flag.)

## Services (delta)

- **New**: `lib/admin/users.ts` — the pure
  domain logic. The role mapping
  (`mapSpecRoleToPrismaRole` /
  `mapPrismaRoleToSpecRole` /
  `parseProvisionRole`), the derivations
  (`deriveUserName`, `deriveUserStatus`,
  `deriveLastLoginAt`, `deriveIdentifier`),
  the crew resolution (`resolveCrews`), the
  list builder (`buildUsersList`,
  `filterByTab`), the identifier
  classification (`classifyIdentifier`), the
  password policy (`validateInitialPassword`,
  `generateInitialPassword`) and the CSV
  pipeline (`splitCsvRows`, `parseUserCsv`,
  `validateCsvRow`, `validateUserCsv`,
  `escapeCsvCell`).
- **New**: `lib/admin/users-db.ts` — the
  db access layer. Reads
  (`listCityUsers`, `listCityCrews`,
  `listCitySessions`, `listCityWards`,
  `listCityDepartments`, `findCityUser`,
  `findUserByIdentifier`) and writes
  (`createCityUser`, `updateCityUser`,
  `deleteCityUser`). It is the SWAP POINT
  for the pending Prisma migration: the
  provisioning columns are read off the row
  defensively, so the routes and the pages
  do not change when the migration lands.

## i18n keys (delta)

New keys under `admin.users.*` (54 keys,
each `{ bn, en }`): `title`, `subtitle`,
`back`, `tab.{all,dispatcher,crew,supervisor}`,
`role.{dispatcher,crew,supervisor}`,
`status.{active,invited,disabled}`,
`cta.{add,bulkImport,downloadTemplate,launch,skip,save,cancel,delete,autoGenerate}`,
`form.{nameBn,nameEn,identifier,email,role,wards,crew,department,password,password.hint,status,supervisor.note}`,
`empty`, `lastLogin.{never,at}`,
`notAssigned`, `import.{title,columns,row,success,failed,close}`,
`launch.disabled`, `webauthn.required`.

## Tests (delta)

- **Vitest**: `tests/unit/admin-users.test.ts`
  (new) — the pure domain logic: the role
  mapping in both directions, the name /
  status / last-login derivations, the
  identifier classification, the password
  policy, the crew resolution (both the
  `Crew`-model path and the synthetic
  fallback), `buildUsersList` (counts, the
  citizen exclusion, the `canLaunch` gate),
  the tab filter, the CSV splitting /
  parsing / row validation / escaping.
- **Vitest**: `tests/unit/admin/users-db.test.ts`
  (new) — the dev-store path of every
  exported db function: the city filters,
  the city-scope guard on `findCityUser`,
  the identifier match, the create / update
  / delete writes, the "user has tickets →
  cannot be deleted" rule, the "sessions
  are dropped on delete" rule, the JS-side
  ticket date-range filter, the trail filter
  and the citizen / staff role partition.
- **Playwright**: `tests/27-admin-users-adoption.spec.ts`
  (new, shared with Unit 006) — the API
  checks (list 200 + the counts, 401, 403,
  create 201 + the audit row, 400
  `invalid_input`, 400 `identifier_invalid`,
  400 `dispatcher_needs_ward`, 409
  `identifier_taken`, import 200 with the
  per-row report, import 401) and the route
  rendering (the header, the tabs, the list,
  the form, the launch button).

**No visual baseline.** The page's content
depends on the seeded dev store, which the
other admin specs mutate, so a pixel
baseline would be flaky across the suite's
execution order. The team rule "never merge
with failing visual regression tests" is
honoured by NOT introducing a baseline that
could fail.

## Platform dependency

The unit reads `User.status`, `User.nameBn`,
`User.lastLoginAt` and `User.crewId`, and
the `Crew` model. Those columns land in the
Prisma migration
`prisma/migrations/20261027140000_platform_gaps/migration.sql`.

**That migration has NOT been applied to any
database.** The configured Neon instance was
unreachable (`P1001: Can't reach database
server`) when the migration was authored, so
`prisma migrate dev` could not run. Apply
with `npx prisma migrate deploy`.

Until it is applied, the production path
falls back cleanly: `lib/admin/users.ts`
reads the real column when it is present and
derives the value when it is absent (the
in-memory dev store does not carry the
columns), and `lib/admin/users-db.ts` returns
`[]` for the crews on the dev path, so the
crew list is synthesised from the
(ward, department) pair.

## Verification

- `npx tsc --noEmit` clean.
- `npm run test:unit` green.
- `npm run test:mockups` green.
- `curl -fs http://localhost:3000/` 200.
- `npx playwright test tests/27-admin-users-adoption.spec.ts` green.
- `npm run build` compiles successfully.
- `npm run test:unit:coverage` above the 80% floor.

## Out of scope (deferred)

- A `supervisor` role in the Prisma `Role`
  enum. The schema has no `supervisor`, so
  the spec role maps to `admin` — the role
  that already bypasses the (ward, department)
  scope check, which is the spec's
  "read-only, no assignment" posture. A
  `TODO(migration)` marks the swap point.
- A ward-join table. The `User` model stores
  a SINGLE `wardId`, so a multi-ward
  dispatcher keeps the first ward on the row;
  the full list is reported back to the
  client in the response. A v1.1 bolt may
  add the join table.
- A `staffId` column. The spec's "staff ID
  or mobile" identifier is stored in `phone`
  when it looks like a mobile and in `email`
  when it looks like an email address; a
  non-email, non-mobile identifier is
  rejected with `identifier_invalid`.
- Per-user WebAuthn enrolment status on the
  card. The page surfaces the `webauthn_required`
  error the API returns; a per-user
  "not enrolled" badge is a v1.1 follow-up.
- Invitation delivery (email / SMS to the
  provisioned staff member). The page
  surfaces the generated initial password
  once; the distribution channel is v1.1.
- The "launch city" action itself. The
  sticky bar's button is rendered and gated
  on `canLaunch`, but the
  `City.status` → `live` write is a v1.1
  follow-up.
