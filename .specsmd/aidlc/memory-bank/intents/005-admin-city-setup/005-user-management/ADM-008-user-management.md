---
story: ADM-008-user-management
unit: 005-user-management
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Story: ADM-008 — Admin User Management

> The 4.6 User Provisioning surface from
> WO-004 §4.6: the internal Aamir surface
> for provisioning a city's dispatchers,
> crew members and supervisors, for seeing
> who has been provisioned, and for bulk-
> importing a roster from CSV. A previously
> deferred v1.1 surface, shipped in Bolt
> 008-015 as Unit 005 of Intent 005.

## Given / When / Then

### Acceptance 1 — List the provisioned users

**Given** an admin on
`/admin/cities/[id]/users`
**When** the page loads
**Then** the city's provisioned users are
rendered in the list column, each card
showing the Bangla name, the English name,
the identifier, the role chip, the status
chip, the ward labels, the crew label and
the last-login time. Citizens are NOT
listed (they self-register). The API
`GET /api/v1/admin/cities/[id]/users`
returns `{ users, counts, crews, wards,
departments, canLaunch }`.

### Acceptance 2 — Role tabs

**Given** the user list is rendered
**When** the admin clicks the "Dispatchers"
tab
**Then** only the users whose provisioning
role is `dispatcher` are shown. The four
tabs are All / Dispatchers / Crew /
Supervisor, and each tab's label carries the
count of that role.

### Acceptance 3 — Provision one user

**Given** an admin on the users page
**When** the admin fills the form (Bangla
name, English name, identifier, role, the
role's scope fields, an initial password and
a status) and saves
**Then** `POST /api/v1/admin/cities/[id]/users`
returns 201 with the created user, the new
user appears in the list, and a
`user.create` `AuditEntry` is written with
the actor's id and the created field set.

### Acceptance 4 — Identifier validation

**Given** an admin provisioning a user
**When** the identifier is neither a mobile
number nor an email address
**Then** the API returns 400
`identifier_invalid` and no user is
created. A mobile identifier is stored in
`User.phone`; an email identifier is stored
in `User.email`.

### Acceptance 5 — Identifier uniqueness

**Given** a city already has a user with the
identifier `+8801711000001`
**When** an admin provisions another user
with the same identifier
**Then** the API returns 409
`identifier_taken` and no user is created.
The uniqueness scope is per city.

### Acceptance 6 — Role scope rules

**Given** an admin provisioning a
dispatcher
**When** no ward is selected
**Then** the API returns 400
`dispatcher_needs_ward`. A crew member
without a crew returns 400
`crew_needs_crew`; a crew member without a
department returns 400
`crew_needs_department`; a supervisor with
a ward returns 400
`supervisor_takes_no_wards`; a supervisor
with a crew returns 400
`supervisor_takes_no_crew`.

### Acceptance 7 — Initial password policy

**Given** an admin provisioning a user
**When** the initial password is shorter
than 8 characters, or lacks a digit, a
lower-case letter or an upper-case letter
**Then** the API returns 400 with the
matching code (`password_too_short`,
`password_needs_digit`,
`password_needs_lowercase`,
`password_needs_uppercase`). The page's
"auto-generate" action produces a password
that satisfies the policy. Only the hash is
stored; the plaintext is never persisted.

### Acceptance 8 — Update a user

**Given** an admin has a user's row open in
the form
**When** the admin changes a field and saves
**Then** `PATCH /api/v1/admin/cities/[id]/users/[userId]`
returns 200 with the updated user, the list
refreshes, and a `user.update` `AuditEntry`
is written with the before and after values.

### Acceptance 9 — Delete a user

**Given** an admin has a user's row open in
the form
**When** the admin deletes the user
**Then** `DELETE /api/v1/admin/cities/[id]/users/[userId]`
returns 200 and the user is removed, together
with the user's sessions. A `user.delete`
`AuditEntry` is written. The delete is
irreversible.

### Acceptance 10 — Delete is blocked by ticket history

**Given** a user has reported a ticket or
been assigned one
**When** an admin deletes the user
**Then** the API returns 409
`user_has_tickets` and the user is NOT
deleted.

### Acceptance 11 — Hardware-key requirement

**Given** a write on the users surface
(create, update, delete or bulk import)
**When** the session has no WebAuthn
assertion
**Then** the API returns the guard's
`webauthn_required` error and the page
surfaces it with the localized
`admin.users.webauthn.required` copy. The
read-only list does NOT require WebAuthn.

### Acceptance 12 — CSV bulk import

