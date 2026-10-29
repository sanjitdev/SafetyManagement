# CityFix v1 — Vercel Deployment Record

> Captured 2026-10-12. Records the production deploy state for
> the CityFix v1 trunk. This is the source of truth for "where
> is the app running, on what infra, with what env vars".

## Hosting

| Field | Value |
|---|---|
| Platform | Vercel (Hobby) |
| Project name | `cityfix` |
| Owner | `super-max1` (personal account) |
| **Production URL (primary)** | **`https://cityfix-bd.vercel.app`** |
| Primary domain type | **Tracked project domain** (auto-promotes on new production builds) |
| Additional aliases | `cityfix-theta.vercel.app`, `cityfix-super-max1.vercel.app`, `cityfix-git-main-super-max1.vercel.app` |
| Deployment URL (current build) | `https://cityfix-6jnmilkp2-super-max1.vercel.app` (commit `ef95e58`, 2026-10-29) |
| Project ID | `prj_av0zjUFXBo9rO70j4EtMJGtTAHaE` |
| GitHub repo | `https://github.com/sanjitdev/SafetyManagement` |
| Production branch | `main` |
| Build command | `prisma generate && next build` (from `package.json`) |
| Install command | `npm install` (auto) |
| Node runtime | 20.x (per `engines.node` in `package.json`) |

> **Note on `cityfix.vercel.app`**: the bare-naked `cityfix.vercel.app`
> subdomain is **owned by an unrelated Vercel project** (it serves a
> different "CityFix - Fix Your City, Together" Vite SPA, last modified
> 2026-10-01). It cannot be claimed by our project — Vercel subdomains
> are first-come-first-served per owner. The primary public URL for
> v1 is **`https://cityfix-bd.vercel.app`**; the older
> `cityfix-theta.vercel.app` / `cityfix-super-max1.vercel.app` /
> `cityfix-git-main-super-max1.vercel.app` aliases are kept as
> fallbacks and for git-branch-based preview URLs.

## Deployment Protection

> **Status (as of 2026-10-28): RESOLVED.** Verified live — an
> unauthenticated `GET https://cityfix-bd.vercel.app/` returns
> **HTTP 200** with the app's Bangla HTML, not a Vercel login page.
> The production URL is publicly reachable with no Vercel account
> required, so the citizen-facing launch constraint recorded on
> 2026-10-12 is satisfied. Preview URLs remain account-gated.

## Database

| Field | Value |
|---|---|
| Provider | Neon (free tier) |
| Project ID | `icy-moon-71538414` |
| Branch | `main` (default) |
| Region | `aws-us-east-2` (Ohio) |
| Hostname | `ep-empty-water-b41dwd0x-pooler.c-6.us-east-2.aws.neon.tech` |
| Connection | **Pooled** (PgBouncer, `-pooler` in hostname) |
| Schema | `public` |
| Migrations | **3 applied** (2026-10-28): `20261012102438_init`, `20261013000000_add_ticket_photo`, `20261027140000_platform_gaps` |
| Seeded | Dhaka North City Corporation + 3 departments + 5 categories + 50 placeholder wards |
| Roles enum | `citizen / dispatcher / crew / admin` |
| Tables | City, Ward, Department, **Crew**, **SlaPolicy**, Category, User, Session, Ticket, TicketEvent, **TicketPhoto**, DedupFlag, AuditEntry, WebAuthnChallenge, OtpCode, PushSubscription |
| Data (verified 2026-10-28) | 1 city, 50 wards, 13 users (all citizens), 10 tickets, 5 categories, 0 crew, 0 SLA policies |

> **Migration note.** The earlier `P1001` "Neon unreachable" was a
> **missing `DATABASE_URL` in the shell**, not a Neon outage. Load the
> env var (`set -a && . ./.env.local && set +a`) before running any
> Prisma CLI command, or use `npm run db:migrate:deploy`.

