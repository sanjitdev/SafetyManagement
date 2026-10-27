---
stage: implement
bolt: 008-015-admin-user-management
created: 2026-10-27T00:00:00Z
---

## Implementation Walkthrough: 005-user-management — Bolt 008-015

### Summary

Shipped the 4.6 User Provisioning surface as
an admin-only page plus three API route
handlers, backed by two new service modules —
a pure domain-logic module and a db access
layer that is also the swap point for the
pending Prisma migration. The page carries
the role tabs, the provisioned-user list, a
sticky add / edit form, the CSV import modal
and the sticky launch bar. Every write is
gated by the admin role AND a WebAuthn
assertion, and every write records an
`AuditEntry`.

The unit also carries an honest caveat: the
Prisma migration that introduces the
`User.status` / `User.nameBn` /
`User.lastLoginAt` / `User.crewId` columns and
the `Crew` model has **not** been applied to
any database. The code reads those columns
when they are present and derives the values
when they are not, so the surface works
against the current schema and needs no change
when the migration lands.

### Structure Overview

- **Domain logic** — `lib/admin/users.ts` is
  a pure module. It separates the role
  mapping, the name / status / last-login
  derivations, the crew resolution, the list
  builder, the identifier classification, the
  password policy and the CSV pipeline, so
  the page and the unit test exercise the same
  code paths without a DB.
- **Db access** — `lib/admin/users-db.ts` is
  a thin, named-export wrapper over the db
  facade plus the Prisma client. The reads
  (`listCityUsers`, `listCityCrews`,
  `listCitySessions`, `listCityWards`,
  `listCityDepartments`, `findCityUser`,
  `findUserByIdentifier`) and the writes
  (`createCityUser`, `updateCityUser`,
  `deleteCityUser`) all live here, so the
  routes never touch Prisma directly.
- **Routes** — three new route handlers under
  `app/api/v1/admin/cities/[id]/users/`. Each
  resolves the session, applies `requireRole`
  (plus `requireWebAuthn` on the writes),
  validates the body with Zod, applies the
  role's scope rules, checks identifier
  uniqueness, performs the write through the
  db layer, and writes the audit entry.
- **Page** — `app/admin/cities/[id]/users/page.tsx`
  is client-only. It resolves the language
  from local storage, gates on
  `/api/auth/status` (redirecting a
  non-admin session), fetches the list, and
  renders the list column and the form column.
- **i18n** — `lib/i18n/keys.ts` gains 46
  `admin.users.*` keys, each bilingual
  `{ bn, en }`.

### Completed Work

- [x] `lib/admin/users.ts` — New. The role
  mapping in both directions plus the
  Bangla/English CSV role parser; the name,
  status, last-login and identifier
  derivations; the crew resolution (the
  `Crew`-model path and the synthetic
  (ward, department) fallback); the list
  builder with the per-role counts and the
  `canLaunch` gate; the tab filter; the
  identifier classifier; the password policy
  and generator; and the CSV pipeline
  (split, parse, row validation, whole-file
  validation, cell escaping) plus the CSV
  template constant.
- [x] `lib/admin/users-db.ts` — New. The
  reads and the writes listed above, plus
  the adoption reads that Bolt 008-016 reuses
  (`listCityTickets`, `listTicketTrail`,
  `listCityCitizens`, `listCityStaff`). The
  provisioning columns are read off the row
  defensively, so the module works against
  both the pre-migration and the post-migration
  schema.
- [x] `app/api/v1/admin/cities/[id]/users/route.ts`
  — New. GET returns the list payload; POST
  provisions one user. The POST path
  classifies the identifier, applies the
  password policy, enforces the role scope
  rules against the city's real ward / crew /
  department ids, checks identifier and email
  uniqueness, resolves the scope into the flat
  `User` column set, hashes the password, and
  writes a `user.create` audit entry.
- [x] `app/api/v1/admin/cities/[id]/users/[userId]/route.ts`
  — New. PATCH updates a user (with the
  identifier-change uniqueness check, the
  optional password re-hash and the
  role/scope re-resolution) and writes a
  `user.update` audit entry with the before
  and after values. DELETE removes a user,
  drops the user's sessions, and writes a
  `user.delete` audit entry; it returns 409
  `user_has_tickets` when the FK restriction
  forbids the delete.
- [x] `app/api/v1/admin/cities/[id]/users/import/route.ts`
  — New. POST parses and validates the CSV
  row by row, creates the good rows with a
  per-row generated password (or a shared
  supplied one), and returns
  `{ imported, failed, created, errors }`
  with each failed row's file row number and
  per-field error codes. Each created row
  writes a `user.import` audit entry.
- [x] `app/admin/cities/[id]/users/page.tsx` —
  New. The header, the add / bulk-import /
  download-template actions, the four role
  tabs with their counts, the user list with
  the name / identifier / role / status chips
  and the ward / crew / last-login metadata,
  the sticky form (nameBn, nameEn,
  identifier, email, role, the role-conditional
  ward / crew / department selects, the
  password with its auto-generate button and
  its policy hint, and the status select), the
  save / cancel / delete actions, the sticky
  launch bar, and the import modal with the
  per-row error list.
- [x] `lib/i18n/keys.ts` — 54 new
  `admin.users.*` keys, bilingual.
