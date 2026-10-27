---
intent: 005-admin-city-setup
phase: construction
status: complete
updated: 2026-10-27T00:00:00Z
---

# Admin City Setup - Unit Decomposition

## Units Overview

This intent is **in-progress** (2026-10-12).
Unit briefs and story specs are in place for
all 6 units. The unit dependency graph is:
auth → config → OTP → audit (the audit
dashboard reads the `AuditEntry` rows
written by every config change, so it
ships last), and audit → user-management →
adoption-dashboard (the adoption dashboard
reuses the ticket / trail / citizen / staff
readers that the user-management bolt
adds).

### Unit 001: webauthn-and-auth

**Status**: `done`
**Brief**:
`001-webauthn-and-auth/unit-brief.md`
**Stories**:
- `001-webauthn-and-auth/ADM-001-webauthn.md` (done)

**Estimated Complexity**: L (4 new API routes
+ a new `requireWebAuthn` guard + 1 new
client-only component for the WebAuthn
ceremony + Playwright spec; the
`WebAuthnChallenge` table and the
`User.webAuthnCredentials` JSON are
already shipped in WO-000, so the schema
work is zero).

### Unit 002: city-config

**Status**: `done`
**Brief**:
`002-city-config/unit-brief.md`
**Stories**:
- `002-city-config/ADM-002-wards.md` (done)
- `002-city-config/ADM-003-categories.md` (done)
- `002-city-config/ADM-004-departments.md` (done)
- `002-city-config/ADM-005-dedup-radius.md` (done)

**Estimated Complexity**: XL (4 new pages
+ 4 new API surfaces + a Leaflet.draw
ward-boundary editor + 4 Playwright specs
+ 4 visual baselines at 1440x900 + a
"Dhaka template" pre-population flow).
The XL size is the reason this is a
single Unit — splitting wards / categories
/ departments would force three near-
identical CRUD pages and three near-
identical APIs to ship in lockstep.

### Unit 003: real-otp-provider

**Status**: `done`
**Brief**:
`003-real-otp-provider/unit-brief.md`
**Stories**:
- `003-real-otp-provider/ADM-006-real-otp.md` (done)

**Estimated Complexity**: M (env-var
selection of the real provider;
`lib/auth/otp.ts → sendOtp(phone, code)`
already exists, so the bolt is mostly
secrets wiring + a Vitest test that
verifies the env-var switch + the
real-provider interface contract).

### Unit 004: audit-dashboard

**Status**: `done`
**Brief**:
`004-audit-dashboard/unit-brief.md`
**Stories**:
- `004-audit-dashboard/ADM-007-audit-dashboard.md` (done)

**Estimated Complexity**: M (1 new
read-only API + 1 new page + cursor
pagination + filter UI + Playwright
spec + 1 visual baseline). Every
preceding unit writes to `AuditEntry`,
so this surface is a view over existing
data — no new platform primitives.

### Unit 005: user-management

**Status**: `done`
**Brief**:
`005-user-management/unit-brief.md`
**Stories**:
- `005-user-management/ADM-008-user-management.md` (done)

**Estimated Complexity**: M (3 new API
route handlers covering 6 methods — list +
create, update + delete, CSV import — plus
1 new page, 2 new service modules
(`lib/admin/users.ts` for the pure domain
logic and `lib/admin/users-db.ts` for the
db access layer), 54 new `admin.users.*` i18n
keys and a shared Playwright spec). The
launch gate needs one dispatcher AND one
crew, so it reads the city's staffing.

**Delivery note**: Shipped as Bolt
`008-015-admin-user-management` on
2026-10-27. The surface provisions a city's
dispatchers, crew members and supervisors
(role-tabbed list, sticky add / edit form,
CSV bulk import with per-row reporting, and a
launch bar gated on the staffing). Every
write is gated by the admin role AND a
WebAuthn assertion, and every write records
an `AuditEntry` (`user.create` /
`user.update` / `user.delete` /
`user.import`). The spec's `supervisor` role
maps onto the Prisma `admin` role, because
the Prisma `Role` enum has no `supervisor`
and the admin role already carries the
"read-only, no assignment" posture. The
Prisma migration `20261027140000_platform_gaps`
that adds the `User` lifecycle columns and
the `Crew` model is authored but **NOT
applied** to any database (Neon unreachable,
`P1001`); the code reads the column when
present and derives it when absent, so the
surface works against the current schema.

