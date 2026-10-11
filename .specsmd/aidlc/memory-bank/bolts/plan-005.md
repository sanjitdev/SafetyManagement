---
standard: bolt-plan
intent: 005-admin-city-setup
phase: construction
status: ready
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T05:30:00Z
---

# Bolt Plan — Intent 005 (Admin City Setup)

The Inception → Construction bridge for Intent
005. The Construction Agent reads this plan
first; it describes how the 4 units of Intent
005 decompose into construction bolts, the
suggested bolt type, the stage-by-stage scope,
and the per-bolt exit criteria.

## Bolt summary

| # | Bolt ID | Unit | Bolt Type | Stories | Objective |
|---|---------|------|-----------|---------|-----------|
| 1 | `005-001-webauthn-and-auth` | 001-webauthn-and-auth | `ddd-construction-bolt` | ADM-001-webauthn | WebAuthn route handlers (4) + `requireWebAuthn` guard + client-only `WebAuthnCeremony` + Playwright spec + 1 visual baseline |
| 2 | `005-002-city-config` | 002-city-config | `ddd-construction-bolt` | ADM-002-wards, ADM-003-categories, ADM-004-departments, ADM-005-dedup-radius | 4 new APIs (CRUD over City / Category / Department / Ward) + 4 new pages + Leaflet.draw ward editor + Dhaka template + Playwright spec + 4 visual baselines |
| 3 | `005-003-real-otp-provider` | 003-real-otp-provider | `ddd-construction-bolt` | ADM-006-real-otp | `lib/auth/otp-provider/{types,stub,twilio,index}.ts` + env-var switch + `.env.example` deltas + Vitest unit test (no new pages) |
| 4 | `005-004-audit-dashboard` | 004-audit-dashboard | `ddd-construction-bolt` | ADM-007-audit-dashboard | New `GET /api/v1/admin/audit` (cursor-paginated, filterable) + new `app/admin/audit/page.tsx` + Playwright spec + 1 visual baseline |

The bolt sequence is fixed:

1. **Bolt 005-001** (Unit 001): 4 new
   `/api/auth/webauthn/*` route handlers
   (register, login, assertion, revoke) +
   the `requireWebAuthn(session)` guard
   + a client-only `WebAuthnCeremony`
   component (browser-side
   `navigator.credentials.create` /
   `.get`) + Playwright spec +
   1 visual baseline at 1440x900
   (the ceremony step). The schema
   (`WebAuthnChallenge` table +
   `User.webAuthnCredentials` JSON
   column + `User.webAuthnChallenge`
   JSON column) is already shipped
   in Intent 001. The dev login
   route's `?role=admin` redirect
   target stays at `/home` for this
   bolt (the `/admin/cities` page
   does not exist yet); the redirect
   flip to `/admin/cities` is bundled
   into Bolt 005-002.
2. **Bolt 005-002** (Unit 002): 4 new
   APIs (`/api/v1/admin/cities`,
   `/api/v1/admin/cities/[id]`,
   `/api/v1/admin/cities/[id]/{categories,
   departments, wards}` — all CRUD) +
   4 new pages (`/admin/cities`,
   `/admin/cities/[id]/setup`,
   `/admin/cities/[id]/taxonomy`,
   `/admin/cities/[id]/wards`) +
   Leaflet.draw ward editor
   (`components/WardEditor.tsx`) +
   Dhaka District overlay
   (`components/DhakaDistrictOverlay.tsx`)
   + `lib/admin/dhaka-template.ts`
   (the snapshot constant) + dev seed
   additive changes (3 cities + the
   Dhaka template's categories +
   departments + wards) + the dev
   login `?role=admin` redirect flip
   to `/admin/cities` + Playwright
   spec + 4 visual baselines at
   1440x900 (one per page). The
   `requireWebAuthn` guard (from
   Bolt 005-001) gates every write
   in this bolt; the
   `DEV_SKIP_WEBAUTHN=1` test seam
   is active throughout the bolt's
   test runs.
