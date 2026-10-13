---
standard: ddd-02-technical-design
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-001-auth-and-profile
---

# Bolt 002-001 — Technical Design

The architecture, layer structure, API contracts, data
persistence, security, and NFRs of the citizen auth
funnel. The design **anchors to the existing source**
(`lib/auth/*`, `app/api/v1/auth/**`, the four
`page.tsx` files) — the Bolt's implement phase is
paperwork + small refinements + visual-baseline
capture, not a from-scratch build.

## Architecture pattern

The CityFix repo is a **modular monolith** with a
**layered** architecture (per
`../../standards/system-architecture.md`):

```text
┌─────────────────────────────────────────────────┐
│  Presentation  (app/splash, app/welcome,        │
│                 app/register, app/verify-otp,   │
│                 app/login — all 'use client')   │
└────────────────────┬────────────────────────────┘
                     │ fetch (credentials: 'include')
                     ▼
┌─────────────────────────────────────────────────┐
│  API  (app/api/v1/auth/{register,send-otp,      │
│        verify-otp,login}/route.ts +             │
│        app/api/auth/status/route.ts)            │
│   - Zod parse at the route boundary             │
│   - Audit + rate-limit at the route boundary    │
│   - Returns JSON; sets cookie on success        │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Service  (lib/auth/{password,otp,session,      │
│            guards}.ts)                          │
│   - Pure functions; Result<T,E> not yet, but    │
│     errors thrown as ApiError, not throw new     │
│     Error(...) in the app code                  │
│   - Argon2id for password + OTP hash            │
│   - HMAC-SHA256 for session cookie              │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Platform  (lib/platform/{rate-limit,audit}.ts, │
│             lib/db-switch.ts)                   │
│   - In-process token bucket                     │
│   - writeAudit (append-only)                    │
│   - db.* facade (Prisma or in-memory dev store) │
└─────────────────────────────────────────────────┘
```

The Identity bounded context owns the **API + Service +
Platform** layers above. The Presentation layer is
**stateless**: every page re-validates the session via
`/api/auth/status` and routes accordingly.

## Layer structure (per route)

### `POST /api/v1/auth/register`

```text
1. Per-IP rate limit (lib/platform/rate-limit.ts):
   rl = rateLimit(`register:${ip}`)
   if (!rl.allowed) → 429

2. Zod parse (RegisterInput schema)
   - phone: string, 11..14 chars, digits/+-/
   - nid: 10 or 17 digits
   - name: 2..120 chars
   - password: 8..200 chars
   - citySlug: default 'dhaka-north'

3. Normalize phone → E.164
   Accept: "+8801XXXXXXXXX" | "8801XXXXXXXXX" | "01XXXXXXXXX"

4. Re-validate: /^\+8801[0-9]{9}$/

5. Resolve city by slug (db.city.findUniqueBySlug)

6. Hash password (lib/auth/password.hashPassword)
   - second line of defense: argon2 enforces 8+ + digit

7. Check phone uniqueness in this city
   - dev: in-memory scan
   - prod: prisma.user.findFirst({ cityId, phone, role: 'citizen' })
   - 409 phone_already_registered on conflict

8. Resolve default ward (db.ward.findFirst, orderBy number asc)
   - 500 ward_not_found if the city has no wards (defensive)

9. Create user (db.user.create)
   - id: user_<uuid12>
   - cityId, role: 'citizen', phone, nid, name,
     passwordHash, wardId

10. Create session (lib/auth/session.createSession)
    - TTL: 14 days
    - cookie value: <id>.<HMAC> (prod) | <id> (dev)

11. Set cookie (cookies().set(cityfix_session, value, opts))
    - httpOnly: true
    - sameSite: 'lax'
    - secure: NODE_ENV === 'production'
    - path: '/'
    - expires: 14 days from now

12. Audit (lib/platform/audit.writeAudit)
    - entityType: 'user'
    - entityId: <new userId>
    - action: 'user.register'
    - actorId: <new userId>
    - afterValue: { cityId, role: 'citizen' }

13. Respond 201 { ok: true, userId }
```

### `POST /api/v1/auth/login`