### Unit 006: adoption-dashboard

**Status**: `done`
**Brief**:
`006-adoption-dashboard/unit-brief.md`
**Stories**:
- `006-adoption-dashboard/ADM-009-adoption-dashboard.md` (done)

**Estimated Complexity**: M (2 new API
route handlers — the dashboard payload and
the CSV export — plus 1 new page, 1 new
service module (`lib/admin/adoption.ts`, the
pure domain logic), 46 new
`admin.adoption.*` i18n keys and the shared
Playwright spec). Every chart is inline SVG
with a table sibling built from the same
data, because the project has no charting
library and none may be added.

**Delivery note**: Shipped as Bolt
`008-016-admin-adoption-dashboard` on
2026-10-27 — the previously deferred WO-004
§4.7 surface, landing as Unit 006 of Intent
005. The page shows the four hero stats with
their window deltas, the five-stage adoption
funnel, the three-line daily activity chart,
the ward heatmap, the three engagement signals
and the health flags, with a date-range
control, the "Compare with Dhaka" overlay and
a CSV export. The export is server-rendered
from the same builder the charts read, so the
two cannot drift. Three of the numbers on the
page are **documented proxies** (the
"registered citizens" stat, the funnel's
"Visit" stage and its "Provided feedback"
stage) because the platform does not yet
record registration events, page views, or
feedback on every ticket. The PDF export is
the browser's print pipeline, not a
server-rendered file, because the project has
no rasteriser.

## Status

Active build (2026-10-12). Intent 003
(Dispatcher Queue) is `complete`; Intent 004
(Field Crew App) is `complete`; this intent
is `in-progress`. The unit decomposition
is the 4 units from the `draft` phase,
revised at entry to active build and now
fully specced, plus 2 v1.1 follow-on units
(005 user-management, 006 adoption-dashboard)
added on 2026-10-27. All 6 units have
unit-briefs + story specs; Unit 001 is
unblocked
(Intent 001 ships the WebAuthn schema;
Intent 001 + 002 + 003 + 004 all ship the
audit + dev-store + serializer primitives
this intent depends on).

**Bolt progress** (2026-10-12): Bolt 005-001
(WebAuthn routes + `requireWebAuthn` guard
+ `WebAuthnCeremony` component) shipped
2026-10-12. The 4 route handlers
(`/api/auth/webauthn/{register,login,assertion,revoke}`)
are wired with Zod validation, the
`requireRole(session, 'admin')` guard, and
the documented error codes. The
`requireWebAuthn` guard is in place; every
write under `/api/v1/admin/*` (Unit 002
forward) is gated by it. The dev seam
(`DEV_SKIP_WEBAUTHN=1`, honored only when
`CITYFIX_DEV_STORE=1`) is the established
shape from `lib/dev-session.ts`. The
`WebAuthnCeremony` component ships as a
client-only presentation shell; the
`/admin/login` page is filed in Bolt 005-002.
2 Vitest suites (`require-webauthn.test.ts`
+ `webauthn-service.test.ts`) + 1 Playwright
spec (`16-admin-webauthn-light.spec.ts`) +
1 visual baseline (the ceremony idle state
at 1440x900) all pass. Next: Bolt 005-002
(city-config UI + APIs + Dhaka template),
then 005-003 (real OTP provider), then
005-004 (audit dashboard).

