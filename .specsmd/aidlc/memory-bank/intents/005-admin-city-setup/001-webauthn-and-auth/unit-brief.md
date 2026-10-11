---
unit: 001-webauthn-and-auth
intent: 005-admin-city-setup
phase: construction
status: ready
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T05:30:00Z
---

# Unit 001 — WebAuthn & Admin Auth (Intent 005)

## Scope

The four `/api/auth/webauthn/*` route handlers
(register, login, assertion, revoke) plus
the `requireWebAuthn` guard that gates every
write under `/api/v1/admin/*`. Closes the
gap from WO-000: the schema ships (the
`WebAuthnChallenge` table + the
`User.webAuthnCredentials` JSON column +
`User.webAuthnChallenge` JSON column) but
the route layer is deferred to this unit
per `decision-index.md` ADR-007.

The unit is the prerequisite for every
Unit 002 (city-config) write — the
admin's first write (e.g., creating a
new ward) demands a fresh WebAuthn
assertion, and the `requireWebAuthn`
guard wired in this unit is what enforces
that.

## Stories owned

| Slug | Title | Status |
|------|-------|--------|
| ADM-001 | webauthn | ready |

## Bolt candidate

`005-001-webauthn-and-auth` (one
`ddd-construction-bolt`).

## Reuse references

- `prisma/schema.prisma`:
  - `model WebAuthnChallenge { ... }` —
    already shipped in Intent 001.
  - `User.webAuthnCredentials Json?` —
    already shipped in Intent 001.
  - `User.webAuthnChallenge Json?` —
    already shipped in Intent 001.
- `lib/auth/guards.ts:48` `requireRole(...)` —
  the per-role guard. This unit extends it
  with `requireWebAuthn(session)` that
  validates a fresh assertion (the
  `WebAuthnChallenge.signCount` + signature
  are checked against the stored
  `webAuthnCredentials`).
- `lib/auth/session.ts` —
  `getSessionFromCookies()` returns the
  current session; `requireWebAuthn(session)`
  pulls the credential by `session.userId`
  and validates the most-recent challenge
  row.
- `lib/auth/otp.ts:53` `devMintSession(role)`
  — the dev login route already mints an
  admin session (Bolt 003-001 / 004-001
  paperwork). The admin redirect target
  is currently `/home`; this bolt
  flips it to `/admin/cities` so the
  dev persona lands on the admin surface
  after Bolt 005-002 ships. The redirect
  flip is gated on `/admin/cities`
  existing — if 005-001 ships first, the
  redirect stays at `/home` and the
  flip is bundled into 005-002.

## API surface (delta)

- **New**: `app/api/auth/webauthn/register/route.ts`
  — POST. Body: `{ credentialName: string,
  attestationResponse: ... }`. Validates the
  attestation; persists the credential
  (public key + signCount) on
  `User.webAuthnCredentials`; returns 201.
  Gated by `requireRole('admin')` + an
  active session (the admin must already be
  logged in via the dev login route or the
  pre-WO-005 admin bootstrap).
- **New**: `app/api/auth/webauthn/login/route.ts`
  — POST. Body: `{ email: string }`. Looks
  up the admin; if they have a registered
  credential, generates a fresh
  `WebAuthnChallenge` row and returns the
  challenge. The client-side `WebAuthnCeremony`
  uses the challenge to drive the browser's
  `navigator.credentials.get(...)` call.
- **New**: `app/api/auth/webauthn/assertion/route.ts`
  — POST. Body: `{ assertionResponse: ... }`.
  Validates the signature against the stored
  public key; bumps `signCount`; mints a
  new `Session` (HMAC-signed cookie,
  14-day TTL) and returns the cookie. The
  WebAuthn assertion is the proof of
  possession; the session cookie is the
  v1 cookie surface.
