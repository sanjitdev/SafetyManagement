---
id: 008-015-admin-user-management
unit: 005-user-management
intent: 005-admin-city-setup
type: simple-construction-bolt
status: complete
stories:
  - ADM-008-user-management
created: 2026-10-27T00:00:00Z
started: 2026-10-27T00:00:00Z
completed: 2026-10-27T00:00:00Z
updated: 2026-10-27T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: 2026-10-27T00:00:00Z
    artifact: implementation-plan.md
  - name: implement
    completed: 2026-10-27T00:00:00Z
    artifact: implementation-walkthrough.md
  - name: test
    completed: 2026-10-27T00:00:00Z
    artifact: test-walkthrough.md
requires_bolts: []
enables_bolts:
  - 008-016-admin-adoption-dashboard
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 2
  testing_scope: 4
  estimated_files: 11
---

# Bolt 008-015 — Admin User Management

## Purpose

Land the 4.6 User Provisioning surface from
WO-004 §4.6 — a previously deferred v1.1
admin surface — as Unit 005 of Intent 005.

The bolt ships:

1. **ADM-008** — an admin-only page at
   `/admin/cities/[id]/users` for listing and
   provisioning a city's dispatchers, crew
   members and supervisors: a role-tabbed
   list, an add / edit form, a CSV bulk
   import, a generated initial password, and
   a "Setup complete — launch city" bar gated
   on the city having at least one dispatcher
   AND one crew.
2. Three API route handlers (list + create,
   update + delete, CSV import), all
   `requireRole('admin')`, with every write
   additionally gated by `requireWebAuthn`
   (the 4.6 "hardware-key requirement").
3. Two new service modules —
   `lib/admin/users.ts` (the pure domain
   logic) and `lib/admin/users-db.ts` (the db
   access layer, and the swap point for the
   pending Prisma migration).
4. 54 new bilingual `admin.users.*` i18n keys.

## Stories

### From Unit 005 (user management)
| Story ID | Title | FR |
|----|-------|----|
| ADM-008-user-management | Admin user provisioning surface: list, create, update, delete, CSV import | WO-004 §4.6 |

## Files Modified

- `app/admin/cities/[id]/users/page.tsx` — new
  page. The role tabs, the user list, the
  sticky add / edit form, the CSV import
  modal, the sticky launch bar, and the
  auth + role gate.
- `app/api/v1/admin/cities/[id]/users/route.ts`
  — new API. GET (list) + POST (create).
- `app/api/v1/admin/cities/[id]/users/[userId]/route.ts`
  — new API. PATCH (update) + DELETE
  (delete, blocked when the user has
  tickets).
- `app/api/v1/admin/cities/[id]/users/import/route.ts`
  — new API. POST (CSV bulk import).
- `lib/admin/users.ts` — new. The pure domain
  logic.
- `lib/admin/users-db.ts` — new. The db
  access layer.
- `lib/i18n/keys.ts` — 54 new
  `admin.users.*` keys, bilingual `{ bn, en }`.
- `app/admin/cities/page.tsx` — the city
  overview table's per-city link row.
- `tests/unit/admin-users.test.ts` — new
  Vitest suite.
- `tests/unit/admin/users-db.test.ts` — new
  Vitest suite.
- `tests/27-admin-users-adoption.spec.ts` —
  new Playwright spec (shared with Bolt
  008-016).

## Implementation Notes

### Role mapping

The Prisma `Role` enum is
`citizen | dispatcher | crew | admin`. The
4.6 spec's three provisioning roles are
Dispatcher, Crew member and Supervisor.
There is NO `supervisor` role in the schema.

The v1 mapping is:

| Spec role | Prisma role | Why |
|---|---|---|
| Dispatcher | `dispatcher` | direct |
| Crew member | `crew` | direct |
| Supervisor | `admin` | the admin role already bypasses the (ward, department) scope check in `requireScope` — the spec's "read-only, no assignment" posture |
| Citizen | `citizen` | never provisioned here (citizens self-register) |

`mapSpecRoleToPrismaRole` is the single
translation point and carries a
`TODO(migration)` for the future enum
change.

### Identifier

The spec calls the identifier a "staff ID or
mobile". The `User` model has `phone String?`
(unique per city via `@@unique([cityId,
phone])`) and `email String?` (unique per
city). There is no `staffId` column.

`classifyIdentifier` decides: a mobile-looking
value is stored in `phone`, an email-looking
value in `email`, and anything else is
rejected with `identifier_invalid`. Uniqueness
is enforced by the database indexes AND
re-checked in the route with an explicit
lookup, which returns 409 `identifier_taken`.

### Scope resolution

The 4.6 rules are:

- dispatcher: ≥ 1 ward, no crew, no department.
- crew: exactly 1 crew and 1 department.
- supervisor: no ward, no crew, no department.

The `User` table stores a SINGLE `wardId`, so
a multi-ward dispatcher keeps the FIRST ward
on the row and the full list is reported back
to the client in the response. The schema has
no ward-join table.