**Bolt 005-002 (2026-10-12)** —
city-config UI + APIs + Dhaka template —
shipped. 4 new admin pages
(`/admin/cities`,
`/admin/cities/<id>/setup`,
`/admin/cities/<id>/taxonomy`,
`/admin/cities/<id>/wards`)
with bilingual copy via
`lib/i18n/keys.ts`; 8 new admin API
route handlers
(`/api/v1/admin/cities`,
`/api/v1/admin/cities/[id]`,
`/api/v1/admin/cities/[id]/{categories,departments,wards}`,
+ the per-entity PATCH/DELETE siblings);
`lib/admin/dhaka-template.ts` (8
departments, 8 categories sorted by
slug ASC, 3 placeholder wards,
`DHAKA_TEMPLATE_VERSION = '2026-10-12-v1'`)
+ the `applyDhakaTemplate(cityId,
actorId)` function that writes one
`AuditEntry` per created entity with
`afterValue.snapshotVersion =
DHAKA_TEMPLATE_VERSION`;
`lib/admin/ward-polygon.ts`
(`validatePolygon(raw)` — closed-ring +
vertex-count + range + no-holes
checks); `lib/auth/guards.ts`
additions (`requireRole` accepts a
single role or role list, the existing
2-arg form is preserved). All routes
gate on `requireRole(session, 'admin')`
+ `requireWebAuthn(session)`; the dev
seam short-circuits both for the admin
persona only. 3 new Vitest suites
(`dhaka-template.test.ts` — 10 tests,
`ward-polygon.test.ts` — 6 tests,
`admin-scope.test.ts` — 5 tests)
+ 1 Playwright spec
(`17-admin-cities-light.spec.ts` — 11
API checks + 4 visual baselines at
1440x900) all pass. `npx tsc --noEmit`
clean for the bolt's own code; the
16 pre-existing errors in
`dispatcher/dedupFlag`, `crew` ticket
trail, and the dispatcher map route
remain out of scope and are not
regressions. Next: Bolt 005-003 (real
OTP provider), then 005-004 (audit
dashboard).

**Bolt 005-003 (2026-10-12)** — real
OTP SMS provider — shipped.
`lib/auth/otp-provider/types.ts`
(`OtpProvider` + `OtpResult`
discriminated union + `OtpError`
string-literal union);
`lib/auth/otp-provider/stub.ts`
(dev / test provider, always-delivered,
`console.info` for dev visibility);
`lib/auth/otp-provider/twilio.ts`
(real provider, 3-attempt retry on
5xx with `[100, 200, 400]` ms
backoff, immediate-fail on 4xx,
constructor-time env-var validation);
`lib/auth/otp-provider/index.ts`
(`getOtpProvider()` factory keyed on
`OTP_PROVIDER`, module-singleton
cache, `__resetOtpProviderForTests`
test seam); `lib/auth/otp.ts`
extended with public
`sendOtp(phone, code, actorId)` —
the helper never throws, writes an
`AuditEntry` with
`action: 'otp_send_failed'`,
`entityType: 'user'` on failure
(ADR-012 keeps the
`AuditWriteInput.entityType` union
closed);
`app/api/v1/auth/send-otp/route.ts`
wired with the new call site
(returns `502 sms_provider_failure`
on delivery failure);
`.env.example` updated with the four
Twilio vars + the rewritten
`OTP_PROVIDER` comment; `twilio@^4`
added to `package.json`. ADR-012
filed in `standards/decision-index.md`
(Context, Decision, Consequences,
6 alternatives rejected, 4
follow-ups deferred). 18 new
Vitest checks in
`tests/unit/otp-provider.test.ts`
cover the factory, the stub, the
Twilio env validation, the retry
semantics, and the public helper.
`npx tsc --noEmit` clean for the
bolt's own code; 235/235 unit tests
(no regressions); 15/15 mockup
baselines (no UI changes); dev
server 200. Next: Bolt 005-004
(audit dashboard).