**Given** an admin has a CSV document with
the columns `name_bn, name_en, identifier,
email, role, wards_or_crew, department`
**When** the admin pastes it into the import
modal and imports
**Then** `POST /api/v1/admin/cities/[id]/users/import`
creates every valid row, returns
`{ imported, failed, created, errors }`, and
reports each failed row with its 1-based file
row number and its per-field error codes.
Good rows are not blocked by bad rows.

### Acceptance 13 — CSV parsing tolerance

**Given** an admin's CSV document
**When** it uses CRLF endings, a UTF-8 BOM,
quoted cells containing commas, doubled
quotes, a blank line, or starts directly with
a data row (no header)
**Then** the rows are still parsed
correctly. The column ORDER is what matters,
not the presence of a header.

### Acceptance 14 — Launch gate

**Given** the city has at least one
dispatcher AND at least one crew member
**When** the users page renders
**Then** the "Setup complete — launch city"
button is enabled. If either is missing, the
button is disabled and the disabled reason
is rendered.

### Acceptance 15 — Cross-role denial

**Given** a non-admin session (citizen /
dispatcher / crew)
**When** the session calls
`GET /api/v1/admin/cities/[id]/users`
**Then** the response is 403
`forbidden_role`. Anonymous (no cookie) →
401. The page redirects a non-admin session
away from the surface.

## Technical Notes

- **The spec's `supervisor` role maps to the
  Prisma `admin` role.** The `Role` enum is
  `citizen | dispatcher | crew | admin`;
  there is no `supervisor`. The admin role
  already bypasses the (ward, department)
  scope check in `requireScope`, which is the
  spec's "read-only, no assignment" posture.
  `mapSpecRoleToPrismaRole` is the single
  translation point and carries a
  `TODO(migration)` for the future enum
  change.
- **The spec's "staff ID or mobile"
  identifier is stored in `phone` or
  `email`.** The `User` model has no
  `staffId` column. `classifyIdentifier`
  decides which; a non-email, non-mobile
  identifier is rejected with
  `identifier_invalid`.
- **The `User` model stores a single
  `wardId`.** A multi-ward dispatcher keeps
  the first ward on the row; the full list is
  reported back to the client in the
  response. There is no ward-join table.
- **The status and last-login values are
  derived when the columns are absent.** The
  in-memory dev store does not carry
  `User.status` / `User.nameBn` /
  `User.lastLoginAt` / `User.crewId`, so
  `lib/admin/users.ts` reads the real column
  when it is present and otherwise derives
  the value: no sessions ⇒ `invited`, a live
  session ⇒ `active`, only lapsed sessions ⇒
  `disabled`; the last login falls back to
  MAX(`Session.lastSeenAt`).
- **The crew list is synthesised on the dev
  path.** `lib/admin/users-db.ts` returns `[]`
  for the crews when the `Crew` model is not
  available, and `resolveCrews` then groups
  the crew members by their (ward, department)
  pair.
- **The Prisma migration
  `20261027140000_platform_gaps` is authored
  but NOT applied to any database.** The
  configured Neon instance was unreachable
  (`P1001: Can't reach database server`) when
  the migration was authored, so
  `prisma migrate dev` could not run. Apply
  with `npx prisma migrate deploy`. The
  fallbacks above keep the surface working
  before the migration lands.
- **Every state change writes an audit
  entry** via `writeAudit(...)` with
  `entityType: 'user'` and the action
  `user.create` / `user.update` /
  `user.delete` / `user.import`.

## Cross-references

- `app/admin/cities/[id]/users/page.tsx` —
  new page.
- `app/api/v1/admin/cities/[id]/users/route.ts`
  — new API (GET list, POST create).
- `app/api/v1/admin/cities/[id]/users/[userId]/route.ts`
  — new API (PATCH, DELETE).
- `app/api/v1/admin/cities/[id]/users/import/route.ts`
  — new API (POST CSV import).
- `lib/admin/users.ts` — the pure domain
  logic (new).
- `lib/admin/users-db.ts` — the db access
  layer (new).
- `lib/i18n/keys.ts` — the `admin.users.*`
  namespace (54 keys, bilingual).
- `tests/unit/admin-users.test.ts` — Vitest
  unit test (new).
- `tests/unit/admin/users-db.test.ts` —
  Vitest unit test (new).
- `tests/27-admin-users-adoption.spec.ts` —
  Playwright spec (new; shared with Unit 006;
  no visual baseline).
- `prisma/migrations/20261027140000_platform_gaps/migration.sql`
  — the pending, NOT-YET-APPLIED platform
  migration.
