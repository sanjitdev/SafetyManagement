---
standard: ddd-01-bolt-record
bolt: 005-001-webauthn-and-auth
unit: 005-admin-city-setup/001-webauthn-and-auth
phase: construction
status: complete
created: 2026-10-12T07:30:00Z
updated: 2026-10-12T07:30:00Z
---

# Bolt 005-001 — Bolt Record

The consolidated per-bolt summary
for Bolt 005-001
(`webauthn-and-auth`). The five
acceptance criteria from the
story spec are walked through
here, with code-level pointers
and test evidence. The Domain
Model + Technical Design +
ADR Analysis that produced
this bolt are in the same
folder:

- `ddd-01-domain-model.md`
- `ddd-02-technical-design.md`
- `ddd-03-adr-analysis.md`

## Bolt slug

`005-001-webauthn-and-auth`

## Bolt intent

Stand up the four
`/api/auth/webwebauthn/*` route
handlers (register, login,
assertion, revoke) + the
`requireWebAuthn(session)` guard
that gates every write under
`/api/v1/admin/*` + the
client-only `WebAuthnCeremony`
component. Closes the gap
flagged by ADR-007 (registered
2026-10-04): the schema +
challenge table ships in WO-000,
the route layer is this bolt's
job.

## Acceptance walked through

| # | Criterion (from ADM-001) | Implementation | Test evidence |
|---|--------------------------|----------------|---------------|
| 1 | `POST /api/auth/webauthn/register` mints a credential | `app/api/auth/webauthn/register/route.ts` → `lib/auth/webauthn.ts → verifyAttestation` → `writeAudit({ action: 'webauthn.register' })` | `tests/unit/webauthn-service.test.ts` (15 checks pinning the service contract); `tests/16-admin-webauthn-light.spec.ts` (7 API checks + 1 visual baseline) |
| 2 | `POST /api/auth/webauthn/assertion` mints a session | `app/api/auth/webauthn/assertion/route.ts` → `lib/auth/webauthn.ts → verifyAssertion` → `createSession(...)` + `cookies().set(SESSION_COOKIE, ...)` + `writeAudit({ action: 'webauthn.assertion' })` | `tests/unit/webauthn-service.test.ts` (assertion path: 400 invalid_input, 404 challenge_not_found, 401 assertion_expired) |
| 3 | `DELETE /api/auth/webauthn/revoke` removes a credential + enforces no-last-credential rule | `app/api/auth/webauthn/revoke/route.ts` → `lib/auth/webauthn.ts → revokeCredential` → `writeAudit({ action: 'webauthn.revoke' })` | `tests/unit/webauthn-service.test.ts` (404 credential_not_found, 409 last_credential, happy path with 2 credentials) |
| 4 | `requireWebAuthn` throws `webauthn_required` / `webauthn_assertion_expired` per the documented conditions | `lib/auth/guards.ts → requireWebAuthn` consults `db.userWebAuthn.readCredentials` + `db.webAuthnChallenge.findLatest` | `tests/unit/require-webauthn.test.ts` (10 checks: null session, non-admin, empty credentials, missing challenge, expired challenge, happy path, three dev-seam variants) |
| 5 | Dev seam (`DEV_SKIP_WEBAUTHN=1`) is honored ONLY when `CITYFIX_DEV_STORE=1` | `lib/auth/guards.ts → requireWebAuthn` short-circuits on `isDevStore() && process.env.DEV_SKIP_WEBAUTHN === '1'` | `tests/unit/require-webauthn.test.ts` (the `DEV_SKIP_WEBAUTHN=1` + `CITYFIX_DEV_STORE` unset test pins the negative case — the seam does NOT short-circuit when the dev store is inactive) |

## Files shipped

### New

- `app/api/auth/webauthn/register/route.ts`
- `app/api/auth/webauthn/login/route.ts`
- `app/api/auth/webauthn/assertion/route.ts`
- `app/api/auth/webauthn/revoke/route.ts`
- `lib/auth/webauthn.ts`
- `components/WebAuthnCeremony.tsx`
- `tests/unit/require-webauthn.test.ts`
- `tests/unit/webauthn-service.test.ts`
- `tests/16-admin-webauthn-light.spec.ts`

### Edited

- `lib/auth/guards.ts` — added the
  `requireWebAuthn` guard + the
  `WEBAUTHN_CHALLENGE_TTL_MS`
  constant.
- `lib/db-switch.ts` — added the
  `db.webAuthnChallenge` + the
  `db.userWebAuthn` surfaces + the
  `db.user.findFirstByEmail`
  switch (the route's email
  lookup) + relaxed the Prisma
  `webAuthnChallenge.findById`
  to support an id-only lookup
  for the anonymous assertion
  path.
- `lib/dev-store.ts` — extended
  `DevUser` + `Store` + the
  helper namespaces; seeded
  the admin's email as
  `admin@cityfix.bd`.