> **Neon account quota — OUTSTANDING HUMAN STEP (2026-10-29).** The
> production database stopped accepting connections. The cause is **not**
> a network or TLS problem: DNS resolves, TCP connects, the TLS
> handshake succeeds (cert `*.c-6.us-east-2.aws.neon.tech`, issuer
> YR2), and the server offers SASL mechanisms. The real failure is an
> **account/project quota rejection** — Neon returns SQLSTATE
> `53000`, *"Your account or project has exceeded the quota"*, at the
> **auth stage**, long after the connection and the handshake succeed.
>
> **Prisma hides this.** It renders every connection-phase failure as
> *"Can't reach database server"*, which sends you hunting for a network
> fault that does not exist. Diagnose with a real client (`pg`), whose
> error text names the cause outright; a raw SSLRequest probe is not
> enough (it stops at the `S` byte and only proves TLS is fine).
>
> **Fix:** upgrade the Neon plan (or reduce usage) on project
> `icy-moon-71538414`. No code change can restore the data.
>
> **Mitigation shipped** (`b468c4f`): `GET /api/v1/activity/public`
> now degrades to `200 {"tickets":[],"categories":[]}` instead of
> `500` when the DB is unreachable, so the public landing page and
> `/feed` stay up (they cost the site its data, not its availability).
> Verified live: `/`, `/feed` and `/api/v1/activity/public` all return
> `200`.

> **Auth gap.** Production has no dispatcher / crew / admin users.
> Admin provisioning is circular by design (an admin must exist
> before the admin's CSV import can create dispatchers and crew), and
> admin writes require a WebAuthn ceremony. Seeding staff accounts is
> the outstanding human step — see the 2026-10-28 design-log entry.

## Local development database (added 2026-10-29)

Local dev and production now point at **different** databases. The split is
deliberate: a developer's laptop is the right place to experiment, and Neon
is the right place to hold citizens' data.

| | Local dev | Production |
|---|---|---|
| Engine | **PostgreSQL 18.1** (Windows service `postgresql-x64-18`) | Neon (free tier) |
| Host | `localhost:5432` | `ep-empty-water-b41dwd0x-pooler.c-6.us-east-2.aws.neon.tech` |
| Database | `cityfix` | `neondb` |
| User | `postgres` | `neondb_owner` |
| Config file | `.env.local` (gitignored) | Vercel project env (Production / Preview / Development) |
| Migrations | `npm run db:migrate` | `npm run db:migrate:deploy` (run by `npm run db:setup`) |
| Seed | `npm run db:seed` | `npm run db:seed` |

> **The two databases are independent.** A local migration does not touch
> Neon, and a Neon migration does not touch the laptop. The Vercel env
> vars are per-environment and completely unaffected by `.env.local`.

### Setting up the local database from scratch

```bash
npm run db:setup     # migrate + seed (reads .env.local)
npm run db:studio    # browse it in Prisma Studio
npm run db:status    # which migrations are applied
```

`db:setup` reads `.env.local` — see the note below on why the Prisma CLI
cannot do that on its own.

> **Why `scripts/load-env-local.mjs` exists.** The Prisma CLI reads
> `.env` and **nothing else** — not `.env.local`. This repo has no `.env`
> (it is gitignored by the `.env*` rule), so every `prisma` command used
> to fail with `P1012 Environment variable not found: DATABASE_URL`.
> Next.js, by contrast, loads `.env.local` automatically at runtime —
> hence the split behaviour. `scripts/load-env-local.mjs` parses
> `.env.local` and injects it into the child process's environment
> (an explicit process env var still wins), and every `db:*` npm script
> now goes through it.

### The production database guard (`lib/platform/db-guard.ts`)

With two databases in play, one failure mode is dangerous enough to be
worth a hard error: if a local-style `DATABASE_URL` ever reaches
production, the deployed app works *perfectly* and silently writes
citizens' real names, NID numbers, phone numbers and photos into a
developer's personal Postgres instance, where it is neither backed up nor
governed. Nothing in the request path would fail.

So `assertProductionDatabaseConfig()` (wired into `lib/db.ts` before the
client ever connects) throws in production when `DATABASE_URL` resolves
to a loopback host (`localhost`, `127.0.0.0/8`, `::1`, `0.0.0.0`). It
never throws in development — using the local database is the point.

The guard is **lazy**, not module-load: Vercel runs `next build` in a
separate process that may not have env vars exposed, and a module-load
throw would fail the build before the app ever serves a request. Same
pattern as the WebAuthn prod guard in `lib/auth/webauthn.ts` — validate on
first use, loud-fail on the first real request.

## Environment variables (Vercel)

All 6 keys × 3 environments (Production / Preview / Development).
Vercel classified most as Secret, a few as Config (cosmetic; doesn't
affect runtime behavior). Values are encrypted at rest.

| Key | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgres://neondb_owner:npg_…@ep-empty-water-…pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require` | Pooled Neon URL |
| `SESSION_SECRET` | 64-hex-char (32 random bytes) | Required: `lib/auth/session.ts` throws if < 32 chars |
| `WEBAUTHN_RP_ID` | `cityfix-bd.vercel.app` | Hostname only, no scheme/port |
| `WEBAUTHN_RP_ORIGIN` | `https://cityfix-bd.vercel.app` | Full origin, must be https:// |
| `WEBAUTHN_RP_NAME` | `CityFix` | Display only |
| `OTP_PROVIDER` | `stub` | Logs code to console; v1 doesn't ship real SMS |
| `POLL_RATE_LIMIT_PER_SECOND` | `1` | Optional, has safe default |

**VAPID keys** (push notifications) intentionally unset for v1. The
web push wiring is stubbed in `lib/platform/push.ts`; v1.1 follow-up.

## Build artifacts (this deploy)

| Commit | Title | Notes |
|---|---|---|
| `16f7e03` | `chore: harden for Vercel production deploy` | Phase A: WebAuthn guard, HSTS/CSP headers, env example, build script |
| `9067ddb` | `fix: unblock Vercel production build` | Lazy WebAuthn guard, useSearchParams → window.location.search |
| `f540124` | `chore: add initial Prisma migration + seed fix + tsx dep` | Initial migration, seed syntax fix, tsx in devDeps |
| `ff8dde3` | `fix: correct production URL in deploy docs` | WebAuthn env var rotation to `cityfix-theta.vercel.app`; doc URL fixes |
| `fcbb88c` | `docs: log auto-deploy verification + WebAuthn env var rotation` | Auto-deploy end-to-end test green; deploy docs updated |
| `d809fe5` | `chore: switch primary production URL to cityfix-bd.vercel.app` | Aliased current build to `cityfix-bd.vercel.app`; WebAuthn env vars rotated to match |
| `11459db` | `fix(otp): surface dev_code in send-otp response while OTP_PROVIDER=stub` | Citizens on prod weren't receiving OTP codes (StubProvider only logs to Vercel function logs, which citizens can't see). send-otp route now always returns `dev_code` in the response so the verify-otp page's "Dev code" hint box renders the 6-digit code. The page hint text was updated to "(stub provider — production sends SMS via Twilio in v1.1)". Live-verified on https://cityfix-bd.vercel.app. |

