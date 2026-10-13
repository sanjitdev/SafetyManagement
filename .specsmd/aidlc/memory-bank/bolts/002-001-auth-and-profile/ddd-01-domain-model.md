---
standard: ddd-01-domain-model
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-001-auth-and-profile
---

# Bolt 002-001 — Domain Model

The citizen auth funnel. The model is **narrow on
purpose**: the funnel exists to issue and verify a
session cookie. Everything downstream (home / report /
reports / settings) consumes the resulting `Session`
aggregate and treats it as opaque.

## Ubiquitous language

| Term | Definition |
|------|------------|
| **Citizen** | A `User` with `role === 'citizen'`. The only role the auth funnel creates; the other three roles are admin-provisioned (Intents 003/004/005). |
| **Session** | A signed cookie (`cityfix_session`) backed by a `Session` row. The cookie value is `<sessionId>.<HMAC-SHA256>`. In dev mode the cookie is a raw id (no HMAC). |
| **Session scope** | The `(cityId, wardId, departmentId)` triple the session carries. Citizens bind to `(city, ward)`; the dispatcher/crew triple is set at their login (Intents 003/004). |
| **OTP** | A 6-digit SMS-OTP, argon2-hashed at rest, 5-min TTL, 5-attempt cap, single-use. Dev fixture: code `"000000"`. |
| **Phone (normalized)** | E.164 form for Bangladesh: `+8801XXXXXXXXX` (11-digit local number prefixed with `+880`). |
| **NID** | Bangladesh National ID, 10 or 17 digits. **Not** unique-per-city (multiple citizens can share an NID — e.g., family phones). |
| **Audit event** | A `user.register` or `user.login` row in `AuditEntry`. Every state-changing auth step writes one. |
| **Lockout** | A per-IP lockout window after 5 wrong-credentials within 10 min; locked for 10 min. Returns 423. |
| **First-run** | The path splash → welcome → register, gated by `localStorage.cityfix.welcome_seen.v1`. Returning citizens skip welcome and go straight to login. |
| **Returning citizen** | A user who already has a `Session` row whose cookie is not expired. Splash routes them to `/home`. |

## Bounded contexts

The auth funnel is **one** bounded context: the
**Identity** context. It owns `User`, `Session`,
`OtpCode`, the lockout map (in-process in v1; a
dedicated `FailedLogin` model in v1.1 if scale
demands), and the auth audit events.

Adjacent contexts (named here only so the boundaries
are explicit; they are not part of this Bolt):

- **Reporter** (Bolt 002-002/003/004) — consumes the
  `Session` to identify the citizen who files a ticket.
- **Profile** (this Bolt, deferred) — future Bolt
  owns the `User.profile` read/write surface
  (name + language override + push subscriptions).

The Identity context's only public contracts are:

- `GET /api/auth/status` → `{ authenticated, session? }`
- `POST /api/v1/auth/register` → `201 { ok, userId }`
- `POST /api/v1/auth/send-otp` → `200 { ok }`
- `POST /api/v1/auth/verify-otp` → `200 { ok }`
- `POST /api/v1/auth/login` → `200 { ok, userId }`
- `POST /api/v1/auth/logout` (implicit via cookie
  delete on a future Bolt) — **not in this Bolt**.

The Identity context depends on the
**Platform context** for:

- `lib/platform/rate-limit.ts` — token bucket
- `lib/platform/audit.ts` — `writeAudit`
- `lib/db-switch.ts` — backend-agnostic facade
- `lib/auth/{password,otp,session,guards}.ts` —
  hashing + session helpers

## Aggregates

### `User` (aggregate root)

**Owns**: the citizen's identity surface.

**State**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | cuid; primary key. |
| `cityId` | string | Per-city isolation (PLAT-REQ-002). |
| `role` | enum | `'citizen'` for the funnel; dispatcher/crew/admin are provisioned elsewhere. |
| `phone` | string \| null | E.164 `+8801XXXXXXXXX`; unique per city (`@@unique([cityId, phone])`). |
| `nid` | string \| null | 10 or 17 digits; **not** unique. |
| `name` | string | ≥ 2 chars; surfaced via the citizen serializer. |
| `passwordHash` | string \| null | argon2id; null until verified. |
| `wardId` | string \| null | Citizen's filing ward; defaults to the city's first ward by number on registration. |
| `languageOverride` | enum \| null | `'bn' \| 'en' \| null`; null → city default. |
| `email` | string \| null | Citizens don't use this; present for the other three roles. |
| `webAuthn*` | various | Out of v1 for citizens; admin WebAuthn lands in Intent 005. |

**Invariants**:

- `role === 'citizen' → phone !== null && passwordHash !== null`
- `phone` is **unique per city** — a phone can register in two different cities, but not twice in the same city.
- `nid` is **not** a uniqueness key.

### `Session` (aggregate root)

**Owns**: the session-cookie lifecycle.

**State**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | cuid; the cookie value's session-id half. |
| `userId` | string | FK → User. |
| `cityId` | string | Baked in at session creation; cross-city reads denied at API. |
| `wardId` | string \| null | Citizens: the user's filing ward. Dispatchers/crew: their scope ward. |
| `departmentId` | string \| null | Citizens: null. Dispatchers/crew: their scope department. |
| `expiresAt` | Date | 14-day TTL from creation. |
| `lastSeenAt` | Date | Updated fire-and-forget on each request. |

**Invariants**:

- A session is **deletable only by its own user** or by
  an admin (Intent 005).
- Expired sessions are **deleted on read** — `getSession`
  does the cleanup.
- `wardId` and `departmentId` are **frozen at session
  creation**. A dispatcher who changes wards mid-shift
  must re-login. (v1 posture; v1.1 may add a
  re-binding endpoint.)

### `OtpCode` (entity)

**Owns**: the SMS-OTP issuance / verification surface.

**State**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | cuid. |
| `userId` | string | FK → User. |
| `codeHash` | string | argon2id. |
| `scope` | string | `'registration' \| 'login' \| 'password-reset'`. |
| `expiresAt` | Date | 5-min TTL. |
| `usedAt` | Date \| null | Set on first successful verify. |
| `attempts` | int | Cap 5; subsequent attempts on the same code fail closed. |

**Invariants**:

- An OTP is **single-use** — verify sets `usedAt`,
  subsequent verifies return `already_used`.
- An OTP is **per-scope** — `scope = 'registration'` does
  not authorize `scope = 'login'`.
- `attempts >= 5 → locked until a new OTP is issued`.
- The plaintext OTP is **never persisted**; only the
  argon2id hash.

## Value objects