- `lib/i18n/keys.ts` — added
  5 `admin.webauthn.*` keys.

### Paperwork

- `intents/005-admin-city-setup/units.md`
  Unit 001 → `done`; bolt-progress
  block updated.
- `intents/005-admin-city-setup/001-webauthn-and-auth/ADM-001-webauthn.md`
  → `done`.
- `.specsmd/aidlc/memory-bank/story-index.md`
  ADM-001 → `done`.
- `_progress/00-design-log.md` —
  Bolt 005-001 entry appended.
- `bolts/005-001-webauthn-and-auth/ddd-01-bolt-record.md`
  (this file).

## Test evidence

| Suite | Before bolt | After bolt | Delta |
|-------|-------------|------------|-------|
| `tests/unit/*.ts` (Vitest) | 168/168 | 196/196 | +28 (`require-webauthn.test.ts`: 10; `webauthn-service.test.ts`: 15 service + 3 `db.user.findFirstByEmail` switch tests) |
| `tests/01-mockups.spec.ts` (Playwright mockups) | 15/15 | 15/15 | 0 (the bolt adds no new mockup HTML) |
| `tests/16-admin-webauthn-light.spec.ts` (new Playwright route spec) | — | 7/7 + 1 visual baseline | +1 spec |
| Live-route smoke (Vitest fetch, port 3002) | — | 7/7 (the 7 API checks of the Playwright spec run against a fresh dev server) | (transient verification only; the contract is the Playwright spec) |
| `npx tsc --noEmit` (bolt's own files) | clean | clean | 0 (the 13 pre-existing TS errors from prior bolts' dedup-flag work are out of scope) |

## Risks + design notes

- **No real WebAuthn authenticator in CI**: the
  OSM dev tunnel does not supply a
  virtual authenticator; the
  happy-paths of the register +
  assertion routes are not exercised
  end-to-end. The unit tests cover
  the lookup + state-management
  logic; the route spec covers the
  API-surface contract (Zod
  validation, role guard, dev-store
  lookups). A future v1.1 bolt can
  add a Playwright virtual-authenticator
  test using `@simplewebauthn/browser`'s
  testing hooks.
- **`db.user.findFirstByEmail` switch
  (Bolt 005-001 addition)**: the
  `db.user.findFirst` switch is
  locked to the citizen's
  `{ cityId, phone, role }` shape;
  the email lookup is a separate
  `findFirstByEmail` method that
  delegates to `devDb.user.findFirstByEmail`
  in dev and to `prismaClient.user.findFirst({ where: { email, role } })`
  in prod. The three new Vitest
  checks pin the dev-store branch
  (the prod branch is reachable
  only when a real `DATABASE_URL`
  is set, which is out of scope
  for the v1 dev rig).
- **`@simplewebauthn/server` v10 API**:
  the v10 shape differs from v9
  (notably `supportedAlgorithmIDs`
  vs. `pubKeyCredParams` for
  registration, and `authenticator:
  AuthenticatorDevice` vs.
  `credential: {...}` for assertion).
  The `lib/auth/webauthn.ts`
  implementation uses the v10
  shape; the library's .d.ts files
  in `node_modules/@simplewebauthn/server/esm/`
  were the authoritative source.
- **Dev seam (production posture)**:
  the `requireWebAuthn` guard
  short-circuits on
  `isDevStore() && DEV_SKIP_WEBAUTHN=1`.
  The negative case is pinned by
  `tests/unit/require-webauthn.test.ts`:
  with `CITYFIX_DEV_STORE` unset,
  the seam is ignored and the
  guard falls through to the
  credentials check. Production
  never reads `DEV_SKIP_WEBAUTHN`.
- **Pre-existing TS errors**: 13
  pre-existing errors from the
  prior bolts' dedup-flag work
  remain out of scope per the
  Bolt 003-005 ready-for-checklist
  pattern. The bolt's own code is
  clean.
- **Two deferred items** (per
  ddd-03-adr-analysis.md): HMAC-signing
  the `WebAuthnChallenge.challenge`
  string and soft-delete on
  consumed challenges are filed
  for a v1.1 hardening pass; both
  are v1.1 architecture
  improvements, not v1 blockers.

## Cross-references

- **Domain Model**:
  `ddd-01-domain-model.md` in
  this folder.
- **Technical Design**:
  `ddd-02-technical-design.md`
  in this folder.
- **ADR Analysis**:
  `ddd-03-adr-analysis.md` in
  this folder.
- **ADR-007** (the contract
  this bolt implements):
  `standards/decision-index.md`.
- **Story spec** (the
  acceptance source):
  `intents/005-admin-city-setup/001-webauthn-and-auth/ADM-001-webauthn.md`.
- **Design log entry**:
  `_progress/00-design-log.md`
  (search "Bolt 005-001").
- **Unit decomposition**:
  `intents/005-admin-city-setup/units.md`.