- **New**: `app/api/auth/webauthn/revoke/route.ts`
  — DELETE. Body: `{ credentialId: string }`.
  Removes the named credential from
  `User.webAuthnCredentials`. Gated by
  `requireRole('admin')` + an active session.

## Components (delta)

- **New**: `components/WebAuthnCeremony.tsx` —
  client-only. Drives the browser's
  `navigator.credentials.create(...)` and
  `navigator.credentials.get(...)` calls.
  Posts to the four route handlers in the
  right order. Used by the admin's
  `/admin/login` page (lands in 005-002 as
  the page bolt's "first session"
  requirement — the actual page surface is
  Unit 002; this unit ships the route + the
  ceremony component the page imports).

## Guards (delta)

- **New** in `lib/auth/guards.ts`:
  `requireWebAuthn(session)` — throws 401
  `webauthn_required` if `session.userId`
  has no `webAuthnCredentials` registered
  (i.e., the admin hasn't completed the
  registration ceremony). Throws 401
  `webauthn_assertion_expired` if the
  most-recent `WebAuthnChallenge` row is
  older than 5 minutes (matches the
  citizen OTP TTL). The 5-minute window
  is the WebAuthn-equivalent of the OTP's
  "freshness" property.
- **Test seam**: `requireWebAuthn` consults
  `process.env.DEV_SKIP_WEBAUTHN` (only
  when the dev store is active). The dev
  persona Anwar can hit `/api/v1/admin/*`
  without a real WebAuthn ceremony in dev
  mode; production never reads this env
  var.

## i18n keys (delta)

- `admin.webauthn.title` — page title
  (e.g., "Sign in with security key" /
  "নিরাপত্তা কী দিয়ে সাইন ইন").
- `admin.webauthn.instruction` —
  instructions for inserting the
  hardware key.
- `admin.webauthn.error.no_credential` —
  "No security key registered. Contact
  your administrator."
- `admin.webauthn.error.expired` —
  "Assertion expired. Try again."
- `admin.webauthn.success` — toast on
  successful assertion.

## Tests (delta)

- **Vitest**: `tests/unit/require-webauthn.test.ts`
  (new). ~15 checks:
  - `requireWebAuthn` throws 401 if
    `webAuthnCredentials` is empty.
  - `requireWebAuthn` throws 401 if the
    most-recent challenge is > 5 min old.
  - `requireWebAuthn` succeeds if a
    credential is registered and a
    challenge row exists with `signCount`
    matching the stored value.
  - `DEV_SKIP_WEBAUTHN=1` short-circuits
    in dev mode.
  - `DEV_SKIP_WEBAUTHN=1` is ignored when
    `CITYFIX_DEV_STORE` is not set (the
    production code path).
- **Playwright**: `tests/16-admin-webauthn-light.spec.ts`
  (new). API checks (anonymous register
  attempt → 401; admin session + no
  WebAuthn registered → 200 from login
  with a "no credential" challenge
  returned; admin + WebAuthn registered +
  valid assertion → 200 + cookie). +
  1 visual baseline (the WebAuthn
  ceremony screen at 1440x900 — the
  page surface is Unit 002's; this
  baseline is the ceremony step, not
  the full login page).

## Verification

- `npx tsc --noEmit` clean for the new
  files.
- `npm run test:unit` green.
- `npm run test:mockups` green.
- `curl -fs http://localhost:3000/` 200.
- `npx playwright test
  tests/16-admin-webauthn-light.spec.ts`
  green.
- `requireWebAuthn` unit test green.

## Out of scope (deferred)

- Hardware-key provisioning flow
  (`/admin/security-keys` — a v1.1
  enhancement that lets Aamir manage
  multiple credentials per admin
  account).
- Backup TOTP codes (a v1.1 recovery
  path).
- `requireWebAuthn` on `/api/auth/*` —
  only `/api/v1/admin/*` writes are
  gated in v1. Read access (e.g., the
  audit dashboard) only requires a
  valid session cookie.