```text
1. Per-IP rate limit (lib/platform/rate-limit.ts):
   rl = rateLimit(`login:${ip}`)
   if (!rl.allowed) → 429

2. Lockout check (in-process map keyed by `login:${ip}`):
   if (prior.lockedUntil > now) → 423

3. Zod parse (LoginInput schema)
   - phone: 11..20 chars
   - password: 1..200 chars (length check; not strength)
   - citySlug: default 'dhaka-north'

4. Normalize phone → E.164; re-validate

5. Resolve city by slug → 404 if not found

6. Look up user (db.user.findFirst)
   - where: { cityId, phone, role: 'citizen' }
   - if !user or no passwordHash:
       noteFailure(attemptKey)
       → 401 wrong_credentials (vague)

7. Verify password (lib/auth/password.verifyPassword)
   - constant-time argon2id
   - on failure: noteFailure; if locked → 423, else 401

8. On success: noteSuccess (clear attempt map)

9. Create session (lib/auth/session.createSession)
   - wardId: user.wardId (the citizen's filing ward)
   - departmentId: null

10. Set cookie (same as register)

11. Audit (lib/platform/audit.writeAudit)
    - action: 'user.login'
    - actorId: user.id
    - afterValue: { cityId }

12. Respond 200 { ok: true, userId }
```

### `POST /api/v1/auth/send-otp` (and `POST /api/v1/auth/verify-otp`)

The send-OTP route generates a 6-digit code, hashes it,
and persists the `OtpCode` row. In dev, the plaintext
is logged to stdout (real provider is Intent 005).

The verify-OTP route:

```text
1. Per-IP rate limit
2. Zod parse { phone, code, citySlug, scope }
3. Resolve user; ensure an un-used un-expired OtpCode
   for (userId, scope)
4. Increment attempts; if attempts >= 5 → reject
5. Re-hash + constant-time compare
6. On match: set usedAt = now()
7. Audit (planned; see Bolt Decision G2)
8. Respond 200 { ok: true }
```

### `GET /api/auth/status`

```text
1. getSession() (lib/auth/session)
2. Respond 200 { authenticated: !!session, session? }
   Where session is the SessionContext projection
   (or omitted if unauthenticated).
```

## Data persistence

- **Prisma** is the prod backend; **`lib/dev-store.ts`**
  is the in-memory backend selected by
  `CITYFIX_DEV_STORE=1`. Both backends are accessed
  through `lib/db-switch.ts`'s `db.*` facade.
- The `User`, `Session`, `OtpCode` models are in
  `prisma/schema.prisma:114-198`. No schema change is
  required for this Bolt.
- **Indexes used**:
  - `User @@unique([cityId, phone])` — uniqueness check.
  - `User @@index([cityId, role])` — login query.
  - `Session @@index([userId])` — lastSeenAt updates.
  - `OtpCode @@index([userId, scope])` — verify lookup.

## Security

### Session cookie

- **Name**: `cityfix_session`
- **TTL**: 14 days (refreshed on each request via
  `lastSeenAt`).
- **Format**: `<sessionId>.<HMAC-SHA256(SESSION_SECRET, sessionId)>`
  in prod; raw `<sessionId>` in dev (the dev
  `dev-session.ts` reads the id directly).
- **Flags**: `httpOnly`, `sameSite=lax`, `secure` in
  production.
- **Tamper detection**: the HMAC is verified
  constant-time via `crypto.timingSafeEqual`.
- **Secret**: `process.env.SESSION_SECRET`, ≥ 32 chars.
  Throw at startup if absent.

### Password

- **Algorithm**: argon2id via `@node-rs/argon2`.
- **Parameters**: `m=19 MiB, t=2, p=1` (OWASP 2024).
- **Strength**: min 8 chars + ≥1 digit. Re-validated
  in `hashPassword` so the service layer is the
  source of truth, not just the route.

### OTP

- **Algorithm**: argon2id (reuses `hashPassword`).
- **Length**: 6 digits, leading zeros allowed.
- **TTL**: 5 min.
- **Attempts**: 5 per code; 6th = locked until a new
  code is issued.
- **Single-use**: `usedAt` is set on first verify.

### Rate limit

- **Register**: 5/min per IP. `rateLimit('register:' + ip)`.
- **Login**: 5/min per IP **+** in-process lockout
  (5 wrong in 10 min → 10-min lockout). 423.