**Bolt 005-004 (2026-10-12)** — admin
audit dashboard — shipped.
`app/api/v1/admin/audit/route.ts`
(GET only; Zod-validated
`actorId`, `action` comma-list,
`entityType` comma-list against the
closed ADR-012 union, `from`, `to`,
`cursor`, `limit`; returns
`{ entries, nextCursor }`; 401/403/
400/500 via the established
`ApiError` shape);
`lib/admin/audit-query.ts` (the
`buildWhere(input)` test seam +
`clampLimit` + `listAuditEntries`
with `take: limit + 1` "has more"
detection + `hydrateActors` fan-out
for `actorName` server-side);
`lib/db-switch.ts` delta
(`db.audit.findMany` mirroring the
queue route's shape); `lib/dev-store.ts`
delta (5 seed `AuditEntry` rows
covering `otp_send_failed`,
`ward_create`, `dedup_update`,
`category_create`, `city_create`
spanning -24h → -1m so the visual
baseline is deterministic);
`app/admin/audit/page.tsx` (auth
gate via `/api/auth/status`, URL
state via `useSearchParams` +
`history.replaceState`, 30s polling
with `cursorRef` stale-closure-safe
pattern, 288px filter rail + flex-1
table surface);
`components/AdminAuditFilters.tsx`
(uncontrolled inputs, single-select
entity type for v1, `toLocalInput`
datetime-local helper);
`components/AdminAuditTable.tsx`
(6-col table: timestamp locale-
formatted per lang, actor, action,
entity type chip, entity id
truncated, expand chevron → before/
after JSON in `<pre>` tags; 5
skeleton rows on loading; single-
row empty/error);
`lib/i18n/keys.ts` delta (22 new
`admin.audit.*` keys, bilingual
`{ bn, en }`);
`app/admin/cities/page.tsx` delta
(header pill → `/admin/audit`).
14 new Vitest checks in
`tests/unit/audit-query.test.ts`
(9 for `buildWhere` — default 7d
window, actorId, action collapses
to string vs `in:`, entityType same
pattern, from/to override, cursor
adds `createdAt.lt`, no cursor omits
`lt`; 5 for `clampLimit` — 200→100,
0→1, undefined→50, NaN→50, 50→50);
1 new Playwright spec
`tests/18-admin-audit-light.spec.ts`
(9 API checks: 401 no session, 403
`forbidden_role` citizen, 200 admin
+ 5 entries + nextCursor null,
`?actorId=user_admin_dncc` → 4,
`?action=create` → 3,
`?entityType=user` → 1,
`?from=-10m&to=now` → 2,
`?limit=2` → 2 + non-null cursor,
`?entityType=garbage` → 400
`invalid_input`; + 1 visual baseline
`admin-audit-1440x900.png` with the
first row open showing the
`twilio_api_error` JSON). 249/249
unit tests (235 + 14 new); 15/15
mockups (no regression); tsc clean
for the bolt's own code; dev server
200. Intent 005 is **done** end to
end.

**Bolt progress** (2026-10-27): Bolt
`008-015-admin-user-management` (Unit 005 —
the 4.6 User Provisioning surface) shipped
2026-10-27. 3 new API route handlers
(`/api/v1/admin/cities/[id]/users` GET + POST,
`/api/v1/admin/cities/[id]/users/[userId]`
PATCH + DELETE, and
`/api/v1/admin/cities/[id]/users/import` POST
CSV import), 1 new page
(`app/admin/cities/[id]/users/page.tsx` — the
role tabs, the user list, the sticky add /
edit form, the CSV import modal and the
sticky launch bar), 2 new service modules
(`lib/admin/users.ts` — the pure domain
logic; `lib/admin/users-db.ts` — the db
access layer, and the single swap point for
the pending Prisma migration), 54 new
`admin.users.*` i18n keys and the shared
Playwright spec `tests/27-admin-users-adoption.spec.ts`.
Every write requires the admin role AND a
WebAuthn assertion; every write records an
`AuditEntry` (`user.create` / `user.update`
/ `user.delete` / `user.import`). The spec's
`supervisor` role maps onto the Prisma
`admin` role (the enum has no `supervisor`),
and the identifier is classified into
`User.phone` or `User.email` rather than a
new `staffId` column. The Prisma migration
`20261027140000_platform_gaps` is authored
but **NOT applied** to any database (the
configured Neon instance was unreachable —
`P1001: Can't reach database server`); apply
it with `npx prisma migrate deploy`. The
surface reads the new columns when present and
derives them when absent, so it works against
the current schema. No visual baseline was
introduced — the page's content depends on the
mutable dev seed, so the route is covered by
structural assertions instead.

**Bolt progress** (2026-10-27): Bolt
`008-016-admin-adoption-dashboard` (Unit 006
— the 4.7 Post-launch Adoption Dashboard)
shipped 2026-10-27, building on Bolt
`008-015` for its db reads. 2 new API route
handlers (`/api/v1/admin/cities/[id]/adoption`
GET and `/api/v1/admin/cities/[id]/adoption/export`
GET CSV), 1 new page
(`app/admin/cities/[id]/adoption/page.tsx`),
1 new service module (`lib/admin/adoption.ts`
— the pure domain logic behind every number
on the page), 46 new `admin.adoption.*` i18n
keys and 1 new Vitest suite
(`tests/unit/admin-adoption.test.ts`) plus
the adoption assertions on the shared
Playwright spec. The page shows the four
hero stats with their window deltas, the
five-stage adoption funnel, the three-line
daily activity chart, the ward heatmap, the
three engagement signals and the health
flags, with a date-range control, the
"Compare with Dhaka" overlay and a CSV
export. Every chart is inline SVG (the
project has no charting library) with a
table sibling built from the same data array,
so the information is reachable by a screen
reader and by the export. The export and the
charts read the same `buildAdoptionCsvRows`
output, so they cannot drift. Three of the
numbers are documented proxies (the
"registered citizens" stat, the funnel's
"Visit" stage and its "Provided feedback"
stage) because the platform does not yet
record registration events, page views, or
feedback on every ticket; the module header
names each proxy and its v1.1 fix. The PDF
export is the browser's print pipeline, not a
server-rendered file. The same pending
migration caveat applies: `20261027140000_platform_gaps`
is authored but **NOT applied**; the
`Ticket.feedback` slot is read defensively, so
the feedback stage reports zero rather than
failing. No visual baseline was introduced
for the same reason as Bolt 008-015. Final
state: `npm run build` 58/58 pages, `tsc
--noEmit` clean, lint 0 errors / 53 warnings,
825 unit tests passing across 58 files, 90.89%
line / 80.85% branch / 94.11% function
coverage, 15/15 mockups with no baseline
regenerated.

The unit decomposition is the 4 units from the
`draft` phase, revised at entry to active
build and now fully specced, plus the 2
v1.1 follow-on units added on 2026-10-27:

- **Unit 001 — webauthn-and-auth**: the four
  `/api/auth/webauthn/*` route handlers
  (register, login, assertion, revoke) plus
  a `requireWebAuthn` guard that gates every
  write under `/api/v1/admin/*`. The
  `WebAuthnChallenge` table + the
  `User.webAuthnCredentials` JSON column
  already ship in WO-000. The bolt is the
  route-handler layer + the client-side
  ceremony. The unit-brief lands it
  alongside the dev login route's existing
  `?role=admin` persona so the admin can
  reach `/admin/cities` from a dev session
  before the WebAuthn ceremony is fully
  end-to-end (the dev path bypasses the
  WebAuthn guard with a `DEV_SKIP_WEBAUTHN=1`
  flag — a test seam only, never used in
  production).
- **Unit 002 — city-config**: the four
  configuration surfaces from WO-004 §4.3
  through §4.6 (cities overview, basic
  info, departments & categories, wards
  & boundaries) plus the "Apply Dhaka
  template" pre-population flow. 4 new
  APIs (CRUD over `City`, `Category`,
  `Department`, `Ward`) + 4 new pages +
  a Leaflet.draw map editor for the
  polygon. Every change writes an
  `AuditEntry` via `writeAudit(...)`.
  The `DevDhakaTemplateSnapshot` is a
  constant in `lib/admin/dhaka-template.ts`
  — the dev store + the production
  Prisma seed both import the same shape.
- **Unit 003 — real-otp-provider**: replace
  the v1 OTP stub with a real provider.
  The `sendOtp(phone, code)` interface in
  `lib/auth/otp.ts` is preserved; the
  bolt adds an env-var switch
  (`OTP_PROVIDER=stub|twilio|ssl|...`)
  + the real-provider client
  (recommendation: `twilio` for v1, with
  the client hidden behind a
  `lib/auth/otp-provider/{name}.ts`
  module that returns a typed
  `OtpProvider` interface). Secrets live
  in env vars (`OTP_API_KEY`,
  `OTP_API_SECRET`, `OTP_FROM_NUMBER`).
- **Unit 004 — audit-dashboard**: a read-
  only view of `AuditEntry` rows scoped
  to the admin's bound city (admins
  bypass the cross-city check via
  `requireScope(...)`'s admin branch, so
  this is a single query per page load
  with no cross-city deny path). Filter
  UI: actor, action, entityType, date
  range. Cursor pagination. The CSV
  export from WO-004 §4.7 is a v1.1
  follow-up (the WO-004 acceptance
  criteria mark it as "out of v1 scope
  for the export action" — the metric
  view is what ships; the export button
  is filed in `out-of-scope` below).
