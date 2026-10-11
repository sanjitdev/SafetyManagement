---
standard: ddd-01-domain-model
bolt: 005-001-webauthn-and-auth
unit: 005-admin-city-setup/001-webauthn-and-auth
phase: construction
status: complete
created: 2026-10-12T05:45:00Z
updated: 2026-10-12T05:45:00Z
---

# Bolt 005-001 — Domain Model (delta)

The static domain model produced for Bolt
005-001. Per the bolt type's Stage 1
contract, this artifact is
documentation-only — no source code was
read or written during Stage 1. The model
is the contract the Implementation stage
(Stage 4) will code against.

## Ubiquitous language

The bolt introduces a small, focused
glossary. Every term here appears in
either the route handler names, the
domain entities, or the i18n key
prefixes — never the other way around.

| Term | Definition |
|------|------------|
| **WebAuthn ceremony** | The browser-driven protocol exchange between a `User` (admin) and the platform: `navigator.credentials.create(...)` (registration) or `navigator.credentials.get(...)` (assertion). The ceremony is mediated by a server-issued `WebAuthnChallenge`. |
| **WebAuthn challenge** | A short-lived, single-use random nonce the server issues to an admin to drive one browser ceremony. Lifetime: 5 minutes (matches the citizen OTP TTL). |
| **WebAuthn assertion** | The signed result of a `navigator.credentials.get(...)` call. Proves possession of the private key bound to a registered credential. Validated server-side against the stored public key + the `WebAuthnChallenge` row. |
| **WebAuthn credential** | A registered authenticator — a `credentialID` + `credentialPublicKey` + `counter` (the `signCount` against which replay attacks are detected) — persisted on `User.webAuthnCredentials`. A `User` may hold zero or many credentials; one is the v1 minimum. |
| **WebAuthn-required write** | Any state-changing operation under `/api/v1/admin/*`. The `requireWebAuthn` guard enforces that the session's user has a registered credential AND a fresh (≤ 5 min) challenge, otherwise the route returns 401. Read access (e.g., the audit dashboard) only requires the session cookie. |
| **Admin bootstrap** | The first WebAuthn credential an admin registers. Prior to bootstrap, `User.webAuthnCredentials` is empty; the `requireWebAuthn` guard returns 401 `webauthn_required`. The admin completes a register ceremony (`/api/auth/webauthn/register`) to bootstrap. |
| **Dev seam** | The `DEV_SKIP_WEBAUTHN=1` env var, consulted only when `CITYFIX_DEV_STORE=1`. The dev persona (Anwar) can hit `/api/v1/admin/*` writes without a real ceremony. The seam is never consulted in production. |

## Domain entities

The Prisma schema ships in Intent 001
(Platform Foundation) and is unchanged
by this bolt. The two existing tables
that the bolt reads + writes are:

### `User.webAuthnCredentials` (JSON column)

A nullable JSON column on `User`. When
present, it holds an array of
`WebAuthnCredential` value objects (see
"Value objects" below). Empty or
`null` means the admin has not
completed a register ceremony.

### `User.webAuthnChallenge` (JSON column)

A nullable JSON column on `User`. A
short-lived copy of the most recent
unconsumed challenge for that user.
Read at assertion time to validate the
signing operation against the
expected nonce.

### `WebAuthnChallenge` table

Server-side challenge ledger. The
schema ships in Intent 001:

```
model WebAuthnChallenge {
  id         String   @id @default(cuid())
  userId     String
  challenge  String   // random server-side nonce
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}
```

The table is append-only at the
storage layer (the bolt does not
delete from it; the in-memory dev
store mirrors that posture by
ignoring any delete requests and
letting entries expire naturally).

### `User` (no schema change)

The existing `User` row is read at
the four route handlers:

- `register` — read the row, verify
  the session is admin, verify the
  role has not already registered
  the same `credentialID`, append
  the new credential to
  `webAuthnCredentials`.
- `login` — read by `email`, verify
  the row exists and has at least
  one credential, issue a fresh
  challenge.
- `assertion` — read by the
  challenge id, verify the session
  (or an unconsumed challenge) is
  bound to the admin, validate the
  signature, bump `signCount`,
  mint a session.
- `revoke` — read the row, remove
  the named credential from
  `webAuthnCredentials`. Refuse if
  it would leave the admin with
  zero credentials (the last
  credential cannot be revoked
  without re-registering).

### `Session` (no schema change)

A successful `assertion` mints a
new `Session` row via
`createSession(...)` from
`lib/auth/session.ts`. The session
row is identical to the
phone-OTP-driven path — WebAuthn
assertion is the proof of
possession that gates session
creation, and the session cookie
is the v1 surface.

## Value objects

