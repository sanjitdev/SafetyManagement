---
stage: plan
bolt: 008-015-admin-user-management
created: 2026-10-27T00:00:00Z
---

## Implementation Plan: 005-user-management — Bolt 008-015

### Objective

Ship the 4.6 User Provisioning admin surface:
an admin-only page at `/admin/cities/[id]/users`
for listing and provisioning a city's
dispatchers, crew members and supervisors,
with a CSV bulk import and the
hardware-key requirement on every write.

### Deliverables

- An admin-only users page with the role
  tabs, the provisioned-user list, a sticky
  add / edit form, a CSV import modal and a
  launch bar gated on the city's staffing.
- Three API route handlers: list + create,
  update + delete, and CSV import.
- Two service modules: the pure domain logic
  and the db access layer.
- Bilingual copy for every new surface
  string.
- Vitest suites for the domain logic and the
  db access layer, plus the shared Playwright
  spec for the route and the API.

### Dependencies

- `lib/auth/guards.ts` — `requireRole`,
  `requireWebAuthn` and the `ApiError` class.
  Every write is gated by `requireRole(session,
  'admin')` + `requireWebAuthn(session)`; the
  list is gated by `requireRole` only.
- `lib/auth/password.ts` — `hashPassword`.
- `lib/platform/audit.ts` — `writeAudit(...)`.
- `lib/db-switch.ts` — the `db.user` /
  `db.ward` / `db.department` accessors.
- `lib/i18n/keys.ts` — the new
  `admin.users.*` namespace.
- `app/admin/cities/page.tsx` — the city
  overview table's per-city link row.
- The Prisma migration
  `20261027140000_platform_gaps` (authored
  in the same batch; NOT YET APPLIED — see
  the risk section).

### Technical Approach

**Two service modules, not one.** The pure
domain logic lives in `lib/admin/users.ts` and
has no DB or Next dependency, so it is
unit-testable without a runtime. The db
access lives in `lib/admin/users-db.ts` and is
a thin, named-export wrapper over the db
facade plus the Prisma client. This split is
deliberate: the routes never touch Prisma
directly (the team rule "no raw Prisma in app
routes"), and `lib/admin/users-db.ts` is the
SINGLE swap point for the pending migration —
when `User.status`, `User.nameBn`,
`User.lastLoginAt` and the `Crew` model land,
only that module and `lib/admin/users.ts`
change; the routes and the pages do not.

**The schema gap is bridged with
derivations, not a second query layer.** The
in-memory dev store does not carry the new
columns, so the domain logic reads a real
column when it is present and derives the
value when it is absent. The mapping is
explicit and lives in one table in the module
header.

**CSV import is per-row, not all-or-nothing.**
A roster import is a bulk operation over
data the admin does not control the quality
of, so a single bad row must not block the
good ones. Each row is validated
independently; the response reports the
imported count, the failed count and each
failed row's file row number plus its
per-field error codes.

**The identifier is classified, not
free-text.** The spec calls it a "staff ID or
mobile" but the schema has no `staffId`
column. Rather than inventing a column,
`classifyIdentifier` routes a mobile-looking
value to `User.phone` and an email-looking
value to `User.email`, and rejects anything
else. Uniqueness then rides on the database's
per-city unique indexes plus an explicit
pre-check that returns a typed 409.

**No charting, no rasteriser, no new
dependencies.** The bolt adds no package
dependency.

### API contracts

- `GET /api/v1/admin/cities/[id]/users` →
  `{ users, counts, crews, wards, departments,
  canLaunch }`. 401 / 403 / 500.
- `POST /api/v1/admin/cities/[id]/users` →
  201 `{ user }`. 400 (Zod / identifier /
  password / scope), 401 / 403
  (`webauthn_required`), 409
  (`identifier_taken`), 500.
- `PATCH /api/v1/admin/cities/[id]/users/[userId]`
  → 200 `{ user }`. 400, 401 / 403, 404
  (`user_not_found`), 409, 500.
- `DELETE /api/v1/admin/cities/[id]/users/[userId]`
  → 200 `{ ok: true }`. 401 / 403, 404, 409
  (`user_has_tickets`), 500.
- `POST /api/v1/admin/cities/[id]/users/import`
  → 200 `{ imported, failed, created, errors }`
  (400 only when EVERY row failed). 400
  (`invalid_input`), 401 / 403, 500.

### Acceptance Criteria

- [x] An admin sees the city's provisioned
      users, split into role tabs, each card
      showing the names, the identifier, the
      role, the status, the ward / crew
      assignment and the last login.
- [x] An admin can create a dispatcher, a crew
      member or a supervisor, with the scope
      rules enforced by the API.
- [x] A non-mobile / non-email identifier is
      rejected with `identifier_invalid`; a
      duplicate identifier is rejected with 409
      `identifier_taken`.
- [x] An admin can update and delete a
      provisioned user; the delete is blocked
      with 409 `user_has_tickets` when the
      user has ticket history.
- [x] Every write requires a WebAuthn
      assertion; the page surfaces the
      `webauthn_required` error.
- [x] Every write records an `AuditEntry`.
- [x] An admin can bulk-import a CSV roster;
      good rows are created and bad rows are
      reported with their row numbers.
- [x] The launch button is enabled only when
      the city has at least one dispatcher AND
      one crew member.
- [x] A non-admin session is refused by both
      the API (403 `forbidden_role`) and the
      page (redirect).
- [x] The domain logic and the db access layer
      are covered by unit tests; the route and
      the API by the shared Playwright spec.
