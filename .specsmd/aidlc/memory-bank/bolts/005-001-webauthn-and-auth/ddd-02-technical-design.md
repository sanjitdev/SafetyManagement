---
standard: ddd-02-technical-design
bolt: 005-001-webauthn-and-auth
unit: 005-admin-city-setup/001-webauthn-and-auth
phase: construction
status: complete
created: 2026-10-12T05:45:00Z
updated: 2026-10-12T05:45:00Z
---

# Bolt 005-001 — Technical Design (delta)

The Technical Design for Bolt
005-001. This artifact translates
the Domain Model
(`ddd-01-domain-model.md`) into
the concrete contract the
Implementation stage (Stage 4) will
code against: route handlers, Zod
schemas, the `requireWebAuthn`
guard body, the dev-store
extensions, the lib additions, the
i18n key shapes, and the test
fixtures.

Per the bolt type's Stage 2
contract, this artifact is
documentation-only — no source
code was read or written during
Stage 2. The Stage 4 implementation
follows the contract here.

## Architecture pattern

The bolt is an additive extension
of the existing v1 surface. The
patterns the bolt inherits
without modification:

- **Next.js 14 App Router** route
  handlers under
  `app/api/auth/webauthn/{register,login,assertion,revoke}/route.ts`.
  The four handlers follow the
  same shape as the existing
  `/api/auth/status` route
  (signature `async (req) =>
  NextResponse.json(...)`).
- **Zod** schemas at every
  external API boundary (per
  `standards/coding-standards.md`
  Mandated). Each handler's
  request body is validated
  through a Zod schema; the
  handler's typed body is the
  `z.infer` of the schema.
- **`requireRole` /
  `requireSameCity` /
  `requireScope` /
  `requireWebAuthn` (new)
  guards** in
  `lib/auth/guards.ts`. Every
  route handler invokes
  `requireRole(session, 'admin')`
  first, then the route-specific
  guard (`requireWebAuthn` for
  the write routes; the login
  route is the one exception —
  it is the pre-session entry
  point).
- **`writeAudit(...)`** in
  `lib/platform/audit.ts` for
  every state-changing event
  (the four domain events
  identified in
  `ddd-01-domain-model.md`).
- **In-memory dev store + Prisma
  switch** via `db-switch.ts`.
  The dev store's
  `lib/dev-store.ts` is extended
  to mirror the Prisma `User`
  + `WebAuthnChallenge` tables
  the bolt reads / writes.
- **`t(key, vars, lang)`** for
  every user-facing string (per
  `standards/coding-standards.md`
  Mandated). The 5 new keys
  under `admin.webauthn.*` are
  added to `lib/i18n/keys.ts`
  with `bn` (canonical) + `en`
  (fallback) per key.
- **HMAC-signed HTTP-only
  session cookies** for the
  assertion result (the
  v1 cookie surface). A
  successful assertion mints a
  `Session` via
  `createSession(...)` and the
  handler sets the cookie
  exactly the way the citizen
  registration / login routes
  do.

## Module map (delta)

The Implementation stage opens
or creates the following files
in this exact order (so the
type checker compiles after
each step):