- **Send-OTP / Verify-OTP**: 5/min per IP (the existing
  primitive; the phone-keyed throttle is in Bolt
  Decision G2).

### Audit

Every state-changing auth step writes one
`AuditEntry`:

| Event | When |
|-------|------|
| `user.register` | After cookie set, before 201. |
| `user.login` | After cookie set, before 200. |
| `user.otp_issued` | **Planned** — see Bolt Decision G2. |
| `user.otp_verified` | **Planned** — see Bolt Decision G2. |

## NFRs (per-bolt targets)

| NFR | Target | Rationale |
|-----|--------|-----------|
| Register latency (p95) | ≤ 1500 ms | argon2id is the floor (≈ 100 ms); a 1-second overhead for Prisma + cookie + audit is acceptable. |
| Login latency (p95) | ≤ 1500 ms | argon2id is again the floor. |
| Session-cookie verify (p95) | ≤ 30 ms | One DB lookup + one HMAC. |
| Rate-limit overhead | ≤ 5 ms | In-process map. |
| Visual baseline fidelity | 0.005 tolerance | Per `aidlc/spaces/default/memory/team.md` Mandated. |

## API contracts (the specsmd reference table)

| Endpoint | Method | Auth | Body | 2xx Response | Error codes |
|----------|--------|------|------|--------------|-------------|
| `/api/auth/status` | GET | none | — | `{ authenticated, session? }` | — |
| `/api/v1/auth/register` | POST | none | `{ phone, nid, name, password, citySlug? }` | `201 { ok, userId }` | 400, 404, 409, 429, 500 |
| `/api/v1/auth/send-otp` | POST | none | `{ phone, scope, citySlug? }` | `200 { ok }` | 400, 404, 429 |
| `/api/v1/auth/verify-otp` | POST | none | `{ phone, code, scope, citySlug? }` | `200 { ok }` | 400, 401, 404, 423, 429 |
| `/api/v1/auth/login` | POST | none | `{ phone, password, citySlug? }` | `200 { ok, userId }` | 400, 401, 404, 423, 429 |

All responses are JSON. All request bodies are
Zod-validated; the validation errors return
`{ error: 'invalid_input', issues: [...] }`.

## Frontend contracts (the four pages)

### `/splash` (1.1)

- **Auth**: none.
- **Behaviour**:
  - On mount, request geolocation (non-blocking;
    resolves either way).
  - Concurrently, `GET /api/auth/status`.
  - Routes to `/home` (authed) or `/welcome`
    (anonymous).
  - Slow-load timer (2 s) shows "Loading…".
  - Bundle-fail timer (8 s) shows "Connection failed —
    try again" with a Retry button.
- **localStorage**: none (first-run).

### `/welcome` (1.2)

- **Auth**: none.
- **Behaviour**:
  - On mount, set `localStorage.cityfix.welcome_seen.v1 = 'true'`.
  - Restore the language from
    `localStorage.cityfix.preferred_language.v1`.
  - Two-column hero at large viewport; collapses at
    medium.
  - Two CTAs: Register (`/register`) and Login
    (`/login`).
  - Language toggle persists to the same
    localStorage key.
- **localStorage keys touched**:
  - `cityfix.welcome_seen.v1` (set on mount).
  - `cityfix.preferred_language.v1` (read on mount;
    write on toggle).

### `/register` (1.3)

- **Auth**: none.
- **Behaviour**:
  - 5 fields: phone, NID, name, password, confirm.
  - Client-side validation on blur (regex for phone
    and NID; min 8 chars + digit for password; password
    match for confirm).
  - Password show/hide on both password inputs.
  - On submit: `POST /api/v1/auth/register`.
  - 201 → `router.replace('/verify-otp?phone=...')`.
  - 409 → inline conflict error under the password
    field.
  - 429/5xx → top-level toast above the form.
- **localStorage keys touched**:
  - `cityfix.preferred_language.v1` (read on mount;
    write on toggle).

### `/verify-otp` (1.3b)

- **Auth**: implicit (the register route sets the
  session cookie, so the verify-OTP page is reached
  with an authenticated session).