| VO | Definition |
|----|-----------|
| `Phone` (normalized) | `+8801[0-9]{9}`. E.164 BD form. Stored as the User.phone column. The registration form accepts `+8801XXXXXXXXX`, `8801XXXXXXXXX`, or `01XXXXXXXXX` and normalizes on the server. |
| `NID` | 10 or 17 digits, no checksum in v1 (Bangladesh NID has a checksum but it isn't on the public form yet). |
| `Password` | ≥ 8 chars, must include a digit. Argon2id-hashed before storage. |
| `OtpCode` | 6 digits, leading zeros allowed. |
| `SessionCookie` | `cityfix_session=<sessionId>.<HMAC-SHA256 signature>`. Dev mode: raw id. |
| `Language` | `'bn' \| 'en'`. Bangla-first per WO-001 PRD. |

## Domain services

### `registerCitizen(input)`

**Purpose**: create a new `User` with `role === 'citizen'`
and mint a session.

**Inputs** (Zod-validated at the route layer):

- `phone` (raw form value, normalized server-side)
- `nid`
- `name`
- `password`
- `citySlug` (default `'dhaka-north'` for v1)

**Steps**:

1. Normalize phone → E.164.
2. Resolve city by slug.
3. Validate password (min 8 + digit; argon2 enforces too).
4. Check phone uniqueness in this city (409 on conflict).
5. Resolve the default ward (the city's first ward by number).
6. Create the user.
7. Create the session.
8. Set the cookie.
9. Write `user.register` audit event.
10. Return `{ userId }`.

**Errors**:

| Error | Status |
|-------|--------|
| `invalid_input` | 400 |
| `rate_limited` | 429 |
| `city_not_found` | 404 |
| `phone_already_registered` | 409 |
| `ward_not_found` | 500 (city has no wards) |

### `loginCitizen(input)`

**Purpose**: authenticate a returning citizen.

**Inputs**:

- `phone` (raw, normalized server-side)
- `password`
- `citySlug` (default `'dhaka-north'`)

**Steps**:

1. Per-IP rate limit check.
2. Lockout check (per-IP; 5 wrong in 10 min → 423).
3. Normalize phone → E.164.
4. Resolve city.
5. Look up user by `(cityId, phone, role='citizen')`.
6. Verify password (argon2id constant-time).
7. On failure: bump the per-IP attempt counter.
8. On success: clear the counter, create the session, set the cookie, write `user.login` audit event.
9. Return `{ userId }`.

**Errors**:

| Error | Status |
|-------|--------|
| `invalid_input` | 400 |
| `rate_limited` | 429 |
| `locked` | 423 |
| `wrong_credentials` | 401 (vague — does not leak which field is wrong) |
| `city_not_found` | 404 |

### `issueOtp(scope, userId)`

**Purpose**: generate a 6-digit OTP, store the argon2id
hash, and (in prod) hand the plaintext to the SMS
provider. In dev, the plaintext is logged to stdout
but the dev fixture is `"000000"`.

**Side effects**:

- `OtpCode` row created.
- `lib/platform/push.ts` is **not** called here — SMS
  is the responsibility of the OTP SMS provider (Intent
  005 / `ADM-006`); v1 has a no-op stub.

### `verifyOtp(scope, userId, candidate)`

**Purpose**: verify the citizen-supplied 6-digit code.

**Steps**:

1. Look up the most recent `OtpCode` for `(userId, scope)`
   that is un-used and un-expired.
2. Increment `attempts`. If `attempts >= 5` → reject the
   code (citizen must request a new one).
3. Re-hash the candidate and constant-time compare
   against the stored hash.
4. On match: set `usedAt = now()`, **do not** issue a
   session — the caller decides what the OTP was for
   (registration completion, login, password reset).
5. Return boolean.

### `getActiveSession()`

**Purpose**: read the cookie, verify the HMAC signature
(in prod), look up the row, return the
`SessionContext` projection (or null). The
**single public read API** every downstream route
consumes.

**Side effects**:

- `Session.lastSeenAt` is updated fire-and-forget.

### `requireRole(session, ...allowed)`, `requireSameCity`, `requireScope`

**Purpose**: the guard chain (lib/auth/guards.ts).
`requireRole` throws `ApiError(401, 'not_authenticated')`
or `ApiError(403, 'forbidden_role')`. `requireScope`
is a no-op for citizens; it enforces the
`(wardId, departmentId)` triple for dispatcher/crew.

## Domain events

| Event | Emitted by | Consumed by |
|-------|-----------|-------------|
| `user.register` | `registerCitizen` | Audit log; potentially a welcome push in v1.1. |
| `user.login` | `loginCitizen` | Audit log; potentially a "new device" push in v1.1. |
| `user.otp_issued` | `issueOtp` | Audit log (planned, not yet emitted — see Bolt Decision G2). |
| `user.otp_verified` | `verifyOtp` | Audit log (planned, not yet emitted). |
| `session.expired` | `getSession` (on read) | Implicit; the row is deleted. No consumer. |

**v1 emits** only `user.register` and `user.login`.
The OTP events are listed here for the
**ADR-009** (or "no-ADR") decision the Bolt makes
about whether to add them in this Bolt or defer.

## Ubiquitous constraints (the BDD acceptance language)

For the **Construction Verification Command** to be
green, the Bolt must demonstrate:

1. `registerCitizen` on a fresh phone → 201 + cookie
   set → `/verify-otp` accepts `"000000"` → session is
   active.
2. `registerCitizen` on a phone already in the same
   city → 409 (`phone_already_registered`).
3. `registerCitizen` on a phone already in a **different**
   city → 201 (per-city uniqueness).
4. `loginCitizen` with the wrong password → 401
   (`wrong_credentials`).
5. 5 wrong logins from the same IP within 10 min → 423
   (`locked`).
6. `getActiveSession` with a tampered cookie → null.
7. `getActiveSession` with an expired cookie → null +
   row deleted.
8. `getActiveSession` with a fresh cookie from the dev
   store (raw id) → `SessionContext` (dev mode only).

## Notes for ddd-02

- The session-cookie **HMAC** is keyed on
  `process.env.SESSION_SECRET` (≥ 32 chars). Dev
  default is checked into `.env.example`.
- `writeAudit` is called for `user.register` and
  `user.login`. The OTP paths do not yet call it.
  A future Bolt (or the same one, per Bolt Decision)
  can add the OTP audit events.
- The rate-limit primitive
  (`lib/platform/rate-limit.ts`) is **shared** with
  Bolt 002-003 (the ticket-creation route uses
  `(actor, ticket)`; the auth routes use
  `(ip, 'login' | 'register' | 'send-otp' | 'verify-otp')`).
  The per-IP key is a stable extension; the
  `requireRole` chain does not change.

## Cross-references

- **bolt.md**: `./bolt.md`.
- **Standards**:
  - `../../standards/tech-stack.md` (auth + data + i18n)
  - `../../standards/coding-standards.md` (Result types,
    Zod boundaries)
  - `../../standards/api-conventions.md` (REST/JSON +
    audit + serializer)
  - `../../standards/system-architecture.md` (modular
    monolith + layered)
  - `../../standards/decision-index.md` (ADR-001, 002,
    004, 008)
- **Active intent**:
  `../../intents/002-citizen-report-flow/`.
- **Code-reality audit**: `../../REFINEMENT.md`
  (Gaps G2, G3 partially).
- **Bolt plan**: `../plan.md`.
