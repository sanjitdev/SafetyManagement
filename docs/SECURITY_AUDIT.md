# CityFix — Security Audit

**Audit date:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Stack:** Next.js 14 App Router · TypeScript strict · Prisma 5.22 · PostgreSQL 16 · `@node-rs/argon2` (Argon2id) · `@simplewebauthn/server` v10
**Method:** Static source review of all 62 route handlers under `app/api/**/route.ts`, `lib/auth/*`, `lib/platform/*`, `lib/serializers/*`, `lib/storage/*`, `lib/admin/*`, `prisma/schema.prisma`, `next.config.js`, `.env.example`, and the ADR-007 test suites.

**No files were modified by this audit.** Every finding below cites a file and line so it can be reproduced.

---

## Summary

| Severity | Count | Blockers for production launch? |
|---|---|---|
| Critical | 3 | Yes — 2 of the 3 are reachable without any credential |
| High | 2 | Yes — each independently breaks the ADR-007 threat model |
| Medium | 5 | Should fix before scale-out, not before pilot |
| Low | 4 | No |

*Counts are the OPEN findings. Three have been closed since the audit: the unenforced OTP attempt limit (Critical #2), the ungated `PUT /api/profile` admin write (High #5), and the unconsumed WebAuthn challenge (High #6), all on 2026-11-09.*

**Verdict: NOT production-ready.** The three open Critical findings are all *configuration-reachable* rather than theoretical — they only become harmless if the deployment's environment variables are set exactly right, and nothing in the codebase enforces that. The single highest-leverage fix is adding an `isDevStore()` guard to four `/api/dev/*` routes (four lines of code).

The strongest part of this codebase is the discipline around the `/api/v1/admin/*` tree: every one of those write handlers calls `requireRole` → `await requireWebAuthn` → `writeAudit`, and the ADR-007 test suite exercises the shared transition route through its real dependency graph rather than with mocks. The weakness is the one ADR-007 itself predicted (lines 229–234): the rule was enforced by *convention* (path layout) before it was enforced by *role*.

---

## Findings table

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| 1 | **Critical** | OTP plaintext is returned in the API response **in every environment** | `app/api/v1/auth/send-otp/route.ts:160-167`; `lib/auth/otp-provider/index.ts:31` | Guard `dev_code` on `NODE_ENV !== 'production' && OTP_PROVIDER === 'stub'`; default `OTP_PROVIDER` to `'twilio'` in prod |
| 2 | **Critical** | OTP attempt limit was **never enforced** — `attempts` was written but never read | `app/api/v1/auth/verify-otp/route.ts`; `lib/auth/otp.ts:32` | **CLOSED 2026-11-09** — the counter is read back before verification; `429 too_many_attempts` at the limit. Covered by `tests/unit/otp-attempt-limit.test.ts` |
| 3 | **Critical** | Four production-reachable `/api/dev/*` endpoints gated only on a shared secret, not on `isDevStore()` | `app/api/dev/{bootstrap-admin:52,issue-session:35,list-users:37,promote-admin:43}/route.ts` | Add `if (!isDevStore()) return 404` to all four, before the secret check |
| 4 | **Critical** | `bootstrap-admin` + `issue-session` mint a full admin session, bypassing password and WebAuthn entirely | `app/api/dev/bootstrap-admin/route.ts:115-146`; `app/api/dev/issue-session/route.ts:70-76` | Same as #3; delete both routes before production |
| 5 | **High** | Admin write path **not** WebAuthn-gated: `PUT /api/profile` has no role check and no ceremony | `app/api/profile/route.ts` | **CLOSED 2026-11-09** — the admin write calls `requireWebAuthn`; the body is Zod-validated; the write is scoped to `session.userId`; every write lands an audit row. Covered by `tests/unit/profile-webauthn-gate.test.ts` |
| 6 | **High** | WebAuthn challenges are **never consumed** — one assertion satisfies the gate for many writes | No `webAuthnChallenge.delete` anywhere; `lib/auth/guards.ts:113-125` | **CLOSED 2026-11-09** — `requireWebAuthn` now DELETES the challenge row it accepts (`db.webAuthnChallenge.consume`); the delete is scoped to the owning user; a concurrent consume is a refusal, not a pass. Covered by `tests/unit/webauthn-challenge-consumption.test.ts` |
| 7 | **High** | Admin city-scoped routes never verify `params.id === session.cityId` — cross-city read + write | `app/api/v1/admin/cities/[id]/**` (only `requireRole('admin')`); `app/api/v1/admin/cities/[id]/adoption/route.ts:50` | Resolve ADR-006, then add `requireSameCity(session, params.id)` consistently |
| 8 | **High** | Staff can authenticate with a **password only** — the WebAuthn key is not a login requirement | `app/api/v1/auth/login/route.ts:137-139` (no role filter) | Restrict the password login to `role: 'citizen'`; force admin login through `/api/auth/webauthn/login` |
| 9 | **Medium** | In-process rate limiter and login lockout are not multi-instance safe | `lib/platform/rate-limit.ts:17`; `lib/auth/login-lockout.ts:38` | Move to Postgres/Redis before scaling past one instance |
| 10 | **Medium** | No `middleware.ts` — every route hand-rolls its own auth; a new route can silently omit it | Repo-wide; no `middleware.ts` file exists | Add a `middleware.ts` that establishes the session and blocks staff routes without a session |
| 11 | **Medium** | CSP ships `'unsafe-inline' 'unsafe-eval'` in `script-src` | `next.config.js:99` | Replace with nonces; isolate the Swagger route so the app never needs `unsafe-eval` |
| 12 | **Medium** | `.env.example` omits `CITYFIX_DEV_PROMOTE_SECRET`, `DEV_SKIP_WEBAUTHN`, and all `BLOB_*` vars | `.env.example` (70 lines); `lib/storage/blob.ts:172-189` | Document every var `lib/` reads, marked required/optional |
| 13 | **Medium** | `GET /api/auth/status` echoes the raw `sessionId` in the JSON body | `app/api/auth/status/route.ts:57` | Omit `sessionId` from the response body |
| 14 | **Low** | OTP codes generated with `Math.random()`, not a CSPRNG | `lib/auth/otp.ts:35-39` | Use `crypto.randomInt(0, 1_000_000)` |
| 15 | **Low** | Missing `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `X-DNS-Prefetch-Control` | `next.config.js:46-118` | Add the three headers |
| 16 | **Low** | Local blob provider's photos 404 — default base URL `/api/blob` has no serving route | `lib/storage/blob.ts:180`; no `app/api/blob/route.ts` | Add the serving route with `nosniff` + `Content-Disposition: inline`, or change the default base URL |
| 17 | **Low** | `GET /api/docs` is a public Swagger UI loaded from the unpkg CDN | `app/api/docs/route.ts:136` | Gate behind admin auth, or serve the assets locally |

---

## 1. Authentication

### 1.1 Sessions

Sessions are HMAC-SHA256-signed opaque cookies, not JWTs — a good choice, since it permits server-side revocation.

| Property | Value | Evidence |
|---|---|---|
| Cookie name | `cityfix_session` | `lib/auth/session.ts:19` |
| TTL | 14 days | `lib/auth/session.ts:20` |
| Format | `<sessionId>.<hex-sig>` | `lib/auth/session.ts:38-52` |
| Signature compare | `timingSafeEqual` | `lib/auth/session.ts:38-52` |
| Secret enforcement | Throws if `SESSION_SECRET` missing or `< 32` chars | `lib/auth/session.ts:22-28` |
| Storage | `Session` table row, resolved per request | `lib/auth/session.ts:67-107` |

**Cookie flags** — consistent across all six cookie-setting sites (`app/api/v1/auth/login/route.ts:192-198`, `verify-otp/route.ts:130-136`, `app/api/auth/webauthn/assertion/route.ts:87-93`, `app/api/auth/webauthn/login/route.ts`, `app/api/dev/login/route.ts:67`, `app/api/dev/issue-session/route.ts:70-76`):

- `httpOnly: true` — not readable from JS.
- `sameSite: 'lax'` — CSRF-resistant for top-level navigations.
- `secure: NODE_ENV === 'production'` — **not** secure in dev/staging.
- `path: '/'`, with expiry set explicitly (not a session cookie).

**Observation — dev-mode cookies are unsigned.** `lib/auth/session.ts:131`:

```ts
const cookieValue = isDevStore() ? session.id : pack(session.id);
```

In dev-store mode the cookie is the **raw session id**, unsigned. Defensible for a no-database local mode, but it means the dev-store security posture is materially weaker than production, and any dev-store deployment inherits it. Combined with finding #3 (the `/api/dev/*` routes are *not* dev-store-gated), a deployed dev store is a full compromise.

**Invalidation.** Sessions are deleted on logout (`app/api/auth/logout/route.ts`) and when a user is deleted (`lib/admin/users-db.ts:436-460` deletes sessions first). `getSession()` deletes expired rows on read and updates `lastSeenAt` fire-and-forget.

### 1.2 Password hashing

Argon2id via `@node-rs/argon2` — `lib/auth/password.ts:22-27`:

```ts
algorithm: 2,           // Argon2id
memoryCost: 19 * 1024, // 19 MiB
timeCost: 2,
parallelism: 1,
```

This matches the OWASP Argon2id recommendation (19 MiB, t=2, p=1). `hashPassword` enforces ≥8 chars and ≥1 digit (`lib/auth/password.ts:29-40`).

`hashSecret` (`lib/auth/password.ts:46-48`) deliberately bypasses that policy — it is used for OTP codes, which are 6 digits. Correct, but worth noting the two paths are separate.

**No password hash ever reaches a response.** `lib/admin/users-db.ts` maps every Prisma read to an explicit projection excluding `passwordHash` (`listCityUsers:74+`, `findCityUser:211-242`, `createCityUser:293-350`, `updateCityUser:379-425`).

### 1.3 OTP flow

| Aspect | Value | Evidence |
|---|---|---|
| TTL | 5 minutes | `lib/auth/otp.ts:31` |
| Length | 6 digits | `lib/auth/otp.ts:33` |
| Max attempts (declared) | 5 | `lib/auth/otp.ts:32` |
| Provider abstraction | `lib/auth/otp-provider/index.ts` — `stub` / `twilio` | `lib/auth/otp-provider/index.ts:31` |
| Rate limit | per-IP token bucket on `verify-otp` and `send-otp` | `verify-otp/route.ts:52-58`, `send-otp/route.ts:59-66` |
| Resend cooldown | 60 s | `send-otp/route.ts:98-114` |

**Finding #1 (Critical) — the OTP is returned to the caller.** `app/api/v1/auth/send-otp/route.ts:160-167`:

```ts
return NextResponse.json({ ok: true, ttlMs: ..., dev_code: code });
```

The comment above it (L152-159) says *"While OTP_PROVIDER=stub, surface the code"* — but **there is no such condition**. The field is returned unconditionally, in every environment, regardless of provider. And `lib/auth/otp-provider/index.ts:31` defaults `OTP_PROVIDER` to `'stub'` when the env var is unset:

```ts
const name = process.env.OTP_PROVIDER ?? 'stub';
```

So a deployment that sets `DATABASE_URL`, `SESSION_SECRET`, and Twilio credentials but forgets `OTP_PROVIDER` gets a stub provider *and* a plaintext OTP in every response — full citizen account takeover, no credential theft required. The stub provider also logs the code: `lib/auth/otp-provider/stub.ts:21` → `console.info('[otp:stub] code=${code} phone=${phone}')`.

**Finding #2 (Critical) — the attempt limit was dead code. CLOSED 2026-11-09.** `app/api/v1/auth/verify-otp/route.ts` used to increment `attempts` and then never read it. `OTP_MAX_ATTEMPTS` was exported from `lib/auth/otp.ts:32` and **imported nowhere** (verified by repo-wide grep — the only hit was the definition). The route's own docstring described behaviour that did not exist:

- *"429 → too many attempts (5 within 10 minutes)"*
- *"on the 5th failure we mark the account as soft-locked"*

The per-IP rate limit was the only thing standing between an attacker and an unlimited guessing loop. It is in-process (`lib/platform/rate-limit.ts:17`), capacity 1/s in production — trivially defeated by distributing requests across source IPs, or across instances.

**Closed.** The route now reads the counter back before verifying and returns `429 too_many_attempts` once it reaches `OTP_MAX_ATTEMPTS`. The counter is persisted on the `OtpCode` row (so it survives a restart, unlike the per-IP limiter), the check happens before the argon2 hash, and the correct code is refused too once locked out. The counter is scoped to the code rather than the account — `send-otp` issues a fresh row with `attempts = 0`, so a citizen is never locked out permanently (the 60-second resend cooldown is the only wait). Covered by `tests/unit/otp-attempt-limit.test.ts` (9 tests; non-vacuity proven by neutering the guard, which fails exactly the 3 lockout tests).

**Finding #14 (Low) — `Math.random()` for OTP generation.** `lib/auth/otp.ts:35-39`. `Math.random()` is not cryptographically secure and its internal state is recoverable from observed outputs. For a 6-digit code that materially shortens the search space. Use `crypto.randomInt`.

### 1.4 WebAuthn

Implementation is in `lib/auth/webauthn.ts` (605 lines) on `@simplewebauthn/server` v10.

| Aspect | Value | Evidence |
|---|---|---|
| Prod config assertion | Requires `WEBAUTHN_RP_ORIGIN` (https) and `WEBAUTHN_RP_ID` ≠ `localhost` | `lib/auth/webauthn.ts:74-88` |
| RP ID / origin (non-prod) | Derived from the request host | `lib/auth/webauthn.ts:128-158` |
| Challenge TTL | 5 minutes | `lib/auth/guards.ts:82` |
| Challenge ledger | `WebAuthnChallenge` table **and** mirrored to `User.webAuthnChallenge` | `lib/auth/webauthn.ts:264-347` |
| Attestation verify | `expectedOrigin` + `expectedRPID` bound to request host | `lib/auth/webauthn.ts:359-434` |
| User verification | `requireUserVerification: false` | `lib/auth/webauthn.ts` (verifyAttestation) |
| Assertion verify | Counter bumped; credential + counter passed to `verifyAuthenticationResponse` | `lib/auth/webauthn.ts:452-563` |
| Revoke | Refuses to revoke the last credential (409 `webauthn_last_credential`) | `lib/auth/webauthn.ts:573-602` |

**Finding #6 (High) — challenges are never consumed. CLOSED 2026-11-09.** *As found:* a repo-wide grep for `webAuthnChallenge.delete|deleteMany|update` returned **no matches**. `lib/db-switch.ts:679-752` exposed only `create` / `findLatest` / `findById` — no consume path. `requireWebAuthn` (`lib/auth/guards.ts:113-125`) only checked that *a* challenge row exists and has not expired. `tests/unit/require-webauthn.test.ts:167-175` pinned exactly this behaviour: *"returns the session when credentials + a fresh challenge row exist."*

*Consequence as found:* **a single ceremony authorised every admin write for the next 5 minutes.** The threat model in ADR-007 assumes "a write requires a fresh assertion from a registered authenticator" (ADR-007:35-36) — that was not what the code enforced. A stolen session cookie plus one observed ceremony satisfied the gate for many subsequent mutations.

*Remediation:* `requireWebAuthn` now **consumes** the challenge it accepts. The consume is a `db.webAuthnChallenge.consume({ id, userId })` call that deletes the row, scoped to the owning user, and the guard treats a failed consume as a **refusal** (`webauthn_assertion_expired`) rather than a pass — so two concurrent writes cannot both be authorised by one challenge. In production the facade uses `deleteMany({ where: { id, userId } })`; the dev store mirrors it with a scoped delete. A *rejected* guard call (expired challenge, no credential) consumes nothing, so a failed attempt never burns a challenge the admin could still use.

The challenge is now a genuine one-shot nonce: one ceremony authorises **exactly one** write, and the next write needs a fresh assertion. Covered by `tests/unit/webauthn-challenge-consumption.test.ts` (9 tests, including the concurrent-write race and the user-scoping of the delete). Non-vacuity proven by mutation — removing the delete from the consume path turns 6 of the 9 tests red.

`requireUserVerification: false` means a PIN-only authenticator is acceptable. Defensible for v1 hardware keys; recorded here as an accepted risk.

`assertWebAuthnProdConfig()` is a strong control — a production deployment with `WEBAUTHN_RP_ID=localhost` fails loudly rather than silently accepting a mismatched origin.

The assertion route has **no rate limit**, acknowledged in its own docstring (`app/api/auth/webauthn/assertion/route.ts:24-29`) as accepted risk because the route is gated by the signature check. Reasonable for v1 given #6 is the real weakness.

The WebAuthn login route returns 404 `admin_not_found` for both a missing user and a non-admin user (`app/api/auth/webauthn/login/route.ts:74-76`) — no enumeration leak. Good.

### 1.5 The `DEV_SKIP_WEBAUTHN` seam

**What it bypasses:** the entire WebAuthn gate — credential presence check, challenge existence check, and TTL check. It returns the session as-is.

**How it is gated** (`lib/auth/guards.ts:98-102`):

```ts
if (isDevStore() && process.env.DEV_SKIP_WEBAUTHN === '1') {
  if (!session) throw new ApiError(401, 'not_authenticated');
  return session;
}
```

Both conditions must hold. `isDevStore()` is the `CITYFIX_DEV_STORE=1` check, so `DEV_SKIP_WEBAUTHN=1` alone does **not** bypass the guard in production. This is pinned by `tests/unit/require-webauthn.test.ts:209-239`, which asserts the guard does *not* short-circuit when `CITYFIX_DEV_STORE` is unset.

**Assessment:** the seam itself is correctly scoped. It is safe *provided* `CITYFIX_DEV_STORE` is never set in production — and that invariant is not enforced anywhere except by convention. `lib/platform/db-guard.ts:105-122` asserts the *database* is not loopback in production, but there is no equivalent guard on `CITYFIX_DEV_STORE`. Adding one (throw in production if `CITYFIX_DEV_STORE=1`) would close the whole class of dev-seam abuse, including findings #3 and #4.

---

## 2. Authorization

### 2.1 Guard contracts — `lib/auth/guards.ts`

| Guard | Lines | 401 | 403 | Notes |
|---|---|---|---|---|
| `requireRole` | 20-31 | `not_authenticated` | `forbidden_role` | |
| `requireSameCity` | 36-47 | `not_authenticated` | `cross_city_access_denied` | |
| `requireScope` | 53-68 | — | `cross_ward_access_denied` / `cross_department_access_denied` / `citizen_cannot_act_as_dispatcher_or_crew` | **Admin bypass at L58** |
| `requireWebAuthn` | 95-127 | `not_authenticated` / `webauthn_required` / `webauthn_assertion_expired` | `forbidden_role` | |

`ApiError` carries `{ status, code }` (L70-75). `requireScope` compares the ticket's ward and department against the session's, using `!==` — so a `null` department on the ticket is a mismatch, not a wildcard.

**Admin scope bypass** — `lib/auth/guards.ts:58`:

```ts
if (session.role === 'admin') return;
```

This is intentional and documented (ADR-007:26-33): an admin session is city-wide authority; a dispatcher or crew session is bounded to one `(city, ward, department)`. The session binds `wardId: user.role === 'admin' ? null : user.wardId` (`app/api/v1/auth/login/route.ts:184-190`).

### 2.2 Write-route enumeration

Every route handler with a write method, and its enforcement. The WebAuthn column applies to admin-role writes only.

| Route | Method | Role gate | Scope | WebAuthn | Zod |
|---|---|---|---|---|---|
| `/api/tickets` | POST | citizen | session city | n/a | ✅ |
| `/api/tickets/[id]/transition` | POST | dispatcher/crew/admin | city + ward/dept (admin bypass) | ✅ **admin only** | ✅ |
| `/api/tickets/[id]/photos/[idx]` | DELETE | citizen | ownership | n/a | ✅ |
| `/api/tickets/[id]/feedback` | POST | citizen | ownership | n/a | ✅ |
| `/api/profile` | **PUT** | citizen/dispatcher/crew (own row); admin gated | **own row** (`session.userId`) | ✅ **admin only** | ✅ |
| `/api/v1/push/subscribe` | POST/DELETE | citizen | own | n/a | ✅ |
| `/api/v1/crew/tickets/[id]/photos` | POST | crew | scope + assignment | n/a | ✅ |
| `/api/v1/crew/tickets/[id]/transition` | POST | crew | scope + assignment | n/a | ✅ |
| `/api/v1/dispatcher/tickets/[id]` | PATCH | dispatcher | scope | n/a | ✅ |
| `/api/v1/dispatcher/tickets/[id]/assign-crew` | POST | dispatcher | scope | n/a | ✅ |
| `/api/v1/dispatcher/tickets/[id]/transition` | POST | dispatcher | scope | n/a | ✅ |
| `/api/v1/dispatcher/dedup-flags/[id]/confirm` | POST | dispatcher | scope | n/a | n/a (no body) |
| `/api/v1/dispatcher/dedup-flags/[id]/dismiss` | POST | dispatcher | scope | n/a | n/a (no body) |
| `/api/v1/dispatcher/monitor/ack` | POST | dispatcher | scope | n/a | ✅ |
| `/api/v1/admin/cities` | POST | admin | — | ✅ | ✅ |
| `/api/v1/admin/cities/[id]` | PATCH/DELETE | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/wards` | POST | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/wards/[wardId]` | PATCH/DELETE | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/categories` | POST | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/categories/[catId]` | PATCH/DELETE | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/departments` | POST | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/departments/[deptId]` | PATCH/DELETE | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/users` | POST | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/users/[userId]` | PATCH/DELETE | admin | **❌ none** | ✅ | ✅ |
| `/api/v1/admin/cities/[id]/users/import` | POST | admin | **❌ none** | ✅ | ✅ |
| `/api/auth/webauthn/revoke` | DELETE | admin | own | ⚠️ deliberate exception | ✅ |

**Finding #5 (High) — `PUT /api/profile` is an ungated admin write — CLOSED 2026-11-09.** `app/api/profile/route.ts`. No `requireRole`, no `requireWebAuthn`, and validation is hand-rolled rather than Zod (L46-51 rejects empty, >80 chars, and control characters). It writes `name`/`nameBn` via `db.user.updateProfile`.

Impact is bounded — a name is not city configuration — but it is a direct contradiction of ADR-007's central claim. ADR-007:87-89 states: *"`requireWebAuthn` is enforced on every write handler under `/api/v1/admin/*` — 16 handlers, zero gaps."* That is true of the `/api/v1/admin/*` tree, but the *rule* as stated at ADR-007:143-147 is about the **role**: *"Every admin write path requires a fresh WebAuthn assertion."* `PUT /api/profile` is reachable by an admin session and performs a write. The gap is that the ADR's scope table (L183-189) lists only path-prefixed rows and never considers routes outside the `/api/v1/admin/*` tree other than the shared transition route — exactly the class of miss ADR-007:229-234 predicted (*"a future admin write route added outside `/api/v1/admin/*` skips the gate"*).

An admin session is obtainable without a hardware key via finding #8, so this is reachable in practice.

**The fix.** The route now calls `await requireWebAuthn(session)` when `session.role === 'admin'`; the body is validated by a Zod schema; the write targets `session.userId` (so one user can never edit another); the cheap checks run before the ceremony, per ADR-007's guard ordering; and every successful write lands an audit row. A citizen / dispatcher / crew write to their own profile is deliberately **not** gated — those are not admin writes, and ADR-007 says so explicitly. `app/profile/page.tsx` surfaces the existing `AdminWebAuthnStepUp` ceremony when an admin save is refused, and retries the save once the assertion lands.

**Non-vacuity.** `tests/unit/profile-webauthn-gate.test.ts` (18 tests) proves the gate does something by mutation: neutering the `requireWebAuthn` call turns exactly the 5 gate tests red.

**Finding #7 (High) — admin city-scoped routes never check the city.** Every route under `/api/v1/admin/cities/[id]/**` calls `requireRole(session, 'admin')` and **nothing else** before acting on `params.id`. The route file itself documents this as intentional — `app/api/v1/admin/cities/[id]/users/route.ts:9-10`: *"Admins bypass the cross-city check (per ADR-006)."*

If ADR-006 genuinely designates admins as platform-wide operators, this is by design. But it is inconsistent with the rest of the admin surface: `app/api/v1/admin/tickets/[id]/route.ts:51` **does** call `requireSameCity(session, ticket.cityId)`, and `app/api/v1/admin/tickets/route.ts:91` calls `requireSameCity(session, effectiveCityId)`. Two admin surfaces disagree about whether an admin is city-scoped.

If the city-scoped reading is correct, then `GET /api/v1/admin/cities/[id]/adoption` (L50) and `GET /api/v1/admin/cities/[id]/adoption/export` (L49) let an admin in city A read city B's adoption metrics and export its CSV — both confirmed to call `requireRole` only, with no `requireSameCity` and no city check on `params.id`. **This must be resolved by reading ADR-006**, which is not in the `docs/adr/` set; it is flagged here as a design inconsistency rather than a confirmed bug.

**Finding #8 (High) — password login has no role filter.** `app/api/v1/auth/login/route.ts:137-139`:

```ts
const user = await db.user.findFirst({ where: { cityId: city.id, phone } });
```

No `role` constraint. The route's docstring (L26-37) acknowledges this — the password path *"is still load-bearing for WRITES"* — but that framing is wrong given #5 and #7. An admin, dispatcher, or crew account with a password can authenticate and then operate across the entire admin surface. The hardware key is therefore not a login requirement, only a per-write gate — and that gate was bypassable by #5 (profile PUT, now closed), #7 (cross-city writes on `cities/[id]`), and #6 (one ceremony, five minutes of writes, now closed). With #5 and #6 closed, the password-login path is no longer a route to ungated admin writes — but it is still an authentication-surface weakness, and #7 remains open beneath it.

**Routes reachable without a session** (all intentional):

- `GET /api/v1/activity/public` — public feed, PII-stripped. Correct.
- `GET /api/docs`, `GET /api/docs/spec` — public Swagger UI from unpkg. Low risk (finding #17).
- `POST /api/v1/auth/{register,send-otp,verify-otp,login}` — public by design.
- `POST /api/auth/webauthn/{login,assertion}` — public by design; the cryptographic signature is the authentication.
- `POST /api/auth/webauthn/register/challenge` — issues a registration challenge.
- `GET /api/v1/activity` — authenticated.
- `GET /api/auth/status` — returns `authenticated: false` when no session.

**The `/api/dev/*` cluster (findings #3, #4)** is the serious exception to "intentional":

| Route | Gate | Effect |
|---|---|---|
| `/api/dev/bootstrap-admin` | `CITYFIX_DEV_PROMOTE_SECRET` **only** (L52-59) | Promotes a citizen to `role='admin'` (L115-130) **and mints an admin session** (L133-146) |
| `/api/dev/issue-session` | `CITYFIX_DEV_PROMOTE_SECRET` **only** (L35-42) | Mints a session for **any** userId including admin, bypassing the password |
| `/api/dev/promote-admin` | `CITYFIX_DEV_PROMOTE_SECRET` **only** (L43-50) | Promotes the session's user to admin |
| `/api/dev/list-users` | `CITYFIX_DEV_PROMOTE_SECRET` **only** (L37-44) | Lists id/name/role/phone/cityId/wardId/departmentId |

Contrast with the two dev routes that **are** correctly gated:

- `/api/dev/login` — `if (!isDevStore())` → 404 (`app/api/dev/login/route.ts:54-56`)
- `/api/dev/reset` — `if (!isDevStore())` → 404 (`app/api/dev/reset/route.ts:12`)

The four promote routes omit the `isDevStore()` check. Their own docstrings say *"Returns 404 if the"* secret is absent — i.e. they rely on the secret being unset, and the secret is a single static string in the deploy environment, not a per-request capability. One leaked or guessed secret yields **unauthenticated privilege escalation to admin**, bypassing both password and WebAuthn. `bootstrap-admin` needs no prior session at all.

### 2.3 The shared transition route — `app/api/tickets/[id]/transition/route.ts`

**ADR-007's gap is correctly closed.** Verified ordering against ADR-007:165-179:

| Step | ADR-007 expects | Route | Result |
|---|---|---|---|
| 1 | `requireRole` → 401 | L77 | ✅ |
| 2 | Zod parse → 400 | L89-95 | ✅ |
| 3 | Role vs `ALLOWED_BY_ROLE` → 403 | L111-126 | ✅ |
| 4 | Ticket load → 404 | L128-133 | ✅ |
| 5 | `requireSameCity` → 403 | L149-152 | ✅ |
| 6 | `requireScope` → 403 | L153-159 | ✅ |
| 7 | **`requireWebAuthn`** → 401 | L168-180 | ✅ |

The ceremony fires **after** the ticket load and **after** the scope checks, exactly as the ADR requires — a dispatcher out of scope gets `cross_ward_access_denied`, not a WebAuthn error, and a missing ticket 404s rather than demanding a ceremony that cannot change anything.

**Dispatcher and crew are NOT blocked.** L168 is conditional:

```ts
if (session!.role === 'admin') {
  await requireWebAuthn(session);
}
```

Confirmed by `tests/unit/transition-webauthn.test.ts:282-305` (*"allows a dispatcher transition… without WebAuthn"*, *"allows a crew transition… without WebAuthn"*).

**Both admin write shapes are covered** — the pure-reassign branch (L185-231) and the status transition (L232-239). `ALLOWED_BY_ROLE.admin` (L50) permits `['routed','in_progress','resolved','cancelled']`, so the admin can move a ticket straight to `resolved` or `cancelled`. All four shapes are gated.

**Two observations:**

1. `requireRole` failure returns **401 for both** the 401 and the 403 case (L79: `status: 401` with `error: (e as Error).message`). A dispatcher calling this route gets `403 forbidden_role` in the body but a 401 status — a status/body mismatch. Minor, but it breaks the contract that `ApiError.status` and the HTTP status agree, and it makes client error-mapping unreliable.
2. The scope check is skipped for admins (L153) — correct per the admin model, and `requireSameCity` still runs, so the admin is city-bound on this route even though `cities/[id]` routes are not. Another inconsistency with finding #7.

---

## 3. Input validation and injection

### 3.1 Zod coverage

**Every route handler that accepts a body or query validates it with Zod.** Verified across all 62 handlers. The two dedup-flag routes (`confirm`, `dismiss`) take no body — their input is the path param, which is checked for existence and scope (`loadPendingFlagInScope`).

**The last exception was closed on 2026-11-09:** `app/api/profile/route.ts` used hand-rolled validation (length + control-character regex) instead of a Zod schema. It now uses one, with the control-character rule carried over as a `refine`. Zod coverage is now total.

### 3.2 Raw SQL / Prisma in route handlers

**None.** No `$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, or `$executeRawUnsafe` anywhere in the repo. Prisma access is confined to `lib/`:

- `lib/db-switch.ts` — the facade (1017 lines)
- `lib/admin/users-db.ts` — admin user projections
- `lib/platform/push.ts` — subscription upsert

Route handlers call `db.*` (the `db-switch` facade), never `@prisma/client` directly. The team.md prohibition holds.

### 3.3 Dedup and SQL injection via lat/lng

**No injection surface.** `lib/platform/dedup.ts` uses the Haversine formula in JS (L24-36) against a **Prisma parameterised `where` object** (L63-78), never a string-built query. The bounding-box pre-filter is:

```ts
where: { cityId, locationLat: { gte, lte }, locationLng: { gte, lte } }
```

Prisma parameterises this into the wire protocol. Latitude/longitude values are validated upstream as Zod numbers with range constraints before they reach the dedup call.

Radius is `city.dedupRadiusMeters ?? 50` (L56). `take: 20` (L77) caps the candidate scan — a deliberate bound that also means the pre-filter considers at most 20 neighbours, so a dense cluster could in principle exceed the radius without being flagged. This is a *policy* limitation, not a security defect; recorded as a known behaviour.

### 3.4 Other input surfaces

- **Stored-URL XSS** — `app/api/tickets/route.ts:61-67` validates photo URLs via `isAcceptablePhotoUrl`, rejecting `javascript:` and `data:text/html` (a documented prior defect). `lib/format/photo-url.ts` reinforces this at the API boundary.
- **Oversized photos** → 413 via `hasOversizedPhoto` (`app/api/tickets/route.ts:126-131`, `app/api/v1/crew/tickets/[id]/photos/route.ts:115-120`).
- **Cross-city ward/category** → 400 `ward_not_in_city` / `category_not_in_city` (`app/api/tickets/route.ts:151-160`).
- **Client-side downscale** to 1600 px / JPEG q80 (`lib/photo/downscale.ts`) — defence in depth against the 5 MB server cap.

---

## 4. Data exposure

### 4.1 The citizen serializer — `lib/serializers/ticket.ts`

The citizen branch (L251-287) **does** strip the internal fields:

| Field | Citizen | Staff | Evidence |
|---|---|---|---|
| `internalNote` | **stripped** (null) | exposed | L284 / L294-328 |
| `assignedCrewId` | **stripped** (null) | exposed | L284 / L294-328 |
| `reporterName` | **stripped** (null) | exposed | L284 / L294-328 |
| trail `actorId` | **stripped** | exposed | L251-287 |
| trail `actorLabel` | anonymised → "সিটি কর্পোরেশন" | exposed | L31-34, L236-249 |
| `reporterId` | **retained** | exposed | L284 |
| `wardId` | **retained** | exposed | L284 |
| `locationLabel` | retained (citizen) | exposed | — |
| `locationLabel` (public) | **stripped** | — | L337-339, L377-399 |

Two notes on the retained fields:

- `reporterId` retained for a citizen is defensible — it is their own user id, needed to correlate their own reports. It is *not* another citizen's id.
- `wardId` retained is a deliberate product decision (the citizen sees their ward). It is a coarse geographic identifier, not PII.
- `locationLabel` is stripped from the **public** serializer (L337-339) precisely because it can carry a street address. It is retained for the citizen who reported it — correct, since they typed it.

### 4.2 The trail serializer — `lib/serializers/trail.ts`

`applyCitizenTrailFilter` (L43-57) rewrites internal marker notes matching `^[a-z_]+:` to a localised "After photo added". This prevents the raw `after_photo:${photoUrl}` marker (`app/api/v1/crew/tickets/[id]/photos/route.ts:235`) from leaking a blob path into a citizen-facing trail. `bucketPhotosByRole` (L71-88) splits citizen/crew photos and defensively buckets unknown roles as citizen — the safe default.

### 4.3 The public serializer — `lib/serializers/ticket.ts:377-399`

`serializeTicketForPublic` returns a strictly narrower shape: no `reporterId`, no `internalNote`, no `assignedCrewId`, no trail, no `locationLabel`. Used by `GET /api/v1/activity/public` — which is unauthenticated. This is correctly implemented.

### 4.4 Routes returning raw Prisma rows

**None found.** Every ticket-returning route calls a serializer:

- `app/api/tickets/route.ts` → `serializeTicketForRole`
- `app/api/tickets/[id]/route.ts` → `serializeTicketForRole`
- `app/api/tickets/[id]/transition/route.ts:272` → `serializeTicketForRole`
- `app/api/v1/admin/tickets/route.ts` → `serializeTicketForRole` via `lib/admin/tickets-query.ts:158-176`
- `app/api/v1/admin/tickets/[id]/route.ts` → `serializeTicketForRole`
- `app/api/v1/dispatcher/**` → `serializeTicketForRole`
- `app/api/v1/crew/**` → `serializeTicketForRole`
- `app/api/v1/activity/public/route.ts:170` → `serializeTicketForPublic`

`lib/admin/tickets-query.ts` was checked in full: it delegates to `serializeTicketForRole(..., 'admin', 'bn')` (L162-174, L191) and never returns a raw row.

### 4.5 PII exposure

| PII | Exposure | Evidence |
|---|---|---|
| Phone number | **Not exposed to other users.** The citizen serializer omits it. `list-users` (dev, secret-gated) returns phone. | `lib/serializers/ticket.ts:251-287` |
| NID | Not in the ticket serializer; only in `User` rows | `prisma/schema.prisma` `User.nid` |
| Addresses | `locationLabel` stripped from the public serializer | `lib/serializers/ticket.ts:337-339` |
| Photos | Served from blob storage; the citizen's own photos are on their ticket | `app/api/tickets/route.ts` |
| `internalNote` | Stripped from citizens; staff-only | `lib/serializers/ticket.ts` |

**Finding #13 (Medium) — `sessionId` is echoed in the auth-status body.** `app/api/auth/status/route.ts:57` returns `sessionId: session.sessionId` in JSON. In production the cookie value is `<sessionId>.<sig>`, so the response leaks the identifier half (the signature half is not leaked). The identifier alone is not sufficient to authenticate — the signature is required — but leaking it removes a layer of defence and helps an attacker who can influence `SESSION_SECRET` derivation. There is no need for a client to see it; `components/SessionProvider.tsx` consumes this endpoint.

---

## 5. Infrastructure and headers

### 5.1 `next.config.js` — headers present

| Header | Value | Line |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | L50 |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | L51 |
| `X-Frame-Options` | `DENY` | L52 |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` — **prod only** | L57-66 |
| `Content-Security-Policy` | see below | L95-109 |
| `Permissions-Policy` | `camera=(self), geolocation=(self), microphone=()` | L113-115 |
| `poweredByHeader` | `false` | L15 |

HSTS is correctly skipped in dev so localhost stays on http.

### 5.2 CSP

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;
img-src 'self' data: blob: https:;
font-src 'self' data: https://fonts.gstatic.com;
connect-src 'self' + OSM tiles + nominatim + demotiles.maplibre.org + cityfix.vercel.app;
worker-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

**Finding #11 (Medium) — `script-src` allows `'unsafe-inline'` and `'unsafe-eval'`.** This disables the CSP's main protection against XSS. It is a common Next.js compromise (React needs inline scripts for hydration), but Next.js supports **nonces**, and the codebase already documents that as the intended path (*"the nonced style approach is a v1.1 hardening"*, L73-74). `'unsafe-eval'` is required only by the Swagger UI's unpkg bundle. Recommendation: nonce-based `script-src` for application pages, and serve `/api/docs` from a separate route with its own relaxed policy so the main app never needs `unsafe-eval`.

**Finding #15 (Low) — missing headers.** `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, and `X-DNS-Prefetch-Control` are absent. Low risk for this app (no OAuth/popup flows, no cross-origin subresources beyond images), but they are cheap to add.

`frame-ancestors 'none'` is present, which supersedes `X-Frame-Options: DENY` for modern browsers — good, and the two are consistent.

### 5.3 Rate limiting — `lib/platform/rate-limit.ts`

**Finding #9 (Medium) — in-process and therefore per-instance.** L17: `const buckets = new Map<string, Bucket>()`. The docstring (L6-9) admits it is sufficient only for single-instance deployment and names the Postgres/Redis swap as a v1.1 item.

Default rate is 1/s, capacity 4 in dev and **1 in production**. Routes using it:

| Route | Scope | Line |
|---|---|---|
| `/api/v1/auth/login` | `login:${ip}` | L86-93 |
| `/api/v1/auth/send-otp` | `send-otp:${ip}` | L59-66 |
| `/api/v1/auth/verify-otp` | `verify-otp:${ip}` | L52-58 |
| `/api/tickets/[id]` | `(userId, ticketId)` | L29-38 |
| `/api/v1/activity/public` | per-IP | — |

**Observation — the login lockout is also in-process.** `lib/auth/login-lockout.ts:38` uses a `Map`. Its docstring (L21-26) states the counter *"is intentionally in-process for v1 — it does not survive a restart and is not shared across instances."* The rate limit is per-IP; the lockout is per-phone. On a multi-instance deploy, an attacker distributing requests across N instances gets N× the attempt budget, and a restart resets the lockout entirely.

### 5.4 Production DB guard — `lib/platform/db-guard.ts`

`assertProductionDatabaseConfig` (L105-122) throws in production if the database host is loopback. `extractDatabaseHost` (L62-81) handles both URL (`postgresql://user@host:port/db`) and libpq keyword (`host=...`) forms. `isLoopbackDatabaseHost` (L84-89) covers 127.0.0.0/8. The latch records SUCCESS only, so a failed check keeps throwing on every subsequent call — fail-closed.

**Gap:** there is **no equivalent guard on `CITYFIX_DEV_STORE`**. The dev store disables the Prisma database entirely *and* unsigns the session cookie (`lib/auth/session.ts:131`) *and* disables the WebAuthn gate. Adding `if (process.env.NODE_ENV === 'production' && isDevStore()) throw` would be a single high-value control that closes findings #3 and #4 at the source.

### 5.5 Blob storage — `lib/storage/blob.ts`

| Control | Implementation | Line |
|---|---|---|
| MIME allow-list | `['image/jpeg','image/png','image/webp']` | L134-138 |
| Size cap | `MAX_BLOB_BYTES = 5 MB` | L143 |
| Key safety | `isSafeKey` — rejects leading `/`/`\`, backslashes, `\0`, `..`, empty segments, >512 chars | L211-221 |
| Path containment | `resolveLocalPath` — defence-in-depth resolution | L340-349 |
| Filename sanitisation | `sanitizeBaseName` | L266-272 |
| Upload validation | MIME + size + key checks on both local and S3 paths | L360-397, L549-590 |

**Finding #16 (Low) — the local provider's photos 404.** `readBlobConfig` (L180) defaults `localBaseUrl` to `'/api/blob'`, and the local `getSignedUrl` (L399-406) returns that stable URL **with no signing**. But **no `app/api/blob/route.ts` exists** in the repo. The URL is stored on the ticket and rendered in `ReportCard`, `PublicLandingExperience`, the `/feed` page, and the dispatcher surfaces — all as broken image links in local mode. Functionally a bug rather than a security hole (it fails closed — the image is simply absent), but it means the local provider is untested end-to-end, and a fix must add the route **with** the correct headers (`Content-Type` from the stored MIME, `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and no `Content-Type: text/html`).

**Observation — the local provider does not sign URLs.** `getSignedUrl` (L399-406) returns the public path directly, unlike the S3 path (L592-623) which uses a presigner when available. In local mode any blob is world-readable by URL. Since the local provider is a dev-only mode, this is acceptable — but it must not be the production default. `BLOB_PROVIDER` is not documented in `.env.example` at all (finding #12), so a misconfiguration could silently select the local provider in production.

### 5.6 No `middleware.ts`

**Finding #10 (Medium).** There is no `middleware.ts` in the repo. Every route independently calls `getActiveSession()` and the guards. This is the structural reason findings #5 and #7 exist — a route is protected only if its author remembered to protect it. A `middleware.ts` that resolves the session once and blocks `/api/v1/admin/**`, `/api/v1/dispatcher/**` and `/api/v1/crew/**` without a session would give a baseline; the per-handler guards would remain as the authoritative checks.

---

## 6. Secrets

### 6.1 Hardcoded credentials

**None found.** A repo-wide scan of `lib/`, `app/`, `components/`, `prisma/`, and `scripts/` for API keys, tokens, passwords, and connection strings returned no matches in source. The only credential-shaped strings are:

- `lib/auth/otp-provider/twilio.ts:108-114` — reads `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` from env, and **throws** if any is missing. Correct.
- `.env.example` — a development placeholder for `SESSION_SECRET`, explicitly marked as a placeholder.

`.env.local` is gitignored and confirmed untracked. `.env.example` is the only env file tracked by git.

### 6.2 `.env.example` — completeness

| Var | Marked | Required in practice | Note |
|---|---|---|---|
| `DATABASE_URL` | PROD-REQ | ✅ | `db-guard` throws in prod if loopback |
| `SESSION_SECRET` | PROD-REQ | ✅ | ≥32 chars enforced (`lib/auth/session.ts:22-28`) |
| `WEBAUTHN_RP_ID` | PROD-REQ | ✅ | ≠ localhost in prod |
| `WEBAUTHN_RP_ORIGIN` | PROD-REQ | ✅ | https in prod |
| `WEBAUTHN_RP_NAME` | PROD-REQ | ✅ | |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | OPTIONAL | optional | |
| `VAPID_PRIVATE_KEY` | OPTIONAL | optional | |
| `VAPID_SUBJECT` | OPTIONAL | optional | |
| `OTP_PROVIDER` | OPTIONAL | **effectively required** | Defaults to `stub` — see finding #1 |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | (listed) | required if `OTP_PROVIDER=twilio` | Provider throws if missing |
| `CITYFIX_DEV_STORE` | DEV-ONLY | **must be unset in prod** | No guard enforces this — finding #3 |
| `POLL_RATE_LIMIT_PER_SECOND` | OPTIONAL | optional | |

**Finding #12 (Medium) — three classes of var are missing entirely:**

- `CITYFIX_DEV_PROMOTE_SECRET` — gates four privilege-escalation endpoints. A deployment that never sets it is safe; a deployment that sets it (as the local `.env.local` does) has an unauthenticated admin-escalation path. It must be documented, and marked **must be unset in production**.
- `DEV_SKIP_WEBAUTHN` — the WebAuthn bypass. Same "must be unset in prod" marking.
- All `BLOB_*` vars — `BLOB_PROVIDER`, `BLOB_LOCAL_DIR`, `BLOB_LOCAL_BASE_URL`, `BLOB_S3_*`, `BLOB_PUBLIC_BASE_URL`, `BLOB_SIGNED_URL_TTL` (`lib/storage/blob.ts:172-189`). A production deployment with no `BLOB_*` set silently gets the local provider — unsigned, unserved, and writing to the local filesystem.

---

## 7. Audit trail

### 7.1 The model — `prisma/schema.prisma:428-443`

```prisma
model AuditEntry {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  action     String
  actorId    String
  beforeValue Json?
  afterValue  Json?
  timestamp  DateTime @default(now())
  actor      User     @relation(fields: [actorId], references: [id], onDelete: Restrict)
  @@index([entityType, entityId])
  @@index([actorId, timestamp])
}
```

The schema comment reads: *"Append-only — no UPDATE/DELETE allowed at the API layer."*

`lib/platform/audit.ts` exposes only `writeAudit(input)` → `db.audit.create`. The `entityType` union is `'ticket'|'city'|'category'|'department'|'ward'|'user'|'dedupFlag'`; `action` is a free string.

### 7.2 Immutability

**Immutability holds.** A repo-wide search for `auditEntry.update|delete|upsert` and `db.audit.update|delete` returns **no matches** anywhere in the codebase. There is no API path that modifies or removes an audit row. The `onDelete: Restrict` on the `actor` relation means a user cannot be deleted while audit rows reference them — though `lib/admin/users-db.ts:436-460` deletes sessions then the user, which would be blocked by `Restrict` if audit rows exist for that user. **This is worth verifying against a live database** — it is either a bug (admin user deletion fails once the user has acted) or an intentional safeguard that needs a documented path.

Note also: `action` is a free-form string with no enum constraint and no server-side validation. Typos in action names would silently create a new action category rather than fail loudly. The `entityType` union is typed, but `action` is not — an inconsistency in a schema whose whole purpose is forensic traceability.

### 7.3 Coverage of the four questions

| Question | Covered? | Action | Evidence |
|---|---|---|---|
| **Who verified a report?** | ⚠️ Partial | `ticket.create`, `ticket.dedup_detected`, `ticket.dedup_declined`, `dedup_confirmed`, `dedup_dismissed` | `app/api/tickets/route.ts:291-316`; `dedup-flags/[id]/confirm/route.ts:104-127`; `dismiss/route.ts:94-109` |
| **Who assigned a crew?** | ✅ Yes | `reassign.crew` (shared route), `reassign` (dispatcher route) | `app/api/tickets/[id]/transition/route.ts:218-229`; `app/api/v1/dispatcher/tickets/[id]/route.ts:226-234` |
| **Who changed priority?** | ❌ **Not covered** | — | No `priority` field on the `Ticket` model; no priority-change action anywhere |
| **When was it resolved?** | ✅ Yes | `ticket.transition` with `beforeValue`/`afterValue` status + `note` | `lib/platform/transitions.ts:48-87` |

**On "who verified a report":** there is no distinct "verification" concept in the model — no `verifiedById`, no `verifiedAt` on `Ticket`. What exists is the dedup-decision trail: `ticket.dedup_detected` records that a near-duplicate was found, `ticket.dedup_declined` records the citizen's denial, and `dedup_confirmed` / `dedup_dismissed` record the dispatcher's adjudication with before/after values. A dispatcher confirming a duplicate **is** a form of verification, and it is audited. But "the report was reviewed and is legitimate" — the ordinary triage case — leaves no trace; a dispatcher viewing a ticket writes nothing.

**On "who changed priority":** the `Ticket` model has **no priority field** (`prisma/schema.prisma`, `model Ticket`). This is not an audit gap in the sense of a missing audit row for an existing operation — the operation does not exist in the product. It is nonetheless a genuine gap against the question as posed, and it should be recorded as a product-scope decision rather than a security defect.

---

## 8. Known weak spots, ranked

### Critical

1. **OTP plaintext in the response** (`send-otp/route.ts:160-167`) combined with the **stub provider default** (`otp-provider/index.ts:31`). Remediation: guard `dev_code` on `NODE_ENV !== 'production' && OTP_PROVIDER === 'stub'`; default `OTP_PROVIDER` to `'twilio'`; never let the stub provider be selected in production.
2. ~~**OTP attempt limit never enforced**~~ — **CLOSED 2026-11-09.** The route now reads `attempts` back before verifying and returns `429 too_many_attempts` at the limit; the counter is persisted on the `OtpCode` row, the correct code is refused once locked out, and the counter is per-code so a citizen is never locked out permanently. Regression test: `tests/unit/otp-attempt-limit.test.ts`.
3. **Four `/api/dev/*` routes reachable in production** (gated on a shared secret, not on `isDevStore()`). Remediation: add `if (!isDevStore()) return 404` to `bootstrap-admin`, `issue-session`, `promote-admin`, `list-users` — matching what `dev/login` and `dev/reset` already do. Then delete `bootstrap-admin` and `issue-session` before launch.

### High

4. ~~**`PUT /api/profile` is an ungated admin write**~~ — **CLOSED 2026-11-09.** The admin write now calls `requireWebAuthn`; the body is Zod-validated; the write is scoped to `session.userId`; the cheap checks run before the ceremony; and every write lands an audit row. The non-admin write stays ungated, per ADR-007. Regression test: `tests/unit/profile-webauthn-gate.test.ts`.
5. ~~**WebAuthn challenges are never consumed**~~ — **CLOSED 2026-11-09.** `requireWebAuthn` now DELETES the challenge row it accepts; the delete is scoped to the owning user; a concurrent consume is a refusal rather than a pass; a rejected guard call consumes nothing. One ceremony now authorises exactly one write. Regression test: `tests/unit/webauthn-challenge-consumption.test.ts`.
6. **Admin city-scoped routes have no city check** — `requireRole('admin')` only, while `admin/tickets/[id]` *does* call `requireSameCity`. Remediation: resolve ADR-006, then apply the answer consistently to all 12 routes under `cities/[id]`.
7. **Password login is not role-restricted** — an admin can authenticate with a password. Remediation: restrict the password path to `role: 'citizen'`; force admin login through the WebAuthn route.

### Medium

8. **In-process rate limiting and lockout** — not multi-instance safe. Remediation: Postgres or Redis before scaling.
9. **No `middleware.ts`** — the structural cause of #4 (now closed) and #6 (now closed). Remediation: add a baseline session gate.
10. **CSP `'unsafe-inline' 'unsafe-eval'`** — remediation: nonces; isolate the Swagger route.
11. **`.env.example` incomplete** — missing `CITYFIX_DEV_PROMOTE_SECRET`, `DEV_SKIP_WEBAUTHN`, all `BLOB_*`. Remediation: document every var, mark the dangerous ones "must be unset in production".
12. **`sessionId` echoed in `/api/auth/status`** — remediation: omit from the body.

### Low

13. **`Math.random()` for OTP codes** — remediation: `crypto.randomInt`.
14. **Missing COOP/CORP/`X-DNS-Prefetch-Control`** — remediation: add.
15. **Local blob photos 404** (`/api/blob` route missing) — remediation: add the serving route with safe headers.
16. **Public Swagger UI from a CDN** — remediation: gate behind admin, or self-host the assets.

### Systemic observation

The strongest pattern in this codebase is the discipline around the `/api/v1/admin/*` tree: every one of those write handlers calls `requireRole` then `await requireWebAuthn` then `writeAudit`, and the ADR-007 test suite exercises the shared transition route through its real dependency graph rather than with mocks. That is good work.

The weakness is the same one ADR-007 itself predicted at lines 229-234: the rule was enforced by *convention* (path layout) before it was enforced by *role*. ADR-007 moved the transition route under the role rule but did not sweep the rest of the codebase for routes that an admin session can reach. `PUT /api/profile` was that route; it is now gated and audited (finding #5, closed 2026-11-09). There may be others in future Bolts — which is why a `middleware.ts` baseline and a route-level audit checklist (as ADR-007:231-234 recommends) are the durable fix.

---

## Recommended remediation order

1. **Check the production env vars.** Determine whether `OTP_PROVIDER`, `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN`, and `CITYFIX_DEV_PROMOTE_SECRET` are set in the deployed environment. This determines whether findings #1–#4 are theoretical or live.
2. **Add the `isDevStore()` guard to the four `/api/dev/*` promote routes** — a four-line change that closes the largest hole.
3. **Fix the OTP path** — guard `dev_code` on env, enforce `OTP_MAX_ATTEMPTS`, switch to `crypto.randomInt`. *(The attempt limit is done — closed 2026-11-09. The `dev_code` leak and the `Math.random()` generator remain.)*
4. **Consume WebAuthn challenges** — restores the platform's core assumption.
5. **Gate `PUT /api/profile`** *(done — closed 2026-11-09)* **and resolve the admin city-scope question against ADR-006.**
6. **Document the missing env vars** and add a production guard on `CITYFIX_DEV_STORE`.

---

## What could NOT be verified, and why

| Item | Why not verifiable |
|---|---|
| **Live database behaviour** | No database was reachable. `AuditEntry`'s `onDelete: Restrict` against `lib/admin/users-db.ts:436-460` user deletion could not be tested — it may be a bug or a deliberate safeguard. |
| **Real WebAuthn hardware** | No authenticator was available. Attestation and assertion paths were read, not executed. `requireUserVerification: false` was confirmed by source inspection but not exercised. Counter-clone detection could not be tested. |
| **Deployed environment** | No deployment was inspected. Whether `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN`, `OTP_PROVIDER`, or `CITYFIX_DEV_PROMOTE_SECRET` are set in production is **unknown and decisive** for findings #1, #3, and #4. **This should be checked against the real hosting environment's env vars as the first action item.** |
| **Prisma schema vs. actual DB** | The `prisma/schema.prisma` model was read; whether migrations have been applied (and whether the live DB matches) is unknown. |
| **ADR-006** | Not present in `docs/adr/`. Its resolution determines whether finding #7 is a confirmed cross-city vulnerability or a documented design decision. |
| **Rate-limit and lockout behaviour under load** | No load testing. The per-instance limitation is established from source (in-process `Map`), not measured. |
| **Twilio provider** | The 3-attempt backoff `[100,200,400]ms` (`twilio.ts:24-25`) and 4xx-is-permanent classification (L93-96) were read, not exercised against the live API. |
| **Client-side code** | `components/` was reviewed only where it bore directly on the API contract (e.g. `SessionProvider.tsx`). XSS via DOM sinks was not systematically audited. |
| **CSP effectiveness** | `'unsafe-inline'`/`'unsafe-eval'` were read from source. No browser-level CSP violation testing was performed. |
| **Photo downscaling trust** | The client-side downscale (`lib/photo/downscale.ts`) is a UX optimisation; the server-side 5 MB cap was confirmed, but no image-content (polyglot/malformed-file) validation exists — a valid-looking JPEG can carry an embedded payload. |

---

## Files referenced in this audit

All paths relative to the repository root.

`docs/adr/ADR-007-admin-write-webauthn.md` · `lib/auth/{session,guards,otp,password,webauthn,login-lockout}.ts` · `lib/auth/otp-provider/{index,stub,twilio}.ts` · `lib/platform/{rate-limit,db-guard,audit,dedup,transitions,push}.ts` · `lib/serializers/{ticket,trail}.ts` · `lib/storage/blob.ts` · `lib/admin/{tickets-query,users-db}.ts` · `lib/format/photo-url.ts` · `lib/crew/upload-photo.ts` · `lib/db-switch.ts` · `prisma/schema.prisma` · `next.config.js` · `.env.example` · `tests/unit/{require-webauthn,transition-webauthn}.test.ts` · and all 62 handlers under `app/api/**/route.ts`.