Three small JSON-serializable
shapes the bolt manipulates. They
are NOT Prisma models — they are
nested inside `User.webAuthnCredentials`
and the in-flight challenge
payloads.

### `WebAuthnCredential`

The per-credential record stored in
`User.webAuthnCredentials` (an
array of these per user).

| Field | Type | Description |
|-------|------|-------------|
| `credentialID` | `string` (base64url) | The authenticator's credential ID — identifies this credential for assertion / revocation. |
| `credentialPublicKey` | `Uint8Array` (base64url-encoded) | The public key the server uses to verify assertions. |
| `counter` | `number` | The `signCount` the authenticator reported at registration. The assertion must produce `counter >= this.counter`; on success, this field is bumped to the assertion's reported `counter` (replay protection). |
| `transports` | `string[]?` | Optional hint of the authenticator's transport (`usb`, `nfc`, `ble`, `internal`) — recorded for support diagnostics. Not validated by the server. |
| `registeredAt` | `string` (ISO 8601) | When the register ceremony completed. Used in the audit row. |
| `name` | `string` | User-friendly name (e.g. `"YubiKey 5C — desk"`, `"MacBook Touch ID"`). v1 allows free-text; the v1.1 hardware-key-provisioning flow will offer a managed list. |

### `ChallengePayload`

