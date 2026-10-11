---
intent: 005-admin-city-setup
phase: construction
status: in-progress
updated: 2026-10-12T05:30:00Z
---

# Admin City Setup - Unit Decomposition

## Units Overview

This intent is **in-progress** (2026-10-12).
Unit briefs and story specs are in place for
all 4 units. The unit dependency graph is:
auth → config → OTP → audit (the audit
dashboard reads the `AuditEntry` rows
written by every config change, so it
ships last).

### Unit 001: webauthn-and-auth

**Status**: `ready`
**Brief**:
`001-webauthn-and-auth/unit-brief.md`
**Stories**:
- `001-webauthn-and-auth/ADM-001-webauthn.md` (ready)

**Estimated Complexity**: L (4 new API routes
+ a new `requireWebAuthn` guard + 1 new
client-only component for the WebAuthn
ceremony + Playwright spec; the
`WebAuthnChallenge` table and the
`User.webAuthnCredentials` JSON are
already shipped in WO-000, so the schema
work is zero).

### Unit 002: city-config

**Status**: `ready`
**Brief**:
`002-city-config/unit-brief.md`
**Stories**:
- `002-city-config/ADM-002-wards.md` (ready)
- `002-city-config/ADM-003-categories.md` (ready)
- `002-city-config/ADM-004-departments.md` (ready)
- `002-city-config/ADM-005-dedup-radius.md` (ready)

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

**Status**: `ready`
**Brief**:
`003-real-otp-provider/unit-brief.md`
**Stories**:
- `003-real-otp-provider/ADM-006-real-otp.md` (ready)

**Estimated Complexity**: M (env-var
selection of the real provider;
`lib/auth/otp.ts → sendOtp(phone, code)`
already exists, so the bolt is mostly
secrets wiring + a Vitest test that
verifies the env-var switch + the
real-provider interface contract).

### Unit 004: audit-dashboard

**Status**: `ready`
**Brief**:
`004-audit-dashboard/unit-brief.md`
**Stories**:
- `004-audit-dashboard/ADM-007-audit-dashboard.md` (ready)

**Estimated Complexity**: M (1 new
read-only API + 1 new page + cursor
pagination + filter UI + Playwright
spec + 1 visual baseline). Every
preceding unit writes to `AuditEntry`,
so this surface is a view over existing
data — no new platform primitives.

## Status

Active build (2026-10-12). Intent 003
(Dispatcher Queue) is `complete`; Intent 004
(Field Crew App) is `complete`; this intent
is `in-progress`. The unit decomposition
is the 4 units from the `draft` phase,
revised at entry to active build and now
fully specced. All 4 units have unit-briefs
+ story specs; Unit 001 is unblocked
(Intent 001 ships the WebAuthn schema;
Intent 001 + 002 + 003 + 004 all ship the
audit + dev-store + serializer primitives
this intent depends on).

**Bolt progress** (2026-10-12): no bolts
shipped yet. The next move is Bolt 005-001
(WebAuthn routes + `requireWebAuthn` guard)
followed by Bolt 005-002 (the city-config
UI + APIs + Dhaka template), then 005-003
(real OTP provider), then 005-004 (audit
dashboard).

The unit decomposition is the 4 units from the
`draft` phase, revised at entry to active
build and now fully specced:

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

## Bolt plan

4 Bolt candidates, one per unit. The
bolt sequence:

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

Each bolt is a `ddd-construction-bolt`
(no separate Construction-KB bolts; per
`aidlc.md`, the framework composes the
minimum viable workflow — Units 001-004
are scope `feature` and lean on Code
Generation + Build and Test + the
inherited `writeAudit(...)` engine).

Verification command (per
`team.md` Mandated +
`project.md` Walking Skeleton):
`npx tsc --noEmit && npm run test:unit
&& npm run test:mockups && curl -fs
http://localhost:3000/`.