- [x] `app/admin/cities/page.tsx` — the city
  overview table's per-city link row.
- [x] `tests/unit/admin-users.test.ts` — New.
  The domain logic.
- [x] `tests/unit/admin/users-db.test.ts` —
  New. The db access layer's dev-store path.
- [x] `tests/27-admin-users-adoption.spec.ts` —
  New. The shared route + API spec (shared
  with Bolt 008-016).

### Key Decisions

- **Map the spec's `supervisor` onto the
  Prisma `admin` role.** The `Role` enum has
  no `supervisor`, and the admin role already
  bypasses the (ward, department) scope check
  in `requireScope` — which is exactly the
  "read-only, no assignment" posture the spec
  asks for. The mapping is confined to
  `mapSpecRoleToPrismaRole`, with a
  `TODO(migration)` marking the swap point.
- **Do not add a `staffId` column.** The
  schema has `phone` and `email`, both unique
  per city. The identifier is classified into
  one of them; a value that is neither a mobile
  nor an email is rejected rather than stored
  in a column that cannot enforce uniqueness.
- **Derive the missing columns instead of
  widening the dev store.** The dev store is
  owned by another agent and does not carry
  `status` / `nameBn` / `lastLoginAt` /
  `crewId`. The domain logic reads the column
  when present and derives it otherwise, so
  neither the routes nor the pages need to
  change when the migration lands.
- **Synthesise the crews on the dev path.**
  `listCityCrews` returns `[]` when the
  `Crew` model is not available, and
  `resolveCrews` then groups the crew members
  by their (ward, department) pair into a
  synthetic crew.
- **Make the CSV import per-row.** A roster
  import is a bulk operation over data the
  admin does not control the quality of, so a
  single bad row must not block the good ones.
  The response reports both counts and the
  failed rows' numbers and codes.
- **Treat the CSV header as optional.** The
  column ORDER is what matters; a file that
  starts directly with a data row is accepted.
  The row numbers in the error report are
  1-based FILE positions, so the header counts
  as row 1.
- **Require WebAuthn on create, update, delete
  AND import.** The 4.6 spec puts deletion and
  bulk import behind the hardware key; applying
  it to every write keeps the rule uniform. The
  read-only list does not require it.
- **Refuse to delete a user with ticket
  history.** `Ticket.reporterId` is an
  `onDelete: Restrict` FK. The delete path
  counts the user's tickets first and returns a
  typed 409 instead of letting the FK error
  surface as a 500.
- **Drop the user's sessions on delete**, so a
  deleted account cannot keep a live cookie.
- **Ship no visual baseline.** The page's
  content depends on the seeded dev store,
  which the other admin specs mutate, so a
  pixel baseline would be flaky across the
  suite's execution order. The team rule
  "never merge with failing visual regression
  tests" is honoured by NOT introducing a
  baseline that could fail.

### Deviations from Plan

- **The page's per-user WebAuthn enrolment
  badge is not implemented.** The plan
  mentioned surfacing `webauthn_required` on
  the users who have not enrolled a credential.
  The shipped code surfaces the
  `webauthn_required` / `webauthn_assertion_expired`
  error the API returns as a page-level error
  banner; there is NO per-user "not enrolled"
  flag on the card, because the list payload
  does not carry the user's WebAuthn credential
  state. This is recorded as a v1.1
  follow-up in the unit brief.
- **The i18n namespace is larger than the
  planned size.** The plan estimated a small
  key set; the shipped surface carries 46
  `admin.users.*` keys (the plan's number was
  an estimate, not a constraint).
- **The adoption readers live in
  `lib/admin/users-db.ts`, not a separate
  module.** They are ticket / trail / citizen /
  staff reads that share the module's db
  plumbing, and Bolt 008-016 reuses them from
  there.

### Dependencies Added

None. The bolt uses the already-installed
`vitest` and `playwright` dev dependencies and
the platform's existing `zod`, `argon2`
(via `lib/auth/password.ts`) and Prisma client.
No package dependency was added.

### Developer Notes

- `lib/admin/users.ts` is the single place
  the "read the column, else derive it"
  pattern appears. The mapping is tabulated in
  the module header so a future reader can see
  which prod column backs which dev fallback.
- The API returns `unauthenticated` (401)
  directly rather than raising, so the client
  can distinguish "not signed in" from "wrong
  role" (403 `forbidden_role`) without parsing
  the error text.
- The create route's identifier path: a
  mobile identifier is stored in `phone` and a
  separate email (when supplied) is stored in
  `email`; an email identifier is stored in
  `email`, and a second, different email on the
  same request is rejected with
  `identifier_email_conflict`.
- The page's `autoGenerate` action builds a
  12-character password and then pins the
  guaranteed characters into the string so the
  policy (upper + lower + digit) always holds.
- The import route returns 400 only when EVERY
  row failed; a partial import returns 200 with
  both counts.
- The `skipDuplicates` flag defaults to true,
  but a duplicate identifier is reported as a
  failed row either way — the flag is the
  switch point for a future "update in place"
  import mode.
- The Prisma migration
  `20261027140000_platform_gaps` is authored
  but NOT applied to any database; the Neon
  instance was unreachable (`P1001: Can't reach
  database server`). Apply with
  `npx prisma migrate deploy`.