The challenge the server returns
to the browser (the `login`
route's response body) and the
client posts back (the
`assertion` route's request
body).

| Field | Type | Description |
|-------|------|-------------|
| `challenge` | `string` (base64url) | The random nonce the server issued. |
| `rpId` | `string` | The Relying Party ID — the hostname the browser will scope credentials to. v1: `localhost` in dev, the prod hostname in production. |
| `allowCredentials` | `Array<{ id: string; transports?: string[] }>` | The credential IDs the browser should offer the user. The `login` route looks them up from the user's `webAuthnCredentials` and returns only the `id` (+ `transports` if present). |
| `userVerification` | `'required' \| 'preferred' \| 'discouraged'` | The level of user verification the server requests. v1: `'preferred'` (most authenticators satisfy it; the protocol still accepts `'discouraged'`-tier ones). |
| `timeout` | `number` (ms) | The ceremony timeout. v1: 60000 (60s). |

### `RegisterChallengePayload`

The challenge the server returns
to the browser for the
registration ceremony
(`register` route's response
body).

| Field | Type | Description |
|-------|------|-------------|
| `challenge` | `string` (base64url) | Random nonce. |
| `rp` | `{ id: string; name: string }` | The Relying Party — `id` is the hostname, `name` is the display name (e.g. `"CityFix"`). |
| `user` | `{ id: string; name: string; displayName: string }` | The admin's user.id + name + displayName. |
| `pubKeyCredParams` | `Array<{ type: 'public-key'; alg: number }>` | The public-key algorithms the server accepts. v1: `[-7]` (ES256) + `[-257]` (RS256). |
| `timeout` | `number` (ms) | Ceremony timeout. v1: 60000. |
| `attestation` | `'none' \| 'indirect' \| 'direct'` | v1: `'none'` (we do not verify the authenticator's attestation chain — only the public-key signature). |
| `authenticatorSelection` | `{ residentKey: 'preferred'; userVerification: 'preferred' }` | v1 hints. |

## Domain events

The bolt publishes four
domain events. Every event is
written to the audit log via
`writeAudit(...)` from
`lib/platform/audit.ts`. The
event vocabulary is the wire
contract the v1.1
hardware-key-provisioning
flow will share.

| Event | Trigger | `entityType` | `action` | `beforeValue` | `afterValue` |
|-------|---------|--------------|----------|---------------|--------------|
| `webauthn.register` | `POST /api/auth/webauthn/register` 201 response | `user` | `webauthn.register` | `null` | `{ credentialId, name, registeredAt }` |
| `webauthn.login_challenge` | `POST /api/auth/webauthn/login` 200 response | `user` | `webauthn.login_challenge` | `null` | `{ challengeId, expiresAt }` |
| `webauthn.assertion` | `POST /api/auth/webauthn/assertion` 200 response | `user` | `webauthn.assertion` | `{ counter }` | `{ counter: newCounter, sessionId, expiresAt }` |
| `webauthn.revoke` | `DELETE /api/auth/webauthn/revoke` 204 response | `user` | `webauthn.revoke` | `{ credentialId, name }` | `null` |

Failed ceremonies (validation
error, signature mismatch,
expired challenge) are NOT
written to the audit log —
they are 4xx responses and the
guard's `ApiError` already
captures the reason. The
`writeAudit` call only fires
on a successful state
transition.

## Aggregates

The bolt's only aggregate is the
`User` admin profile (the
existing `User` row, scoped to
the role `admin`):

```
Aggregate: AdminAuth
  Root: User { role: 'admin' }
  Members:
    User.webAuthnCredentials: WebAuthnCredential[]   // value-object array
    User.webAuthnChallenge: ChallengePayload?       // most recent in-flight
    WebAuthnChallenge[]: ChallengeLedger            // server-side history
  Invariants:
    - counter is monotonically non-decreasing per credential
    - webAuthnCredentials is non-empty if the user has completed
      a register ceremony
    - The challenge is single-use; consumed challenges are
      not deleted but not re-validated
    - revoke() may not leave the user with zero credentials
      (the v1 rule: a last-credential revoke is a 409 conflict)
```

The aggregate's transactional
boundary is the `User` row.
Every state change (register,
revoke, signCount bump) writes
to `User` + emits an audit row.
The `WebAuthnChallenge` table is
append-only at the storage
layer.

## Domain services

The bolt stands up three
domain-service functions in
`lib/auth/webauthn.ts` (the
Implementation stage will create
this file):

### `issueChallenge(userId, kind)`

Creates a new `WebAuthnChallenge`
row + returns the
`ChallengePayload` /
`RegisterChallengePayload` the
browser needs. `kind` is
`'registration' | 'assertion'`
and selects the payload shape.

### `verifyAttestation(userId, attestationResponse)`

Validates the browser's
attestation against the stored
challenge, the relying party
configuration, and the user's
existing credentials (the
`credentialID` must not already
be registered). On success,
appends a new `WebAuthnCredential`
to the user's
`webAuthnCredentials` and emits
`webauthn.register`. On
failure, throws `ApiError`
(400 `invalid_input` /
`webauthn_attestation_failed`).

### `verifyAssertion(assertionResponse)`

Validates the browser's
assertion against the stored
challenge + the named
credential's public key +
counter. On success:

1. Bumps the credential's
   `counter` to the new value.
2. Mints a new `Session` via
   `createSession(...)` (the
   `User.cityId` is the
   session's `cityId`; admin
   sessions have `wardId: null`
   + `departmentId: null`).
3. Emits `webauthn.assertion`.

On failure, throws `ApiError`
(401 `webauthn_assertion_failed`
or 401
`webauthn_assertion_expired`).

## Repository interfaces

The bolt's repository surface
extends the existing
`db-switch.ts` facade with two
new shapes. The
`lib/auth/webauthn.ts`
domain-service functions call
through these — the route
handlers never touch the
facade directly.

### `db.webAuthnChallenge`

```ts
interface WebAuthnChallengeRepo {
  create(args: {
    userId: string;
    challenge: string;
    expiresAt: Date;
  }): Promise<{ id: string; challenge: string; expiresAt: Date }>;
  findLatest(args: { userId: string }): Promise<{
    id: string;
    challenge: string;
    expiresAt: Date;
  } | null>;
}
```

`create` appends a row.
`findLatest` returns the most
recent unconsumed challenge for
the user (for `verifyAssertion`
to look up the nonce the
browser signed against).
`consume` is intentionally NOT
a method — the table is
append-only; consumed rows
stay on disk for audit.

### `db.user.webAuthn`

```ts
interface UserWebAuthnRepo {
  readCredentials(userId: string): Promise<{
    webAuthnCredentials: WebAuthnCredential[] | null;
    webAuthnChallenge: ChallengePayload | null;
  }>;
  writeCredentials(
    userId: string,
    credentials: WebAuthnCredential[],
  ): Promise<void>;
  writeChallenge(
    userId: string,
    challenge: ChallengePayload | null,
  ): Promise<void>;
  bumpCounter(
    userId: string,
    credentialId: string,
    newCounter: number,
  ): Promise<void>;
  revokeCredential(
    userId: string,
    credentialId: string,
  ): Promise<{ removed: WebAuthnCredential; remaining: number }>;
}
```

`readCredentials` returns the
two JSON columns in a single
round-trip. `writeCredentials`
replaces the array. `writeChallenge`
sets / clears the in-flight
challenge. `bumpCounter` updates
a single credential's
`counter` field. `revokeCredential`
removes one credential and
returns the removed record +
the remaining count (so the
domain service can enforce the
"no last-credential revoke"
invariant).

In the dev store (in-memory)
the surface is implemented
against the existing
`Map<string, DevUser>` with
JSON-stringified columns. In
the production Prisma path the
surface delegates to
`prismaClient.user.update({
where: { id }, data: {
webAuthnCredentials,
webAuthnChallenge } })`.

## Ubiquitous language → i18n mapping

The user-facing copy the bolt
ships in `lib/i18n/keys.ts`
under the `admin.webauthn.*`
prefix. Every key name mirrors
a term in the ubiquitous
language table at the top of
this artifact:

| i18n key | Term | Locale shape |
|----------|------|--------------|
| `admin.webauthn.title` | WebAuthn ceremony | "Sign in with security key" / "নিরাপত্তা কী দিয়ে সাইন ইন" |
| `admin.webauthn.instruction` | WebAuthn ceremony | "Insert your security key, then tap the button" / "নিরাপত্তা কী ঢোকান, তারপর বোতাম চাপুন" |
| `admin.webauthn.error.no_credential` | WebAuthn-required write | "No security key registered. Contact your administrator." / "কোনো নিরাপত্তা কী নিবন্ধিত নেই। প্রশাসকের সাথে যোগাযোগ করুন।" |
| `admin.webauthn.error.expired` | WebAuthn-required write | "Assertion expired. Try again." / "যাচাইকরণের মেয়াদ শেষ। আবার চেষ্টা করুন।" |
| `admin.webauthn.success` | WebAuthn ceremony | "Security key verified" / "নিরাপত্তা কী যাচাই সম্পন্ন" |

The Implementation stage
authors these keys. The Domain
Model stage names the contract
the keys must satisfy.

## Cross-aggregate consistency

The `AdminAuth` aggregate
(above) is the only aggregate
the bolt touches. There is no
cross-aggregate transaction
required. The
`/api/v1/admin/cities/*` write
routes that Bolt 005-002 will
stand up will:

1. Call `requireRole(session,
   'admin')` (already in
   `lib/auth/guards.ts`).
2. Call `requireWebAuthn(session)`
   (new in this bolt).
3. Perform the write + emit
   an `AuditEntry` via
   `writeAudit(...)`.

The WebAuthn guard is the
contract between the two
bolts; the Domain Model stage
defines it once and the
Implementation stages honor
it.

## Reuse references

The Domain Model stage
reuses these without
modification:

- `lib/auth/guards.ts`
  (`requireRole`,
  `requireSameCity`,
  `requireScope`, `ApiError`).
- `lib/auth/session.ts`
  (`getSession`, `createSession`,
  `SESSION_COOKIE`).
- `lib/db-switch.ts` (the
  facade — extended in this
  bolt with the
  `webAuthnChallenge` +
  `user.webAuthn` shapes
  above).
- `lib/platform/audit.ts`
  (`writeAudit`).
- `lib/i18n/keys.ts`
  (extended in this bolt).
- `lib/dev-store.ts`
  (extended in this bolt with
  `webAuthnChallenge` rows +
  `User.webAuthnCredentials`
  on the dev admin user).
- `@simplewebauthn/server` v10
  — `verifyRegistrationResponse(...)`
  + `verifyAuthenticationResponse(...)`.
- `@simplewebauthn/browser` v10
  — `startRegistration(...)` +
  `startAuthentication(...)`
  on the client.

## Out-of-scope (deferred)

- **Multi-credential
  provisioning UI**
  (`/admin/security-keys` — a
  v1.1 page that lets an admin
  register a second hardware
  key as a backup). The bolt
  supports the data model for
  multiple credentials (the
  `webAuthnCredentials` is an
  array); the v1 surface only
  requires one.
- **Backup TOTP codes** (a
  v1.1 recovery path for admins
  who lose their security key).
- **`requireWebAuthn` on
  `/api/auth/*`** — only
  `/api/v1/admin/*` writes are
  gated in v1. The audit
  dashboard read
  (Unit 004) only needs a
  valid session cookie.
- **Attestation chain
  verification** — v1 uses
  `attestation: 'none'`. A v1.1
  hardening pass would verify
  the authenticator's
  attestation chain (YubiKey
  root, etc.) to gate
  enterprise-class keys.
- **RP ID rotation** — the
  hostname in `ChallengePayload.rpId`
  is pinned to the prod
  hostname. A future Bolt
  may need to support the
  multi-tenant / multi-RP
  case (one platform, many
  cities each with their own
  Relying Party).

## Cross-references

- **Bolt plan**:
  `bolts/plan-005.md` — the
  4-bolt Intent 005
  decomposition.
- **Unit brief**:
  `intents/005-admin-city-setup/001-webauthn-and-auth/unit-brief.md`.
- **Story**:
  `intents/005-admin-city-setup/001-webauthn-and-auth/ADM-001-webauthn.md`.
- **Standards**:
  `standards/tech-stack.md`
  (WebAuthn-mandatory-for-admin),
  `standards/api-conventions.md`
  (response envelope, error
  codes),
  `standards/coding-standards.md`
  (Result types, audit log,
  Zod boundary).
- **ADR-007** — the WebAuthn
  mandatory-for-admin-writes
  policy this bolt implements.
- **Stage 2 (Technical Design)**:
  `ddd-02-technical-design.md`
  in this folder — translates
  this Domain Model into route
  handlers + Zod schemas + the
  dev-store extensions.
