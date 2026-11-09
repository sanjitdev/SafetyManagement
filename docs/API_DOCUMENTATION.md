# CityFix — API Documentation

**Documented:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Base URL (prod):** `https://cityfix.vercel.app`
**Base URL (local):** `http://localhost:3000`

---

## How to read this document

This file is the **human-facing** API reference. The **machine-readable** contract is `lib/docs/openapi.ts`, an OpenAPI 3.0.3 document served live at `GET /api/docs/spec` and rendered by Swagger UI at `GET /api/docs`.

The two are kept in sync by a rule that is enforced by the type checker, not by discipline: `lib/docs/openapi.ts` is a **TypeScript module**, not a YAML file. A typo'd component reference or a malformed schema is a `tsc --noEmit` failure, not a silently-wrong doc. `npm run docs:generate` materialises it as `lib/docs/openapi.json` for external tooling.

**Where this document and the OpenAPI spec disagree, the OpenAPI spec wins.** It is generated from typed code and is the closest thing to the live contract.

**Coverage:** 62 route handler files, **78 HTTP operations**, under `app/api/**/route.ts`.

| Group | Paths | Operations | Base path | Auth |
|---|---:|---:|---|---|
| Public / Auth | 12 | 12 | `/api/v1/auth/*`, `/api/auth/*` | Public (credential in body) |
| Citizen tickets & misc | 8 | 11 | `/api/tickets/*`, `/api/profile`, `/api/report/*`, `/api/v1/push/*` | Session |
| Activity feeds | 2 | 2 | `/api/v1/activity/*` | Mixed |
| Dispatcher | 12 | 13 | `/api/v1/dispatcher/*` | Session + ward/dept scope |
| Crew | 4 | 4 | `/api/v1/crew/*` | Session + assignment scope |
| Admin | 16 | 27 | `/api/v1/admin/*` | Session + **WebAuthn on writes** |
| Dev-only | 6 | 7 | `/api/dev/*` | Shared secret — **not for production** |
| Docs | 2 | 2 | `/api/docs/*` | Public |
| **Total** | **62** | **78** | | |

Operation split by method across the whole surface: 30 GET, 33 POST, 8 DELETE, 6 PATCH, 1 PUT.

> **The counts here are measured, not estimated.** They were produced by parsing `export {GET,POST,PUT,PATCH,DELETE}` declarations out of all 62 `route.ts` files and reconciling the result against `lib/docs/openapi.ts`. An earlier draft of this document claimed 80 operations; that figure was wrong and has been corrected. A later revision of this table carried a wrong *method split* (31 GET / 7 PATCH / 6 DELETE) while its totals were right; re-measuring on 2026-11-08 gave 30 GET / 6 PATCH / 8 DELETE. Re-measuring again on 2026-11-09, after the WebAuthn step-up route was added, gave 62 files / 78 operations and 30 GET / 33 POST / 8 DELETE / 6 PATCH / 1 PUT.
>
> The reconciliation is now **enforced mechanically** — `tests/unit/docs/openapi-route-parity.test.ts` compares the spec against the route files in both directions on every unit run.

---

## Authentication

### Session cookie

All authenticated endpoints use a single HTTP-only cookie:

```
cityfix_session = <sessionId>.<hmac-sha256-signature>
```

| Property | Value |
|---|---|
| `HttpOnly` | `true` — not readable from JavaScript |
| `SameSite` | `lax` — CSRF-resistant for top-level navigations |
| `Secure` | `NODE_ENV === 'production'` only |
| `Path` | `/` |
| TTL | 14 days |
| Signature compare | `timingSafeEqual` |

Sessions are stored as `Session` rows, so revocation is immediate — deleting the row invalidates the cookie on the next request. Logout deletes the row.

### Roles

Four roles, bound to the session at login:

| Role | Scope binding | Notes |
|---|---|---|
| `citizen` | city | Can report, read own reports, leave feedback |
| `dispatcher` | city + ward + department | Triage, assign crew, adjudicate dedup flags |
| `crew` | city + ward + department + assignment | Work assigned tickets, upload after-photos |
| `admin` | city (or platform-wide — see [ADR-006 ambiguity](#known-inconsistencies)) | City configuration. **Every admin write requires a WebAuthn assertion.** |

### WebAuthn (admin write ceremonies)

Admin write endpoints require a **fresh assertion** from a registered authenticator. The flow:

1. `POST /api/auth/webauthn/assertion` — body carries the credential ID and the authenticator's signed challenge. On success the server issues a session cookie.
2. That session then satisfies `requireWebAuthn` on admin writes for the challenge TTL (5 minutes).

**Known limitation:** challenges are currently **not consumed** on use — see [SECURITY_AUDIT.md §1.4](SECURITY_AUDIT.md#14-webauthn) (finding #6, High). One ceremony currently authorises every admin write for 5 minutes.

### Guards

All guards live in `lib/auth/guards.ts` and throw `ApiError({ status, code })`.

| Guard | 401 code | 403 code | Semantics |
|---|---|---|---|
| `requireRole` | `not_authenticated` | `forbidden_role` | Role must match |
| `requireSameCity` | `not_authenticated` | `cross_city_access_denied` | Session city must match the resource city |
| `requireScope` | — | `cross_ward_access_denied` / `cross_department_access_denied` / `citizen_cannot_act_as_dispatcher_or_crew` | Ward + department must match. **Admins bypass** (city-wide authority) |
| `requireWebAuthn` | `not_authenticated` / `webauthn_required` / `webauthn_assertion_expired` | `forbidden_role` | Admin writes only |

---

## Response conventions

### Success

JSON. Ticket-bearing responses use the role-aware serializer `serializeTicketForRole` (`lib/serializers/ticket.ts`), which strips `internalNote`, `assignedCrewId` and `reporterName` from citizen responses and anonymises the trail actor to "সিটি কর্পোরেশন".

### Errors

```json
{ "error": "<stable_error_code>" }
```

`ApiError` sets `message = code` when no separate message is supplied, so the body is usually `{"error":"forbidden_role"}`.

### Common status codes

| Status | Meaning |
|---|---|
| 200 | Success |
| 201 | Created |
| 204 | No content (e.g. photo delete) |
| 400 | Malformed body / query (`invalid_input`, `invalid_query`, `ward_not_in_city`, `category_not_in_city`) |
| 401 | No session, expired session, or missing WebAuthn assertion |
| 403 | Authenticated but not permitted (`forbidden_role`, `cross_city_access_denied`, `cross_ward_access_denied`, `cross_department_access_denied`) |
| 404 | Resource not found, or route deliberately hidden |
| 409 | Conflict — duplicate, illegal transition, last WebAuthn credential |
| 413 | Photo exceeds the 5 MB cap |
| 422 | Illegal transition on the v1 dispatcher/crew transition routes |
| 429 | Rate limited — see `Retry-After` |

### Rate limiting

Per-IP token buckets (`lib/platform/rate-limit.ts`). Default **1 req/s, capacity 1** in production, capacity 4 in dev. Applied to `/api/v1/auth/login`, `/api/v1/auth/send-otp`, `/api/v1/auth/verify-otp`, `GET /api/tickets/{id}`, and `GET /api/v1/activity/public`.

The limiter is **in-process** — a `Map` in the Node process. It is not shared across instances and does not survive a restart (see [SECURITY_AUDIT.md §5.3](SECURITY_AUDIT.md#53-rate-limiting--libplatformrate-limitts), finding #9).

---

## Endpoint reference

### Auth — public

#### `POST /api/v1/auth/register`

Create a citizen account.

**Request**

| Field | Type | Rules |
|---|---|---|
| `phone` | string | E.164-ish, unique per city |
| `nid` | string | National ID; unique |
| `password` | string | ≥8 chars, ≥1 digit (Argon2id hashed) |
| `name` | string | Display name |
| `nameBn` | string? | Bangla display name |
| `cityId` | string | Must exist |
| `wardId` | string? | Must belong to the city |

**Responses** — `201` with `{ id, phone, name, role: "citizen" }` · `400` `invalid_input` / `phone_taken` / `nid_taken` · `409` duplicate

---

#### `POST /api/v1/auth/send-otp`

Request an SMS OTP.

**Request** — `{ phone: string, cityId?: string }`

**Responses** — `200` `{ ok: true, ttlMs: 300000, dev_code?: string }` · `429` rate limited / resend cooldown (60 s)

> ⚠️ **`dev_code` is currently returned unconditionally, in every environment.** See [SECURITY_AUDIT.md §1.3](SECURITY_AUDIT.md#13-otp-flow) (finding #1, Critical). Treat this endpoint as unsafe to expose until fixed.

---

#### `POST /api/v1/auth/verify-otp`

Exchange an OTP for a session.

**Request** — `{ phone: string, code: string, citySlug?: string, scope?: 'registration' | 'login' | 'password-reset' }`

**Responses** — `200` with a `cityfix_session` cookie · `400` `invalid_input` · `401` `wrong_code` (with `attempts` and `remaining`) · `404` `city_not_found` / `no_pending_verification` · `410` `expired` · `429` `rate_limited` / `too_many_attempts`

> ✅ **The 5-attempt limit is enforced** (fixed 2026-11-09). The `attempts` column on the `OtpCode` row is incremented on each wrong guess and read back before verification; once it reaches `OTP_MAX_ATTEMPTS` the code is locked out with `429 too_many_attempts`, and even the correct code is refused. The counter lives on the row, so it survives a restart. It is scoped to the code, not the account: issuing a new code starts a fresh counter (the `send-otp` route has a 60-second resend cooldown). See `tests/unit/otp-attempt-limit.test.ts`.

---

#### `POST /api/v1/auth/login`

Password login.

**Request** — `{ phone: string, password: string, cityId?: string }`

**Responses** — `200` with a `cityfix_session` cookie · `401` `invalid_credentials` · `423` locked out · `429` rate limited

> ⚠️ No role filter — staff accounts can authenticate with a password. See finding #8, High.

---

#### `POST /api/auth/webauthn/login`

Start an admin WebAuthn login.

**Request** — `{ phone: string }` or `{ username: string }`

**Responses** — `200` `{ challenge, rpId, allowCredentials, timeout, userVerification }` · `404` `admin_not_found` (same code for missing and non-admin — no enumeration leak)

---

#### `POST /api/auth/webauthn/assertion`

Complete a WebAuthn login or admin-write ceremony.

**Request** — `{ id: string, rawId: string, response: {...}, type: "public-key" }` plus the server-side challenge

**Responses** — `200` with a `cityfix_session` cookie · `401` `webauthn_assertion_expired` / `webauthn_verification_failed`

---

#### `POST /api/auth/webauthn/step-up`

The **session-authenticated** ceremony for an admin who is already signed in. Two actions on one route, because the authenticator interaction sits between them.

| Action | Request | Response |
|---|---|---|
| `challenge` | `{ action: "challenge" }` | `200` `{ challengeId, challenge, rpId, allowCredentials, timeout, userVerification }` |
| `verify` | `{ action: "verify", challengeId: string, assertionResponse: {...} }` | `200` `{ ok: true }` |

The challenge is bound to **the session's own user** — never to a client-supplied identifier — and a successful assertion does **not** mint or replace the session. The admin's existing cookie keeps working; what changes is that the challenge ledger holds a fresh, unexpired row, so the next gated write passes `requireWebAuthn`.

**Responses** — `200` · `400` `invalid_input` · `401` `not_authenticated` / `webauthn_assertion_failed` / `webauthn_assertion_expired` · `403` `forbidden_role` / `webauthn_challenge_owner_mismatch` · `404` `webauthn_challenge_not_found` / `webauthn_credential_not_found` · `409` `webauthn_no_credential`

> `webauthn_challenge_owner_mismatch` is the security-critical case: without it, a signed-in admin could complete a *different* user's challenge and have it recorded as their own step-up.

---

### Auth — session

#### `GET /api/auth/status`

Current session state.

**Responses** — `200` `{ authenticated: boolean, role?, cityId?, sessionId? }`

> `sessionId` is echoed in the body — finding #13, Medium.

---

#### `POST /api/auth/logout`

Delete the session row and clear the cookie.

**Responses** — `200` `{ ok: true }`

---

### Auth — WebAuthn registration

#### `POST /api/auth/webauthn/register/challenge`

Issue a registration challenge for the authenticated admin.

**Responses** — `200` `{ challenge, rp: { id, name }, user: { id, name, displayName }, pubKeyCredParams }`

---

#### `POST /api/auth/webauthn/register`

Submit the authenticator's attestation.

**Request** — `{ id, rawId, response: { attestationObject, clientDataJSON }, type: "public-key" }`

**Responses** — `200` `{ credentialId }` · `400` `webauthn_verification_failed`

---

#### `DELETE /api/auth/webauthn/revoke`

Remove a registered credential.

**Responses** — `200` `{ ok: true }` · `409` `webauthn_last_credential` (refuses to revoke the last one)

---

### Tickets — citizen

#### `POST /api/tickets`

Create a city issue report.

**Request**

| Field | Type | Rules |
|---|---|---|
| `categoryId` | string | Must belong to the city |
| `wardId` | string | Must belong to the city |
| `description` | string | Report body |
| `descriptionBn` | string? | Bangla body |
| `locationLat` / `locationLng` | number | Range-constrained; geofenced to the city |
| `locationLabel` | string? | Free-text address |
| `photoUrls` | string[] | ≤3 (≤2 for narrow categories, ≥1 mandatory) |
| `dedupConfirmed` | boolean? | Citizen's acknowledgement after a dedup prompt |

**Responses** — `201` with the created ticket · `400` `ward_not_in_city` / `category_not_in_city` / `too_many_photos` / `invalid_photo_url` · `413` oversized photo · `409` `duplicate_ticket`

**Dedup.** A near-duplicate within `city.dedupRadiusMeters` (default 50 m) raises a dedup flag rather than rejecting the report. The citizen is asked to confirm; the decision is audited (`ticket.dedup_detected`, `ticket.dedup_declined`).

---

#### `GET /api/tickets`

List the calling citizen's own reports.

**Query** — `status?`, `limit?`, `cursor?`

**Responses** — `200` `{ tickets: [...], nextCursor? }` · `401` `not_authenticated`

---

#### `GET /api/tickets/{id}`

One report.

**Responses** — `200` with the ticket · `404` not found · `401` `not_authenticated`

---

#### `POST /api/tickets/{id}/feedback`

Citizen satisfaction feedback ("was this heard?").

**Request** — `{ rating: number, comment?: string }`

**Responses** — `201` · `400` `invalid_input` · `404` · `409` `feedback_already_submitted`

---

#### `DELETE /api/tickets/{id}/photos/{idx}`

Remove one of the caller's own photos by zero-based index.

**Responses** — `204` · `400` `invalid_input` (index not numeric) · `404`

---

#### `POST /api/tickets/{id}/transition`

**Shared transition route** — the single implementation used by citizen, dispatcher, crew and admin, with the role matrix enforced server-side.

**Request** — `{ status: TicketStatus, note?: string, crewId?: string }`

**Responses** — `200` with the updated ticket · `403` `forbidden_role` / `cross_ward_access_denied` / `cross_department_access_denied` · `409` `invalid_transition` · `401` `webauthn_required` (admin only)

**The ordering is deliberate** and matches ADR-007 exactly:

1. `requireRole` → 401
2. Zod parse → 400
3. Role vs `ALLOWED_BY_ROLE` → 403
4. Ticket load → 404
5. `requireSameCity` → 403
6. `requireScope` → 403
7. **`requireWebAuthn`** → 401 — *only when `session.role === 'admin'`*

The ceremony fires **after** the ticket load and the scope checks, so an out-of-scope dispatcher gets `cross_ward_access_denied` rather than a WebAuthn error, and a missing ticket 404s rather than demanding a ceremony that cannot change anything.

**Status trail** (shared across all surfaces):

```
submitted → routed → in_progress → resolved
```

`cancelled` is an admin-only terminal state.

---

### Dispatcher

#### `GET /api/v1/dispatcher/queue`

The triage queue.

**Query** — `status?`, `wardId?`, `limit?`

**Responses** — `200` `{ tickets: [...], counts: {...} }` · `403` `cross_city_access_denied` · `400` `invalid_query`

---

#### `GET /api/v1/dispatcher/map/tickets`

Map bounding-box query for the dispatcher map.

**Query** — `bbox` (`minLng,minLat,maxLng,maxLat`), `status?`

**Responses** — `200` `{ tickets: [...] }` · `400` `invalid_query` · `403` `cross_city_access_denied`

---

#### `GET /api/v1/dispatcher/monitor`

Live monitor board.

**Query** — `wardId?`

**Responses** — `200` `{ crews: [...], tickets: [...], sla: {...} }` · `403` `cross_city_access_denied`

---

#### `POST /api/v1/dispatcher/monitor/ack`

Acknowledge a monitor alert.

**Request** — `{ ticketId: string, note?: string }`

**Responses** — `200` · `403` · `404`

---

#### `GET /api/v1/dispatcher/crew-for-ward`

Available crews for a ward.

**Query** — `wardId` (required)

**Responses** — `200` `{ crews: [...] }` · `400` `invalid_query` · `403` `cross_ward_access_denied`

---

#### `GET /api/v1/dispatcher/performance`

Crew performance metrics.

**Query** — `from?`, `to?`, `wardId?`

**Responses** — `200` `{ crews: [...], totals: {...} }` · `403` `cross_city_access_denied`

---

#### `GET /api/v1/dispatcher/dedup-flags`

Pending dedup flags for review.

**Responses** — `200` `{ flags: [...] }`

---

#### `POST /api/v1/dispatcher/dedup-flags/{id}/confirm`

Confirm the flagged report is a duplicate.

**Responses** — `200` · `403` `cross_ward_access_denied` · `404` · audited as `dedup_confirmed`

---

#### `POST /api/v1/dispatcher/dedup-flags/{id}/dismiss`

Dismiss the flag — the report is legitimate.

**Responses** — `200` · `403` · `404` · audited as `dedup_dismissed`

---

#### `GET /api/v1/dispatcher/tickets/{id}`

One ticket, dispatcher view.

**Responses** — `200` · `403` `cross_ward_access_denied` / `cross_department_access_denied` · `404`

---

#### `PATCH /api/v1/dispatcher/tickets/{id}`

Update dispatcher-editable ticket fields.

**Request** — any of `{ departmentId?, categoryId?, priorityNote? }`

**Responses** — `200` · `400` `invalid_input` · `403` · `404` · audited

---

#### `POST /api/v1/dispatcher/tickets/{id}/transition`

Dispatcher-scoped transition. Functionally equivalent to the shared route but uses **422 `illegal_transition`** rather than 409 `invalid_transition`.

**Responses** — `200` · `403` · `404` · `422` `illegal_transition`

---

#### `POST /api/v1/dispatcher/tickets/{id}/assign-crew`

Assign a crew to the ticket.

**Request** — `{ crewId: string, note?: string }`

**Responses** — `200` · `400` `invalid_input` · `403` · `404` · audited as `reassign`

---

### Crew

#### `GET /api/v1/crew/tickets`

The calling crew member's assignments.

**Responses** — `200` `{ tickets: [...] }` · `403` `cross_city_access_denied`

---

#### `GET /api/v1/crew/tickets/{id}`

One assigned ticket, crew view.

**Responses** — `200` · `403` `cross_ward_access_denied` · `404`

---

#### `POST /api/v1/crew/tickets/{id}/transition`

Crew-scoped transition. `422 illegal_transition` for illegal moves.

**Responses** — `200` · `403` · `404` · `422` `illegal_transition`

---

#### `POST /api/v1/crew/tickets/{id}/photos`

Upload an after-photo.

**Request** — multipart form: the image plus `note?`

**Responses** — `201` with the photo · `413` oversized · `400` `invalid_input` · `403` · `404`

Photos are validated against the MIME allow-list `image/jpeg`, `image/png`, `image/webp` and the 5 MB cap. The trail marker `after_photo:<url>` is rewritten to a localised string for citizen-facing responses (`lib/serializers/trail.ts`).

---

### Activity

#### `GET /api/v1/activity`

Authenticated activity feed — the caller's own reports plus city-wide activity.

**Responses** — `200` `{ items: [...] }` · `401` `not_authenticated`

---

#### `GET /api/v1/activity/public`

**Unauthenticated** public activity feed.

Uses `serializeTicketForPublic`, which strips `reporterId`, `internalNote`, `assignedCrewId`, the trail and `locationLabel`.

**Responses** — `200` `{ items: [...] }` · `429` rate limited

---

### Admin

All admin writes call `requireRole(session, 'admin')` → `await requireWebAuthn(session)` → `writeAudit(...)`, in that order. Reads are exempt from the ceremony.

#### `GET /api/v1/admin/cities` · `POST /api/v1/admin/cities`

List cities / create a city.

**POST request** — `{ name, nameBn?, slug, country?, cityConfig?, template? }`

**Responses** — `200` / `201` · `400` `invalid_input` · `401` `webauthn_required` (POST)

> ⚠️ `POST /api/v1/admin/cities` **swallows template-application failure** and still returns 200 — see [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

---

#### `GET|PATCH|DELETE /api/v1/admin/cities/{id}`

Read / update / delete one city.

**Responses** — `200` / `204` · `400` · `401` `webauthn_required` (writes) · `404`

> ⚠️ These routes check the admin **role** but not the **city** — `params.id` is not compared to `session.cityId`. See finding #7, High.

---

#### `GET|POST /api/v1/admin/cities/{id}/categories` · `PATCH|DELETE .../categories/{catId}`

Category taxonomy CRUD.

**Responses** — `200` / `201` / `204` · `400` · `401` `webauthn_required` (writes) · `404`

---

#### `GET|POST /api/v1/admin/cities/{id}/departments` · `PATCH|DELETE .../departments/{deptId}`

Department taxonomy CRUD.

**Responses** — as above

---

#### `GET|POST /api/v1/admin/cities/{id}/wards` · `PATCH|DELETE .../wards/{wardId}`

Ward CRUD, including the GeoJSON boundary polygon.

**Responses** — as above

---

#### `GET|POST /api/v1/admin/cities/{id}/users` · `PATCH|DELETE .../users/{userId}`

Staff user management.

**Responses** — `200` / `201` / `204` · `400` · `401` `webauthn_required` (writes) · `404`

---

#### `POST /api/v1/admin/cities/{id}/users/import`

Bulk user import.

**Request** — `{ users: [...] }`

**Responses** — `201` `{ imported, skipped, failed }` · `400` · `401` `webauthn_required`

---

#### `GET /api/v1/admin/cities/{id}/adoption` · `GET /api/v1/admin/cities/{id}/adoption/export`

Adoption metrics for a city; the second returns CSV.

**Responses** — `200` JSON / `text/csv` · `401`

> ⚠️ The export route passes `citySlug: params.id` — the **id**, not the slug. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

---

#### `GET /api/v1/admin/tickets` · `GET /api/v1/admin/tickets/{id}`

City-wide ticket oversight.

**Responses** — `200` · `403` `cross_city_access_denied` · `404`

These two routes **do** call `requireSameCity` — unlike the `cities/{id}` routes above.

---

#### `GET /api/v1/admin/audit`

Audit trail query.

**Query** — `entityType?`, `entityId?`, `actorId?`, `from?`, `to?`, `limit?`

**Responses** — `200` `{ entries: [...] }` · `400` `invalid_query`

---

### Misc

#### `GET /api/profile` · `PUT /api/profile`

Read / update the calling user's profile (`name`, `nameBn`).

**Responses** — `200` · `400` `invalid_input` · `401` `unauthenticated` · `401` `webauthn_required` · `401` `webauthn_assertion_expired` · `404` `user_not_found`

> ✅ **Fixed 2026-11-09.** `PUT /api/profile` used to have no role check, no WebAuthn ceremony and hand-rolled validation. It now calls `requireWebAuthn` for an **admin** session, validates the body with Zod, scopes the write to the caller's own row, and lands an audit row. A citizen / dispatcher / crew write to their own profile is **not** gated — ADR-007 applies the rule to the *role*, and those writes are not admin writes. See finding #5 (closed).

---

#### `GET /api/report/bootstrap`

Everything the report flow needs to start: categories, wards, the city geofence polygon, and photo limits.

**Responses** — `200` `{ city, categories, wards, limits }`

---

#### `POST /api/v1/push/subscribe` · `DELETE /api/v1/push/subscribe`

Register / remove a Web Push subscription for the calling user.

**Request** — `{ endpoint, keys: { p256dh, auth } }`

**Responses** — `200` / `204` · `400` `invalid_input` · `401` `not_authenticated`

---

### Docs

#### `GET /api/docs` · `GET /api/docs/spec`

Swagger UI, and the OpenAPI 3.0.3 JSON it renders.

Both are **public and un-rate-limited** by design — Swagger's "Try it out" fetches the spec on every page load.

**Responses** — `200` HTML / JSON

---

### Dev-only — **not for production**

| Route | Method | Gate | Effect |
|---|---|---|---|
| `/api/dev/login` | GET, POST | `isDevStore()` → 404 | Sign in as a seeded persona |
| `/api/dev/reset` | POST | `isDevStore()` → 404 | Reset the dev store |
| `/api/dev/bootstrap-admin` | POST | **`CITYFIX_DEV_PROMOTE_SECRET` only** | Promote a citizen to admin **and mint an admin session** |
| `/api/dev/issue-session` | POST | **`CITYFIX_DEV_PROMOTE_SECRET` only** | Mint a session for any userId, bypassing the password |
| `/api/dev/promote-admin` | POST | **`CITYFIX_DEV_PROMOTE_SECRET` only** | Promote the session's user to admin |
| `/api/dev/list-users` | POST | **`CITYFIX_DEV_PROMOTE_SECRET` only** | List users with roles and phone numbers |

> ⚠️ The last four are **not** gated on `isDevStore()`, unlike the first two. A single leaked static secret yields unauthenticated privilege escalation to admin. See findings #3 and #4, Critical.

---

## The OpenAPI spec

`lib/docs/openapi.ts` is the machine-readable contract.

- **Served live:** `GET /api/docs/spec` (no-store)
- **Rendered:** `GET /api/docs` (Swagger UI, assets from unpkg)
- **Materialised:** `npm run docs:generate` → `lib/docs/openapi.json`

**53 paths / 68 operations** are in the spec. It excludes the 8 dev-only and docs routes (7 + 2 = 9 operations across 8 files), which accounts for the difference against the 77 live operations.

> ### ✅ The phantom-operation defect was found — and fixed
>
> Reconciling the spec against the route handlers found **one path where the spec documented methods that did not exist**:
>
> | Path | Was in the spec | Is in the code |
> |---|---|---|
> | `/api/tickets/{id}` | `GET`, `PATCH`, `DELETE` | **`GET` only** |
>
> `app/api/tickets/[id]/route.ts` exports exactly one handler — `GET` at line 17. There was no `PATCH` and no `DELETE`. The spec's `patch` block (`operationId: updateTicket`) and `delete` block (`operationId: deleteTicket`) described endpoints that did not exist, violating the spec module's own accuracy rule #1. The type checker could not catch it: `tsc --noEmit` validates that a component reference is well-formed, not that a documented method has a handler behind it.
>
> **Both blocks were deleted on 2026-11-08.** They were removed rather than left as "planned", because a spec that lists unimplemented operations is indistinguishable from a spec that lists broken ones — and the Swagger UI at `/api/docs` was telling developers that a citizen could edit or delete their own report, when both requests return 405.
>
> **A durable guard now enforces it.** `tests/unit/docs/openapi-route-parity.test.ts` reads every `app/api/**/route.ts` from disk, extracts its exported HTTP methods, and compares them against the spec in both directions — a documented operation with no handler fails, and a handler with no documented operation fails. The test runs on every unit suite, so the two can no longer drift apart. It was verified non-vacuous by renaming a live `PATCH` export and confirming the suite went red.
>
> If a future Bolt implements citizen report editing, it must add the handler **and** the spec block in the same commit. See [KNOWN_ISSUES.md #31](KNOWN_ISSUES.md#31-the-openapi-spec-documents-two-methods-that-do-not-exist---resolved-2026-11-08).

The spec module's own header records four rules that explain its shape:

1. Every path, method, status code and error code was read from the corresponding route file. **Where a route's docblock disagrees with its code, the code wins** — several docblocks in this repo are stale (e.g. `POST /api/tickets`'s header claims the dedup body carries `existing_ticket`, but the code returns a flat `existing_ticket_id`).
2. The API is **not internally consistent**, and the spec does not pretend it is. The known divergences are documented inline rather than normalised away, because clients already depend on the current behaviour.
3. Endpoints that return 401 with the guard's raw error *message* are documented with the code the guard throws, since `ApiError` sets `message = code`.
4. **Rule 1 is enforced, not just asserted.** `tests/unit/docs/openapi-route-parity.test.ts` compares this document against the route files mechanically on every unit run.

---

## Known inconsistencies

These are **live divergences**, not typos. They are documented rather than fixed because clients already depend on the current behaviour — but each should be normalised before a public API v1.

| Divergence | Where |
|---|---|
| Unauthenticated code is `not_authenticated` everywhere **except** `/api/v1/admin/**` and `/api/profile`, which use `unauthenticated` | across the tree |
| Input-error code is `invalid_query` on the dispatcher/crew list routes, `invalid_input` on admin routes and body routes | across the tree |
| Rate-limit field is `retryAfterMs` on most routes but `retry_after_ms` on `GET /api/tickets/{id}` | `app/api/tickets/[id]/route.ts` |
| Illegal transition is **409** `invalid_transition` on `/api/tickets/{id}/transition` but **422** `illegal_transition` on the v1 dispatcher/crew transition routes | both trees |
| `requireRole` failure returns **401** where 403 is expected, in the shared transition route | `app/api/tickets/[id]/transition/route.ts:79` |

See [KNOWN_ISSUES.md](KNOWN_ISSUES.md) for the full list of 31 flags, including the dead `/api/blob` photo URLs and the adoption-export id/slug mismatch.

---

## Audit trail

Every state-changing operation writes an `AuditEntry` via `writeAudit(...)` (`lib/platform/audit.ts`). The table is **append-only** — no code path updates or deletes an audit row.

| Field | Purpose |
|---|---|
| `entityType` | `'ticket' \| 'city' \| 'category' \| 'department' \| 'ward' \| 'user' \| 'dedupFlag'` |
| `entityId` | The subject |
| `action` | Free-form string (see the vocabulary below) |
| `actorId` | Who did it (FK to `User`, `onDelete: Restrict`) |
| `beforeValue` / `afterValue` | JSON snapshots — the before/after pair |
| `timestamp` | When |

**Action vocabulary** observed in the codebase: `ticket.create`, `ticket.transition`, `ticket.dedup_detected`, `ticket.dedup_declined`, `dedup_confirmed`, `dedup_dismissed`, `reassign`, `reassign.crew`.

> `action` is a free-form string with no enum constraint — a typo silently creates a new action category rather than failing loudly. See [SECURITY_AUDIT.md §7.2](SECURITY_AUDIT.md#72-immutability).

---

## Related documents

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the full findings register with evidence
- [ARCHITECTURE.md](ARCHITECTURE.md) — layers, data model, and the request lifecycle
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — the 31 flags this document references
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) — environment variables and hosting
