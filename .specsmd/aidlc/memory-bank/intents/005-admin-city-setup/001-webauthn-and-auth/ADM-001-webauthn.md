---
story: ADM-001-webauthn
unit: 001-webauthn-and-auth
intent: 005-admin-city-setup
phase: construction
status: ready
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T05:30:00Z
---

# Story: ADM-001 — WebAuthn (mandatory for admin writes)

> Closes the gap from WO-000: the
> `WebAuthnChallenge` table + the
> `User.webAuthnCredentials` JSON column
> ship in Intent 001, but the four
> `/api/auth/webauthn/*` route handlers
> are deferred to this unit per
> `decision-index.md` ADR-007. The bolt
> stands them up + adds a
> `requireWebAuthn(session)` guard that
> gates every write under
> `/api/v1/admin/*`.

## Given / When / Then

### Acceptance 1 — Register

**Given** an admin with a valid session
cookie but no registered WebAuthn
credential
**When** the admin completes the browser
`navigator.credentials.create(...)`
ceremony and POSTs the attestation to
`/api/auth/webauthn/register`
**Then** the credential (public key +
signCount) is persisted on
`User.webAuthnCredentials` and the
response is 201.

### Acceptance 2 — Login

**Given** an admin with a registered
credential
**When** the admin POSTs
`{ email: 'admin@cityfix.bd' }` to
`/api/auth/webauthn/login`
**Then** a fresh `WebAuthnChallenge` row
is created (TTL 5 minutes) and the
challenge is returned in the response
body for the client to feed into
`navigator.credentials.get(...)`.

### Acceptance 3 — Assertion

**Given** an admin with a registered
credential AND a fresh challenge from
Acceptance 2
**When** the admin POSTs the assertion
response to
`/api/auth/webauthn/assertion`
**Then** the signature is validated
against the stored public key,
`signCount` is bumped, and the response
is 200 with the new session cookie
(HMAC-signed, 14-day TTL).

### Acceptance 4 — Revoke

**Given** an admin with multiple
registered credentials
**When** the admin DELETEs
`/api/auth/webauthn/revoke` with
`{ credentialId: '...' }`
**Then** the named credential is removed
from `User.webAuthnCredentials` and the
response is 204.

### Acceptance 5 — `requireWebAuthn` guard

**Given** an admin session WITHOUT a
registered credential OR with a stale
challenge (> 5 min old)
**When** the admin attempts any write
under `/api/v1/admin/*` (e.g.,
`POST /api/v1/admin/cities`)
**Then** the route returns 401
`webauthn_required` (no credential) or
401 `webauthn_assertion_expired`
(stale challenge).

### Acceptance 6 — Dev seam

**Given** the dev store is active
(`CITYFIX_DEV_STORE=1`) AND
`DEV_SKIP_WEBAUTHN=1`
**When** an admin with a dev session
attempts any write under
`/api/v1/admin/*`
**Then** the request is allowed (the
guard short-circuits). When
`CITYFIX_DEV_STORE` is unset (the
production path), the env var is
ignored and the guard enforces the
full check.

## Technical Notes

- Hardware-key (YubiKey-class) is the
  primary authenticator; platform
  authenticator (Touch ID / Windows
  Hello) is the fallback. Both are
  supported via the standard
  `navigator.credentials.create` /
  `.get` API; the bolt does not need
  to differentiate at the route layer
  (the browser + `@simplewebauthn/browser`
  handle the cross-platform surface).
- The `WebAuthnChallenge` row's TTL is
  enforced server-side: a challenge
  older than 5 minutes (the same
  window as the citizen OTP) is treated
  as expired.
- `requireWebAuthn` does NOT gate
  `/api/auth/*` — only `/api/v1/admin/*`
  writes. The audit dashboard read
  (Unit 004) only needs a valid
  session cookie.

## Cross-references

- `app/api/auth/webauthn/{register,login,assertion,revoke}/route.ts` —
  4 new routes.
- `lib/auth/guards.ts` —
  `requireWebAuthn(session)` (new).
- `components/WebAuthnCeremony.tsx` —
  client-only browser ceremony (new).
- `tests/unit/require-webauthn.test.ts` —
  Vitest unit test (new).
- `tests/16-admin-webauthn-light.spec.ts` —
  Playwright spec (new).
- `decision-index.md` ADR-007 — the
  policy this story implements.