- **Unit 005 — user-management**: the 4.6
  User Provisioning surface from WO-004
  §4.6 — a previously deferred v1.1 admin
  surface, landing on 2026-10-27 as Bolt
  `008-015-admin-user-management`. 3 API
  route handlers (list + create, update +
  delete, CSV import) + 1 page + 2 service
  modules (`lib/admin/users.ts` for the pure
  domain logic, `lib/admin/users-db.ts` for
  the db access layer and the Prisma
  migration swap point). Every write is
  gated by `requireRole('admin')` +
  `requireWebAuthn` and records an
  `AuditEntry`. The spec's `supervisor` role
  maps onto the Prisma `admin` role.
- **Unit 006 — adoption-dashboard**: the 4.7
  Post-launch Adoption Dashboard from WO-004
  §4.7 — also deferred to v1.1, landing on
  2026-10-27 as Bolt
  `008-016-admin-adoption-dashboard`. 2 API
  route handlers (the dashboard payload and
  the CSV export) + 1 page + 1 service module
  (`lib/admin/adoption.ts`). Every chart is
  inline SVG with a table sibling from the
  same data array; the export reads the same
  builder as the charts. Three of the metrics
  are documented proxies pending the
  `RegistrationEvent` / `AnalyticsEvent`
  tables.

