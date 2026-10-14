# CityFix — Seed users & login reference

> Reference doc — every seed user in the dev store, and the
> four ways to log in as each (dev store bypass, real auth,
> production escape hatch, WebAuthn for admin).

**Dev:feat URL**: `http://localhost:3200` (in-memory dev store,
`CITYFIX_DEV_STORE=1`).
**Production URL**: Vercel (Postgres-backed, dev store off).

---

## The 6 seed users

All seed users live in `lib/dev-store.ts`. They exist only in the
in-memory dev store (active when `CITYFIX_DEV_STORE=1`, i.e.
`npm run dev:feat`). On the Vercel build the dev store is off —
the real Postgres is the source of truth, and the dev-login
bypasses below return 404.

| Role | Name | userId | Phone | NID | City / Ward / Dept |
|---|---|---|---|---|---|
| Citizen | **Rahim** | `user_citizen_rahim` | `+8801711000000` | `1234567890` | Dhaka-North / Ward 14 / — |
| Dispatcher | **Habib** | `user_dispatcher_habib` | `+8801711000001` | `2234567890` | Dhaka-North / Ward 14 / Streetlight |
| Crew | **Rashid** | `user_crew_rashid` | `+8801711000002` | `3234567890` | Dhaka-North / Ward 14 / Streetlight |
| Admin | **Anwar** | `user_admin_anwar` | `+8801711000003` | `4234567890` | Dhaka-North / — / — (email: `admin@cityfix.bd`) |
| Crew | **Karim** (Ward 14) | `user_crew_karim` | `+8801711000004` | `5234567890` | Dhaka-North / Ward 14 / Streetlight |
| Crew | **Jamal** (different ward) | `user_crew_jamal` | `+8801711000005` | `6234567890` | Dhaka-North / Ward Other / Streetlight |

Every seed user has `passwordHash` set to the **demo password
`12345678`** (argon2id, matches `lib/auth/password.ts`
`ARGON2_OPTIONS`). The real auth flow for citizens is now
**phone + password** through `POST /api/v1/auth/login`; the
phone + NID + OTP path still works for brand-new registrations
(password is set during `register`). Dispatcher / crew / admin
personas authenticate via the dev bypasses (options 1, 3, or 4
below) because `/api/v1/auth/login` is **citizen-only** by route
design.

---

## Three ways to log in

### 1. One-click via dev:feat (the easiest, dev only)

The dev:feat build (`http://localhost:3200`) has the dev store on.
A single click mints a session for any persona — **no OTP, no
NID, no password**:

```bash
# As Rahim (citizen)
curl -sS -X POST http://localhost:3200/api/dev/login?role=citizen -c cookies.txt

# As Habib (dispatcher)
curl -sS -X POST http://localhost:3200/api/dev/login?role=dispatcher -c cookies.txt

# As Rashid (crew)
curl -sS -X POST http://localhost:3200/api/dev/login?role=crew -c cookies.txt

# As Anwar (admin)
curl -sS -X POST http://localhost:3200/api/dev/login?role=admin -c cookies.txt
```

Or in the browser, just visit
`http://localhost:3200/api/dev/login?role=citizen` and the redirect
carries you straight to `/home` with a session cookie set.

> **Admin caveat**: the dev `/api/dev/login?role=admin` mints a
> session, but the admin pages (`/admin/cities`, etc.) require
> additional guard checks. The new `/api/dev/issue-session` route
> + `/dev/login` page can mint admin sessions explicitly by
> userId. The dev persona redirects to `/home` for admin (the
> admin console is the dedicated surface, but it's gated by
> WebAuthn in production).

### 2. Real auth flow (works on dev:feat AND production)

**For the seed personas (citizen)**: phone + password — the demo
password `12345678` works for every seed user. The `/api/v1/auth/login`
route is **citizen-only**, so non-citizen personas use the dev
bypasses (options 1, 3, or 4).

```bash
# Citizen login (seed users: password is "12345678")
POST /api/v1/auth/login
  { "phone": "+8801711000000", "password": "12345678",
    "citySlug": "dhaka-north" }
# → 200 + cityfix_session cookie
```

**For a brand-new user** (not in the seed): phone + NID + password +
OTP. The registration endpoint sets the password, and the OTP step
verifies phone ownership. On dev:feat, the OTP is the `stub` —
printed to the **server's stdout**. On production with
`OTP_PROVIDER=twilio`, the code is sent via SMS.

```bash
# 1. Register (brand-new user; password is chosen here)
POST /api/v1/auth/register
  { "phone": "+8801800000000", "nid": "9999999999", "name": "New User",
    "password": "<chosen>", "citySlug": "dhaka-north", "wardSlug": "ward-14" }

# 2. Send OTP — the code is logged to stdout on dev:feat
POST /api/v1/auth/send-otp
  { "phone": "+8801800000000" }

# 3. Verify the OTP — sets the cityfix_session cookie
POST /api/v1/auth/verify-otp
  { "phone": "+8801800000000", "code": "<read from dev:feat stdout>" }
```

### 3. Production escape hatch (Vercel only)

When `CITYFIX_DEV_PROMOTE_SECRET` is set on Vercel, the new
`/dev/login?secret=…&next=/reports` page lets the team mint a
session for any seed user by userId. One click, no DevTools. See
the Bolt 008-004 commit `8402fa7`.

```text
https://<vercel-host>/dev/login?secret=<CITYFIX_DEV_PROMOTE_SECRET>&next=/reports
```

The page renders a `<select>` of every user in `city_dhaka_north`
(defaulted to the first citizen). One click → `issue-session` →
redirect to `?next=`.

### 4. WebAuthn (admin only)

The admin (`Anwar`, `admin@cityfix.bd`) uses a WebAuthn passkey
for writes. The seed user has no passkey registered, so on a
fresh dev:feat build the admin pages show a "register your
passkey" flow:

```
POST /api/auth/webauthn/register   → challenge
POST /api/auth/webauthn/assertion  → verify the assertion
```

For the dev store you can mint an admin session via the dev
escape hatches (option 1 or 3) — WebAuthn is bypassed in dev
because the team uses the dev session for testing.

---

## Cheat sheet — which login to use when

| What you want | Use |
|---|---|
| Demo the citizen flow on dev:feat | `/api/dev/login?role=citizen` |
| Demo the dispatcher flow on dev:feat | `/api/dev/login?role=dispatcher` |
| Demo the crew flow on dev:feat | `/api/dev/login?role=crew` |
| Demo the admin flow on dev:feat | `/api/dev/login?role=admin` |
| Look at the Vercel production data as a citizen | `/dev/login?secret=<X>&next=/reports` |
| Look at the Vercel production data as an admin | `/dev/login?secret=<X>&next=/admin/cities` |
| Log in as a seed citizen with the **real** auth route | `POST /api/v1/auth/login {phone, password:"12345678", citySlug}` |
| Register a brand-new citizen end-to-end (phone+NID+password+OTP) | `/register` → fill the form → read OTP from server stdout → `/verify-otp` |
| Reset the dev store (wipe all tickets) | `POST /api/dev/reset` |