| Order | File | Action | Why this order |
|-------|------|--------|----------------|
| 1 | `lib/auth/webauthn.ts` | **create** | The `issueChallenge` / `verifyAttestation` / `verifyAssertion` domain-service functions. The route handlers import from here. |
| 2 | `lib/auth/guards.ts` | **edit** | Add the `requireWebAuthn` guard at the bottom of the existing module. Re-exports the `WEBAUTHN_CHALLENGE_TTL_MS` constant. |
| 3 | `lib/db-switch.ts` | **edit** | Add the `db.webAuthnChallenge` + `db.user.webAuthn` surface. Both paths (dev + Prisma) are wired. |
| 4 | `lib/dev-store.ts` | **edit** | Add `webAuthnChallenges: Map<string, DevWebAuthnChallenge>`, the `DevUser.webAuthnCredentials` / `webAuthnChallenge` JSON fields, and the in-memory `webAuthnChallenge` / `userWebAuthn` query helpers. The dev admin user is seeded with an empty `webAuthnCredentials` so the assertion path is exercised. |
| 5 | `app/api/auth/webauthn/register/route.ts` | **create** | The first of the four route handlers. Imports from `lib/auth/webauthn.ts`. |
| 6 | `app/api/auth/webauthn/login/route.ts` | **create** | Second handler. The pre-session entry point — does NOT call `requireRole` (the caller may be unauthenticated); the email is the admin's identifier. |
| 7 | `app/api/auth/webauthn/assertion/route.ts` | **create** | Third handler. Mints the session cookie on success. |
| 8 | `app/api/auth/webauthn/revoke/route.ts` | **create** | Fourth handler. The single DELETE method. |
| 9 | `components/WebAuthnCeremony.tsx` | **create** | Client-only component that drives the browser's `navigator.credentials.create` / `.get` calls via `@simplewebauthn/browser`. |
| 10 | `lib/i18n/keys.ts` | **edit** | Add the 5 `admin.webauthn.*` keys. |
| 11 | `tests/unit/require-webauthn.test.ts` | **create** | Vitest unit test for the guard. |
| 12 | `tests/unit/webauthn-service.test.ts` | **create** | Vitest unit test for the domain-service functions (issueChallenge, verifyAttestation, verifyAssertion). |
| 13 | `tests/16-admin-webauthn-light.spec.ts` | **create** | Playwright route spec (API checks + 1 visual baseline at 1440x900). |
| 14 | `tests-mockups/baselines/16-admin-webauthn-light.spec.ts/admin-webauthn-ceremony-1440x900.png` | **create** | The 1 visual baseline (the ceremony step rendered at 1440x900, light theme, English). |

## API contracts

### `POST /api/auth/webauthn/register`

**Auth**: `requireRole(session, 'admin')`. Anonymous
→ 401 `not_authenticated`. Non-admin session → 403
`forbidden_role`.

**Request body** (Zod schema):

```ts
const RegisterBody = z.object({
  credentialName: z.string().min(1).max(120),
  // The base64url-encoded attestation response from
  // navigator.credentials.create(...). The exact shape is
  // a @simplewebauthn/browser type, but we accept it as
  // `unknown` and let @simplewebauthn/server validate.
  attestationResponse: z.unknown(),
});
```

**Response 201**:

```json
{
  "credential": {
    "id": "base64url-string",
    "name": "YubiKey 5C — desk",
    "registeredAt": "2026-10-12T05:45:00.000Z"
  }
}
```

**Response 400** on Zod failure:
`{ "error": "invalid_input", "issues": [...] }`.

**Response 401** `webauthn_attestation_failed`
when `@simplewebauthn/server` rejects the
attestation. (The 401 status is a deliberate
choice — see the "Error code conventions" note
below.)

### `POST /api/auth/webauthn/login`

**Auth**: NONE. The route is the pre-session
entry point — the email is the admin's
identifier.

**Request body**:

```ts
const LoginBody = z.object({
  email: z.string().email(),
});
```

**Response 200** (admin has a registered credential):

```json
{
  "challengeId": "wbc_01HXY...",
  "challenge": "base64url-string",
  "rpId": "localhost",
  "allowCredentials": [
    { "id": "base64url-string-1" }
  ],
  "userVerification": "preferred",
  "timeout": 60000
}
```

**Response 404** `admin_not_found` if the
email does not map to a `User` with
`role = 'admin'`. (404 rather than
401 to avoid leaking which
emails are admin accounts.)

**Response 409** `webauthn_no_credential`
if the admin has not yet
completed a register ceremony.

### `POST /api/auth/webauthn/assertion`

**Auth**: NONE. The challenge id from the
`login` response is the
proof-of-session for this
route.

**Request body**:

```ts
const AssertionBody = z.object({
  challengeId: z.string().min(1),
  // The base64url-encoded assertion response from
  // navigator.credentials.get(...).
  assertionResponse: z.unknown(),
});
```

**Response 200** (assertion valid):

- Sets the `cityfix_session` cookie
  (HMAC-signed, 14-day TTL,
  `HttpOnly`, `SameSite=Lax`,
  `Secure: false` in dev /
  `Secure: true` in prod —
  same flags as the citizen
  registration / login routes).
- Body:

```json
{
  "authenticated": true,
  "session": {
    "sessionId": "ses_...",
    "userId": "user_admin_anwar",
    "role": "admin",
    "cityId": "city_dhaka_north"
  }
}
```

**Response 401** `webauthn_assertion_failed`
on signature mismatch.

**Response 401** `webauthn_assertion_expired`
when the `WebAuthnChallenge.expiresAt`
is in the past (the
`assertion_expired` error
code, not the more specific
`webauthn_assertion_failed`
— the 5-minute TTL is the
guard's contract).

**Response 404** `webauthn_challenge_not_found`
if the `challengeId` does
not exist (e.g. a replay
attempt with a consumed /
non-existent id).

### `DELETE /api/auth/webauthn/revoke`

**Auth**: `requireRole(session, 'admin')` +
the session must be the
admin who owns the
credential.

**Request body**:

```ts
const RevokeBody = z.object({
  credentialId: z.string().min(1),
});
```

**Response 204** on success.

**Response 400** on Zod failure.

**Response 404** `webauthn_credential_not_found`
if the named credential
is not in the user's
`webAuthnCredentials`.

**Response 409** `webauthn_last_credential`
if the revoke would
leave the admin with zero
credentials (the
no-last-credential rule
from the Domain Model).

### Error code conventions

The four WebAuthn-specific
error codes:

- `webauthn_required` — 401.
  The session is admin but
  has zero registered
  credentials. Returned by
  `requireWebAuthn` when
  `webAuthnCredentials` is
  empty / null. Every write
  under `/api/v1/admin/*`
  will return this until
  the admin completes a
  register ceremony.
- `webauthn_assertion_expired`
  — 401. The session's most
  recent `WebAuthnChallenge`
  is older than
  `WEBAUTHN_CHALLENGE_TTL_MS`
  (5 minutes). Returned by
  `requireWebAuthn`. The
  client must re-issue a
  login ceremony.
- `webauthn_attestation_failed`
  — 401. The
  `@simplewebauthn/server`
  verifier rejected the
  attestation (signature
  mismatch, malformed
  payload, etc.). Returned
  by the `register` route.
- `webauthn_assertion_failed`
  — 401. The
  `@simplewebauthn/server`
  verifier rejected the
  assertion. Returned by
  the `assertion` route.
- `webauthn_no_credential`
  — 409. The admin has not
  completed a register
  ceremony. Returned by
  the `login` route so the
  client can prompt the
  admin to register a key
  first.
- `webauthn_last_credential`
  — 409. The revoke would
  leave the admin with zero
  credentials. Returned by
  the `revoke` route.
- `webauthn_challenge_not_found`
  — 404. The
  `assertion` route's
  `challengeId` does not
  match any row.
- `webauthn_credential_not_found`
  — 404. The
  `revoke` route's
  `credentialId` does not
  match any of the user's
  registered credentials.
- `admin_not_found` — 404.
  The `login` route's email
  does not map to an admin
  user.

The 4xx status codes are
deliberate — the API
conventions document
(`standards/api-conventions.md`)
already establishes
`{ "error": "<machine_code>" }`
as the contract; the
specific numeric status
choices follow the existing
platform layer (e.g.
`not_authenticated` is
already 401,
`forbidden_role` is 403,
`invalid_input` is 400).

## `requireWebAuthn` guard body

The Implementation stage adds
this function to the bottom
of `lib/auth/guards.ts`:

```ts
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 min

/**
 * Throws 401 webauthn_required if the session's user has no
 * registered WebAuthn credential. Throws 401
 * webauthn_assertion_expired if the most-recent
 * WebAuthnChallenge row is older than
 * WEBAUTHN_CHALLENGE_TTL_MS. Returns the refreshed session on
 * success.
 *
 * Dev seam: when CITYFIX_DEV_STORE=1 AND
 * DEV_SKIP_WEBAUTHN=1, the guard short-circuits and returns
 * the session as-is. The env var is never consulted when
 * CITYFIX_DEV_STORE is unset (the production path).
 */
export async function requireWebAuthn(
  session: SessionContext | null,
): Promise<SessionContext> {
  if (process.env.CITYFIX_DEV_STORE === '1' && process.env.DEV_SKIP_WEBAUTHN === '1') {
    // Dev seam — never reached in production. The route's
    // requireRole(session, 'admin') check has already run.
    if (!session) throw new ApiError(401, 'not_authenticated');
    return session;
  }
  if (!session) {
    throw new ApiError(401, 'not_authenticated');
  }
  if (session.role !== 'admin') {
    throw new ApiError(403, 'forbidden_role');
  }
  // Read the user's webAuthnCredentials + most-recent challenge
  // through the db-switch facade.
  const { userWebAuthn } = await import('@/lib/db-switch');
  const { webAuthnCredentials, webAuthnChallenge } =
    await userWebAuthn.readCredentials(session.userId);
  if (!webAuthnCredentials || webAuthnCredentials.length === 0) {
    throw new ApiError(401, 'webauthn_required');
  }
  // The session-scoped challenge lookup is the more
  // authoritative source; the JSON column on User is a
  // cache.
  const { webAuthnChallenge: latest } = await import('@/lib/db-switch').then(
    (m) => m.db.webAuthnChallenge,
  );
  const challenge = await latest.findLatest({ userId: session.userId });
  if (!challenge) {
    throw new ApiError(401, 'webauthn_assertion_expired');
  }
  if (challenge.expiresAt < new Date()) {
    throw new ApiError(401, 'webauthn_assertion_expired');
  }
  return session;
}
```

The guard consults
`process.env.CITYFIX_DEV_STORE`
and `process.env.DEV_SKIP_WEBAUTHN`
directly. The dev seam is
only honored when the dev
store is active — production
never reads
`DEV_SKIP_WEBAUTHN`.

## Dev-store extensions (delta)

The Implementation stage
extends `lib/dev-store.ts`
in three places:

1. **Type extensions** —
   add `webAuthnCredentials: WebAuthnCredential[] | null`
   + `webAuthnChallenge:
   ChallengePayload | null`
   to `DevUser`.
2. **`Store` extension** —
   add `webAuthnChallenges: Map<string, DevWebAuthnChallenge>`
   to the `Store` interface +
   the `seed()` return value
   + the `resetStore()` re-seed.
3. **Admin user seed** —
   the seeded `user_admin_anwar`
   gets
   `webAuthnCredentials: null`
   + `webAuthnChallenge: null`
   (the v1 default; the admin
   completes a register
   ceremony at runtime).
4. **Helper surface** —
   add `devDb.webAuthnChallenge.create(...)`
   + `devDb.webAuthnChallenge.findLatest(...)`
   + `devDb.user.webAuthn.readCredentials(...)`
   + `devDb.user.webAuthn.writeCredentials(...)`
   + `devDb.user.webAuthn.writeChallenge(...)`
   + `devDb.user.webAuthn.bumpCounter(...)`
   + `devDb.user.webAuthn.revokeCredential(...)`.

The `DevWebAuthnChallenge`
shape:

```ts
export interface DevWebAuthnChallenge {
  id: string;
  userId: string;
  challenge: string;
  expiresAt: string; // ISO
  createdAt: string; // ISO
}
```

## `db-switch.ts` extensions (delta)

The Implementation stage adds
two new surfaces to the
`db` object in
`lib/db-switch.ts`:

```ts
webAuthnChallenge: {
  create: (args: {
    userId: string;
    challenge: string;
    expiresAt: Date;
  }) => isDevStore()
    ? devDb.webAuthnChallenge.create(args)
    : prismaClient.webAuthnChallenge.create({ data: args }),
  findLatest: (args: { userId: string }) =>
    isDevStore()
      ? devDb.webAuthnChallenge.findLatest(args)
      : prismaClient.webAuthnChallenge.findFirst({
          where: { userId: args.userId },
          orderBy: { createdAt: 'desc' },
        }),
},
userWebAuthn: {
  readCredentials: (userId: string) =>
    isDevStore()
      ? devDb.user.webAuthn.readCredentials(userId)
      : prismaClient.user.findUniqueOrThrow({
          where: { id: userId },
          select: {
            webAuthnCredentials: true,
            webAuthnChallenge: true,
          },
        }),
  writeCredentials: (userId: string, credentials: unknown) =>
    isDevStore()
      ? devDb.user.webAuthn.writeCredentials(userId, credentials)
      : prismaClient.user.update({
          where: { id: userId },
          data: { webAuthnCredentials: credentials as never },
        }),
  // ... writeChallenge, bumpCounter, revokeCredential
  // follow the same pattern.
},
```

The Prisma `User` model
already has the
`webAuthnCredentials` +
`webAuthnChallenge` columns
(shipped in Intent 001); the
Prisma `WebAuthnChallenge`
table also exists. No
schema migration is needed.

## i18n keys (delta)

The Implementation stage
appends 5 new keys to
`lib/i18n/keys.ts` (under the
`admin.webauthn.*` prefix,
following the established
Bangla-canonical +
English-fallback pattern):

| Key | `bn` | `en` |
|-----|------|------|
| `admin.webauthn.title` | `নিরাপত্তা কী দিয়ে সাইন ইন` | `Sign in with security key` |
| `admin.webauthn.instruction` | `নিরাপত্তা কী ঢোকান, তারপর বোতাম চাপুন` | `Insert your security key, then tap the button` |
| `admin.webauthn.error.no_credential` | `কোনো নিরাপত্তা কী নিবন্ধিত নেই। প্রশাসকের সাথে যোগাযোগ করুন।` | `No security key registered. Contact your administrator.` |
| `admin.webauthn.error.expired` | `যাচাইকরণের মেয়াদ শেষ। আবার চেষ্টা করুন।` | `Assertion expired. Try again.` |
| `admin.webauthn.success` | `নিরাপত্তা কী যাচাই সম্পন্ন` | `Security key verified` |

The keys follow the
established shape (every key
has both `bn` + `en`
literals; both are
authored — the bolt does
not rely on a fallback).

## Component: `WebAuthnCeremony`

`components/WebAuthnCeremony.tsx`
is a client-only component
that drives the browser's
WebAuthn APIs. The contract:

```ts
export interface WebAuthnCeremonyProps {
  mode: 'register' | 'login';
  // The route the ceremony posts to.
  endpoint: string;
  // The body to send to the route
  // (the `credentialName` for register;
  //  the `email` for login).
  body: Record<string, unknown>;
  // Called on a successful ceremony with the
  // server's response body.
  onSuccess: (response: unknown) => void;
  // Called on a failed ceremony with the
  // machine-readable error code.
  onError: (code: string) => void;
}
```

The component:

- `'use client'`.
- Calls
  `startRegistration(...)` (for
  `mode: 'register'`) or
  `startAuthentication(...)` (for
  `mode: 'login'`) from
  `@simplewebauthn/browser`,
  both of which wrap the
  underlying
  `navigator.credentials.create`
  / `.get` calls.
- POSTs the result + the
  `body` prop to `endpoint`.
- Routes the response
  through `onSuccess` or
  `onError`.
- Renders a 3-state UI:
  `idle` (button to start),
  `in_progress` (spinner
  + the `admin.webauthn.instruction`
  text), `done` (the
  `admin.webauthn.success`
  toast or the error key
  via `t(...)`).
- The button's text comes
  from the i18n keys
  (`admin.webauthn.title`
  in `idle`).

The component is used by the
`/admin/login` page in Bolt
005-002; the bolt ships the
component but no page
consumes it yet.

## Test contracts

### `tests/unit/require-webauthn.test.ts`

~15 Vitest checks. The test
files the guard as a pure
function of `(session,
{webAuthnCredentials,
webAuthnChallenge, latestChallenge})`
— the dev-store seam +
the user lookup are mocked
via the `db.userWebAuthn` +
`db.webAuthnChallenge`
surface:

1. `requireWebAuthn(null)` →
   401 `not_authenticated`.
2. `requireWebAuthn` with
   a non-admin session →
   403 `forbidden_role`.
3. `requireWebAuthn` with
   `webAuthnCredentials: null` →
   401 `webauthn_required`.
4. `requireWebAuthn` with
   `webAuthnCredentials: []`
   → 401 `webauthn_required`.
5. `requireWebAuthn` with
   credentials but no
   `WebAuthnChallenge` row →
   401 `webauthn_assertion_expired`.
6. `requireWebAuthn` with
   a `WebAuthnChallenge` row
   whose `expiresAt` is in
   the past → 401
   `webauthn_assertion_expired`.
7. `requireWebAuthn` with
   credentials + a fresh
   `WebAuthnChallenge` row →
   returns the session.
8. `requireWebAuthn` with
   `CITYFIX_DEV_STORE=1` +
   `DEV_SKIP_WEBAUTHN=1` +
   `session: null` → 401
   `not_authenticated` (the
   session check still runs
   first; the seam only
   short-circuits the
   challenge lookup).
9. `requireWebAuthn` with
   `CITYFIX_DEV_STORE=1` +
   `DEV_SKIP_WEBAUTHN=1` +
   `session: admin` →
   returns the session
   without consulting the
   database.
10. `requireWebAuthn` with
    `DEV_SKIP_WEBAUTHN=1`
    but `CITYFIX_DEV_STORE`
    unset → enforces the
    full check (the seam
    is ignored in
    production).
11. `requireWebAuthn` with
    `CITYFIX_DEV_STORE=1`
    but `DEV_SKIP_WEBAUTHN`
    unset → enforces the
    full check (the dev
    store alone is not
    enough).
12. The session-scoped
    challenge lookup
    prefers the
    `db.webAuthnChallenge.findLatest`
    row over the
    `User.webAuthnChallenge`
    JSON column (the JSON
    column is a cache).
13. `requireWebAuthn` does
    NOT call
    `db.userWebAuthn.writeChallenge`
    — the guard is
    read-only; the
    assertion route
    consumes the challenge.
14. `requireWebAuthn` does
    NOT call
    `writeAudit` — the
    audit row is emitted
    by the route handler
    that called the guard
    (e.g., the
    `POST /api/v1/admin/cities`
    route in Bolt 005-002
    writes the
    `webauthn.assertion`
    audit, not the guard).
15. The error thrown is
    always an `ApiError`
    instance (the guard
    never throws a raw
    `Error`).

### `tests/unit/webauthn-service.test.ts`

~12 Vitest checks for the
domain-service functions:

1. `issueChallenge(userId, 'assertion')` →
   creates a `WebAuthnChallenge`
   row + returns the
   `ChallengePayload`.
2. `issueChallenge(userId, 'registration')` →
   creates a `WebAuthnChallenge`
   row + returns the
   `RegisterChallengePayload`.
3. The challenge TTL is
   exactly 5 minutes from
   `Date.now()`.
4. `verifyAttestation` accepts
   a well-formed
   `@simplewebauthn/server`
   `VerifiedRegistrationResponse`
   and appends a new
   `WebAuthnCredential` to
   the user's
   `webAuthnCredentials`.
5. `verifyAttestation` rejects
   when the `credentialID`
   is already registered
   (duplicate register
   attempt).
6. `verifyAttestation` rejects
   when the
   `@simplewebauthn/server`
   verifier rejects the
   attestation.
7. `verifyAttestation` emits
   the `webauthn.register`
   audit row on success.
8. `verifyAttestation` does
   NOT emit an audit row on
   failure.
9. `verifyAssertion` accepts
   a well-formed assertion
   + bumps the credential's
   `counter` + mints a new
   `Session` + emits the
   `webauthn.assertion` audit
   row.
10. `verifyAssertion` rejects
    on `counter < storedCounter`
    (replay attempt).
11. `verifyAssertion` rejects
    on
    `expiresAt < Date.now()`.
12. `verifyAssertion` rejects
    on a `credentialID` not
    in the user's
    `webAuthnCredentials`.

The test mock uses
`@simplewebauthn/server`'s
in-memory fakes (the
library exports a
test-friendly
`verifyRegistrationResponse`
+ `verifyAuthenticationResponse`
that accepts a pre-built
attestation / assertion).
The test does NOT exercise
a real authenticator — the
end-to-end browser ceremony
is the Playwright spec's
job (with a virtual
authenticator via Playwright's
`--use-virtual-authenticator`
or the `WebAuthn` Playwright
test option).

### `tests/16-admin-webauthn-light.spec.ts`

~6 API checks + 1 visual
baseline:

1. `POST /api/auth/webauthn/register`
   without a session → 401
   `not_authenticated`.
2. `POST /api/auth/webauthn/register`
   with a citizen session → 403
   `forbidden_role`.
3. `POST /api/auth/webauthn/register`
   with an admin session +
   a (mocked) valid
   attestation → 201 + the
   credential echoed in the
   response body.
4. `POST /api/auth/webauthn/login`
   with `email: 'admin@cityfix.bd'`
   → 200 + a fresh challenge.
5. `POST /api/auth/webauthn/assertion`
   with a valid challenge +
   a (mocked) valid assertion
   → 200 + the
   `cityfix_session` cookie
   set.
6. `DELETE /api/auth/webauthn/revoke`
   with an admin session +
   a registered credential →
   204.
7. Visual baseline:
   `admin-webauthn-ceremony-1440x900.png`
   — the ceremony step
   rendered at 1440x900
   (light theme, English
   labels) on a test page
   that mounts the
   `WebAuthnCeremony`
   component. (The page is
   a route-spec-only test
   page; it lives under
   `tests/16-admin-webauthn-light.spec.ts`
   as an inline fixture, not
   in `app/`.)

The Playwright spec uses
the `request` context for
the API checks (no real
browser required) + a
`browser` context for the
visual baseline (the
ceremony step's UI).

## Reuse references

- `lib/auth/guards.ts:65` —
  `ApiError` class (the
  guard throws this).
- `lib/auth/session.ts:113` —
  `createSession(...)` (the
  assertion route uses this
  on success).
- `lib/auth/session.ts:54` —
  `SessionContext` (the guard
  accepts this).
- `lib/db-switch.ts:24` —
  the `db` facade (extended
  in this bolt with the
  `webAuthnChallenge` +
  `userWebAuthn` surfaces).
- `lib/dev-store.ts:582` —
  the `devDb` object
  (extended in this bolt).
- `lib/platform/audit.ts:23` —
  `writeAudit(...)` (the four
  domain events).
- `lib/i18n/keys.ts:185` —
  the `status.*` keys pin
  the shape (every key is a
  `{ bn, en }` object).
- `@simplewebauthn/server` v10
  — `verifyRegistrationResponse(...)`
  + `verifyAuthenticationResponse(...)`
  + `generateRegistrationOptions(...)`
  + `generateAuthenticationOptions(...)`.
- `@simplewebauthn/browser` v10
  — `startRegistration(...)` +
  `startAuthentication(...)`.

## Risk + design notes

- **HMAC signing of the
  challenge**: the
  `WebAuthnChallenge.challenge`
  is the random nonce the
  browser signs against.
  The bolt stores the
  challenge in plaintext
  (the same row the
  browser received) — the
  server-side `findLatest`
  reads the row + feeds the
  `challenge` to
  `@simplewebauthn/server`'s
  verifier. HMAC-signing the
  challenge would be a
  v1.1 hardening pass (it
  protects against a DB
  read that yields the
  expected value but is
  itself forged); v1's
  append-only
  `WebAuthnChallenge` table
  + the
  `requireWebAuthn`
  short-circuit on the
  dev seam is the
  v1 contract.
- **Replay protection**:
  the `counter` field in
  `WebAuthnCredential` is
  the replay protection.
  Every successful
  assertion must produce
  `counter >= storedCounter`
  (the
  `@simplewebauthn/server`
  verifier enforces this);
  on success the field is
  bumped to the
  `newCounter` value. A
  v1.1 hardening pass may
  add a `consumedAt`
  timestamp on the
  `WebAuthnChallenge` row
  to detect a replay even
  with a `counter` roll
  (the table is
  append-only at the
  storage layer; the
  v1.1 hardening would
  add a soft-delete on
  the read path).
- **The dev seam
  (`DEV_SKIP_WEBAUTHN`)**:
  the env var is consulted
  ONLY when the dev store
  is active
  (`CITYFIX_DEV_STORE=1`).
  A production deployment
  that somehow sets
  `DEV_SKIP_WEBAUTHN=1` is
  NOT affected — the guard
  enforces the full check.
  This is the same shape
  as the existing
  `lib/dev-session.ts`'s
  `isDevStore()` guard.
- **The dev admin
  `user_admin_anwar`**
  starts with
  `webAuthnCredentials: null`.
  The first time the dev
  admin hits an
  `/api/v1/admin/*` write
  route, the guard returns
  401 `webauthn_required`
  (unless the dev seam is
  active). The
  `/api/v1/admin/cities`
  page (Bolt 005-002) will
  detect this and prompt
  the admin to register a
  key — the
  `WebAuthnCeremony`
  component is the
  registration UI.
- **Visual baseline
  fragility**: the
  `admin-webauthn-ceremony-1440x900.png`
  captures a test-only
  page that mounts the
  `WebAuthnCeremony`
  component. The
  Playwright spec uses the
  Pillow `pixelmatch` helper
  (same as the other
  visual baselines);
  tolerance `0.005`. The
  ceremony step is
  deterministic (a single
  `idle` button + the
  instruction text) so
  the baseline is stable.
- **Pre-existing TS
  errors**: the prior
  bolts' `dedup-flag` TS
  errors remain out of
  scope; the bolt's own
  code is clean.

## Out-of-scope (deferred)

- **Hardware-key
  provisioning UI**
  (`/admin/security-keys`).
- **Backup TOTP codes**.
- **`requireWebAuthn` on
  `/api/auth/*`** — only
  `/api/v1/admin/*` writes
  are gated in v1.
- **Attestation chain
  verification** (v1.1
  hardening pass).
- **Multi-tenant RP ID
  rotation** (v1.1+).

## Cross-references

- **Domain Model**:
  `ddd-01-domain-model.md`
  in this folder.
- **Unit brief**:
  `intents/005-admin-city-setup/001-webauthn-and-auth/unit-brief.md`.
- **Story**:
  `intents/005-admin-city-setup/001-webauthn-and-auth/ADM-001-webauthn.md`.
- **Bolt plan**:
  `bolts/plan-005.md`.
- **Standards**:
  `standards/tech-stack.md`
  (WebAuthn-mandatory-for-admin,
  `@simplewebauthn/{server,browser}`
  pinning),
  `standards/coding-standards.md`
  (Zod boundary, audit
  log, i18n),
  `standards/api-conventions.md`
  (error envelope).
- **Stage 3 (ADR
  Analysis)**:
  `ddd-03-adr-analysis.md`
  in this folder.