The unit dependency graph:

```text
[Intent 001 platform] ─┐
[Intent 003 dispatcher]┤
[Intent 004 crew]      ├─> [Unit 001 webauthn-and-auth] ──┐
                       │                                     │
                       │                                     v
                       │                  [Unit 002 city-config] ──┐
                       │                                                  v
                       │                              [Unit 003 real-otp-provider]
                       │                                                  │
                       │                                                  v
                       │                              [Unit 004 audit-dashboard]
                       │                                       │
                       │                                       v
                       │                              [Unit 005 user-management]
                       │                                       │
                       │                                       v
                       │                       [Unit 006 adoption-dashboard]
                       │
                       └─> [AuditEntry from Intent 001, written by every
                            config change in Unit 002, read by Unit 004]
```

Units 001 and 002 are independent of each
other (the auth + scope contract is
inherited from Intent 001; the city-config
APIs gate on `requireRole('admin')` +
`requireWebAuthn` only, not on any of
Unit 001's specifics). Unit 003 depends
on the platform layer (Intent 001's
`lib/auth/otp.ts` interface) but not on
either Unit 001 or 002 — it could ship
in any order relative to 001 + 002. Unit
004 depends on every prior unit having
written at least one `AuditEntry` row in
the dev seed; the dev-store seed will
add 4-5 seed rows (one per admin action)
at the start of the bolt.

## Stories owned

| Slug | Title | Unit | Status target |
|------|-------|------|---------------|
| ADM-001 | webauthn | 001 | `done` |
| ADM-002 | wards | 002 | `done` |
| ADM-003 | categories | 002 | `done` |
| ADM-004 | departments | 002 | `done` |
| ADM-005 | dedup-radius | 002 | `done` |
| ADM-006 | real-otp | 003 | `done` |
| ADM-007 | audit-dashboard | 004 | `done` |
| ADM-008 | user-management | 005 | `done` |
| ADM-009 | adoption-dashboard | 006 | `done` |

## Bolt plan

4 Bolt candidates, one per unit. The
bolt sequence (Units 005 and 006 are the
v1.1 follow-on bolts, appended below):

1. **Bolt 005-001** (Unit 001):
   4 new `/api/auth/webauthn/*` route
   handlers (register, login, assertion,
   revoke) + the `requireWebAuthn` guard
   + a client-only `WebAuthnCeremony`
   component for the browser side +
   Playwright spec + 1 visual baseline
   (the login surface at 1440x900). The
   schema is already shipped (Intent 001);
   the bolt is the route + client layer.
2. **Bolt 005-002** (Unit 002): 4 new
   APIs (`/api/v1/admin/cities`,
   `/api/v1/admin/categories`,
   `/api/v1/admin/departments`,
   `/api/v1/admin/wards` — all CRUD)
   + 4 new pages under `/admin/*` (cities
   overview, basic info, departments &
   categories, wards & boundaries) +
   Leaflet.draw ward editor + Dhaka
   template pre-population +
   `lib/admin/dhaka-template.ts` (the
   snapshot constant) + Playwright spec
   + 4 visual baselines at 1440x900. The
   dev seed gets additive `City`,
   `Category`, `Department`, `Ward`
   fixtures matching the Dhaka template
   so the visual baselines are
   deterministic.
3. **Bolt 005-003** (Unit 003):
   `lib/auth/otp-provider/{stub,twilio}.ts`
   (typed `OtpProvider` interface +
   factory keyed on the `OTP_PROVIDER`
   env var) + secrets wired through
   `.env.example` + Vitest test that
   verifies the env-var switch and the
   real-provider contract. No new page
   or Playwright spec (the OTP path is
   library-level; the citizen's
   registration flow already covers the
   end-to-end behaviour).
4. **Bolt 005-004** (Unit 004): new
   `GET /api/v1/admin/audit` (cursor-
   paginated, filterable) + new
   `app/admin/audit/page.tsx` (filter
   UI + table + cursor pagination) +
   Playwright spec + 1 visual baseline
   (audit dashboard at 1440x900). The
   dev seed adds 4-5 `AuditEntry` rows
   so the visual baseline captures a
   non-empty table.
5. **Bolt 008-015** (Unit 005 — the 4.6
   User Provisioning surface): 3 new API
   route handlers
   (`/api/v1/admin/cities/[id]/users` GET +
   POST, `.../users/[userId]` PATCH + DELETE,
   `.../users/import` POST CSV) + 1 new page
   (`app/admin/cities/[id]/users/page.tsx`) +
   2 new service modules (`lib/admin/users.ts`,
   `lib/admin/users-db.ts`) + 54 new
   `admin.users.*` i18n keys + the shared
   Playwright spec `tests/27-admin-users-adoption.spec.ts`.
   Every write is gated by `requireRole('admin')`
   + `requireWebAuthn` and records an
   `AuditEntry`. The Prisma migration
   `20261027140000_platform_gaps` is authored
   but NOT applied to any database; the code
   reads the new columns when present and
   derives them when absent. No visual
   baseline.
6. **Bolt 008-016** (Unit 006 — the 4.7
   Post-launch Adoption Dashboard): 2 new API
   route handlers
   (`/api/v1/admin/cities/[id]/adoption` GET
   and `.../adoption/export` GET CSV) + 1 new
   page (`app/admin/cities/[id]/adoption/page.tsx`)
   + 1 new service module
   (`lib/admin/adoption.ts`) + 46 new
   `admin.adoption.*` i18n keys + 1 new Vitest
   suite + the adoption assertions on the
   shared Playwright spec. Every chart is
   inline SVG with a table sibling built from
   the same data; the export reads the same
   builder as the charts. Three of the metrics
   are documented proxies. Depends on Bolt
   008-015 for its db reads. No visual
   baseline.

Each bolt is a `ddd-construction-bolt`
(no separate Construction-KB bolts; per
`aidlc.md`, the framework composes the
minimum viable workflow — Units 001-006
are scope `feature` and lean on Code
Generation + Build and Test + the
inherited `writeAudit(...)` engine).

Verification command (per
`team.md` Mandated +
`project.md` Walking Skeleton):
`npx tsc --noEmit && npm run test:unit
&& npm run test:mockups && curl -fs
http://localhost:3000/`.