3. **Bolt 005-003** (Unit 003):
   `lib/auth/otp-provider/{types,stub,twilio,index}.ts`
   + `.env.example` deltas (4 new
   env vars) + `lib/auth/otp.ts`
   body change (delegate to
   `getOtpProvider().send(...)`) +
   `package.json` delta
   (`twilio` v4.x) + Vitest unit test
   `tests/unit/otp-provider.test.ts`
   (~12 checks) +
   `tests/unit/otp.test.ts` (Intent
   001's existing test) unchanged.
   No new page, no new Playwright
   spec; the OTP path is library-
   level and the citizen's
   registration flow covers the
   end-to-end behaviour.
4. **Bolt 005-004** (Unit 004): new
   `GET /api/v1/admin/audit` (cursor-
   paginated, filterable) + new
   `app/admin/audit/page.tsx` (filter
   rail + table + cursor pagination) +
   `components/AuditTable.tsx` +
   `components/AuditFilters.tsx` +
   dev seed additive change (4-5
   `AuditEntry` rows on startup) +
   header pill added to
   `app/admin/cities/page.tsx`
   (pointing at `/admin/audit`) +
   Playwright spec + 1 visual
   baseline at 1440x900 (audit
   dashboard, non-empty table
   captured).

Each bolt is a `ddd-construction-bolt`
(no separate Construction-KB bolts; per
`aidlc.md`, the framework composes the
minimum viable workflow — Units 001-004
are scope `feature` and lean on Code
Generation + Build and Test + the
inherited `writeAudit(...)` engine).

## Code-reality starting state

The platform layer (Intent 001) is
substantially built:

- `User.role` enum (`citizen / dispatcher /
  crew / admin`).
- `Session.wardId?` + `Session.departmentId?`
  bound at login time.
- `requireRole(session, ...allowed)`,
  `requireSameCity(...)`, `requireScope(...)`
  guards in `lib/auth/guards.ts`.
- `transitionTicket(...)` engine in
  `lib/platform/transitions.ts`.
- `writeAudit(...)` in
  `lib/platform/audit.ts`.
- `serializeTicketForRole(role, ...)` in
  `lib/serializers/ticket.ts`.
- `sendTicketPush(...)` in
  `lib/platform/push.ts`.
- `sendOtp(phone, code)` interface in
  `lib/auth/otp.ts` (v1 ships a stub
  implementation; Unit 003 replaces
  the body with the real-provider
  factory).
- `WebAuthnChallenge` table +
  `User.webAuthnCredentials` JSON
  column + `User.webAuthnChallenge`
  JSON column (the schema is in
  place; the route layer is Unit
  001's job).
- `AuditEntry` table with
  `entityType`, `entityId`, `action`,
  `actorId`, `beforeValue`,
  `afterValue`, `createdAt` (Intent
  001 ships the table; Unit 004
  reads it).

The dispatcher surface (Intent 003) +
the crew surface (Intent 004) are
both code-complete (5/5 + 4/4 bolts
shipped). The admin surface is the
last persona WO. The admin's unique
properties:

- WebAuthn-mandatory for writes
  (Unit 001) — every other surface
  uses a session cookie only.
- Cross-city read is allowed (admins
  bypass `requireScope(...)`'s
  per-city check) — every other
  surface is bound to a single
  cityId at login.
- The admin's UI is desktop-first
  (1440x900) — the dispatcher's
  surface matches; the crew's
  surface is mobile-first (390x844);
  the citizen's surface is a hybrid
  (mobile-first, tablet+desktop
  fallback). The admin's visual
  baselines therefore target 1440x900
  to match the dispatcher's pattern.

The Construction Agent's job is to:
(a) write the source code per the
design, (b) capture Playwright visual
baselines for the new routes, (c)
write Vitest unit tests for the
`lib/` changes, and (d) close the
bolt's paperwork (this folder's
`ddd-01-bolt-record.md`).

## Per-bolt source pointers (planned)

These are the files the Construction
Agent opens first for each Bolt. Some
are already-built (Intent 001); the
rest are written by the bolt.

| Bolt | Source files (already-built) | Source files (new) |
|------|-------------------------------|--------------------|
| 005-001 | `lib/auth/guards.ts`, `lib/auth/session.ts`, `prisma/schema.prisma` (WebAuthn schema) | `app/api/auth/webauthn/{register,login,assertion,revoke}/route.ts`, `lib/auth/guards.ts` (delta: `requireWebAuthn`), `components/WebAuthnCeremony.tsx`, `tests/unit/require-webauthn.test.ts`, `tests/16-admin-webauthn-light.spec.ts`, `lib/i18n/keys.ts` (delta: `admin.webauthn.*` keys) |
| 005-002 | `lib/platform/audit.ts` (writeAudit), `lib/auth/guards.ts` (requireRole + requireWebAuthn), `prisma/schema.prisma` (City / Ward / Department / Category), `app/api/dev/login/route.ts` (delta: redirect `admin` to `/admin/cities`), `lib/geo/dhaka-district.ts` | `app/api/v1/admin/cities/{route.ts,[id]/route.ts,[id]/categories/{route.ts,[catId]/route.ts},[id]/departments/{route.ts,[deptId]/route.ts},[id]/wards/{route.ts,[wardId]/route.ts}`, `app/admin/cities/{page.tsx,[id]/setup/page.tsx,[id]/taxonomy/page.tsx,[id]/wards/page.tsx}`, `components/{WardEditor,DhakaDistrictOverlay}.tsx`, `lib/admin/dhaka-template.ts`, `lib/dev-store.ts` (delta: seed), `tests/unit/{dhaka-template,admin-scope}.test.ts`, `tests/17-admin-cities-light.spec.ts`, `lib/i18n/keys.ts` (delta: `admin.cities.*` + `admin.setup.*` + `admin.taxonomy.*` + `admin.wards.*` keys) |
| 005-003 | `lib/auth/otp.ts` (public `sendOtp` interface), `.env.example` | `lib/auth/otp-provider/{types,stub,twilio,index}.ts`, `lib/auth/otp.ts` (delta: body delegates to `getOtpProvider().send(...)`), `.env.example` (delta: 4 new env vars), `package.json` (delta: `twilio` v4.x), `tests/unit/otp-provider.test.ts` |
| 005-004 | `lib/platform/audit.ts` (writeAudit — unchanged), `prisma/schema.prisma` (AuditEntry), `app/admin/cities/page.tsx` (header pill delta), `lib/serializers/user.ts` (or the new admin serializer) | `app/api/v1/admin/audit/route.ts`, `app/admin/audit/page.tsx`, `components/{AuditTable,AuditFilters}.tsx`, `lib/dev-store.ts` (delta: 4-5 seed AuditEntry rows), `tests/unit/audit-query.test.ts`, `tests/18-admin-audit-light.spec.ts`, `lib/i18n/keys.ts` (delta: `admin.audit.*` keys) |

## Per-bolt stage guidance

Each bolt runs through the 5-stage DDD
process (the bolt record
`ddd-01-bolt-record.md` captures the
per-bolt output):

1. **Domain Model** — entities, value
   objects, aggregates, events, services,
   repository interfaces, ubiquitous
   language. (Most bolts inherit the
   domain model from Intent 001; the
   delta is small. Bolt 005-002 has
   the largest delta — the
   `DhakaTemplateSnapshot` value
   object is new.)
2. **Technical Design** — architecture
   pattern, layer structure, API
   contracts, data persistence, security,
   NFRs, integrations. (Bolt 005-002
   has the most surface to design —
   4 APIs + 4 pages + 1 map editor;
   the other bolts are smaller.)
3. **ADR Analysis** (optional) — only when
   an ADR-worthy decision is identified.
   Most bolts inherit decisions from the
   `decision-index.md` and do not need
   new ADRs. (No new ADRs are expected
   in this intent — the WebAuthn
   policy is already ADR-007, the
   audit log is already a WO-000
   decision, and the real-OTP
   provider choice is the pilot
   city's call, not a framework
   decision.)
4. **Implement** — write the source code
   per the design.
5. **Test** — Vitest unit tests + Playwright
   route specs + visual regression
   baselines.

The 5 stages are gated by human
checkpoints per
`.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.
The user has chosen continuous,
autonomous execution (Auto Mode), so
the per-bolt stage checkpoints are
auto-approved per the Construction
Agent's standing instruction.

## Per-bolt exit criteria

A bolt is "done" when:

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green (new tests
  for any `lib/` change).
- `npm run test:mockups` is green (new
  visual baselines for any new route).
- `curl -fs http://localhost:3000/`
  returns 200 for any new top-level
  route.
- The bolt's `ddd-01-bolt-record.md` is
  committed.
- The intent's `units.md` Unit status
  is updated to `done`.
- The intent's story spec files are
  flipped to `phase: construction,
  status: done`.

## Verification command

Per `team.md` Mandated + `project.md`
Walking Skeleton:

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

## Cross-references

- **Active intent**:
  `../intents/005-admin-city-setup/`.
- **Bolt folder layout**: `./README.md`.
- **Per-bolt template**:
  `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.
- **Construction Agent**:
  `.specsmd/aidlc/agents/construction-agent.md`.
- **Sister intents**: the
  dispatcher's (Intent 003) +
  crew's (Intent 004) pattern for
  auth-scope + queue + ticket-detail
  is the structural model this plan
  mirrors; the admin's WebAuthn-
  mandatory-for-writes policy is
  the new axis.
- **PRD**: `design-artifacts/E-Development/WO-004-admin-city-setup.md` —
  the 7 pages + the "Do Not Change"
  list.
- **ADR-007** (WebAuthn mandatory for
  admin writes) — the policy this
  intent implements.