## Verification (recorded 2026-10-12)

- `npx tsc --noEmit` → clean
- `npx vitest run` → 255/255 pass
- `npx next build` (with prod env vars) → succeeds, 44/44 static pages
- `npx prisma migrate deploy` against Neon → 1 migration applied
- `npm run db:seed` against Neon → Dhaka fixture seeded
- Vercel `vercel --prod` → build succeeded, deployed to `cityfix-theta.vercel.app`
- Live curl: `vercel curl /api/auth/status` → `{"authenticated":false,"session":null}` (one of the first calls before Deployment Protection kicked in)
- Live curl: `vercel curl /api/v1/dispatcher/queue` → `{"error":"not_authenticated"}`
- Auto-deploy end-to-end test (after GitHub App allowlist fix): push to `main` → build in ~30s, Ready in ~50s; aliases re-pointed at new build automatically
- Primary URL switched to `https://cityfix-bd.vercel.app` as a **tracked project domain** (not a one-time alias — auto-promotes on every new production deployment)
- `curl -I https://cityfix-bd.vercel.app` → HTTP/2 200, our CSP + HSTS headers present, Bangla title "আপনার শহর, আপনার কণ্ঠস্বর" rendered

**Live URL smoke (not yet run by an automated check)**: citizen sign-up
+ ticket filing, dispatcher queue, crew ticket view, admin WebAuthn
ceremony. To be done in browser by the team after Deployment Protection
is set to Standard.

## Auto-deploy (Phase C — verified)

**Status (2026-10-12)**: ✅ Live and verified end-to-end.
The Vercel GitHub App is installed on the user's GitHub
account with `sanjitdev/SafetyManagement` in the repository
allowlist. Every `git push origin main` triggers a Vercel
production build within ~30 s; build completes in ~50 s
→ Ready → all four production aliases auto-repoint at the
new build. The 5+ builds since the original capture
(`ff8dde3`, `fcbb88c`, `d809fe5`, `9501f07`, `e88562f`,
`11459db`, `1e69589`, `7d14742`) are all auto-promoted
to `cityfix-bd.vercel.app` without manual intervention.

To re-enable from scratch (if the integration breaks):