### Status / last-login derivation

The new columns (`User.status`, `User.nameBn`,
`User.lastLoginAt`, `User.crewId`) come with
the pending platform migration. The in-memory
dev store does not carry them, so
`lib/admin/users.ts` reads the real column
when it is present and derives the value when
it is absent:

| Spec field | Prisma column (prod) | Dev-store fallback |
|---|---|---|
| status pill | `User.status` | derived from the session history |
| Bangla name | `User.nameBn ?? User.name` | `User.name` |
| last login | `User.lastLoginAt` | MAX(`Session.lastSeenAt`) |
| crew | `User.crewId` → `Crew` row | synthetic (ward, department) key |

The status derivation: no sessions ⇒ `invited`,
a live session ⇒ `active`, only lapsed
sessions ⇒ `disabled`.

### CSV import

The spec's CSV header is
`name_bn, name_en, identifier, email, role,
wards_or_crew, department`.

`splitCsvRows` handles RFC-4180 quoting (doubled
quotes escape a literal quote), a UTF-8 BOM,
and CRLF or LF endings. `parseUserCsv` treats
the header row as OPTIONAL — the column ORDER
is what matters, so a file that starts directly
with a data row is accepted. Row numbers are
1-based file positions, so the header counts as
row 1.

Every row is validated independently by
`validateCsvRow` against the city's known ward,
crew and department ids. Good rows are created;
bad rows come back with their row numbers and
per-field error codes.

### Password policy

The 4.6 spec states "≥ 8 chars, mixed".
`lib/auth/password.ts` `hashPassword`
enforces the platform floor (≥ 8 chars + ≥ 1
digit); the provisioning layer enforces the
stricter rule and reports a typed error:
`password_too_short`, `password_needs_digit`,
`password_needs_lowercase`,
`password_needs_uppercase`.
`generateInitialPassword` produces a
password that always satisfies the policy.

### Audit

Every state-changing operation writes an
`AuditEntry` via `writeAudit(...)` with
`entityType: 'user'` and the action
`user.create` / `user.update` / `user.delete` /
`user.import`. The create / update entries
carry the field set; the update entry carries
the before AND after values; the delete entry
carries the before value.

## Platform Dependency — Migration NOT Applied

The unit depends on the Prisma migration
`prisma/migrations/20261027140000_platform_gaps/migration.sql`,
which adds `Crew` and `SlaPolicy`, the
`User` lifecycle fields (`status`, `nameBn`,
`lastLoginAt`, `disabledAt`, `crewId`), and
`City.status`.

**This migration has NOT been applied to any
database.** The configured Neon instance was
unreachable (`P1001: Can't reach database
server`) when the migration was authored, so
`prisma migrate dev` could not run. Apply
with:

```
npx prisma migrate deploy
```

Every statement in the migration is additive
(new columns with defaults, new tables, new
indexes) and is safe against the
pre-migration schema. The code paths degrade
cleanly before the migration lands: the
derivation fallbacks above supply the missing
columns, and `listCityCrews` returns `[]` on
the dev path so the crew list is synthesised
from the (ward, department) pair.

## Verification

- `npm run build` — compiled successfully,
  58/58 static pages generated.
- `npx tsc --noEmit` — clean, 0 errors.
- `npm run lint` — 0 errors, 53 warnings.
- `npm run test:unit` — 825 passed across 58
  test files.
- `npm run test:unit:coverage` — 90.89% lines
  / 80.85% branches / 94.11% functions (the
  80% floor).
- `npm run test:mockups` — 15 passed, no
  baseline regenerated.

## Out of Scope

- A `supervisor` role in the Prisma `Role`
  enum — the spec role maps to `admin`.
- A ward-join table (the `User` model stores a
  single `wardId`).
- A `staffId` column (the identifier lives in
  `phone` or `email`).
- A per-user "WebAuthn not enrolled" badge on
  the card. The page surfaces the
  `webauthn_required` error the API returns.
- Invitation delivery to the provisioned staff
  member.
- The "launch city" write itself
  (`City.status` → `live`); the button is
  rendered and gated on `canLaunch`.
- A visual baseline for the new page.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The pending migration is not applied, so the production columns are missing | The derivation fallbacks in `lib/admin/users.ts` supply every value; `lib/admin/users-db.ts` is the single swap point |
| The `supervisor` → `admin` role mapping grants admin-level scope to a supervisor | The admin role is already the read-only, no-assignment posture the spec asks for; the mapping is a single function with a `TODO(migration)` |
| A CSV import provisions dozens of accounts at once | The import route is gated by `requireWebAuthn`; each row is validated independently and duplicate identifiers are refused |
| A user with ticket history is hard-deleted and breaks the FK | `deleteCityUser` counts the user's tickets first and returns `user_has_tickets` |
| A deleted user keeps a live session cookie | The delete path drops the user's sessions in the same operation |
| The page's content depends on a mutable dev seed, so a pixel baseline would be flaky | No visual baseline is introduced; the Playwright spec asserts route structure and API behaviour instead |