- **Behaviour**:
  - On mount, `POST /api/v1/auth/send-otp` to issue
    the registration OTP (or use the existing
    OtpCode if the registration route already issued
    one — the v1 flow lets the page re-issue).
  - User enters the 6-digit code → `POST
    /api/v1/auth/verify-otp` with `scope:
    'registration'`.
  - On success → `router.replace('/home')`.
- **localStorage keys touched**: none.

### `/login` (1.5)

- **Auth**: none.
- **Behaviour**:
  - 2 fields: phone, password.
  - Client-side validation on blur.
  - On submit: `POST /api/v1/auth/login`.
  - 200 → `router.replace('/home')`.
  - 401 → top-level "wrong credentials" error.
  - 423 → "too many attempts — try again in N
    minutes" with a countdown.
- **localStorage keys touched**:
  - `cityfix.preferred_language.v1` (read on mount;
    write on toggle).

## Layer-by-layer checklist (for the Construction Agent)

The implement phase must confirm each of these in
`bolt-decisions.md`:

- [ ] Zod schemas are at the route boundary; no
  unvalidated data crosses into the service layer.
- [ ] `lib/auth/{password,otp,session,guards}.ts` is
  imported only by the API layer; no direct imports
  from `app/<pages>/**`.
- [ ] `db.user.*` and `db.session.*` are called only
  through `lib/db-switch.ts`'s `db` facade; no direct
  Prisma imports in the auth routes (the existing
  `app/api/v1/auth/register/route.ts` does import
  `prisma` from `@/lib/db` for the phone-uniqueness
  check — see Bolt Decision below).
- [ ] The session cookie is set with `httpOnly: true`,
  `sameSite: 'lax'`, `secure: NODE_ENV === 'production'`.
- [ ] Every state-changing path writes exactly one
  `AuditEntry`.
- [ ] Every path is rate-limited; the per-IP key is
  `register:<ip>`, `login:<ip>`, `send-otp:<ip>`,
  `verify-otp:<ip>`.
- [ ] No secrets in code; `SESSION_SECRET` is
  environment-only.

## Bolt Decision (technical addenda)

In addition to the Bolt Decision recorded in
`./bolt.md`:

- **Direct `prisma` import in the register route**:
  the existing `app/api/v1/auth/register/route.ts`
  imports `prisma` from `@/lib/db` for the
  phone-uniqueness check. The specsmd coding standard
  prefers going through the `db.*` facade. The
  Construction Agent should **either** (a) extend
  `lib/db-switch.ts` with a `db.user.findFirstByPhone
  ({ cityId, phone, role })` helper and route the
  register flow through it, or (b) record a
  bolt-decision that this single import is an
  exception, because the dev store's
  `[...getStore().users.values()]` scan is the
  equivalent of the prod Prisma query and
  consolidating them through a new facade helper
  would couple the dev store to the prod schema.
  Recommended: option (a) for consistency.
- **OTP audit events**: the `user.otp_issued` and
  `user.otp_verified` events are **not yet emitted**.
  Per Bolt Decision G2, the Construction Agent decides
  whether to (i) add them in this Bolt, (ii) defer to
  v1.1, or (iii) defer and create a tracked
  `bolt-001-followup.md` issue. Recommended: (i) — the
  effort is one `writeAudit` call per route.
- **Per-phone login throttle**: the existing IP lockout
  does not survive IP rotation. A `(phone, 'login')`
  rate limit would close that hole. Per Bolt Decision
  G2, the Construction Agent commits to either
  closing it in this Bolt or deferring to v1.1 with
  a tracked ADR-009.

## Cross-references

- **bolt.md**: `./bolt.md`.
- **ddd-01**: `./ddd-01-domain-model.md`.
- **Standards**:
  - `../../standards/tech-stack.md`
  - `../../standards/coding-standards.md`
  - `../../standards/api-conventions.md`
  - `../../standards/system-architecture.md`
  - `../../standards/data-stack.md`
  - `../../standards/decision-index.md`
- **Refinement gaps**: G2 (login throttle), G3
  (requireSameWard / requireSameDepartment — narrow
  scope to keep in the report-flow bolts).
- **Code-reality audit**: `../../REFINEMENT.md`.
- **Bolt plan**: `../plan.md`.