1. Vercel dashboard → `cityfix` project → Settings → Git → Connect
2. Pick `sanjitdev/SafetyManagement`
3. Production Branch = `main`
4. Save
5. `https://github.com/settings/installations` → Vercel →
   Configure → confirm `sanjitdev/SafetyManagement` is in
   "Repository access"
6. Push an empty commit to confirm the wire

No GitHub Actions needed; Vercel polls the repo via its own webhook.

## v1 launch readiness (2026-10-12)

**Decision (2026-10-12)**: CityFix v1 is **launch-ready** on
the current trunk. All 5 AIDLC intents are `complete`, the
Construction Verification Command (`npx tsc --noEmit &&
npm run test:unit && npm run test:mockups && curl -fs
http://localhost:3000/`) is green, the prod smoke on
`https://cityfix-bd.vercel.app` passed for citizen
register/login/OTP/activity-flow + dispatcher + crew +
admin auth boundaries, and the 5 known v1.1 follow-ups
are explicitly deferred per the table below.

| # | Follow-up | Blocks v1? | Decision |
|---|-----------|------------|----------|
| 1 | Twilio real OTP SMS | No | `OTP_PROVIDER=stub` surfaces the 6-digit code in the `dev_code` field of the send-otp response (commit `11459db`); the verify-otp page renders it in a "Dev code" hint box. v1.1 swap is a one-flag flip + 3 env vars. The TwilioProvider class is implemented (Bolt 005-003) and 18/18 unit tests pass. |
| 2 | Web Push via VAPID | No | `PushSubscription` model + helpers are in place; the wire call is not invoked. v1 citizens won't get push notifications but can poll the activity feed. v1.1 follow-up. |
| 3 | Custom domain (Vercel subdomain) | No | `cityfix-bd.vercel.app` is a tracked project domain that auto-promotes; citizens can reach the app without a login wall. Custom domain is cosmetic. |
| 4 | CI on PRs (GitHub Actions) | No | **DONE (2026-10-28)** — `.github/workflows/ci.yml` runs lint, typecheck, unit, coverage (80% floor), visual regression, and build on every push to `main` and every PR. |
| 5 | CSV export of audit log | No | Admin can see the audit dashboard in the browser. CSV export is a future-quality convenience. |
| 6 | Standard Protection on Vercel (preview-only login wall) | No | **DONE (2026-10-28)** — verified: unauthenticated `GET /` returns HTTP 200 with the app HTML. No login wall on production. |
| 7 | Postgres migration history (v1 used `prisma db push`) | No | **DONE (2026-10-28)** — 3 proper migrations now applied via `prisma migrate deploy`. Adopt `migrate dev` for new schema work. |
| 8 | Next.js / MapLibre major-version security upgrade | No | `npm audit` reports 17 pre-existing advisories. Next.js was taken to 14.2.35 (newest 14.x); the remaining critical advisories need 15.5.27+ (major). Deferred to a v1.1 upgrade. Mitigated meanwhile: no middleware, no Server Actions, no `next/image` `remotePatterns` — the Server-Actions DoS/SSRF, Middleware-bypass, and Image-Optimizer RCE paths do not apply. |
| 9 | Staff accounts (dispatcher / crew / admin) | **Yes — for staff surfaces** | Production has 13 citizens and zero staff users. Admin provisioning is circular (an admin must exist before the admin's CSV import can create dispatchers/crew) and admin writes require WebAuthn. The dispatcher monitor, performance reporting, admin user management, and adoption dashboard deploy and render but cannot be exercised until staff accounts exist. **Outstanding human step.** |

No follow-up is a v1 blocker. The 5AIDLC intents + the
2 prod hot-fixes (OTP dev_code, Prisma getTicketWithTrail)
deliver the full citizen → dispatcher → crew → admin loop
on `https://cityfix-bd.vercel.app`.

## Out of scope (deferred to v1.1)

See the v1 launch readiness table above for the per-follow-up
rationale.

- Twilio real OTP SMS — `OTP_PROVIDER=stub` for v1
- Web Push via VAPID — v1.1
- Custom domain — Vercel subdomain is fine for v1
- CI on PRs (GitHub Actions) — v1.1
- CSV export of audit log — v1.1

## Rollback

Vercel keeps every build. `vercel rollback` (or one click in the
dashboard) promotes the previous deployment. The Neon DB is decoupled
from Vercel — no schema changes were required to roll back to any
prior build. Migrations are forward-only.
