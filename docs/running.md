# Running CityFix — Frontend & Backend

> **One process, two surfaces.** CityFix is a single full-stack
> Next.js 14 repo. There is no separate backend service. The
> "backend" is the Next.js API routes (`app/api/`) served by the
> same `next dev` / `next start` process as the frontend. The data
> layer is either **PostgreSQL 16** (production) or an **in-memory
> dev store** (no Postgres required for local).

> **For production hosting, env vars and runbooks, see
> [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).** This document covers
> running the app locally. For the API surface, see
> [API_DOCUMENTATION.md](API_DOCUMENTATION.md). For the go/no-go, see
> [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md).

---

## Table of contents

1. [Quick start (no Postgres)](#quick-start-no-postgres)
2. [Production mode (with PostgreSQL)](#production-mode-with-postgresql)
3. [Available scripts](#available-scripts)
4. [Dev login shortcut](#dev-login-shortcut)
5. [Where the backend lives](#where-the-backend-lives)
6. [Construction Verification Command](#construction-verification-command)
7. [Troubleshooting](#troubleshooting)

---

## Quick start (no Postgres)

The fastest path. Uses the in-memory dev store, resets on every
restart.

```sh
# 1. Install dependencies (Node 22 recommended — see below)
npm install

# 2. Generate the Prisma client
npm run db:generate

# 3. Start the dev server (frontend + API routes in one process)
npm run dev:feat
#    CITYFIX_DEV_STORE=1 is set by the script
#    Listens on http://localhost:3000
```

Open **http://localhost:3000** in your browser. You should see the
splash screen → register → home (city activity map).

**That's it.** Frontend, API, auth, OTP, dedup, transitions, audit,
push fan-out — all served from one process.

> **Node version.** `package.json` declares `engines.node: >=20.0.0`,
> which is the *runtime* floor for the deployed app. But **CI runs
> Node 22**, and you should too: `jsdom@30` pulls `undici@8`, whose
> `engines.node` is `>=22.19.0`. On Node 20 the Vitest suite dies at
> import time with 16 unhandled errors. This cost CI a month of red
> runs before it was found — the dev machine ran Node 24, so the
> suite was green locally the whole time. See
> [TESTING_REPORT.md §5](TESTING_REPORT.md#the-node-22-requirement).

---

## Production mode (with PostgreSQL)

For a real run with persistent storage.

### 1. Prereqs

- **Node.js 22** (recommended; `>=20` is the runtime floor)
- **PostgreSQL 16** running locally or reachable via `DATABASE_URL`

### 2. Configure

```sh
# Create .env (gitignored) with the database URL
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/cityfix"' >> .env

# Session signing key — must be ≥32 characters
echo 'SESSION_SECRET="'"$(openssl rand -hex 32)"'"' >> .env

# Optional: real OTP provider (v1.1; otherwise the stub logs
# the code to Vercel function logs + returns it in dev_code)
# echo 'OTP_PROVIDER=twilio' >> .env
# echo 'TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' >> .env
# echo 'TWILIO_AUTH_TOKEN=your_token' >> .env
# echo 'TWILIO_FROM_NUMBER=+15555550100' >> .env
```

> **Do NOT set `CITYFIX_DEV_STORE`, `DEV_SKIP_WEBAUTHN` or
> `CITYFIX_DEV_PROMOTE_SECRET` outside local development.**
> `CITYFIX_DEV_STORE=1` disables the database, **unsigns the session
> cookie** and bypasses the WebAuthn gate. `DEV_SKIP_WEBAUTHN=1`
> bypasses WebAuthn entirely. `CITYFIX_DEV_PROMOTE_SECRET` gates four
> privilege-escalation routes that are *not* dev-store-gated — a
> leaked secret there yields unauthenticated admin access.
> See [DEPLOYMENT_GUIDE.md §3](DEPLOYMENT_GUIDE.md#3-environment-variables).

> **`NODE_ENV=production` refuses a loopback `DATABASE_URL`.** The
> db-guard (`lib/platform/db-guard.ts`) throws if the host is
> `127.0.0.0/8` or `localhost`, so a genuine production-mode run
> needs a hosted Postgres (Neon). This is deliberate — it is the
> guard that stops a production deploy from silently running against
> a developer's laptop.

### 3. Sync schema + seed

```sh
# Apply migrations + seed the Dhaka template
# (1 city, 10 wards, 3 departments, 6 categories, 1 user per role)
npm run db:setup
```

`db:setup` = `db:migrate:deploy` then `db:seed`. For local schema
iteration, `npm run db:migrate` (`prisma migrate dev`) authors a new
migration.

### 4. Build + start

```sh
# Production build
npm run build

# Production server
npm run start
#    Listens on http://localhost:3000
```

`npm run start` runs `scripts/start-next.mjs`, which finds the next
free port between 3000 and 3100 if 3000 is taken.

**Hosting target: Vercel (Hobby); production URL
`https://cityfix-bd.vercel.app`** (Vercel + Neon Postgres,
auto-deploy on push to `main`). Full deploy record:
`_progress/operations/cityfix-deployment.md` (URLs, env vars,
build SHAs) + `_progress/operations/vercel-neon-deploy-runbook.md`
(the reproducible how-to). The build output also runs on
Cloudflare Workers (`@cloudflare/next-on-pages`), Railway, or
any Node 22 host, but the production target is Vercel as of v1
launch (2026-10-12).

---

## Available scripts

All scripts are defined in `package.json`.

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `next dev` | Bare dev server, fails on missing DB |
| `npm run dev:feat` | `cross-env CITYFIX_DEV_STORE=1 next dev` | **Recommended for local**; in-memory store, no DB required |
| `npm run build` | `prisma generate && next build` | Production build |
| `npm run start` | `node scripts/start-next.mjs` | Production server (after `build`); auto-picks a free port |
| `npm run typecheck` | `tsc --noEmit` | TypeScript strict compile check |
| `npm run lint` | `eslint .` | Lint (0 errors, 55 warnings) |
| `npm run lint:fix` | `eslint . --fix` | Autofix |
| `npm run format` | `prettier --write .` | Format |
| `npm run format:check` | `prettier --check .` | Format check |
| `npm test` | `playwright test` | Playwright route specs (34 files) |
| `npm run test:unit` | `vitest run` | 1,851 unit tests across 102 files |
| `npm run test:unit:watch` | `vitest` | Vitest watch mode |
| `npm run test:unit:coverage` | `vitest run --coverage` | Coverage + the 80% floor gate |
| `npm run test:mockups` | `playwright test tests/01-mockups.spec.ts` | 25 visual baselines (gating) |
| `npm run test:update-baselines` | Same with `--update-snapshots` | Re-capture mockup PNGs (**CI only — see below**) |
| `npm run test:report` | `playwright show-report` | Open last Playwright HTML report |
| `npm run check:i18n` | `node scripts/check-i18n-keys.mjs` | Fail if `app/**` references an unregistered i18n key (957 keys) |
| `npm run docs:generate` | `tsx scripts/generate-openapi.ts` | Regenerate the OpenAPI spec |
| `npm run db:generate` | `prisma generate` | Prisma client codegen |
| `npm run db:migrate` | `prisma migrate dev` | Author + apply a migration |
| `npm run db:migrate:deploy` | `prisma migrate deploy` | Apply existing migrations (CI / production) |
| `npm run db:push` | `prisma db push` | Sync schema without a migration |
| `npm run db:seed` | `tsx prisma/seed.ts` | Seed the Dhaka template (idempotent) |
| `npm run db:setup` | `db:migrate:deploy` + `db:seed` | Migrations + seed in one step |
| `npm run db:status` | `prisma migrate status` | Show migration state |
| `npm run db:reset` | `prisma migrate reset --force` | Reset the database (destructive) |
| `npm run db:studio` | `prisma studio` | DB GUI |

> **`test:update-baselines` must not be used for the committed set.**
> The baselines are rendered by `ubuntu-latest` — the platform CI
> asserts them on — and Chromium rasterises the Noto Sans Bengali
> webfont differently on Windows. A Windows-generated baseline drifts
> past the 1% tolerance on CI. Refresh them through the
> `regenerate-baselines.yml` workflow instead. See
> [TESTING_REPORT.md §2.3](TESTING_REPORT.md#23-visual-regression--playwright-mockup-baselines).

---

## Dev login shortcut

In `dev:feat` mode, `GET /api/dev/login?role=…` boots a session for
a seeded user. Useful for clicking through the four personas without
SMS-OTP.

```sh
# In a browser, or with curl
curl -i 'http://localhost:3000/api/dev/login?role=citizen'
curl -i 'http://localhost:3000/api/dev/login?role=dispatcher'
curl -i 'http://localhost:3000/api/dev/login?role=crew'
curl -i 'http://localhost:3000/api/dev/login?role=admin'
```

To wipe the in-memory store and reseed:

```sh
curl -i 'http://localhost:3000/api/dev/reset'
```

`/api/dev/login` and `/api/dev/reset` are no-ops in production (gated
by `process.env.CITYFIX_DEV_STORE === '1'`).

> **Four sibling routes are gated on the secret only, not the dev
> store** — `bootstrap-admin`, `issue-session`, `promote-admin` and
> `list-users`. Two of them mint admin sessions. Keep
> `CITYFIX_DEV_PROMOTE_SECRET` unset in production. See
> [SECURITY_AUDIT.md §2](SECURITY_AUDIT.md#2-authorization) and
> [KNOWN_ISSUES.md #3](KNOWN_ISSUES.md#3-four-apidevroutes-are-not-dev-store-gated).

---

## Where the backend lives

There is no separate backend service. The API surface is the
`app/api/**/route.ts` files, served by the same Next.js process.
**61 route handlers, 77 operations**, organised by role:

### Public & auth

- `app/api/v1/auth/register/route.ts` — POST register
- `app/api/v1/auth/login/route.ts` — POST login
- `app/api/v1/auth/send-otp/route.ts` — POST send OTP
- `app/api/v1/auth/verify-otp/route.ts` — POST verify OTP
- `app/api/auth/logout/route.ts` — POST logout
- `app/api/auth/status/route.ts` — GET session status
- `app/api/v1/activity/route.ts` — GET city feed (authenticated)
- `app/api/v1/activity/public/route.ts` — GET public feed
- `app/api/v1/push/subscribe/route.ts` — POST/DELETE push subscription

### Citizen

- `app/api/tickets/route.ts` — POST create (with dedup), GET list
- `app/api/tickets/[id]/route.ts` — GET (with rate limit + scope)
- `app/api/tickets/[id]/transition/route.ts` — POST role-scoped
- `app/api/tickets/[id]/feedback/route.ts` — POST rate the response
- `app/api/tickets/[id]/photos/[idx]/route.ts` — DELETE photo
- `app/api/profile/route.ts` — GET/PUT profile

### Dispatcher (Habib)

- `app/api/v1/dispatcher/queue/route.ts` — GET queue
- `app/api/v1/dispatcher/map/tickets/route.ts` — GET map pins
- `app/api/v1/dispatcher/monitor/route.ts` — GET monitor flow counts
- `app/api/v1/dispatcher/monitor/ack/route.ts` — POST acknowledge
- `app/api/v1/dispatcher/performance/route.ts` — GET performance metrics
- `app/api/v1/dispatcher/crew-for-ward/route.ts` — GET crew for a ward
- `app/api/v1/dispatcher/tickets/[id]/route.ts` — GET/PATCH ticket
- `app/api/v1/dispatcher/tickets/[id]/assign-crew/route.ts` — POST assign crew
- `app/api/v1/dispatcher/tickets/[id]/transition/route.ts` — POST transition
- `app/api/v1/dispatcher/dedup-flags/route.ts` — GET dedup flags
- `app/api/v1/dispatcher/dedup-flags/[id]/confirm/route.ts` — POST
- `app/api/v1/dispatcher/dedup-flags/[id]/dismiss/route.ts` — POST

### Crew (Rashid)

- `app/api/v1/crew/tickets/route.ts` — GET my assignments
- `app/api/v1/crew/tickets/[id]/route.ts` — GET assignment
- `app/api/v1/crew/tickets/[id]/transition/route.ts` — POST transition
- `app/api/v1/crew/tickets/[id]/photos/route.ts` — POST before/after

### Admin (Aamir)

- `app/api/v1/admin/audit/route.ts` — GET audit log
- `app/api/v1/admin/cities/route.ts` — POST/GET cities
- `app/api/v1/admin/cities/[id]/route.ts` — GET/PATCH/DELETE city
- `app/api/v1/admin/cities/[id]/categories/route.ts` — CRUD categories
- `app/api/v1/admin/cities/[id]/categories/[catId]/route.ts` — GET/PATCH/DELETE category
- `app/api/v1/admin/cities/[id]/departments/route.ts` — CRUD departments
- `app/api/v1/admin/cities/[id]/departments/[deptId]/route.ts` — GET/PATCH/DELETE department
- `app/api/v1/admin/cities/[id]/wards/route.ts` — CRUD wards
- `app/api/v1/admin/cities/[id]/wards/[wardId]/route.ts` — GET/PATCH/DELETE ward
- `app/api/v1/admin/cities/[id]/users/route.ts` — GET/POST users
- `app/api/v1/admin/cities/[id]/users/[userId]/route.ts` — GET/PATCH/DELETE user
- `app/api/v1/admin/cities/[id]/users/import/route.ts` — POST bulk import
- `app/api/v1/admin/cities/[id]/adoption/route.ts` — GET adoption dashboard
- `app/api/v1/admin/cities/[id]/adoption/export/route.ts` — GET adoption CSV
- `app/api/v1/admin/tickets/route.ts` — GET all tickets (also the admin dashboard KPI source)
- `app/api/v1/admin/tickets/[id]/route.ts` — GET/PATCH admin ticket

### WebAuthn (admin writes)

- `app/api/auth/webauthn/register/challenge/route.ts`
- `app/api/auth/webauthn/register/route.ts`
- `app/api/auth/webauthn/assertion/route.ts`
- `app/api/auth/webauthn/revoke/route.ts`
- `app/api/auth/webauthn/login/route.ts`

### Misc

- `app/api/report/bootstrap/route.ts` — POST report-flow bootstrap
- `app/api/docs/route.ts` — GET Swagger UI
- `app/api/docs/spec/route.ts` — GET the OpenAPI spec

### Dev-only

- `app/api/dev/login/route.ts` — role-shortcut session bootstrap (dev-store gated)
- `app/api/dev/reset/route.ts` — wipe + reseed the in-memory store (dev-store gated)
- `app/api/dev/bootstrap-admin/route.ts` — **secret-gated only**
- `app/api/dev/issue-session/route.ts` — **secret-gated only**
- `app/api/dev/promote-admin/route.ts` — **secret-gated only**
- `app/api/dev/list-users/route.ts` — **secret-gated only**

All handlers go through the service layer in `lib/` — no raw Prisma
or raw SQL in route handlers (per the Forbidden rules in
`aidlc/spaces/default/memory/team.md`).

The full contract for every operation — request shape, response shape,
guard requirements and error codes — is in
[API_DOCUMENTATION.md](API_DOCUMENTATION.md). The OpenAPI spec is
served live at `/api/docs` with Swagger UI at `/api/docs/spec`.

---

## Construction Verification Command

The canonical end-to-end check, per
`aidlc/spaces/default/memory/project.md → Walking Skeleton`:

```sh
npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/
```

If all four pass, the project is healthy.

| Step | Verifies |
|---|---|
| `npx tsc --noEmit` | TypeScript strict compile clean |
| `npm run test:unit` | 1,851 unit tests pass (102 files) |
| `npm run test:mockups` | 25 visual baselines match (gating) |
| `curl -fs http://localhost:3000/` | Server returns 2xx on `/` |

To reproduce the CI environment exactly — the same in-memory store,
the same placeholder credentials, the same `NODE_ENV` handling:

```sh
node scripts/ci-env.mjs npm run test:unit
node scripts/ci-env.mjs npx next build
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `EADDRINUSE :::3000` | Old dev server still running | Kill it: `Get-Process -Name node \| Stop-Process` (PowerShell) or `pkill -f "next dev"` (bash). `npm run start` auto-picks a free port |
| `PrismaClientInitializationError` on first request | `DATABASE_URL` not set or DB unreachable | Set it (production mode) or use `npm run dev:feat` (in-memory store) |
| `Cannot find module '@prisma/client'` | Prisma client not generated | `npm run db:generate` after `npm install` (a `postinstall` hook also runs it) |
| Vitest dies with 16 unhandled errors at import time | Node 20 — `undici@8` needs `>=22.19.0` | Upgrade to Node 22 |
| `PrismaClientInitializationError: loopback DATABASE_URL rejected` | The db-guard fired | **Expected in production mode.** Use a hosted Postgres, or run in dev mode |
| Map shows blank tiles on `/home` | OSM tile CDN unreachable from your network | Check `https://tile.openstreetmap.org/{z}/{x}/{y}.png` in a browser. (Per project memory, the OSM Tile Usage Policy forbids heavy production use — a paid provider is the scale path.) |
| Bangla text renders in the wrong font | The webfont is blocked — `fonts.googleapis.com` missing from `style-src` or `fonts.gstatic.com` from `font-src` | Check the CSP in `next.config.js` |
| `OTP_PROVIDER=twilio` but SMS doesn't send | Missing Twilio credentials or from-number | Check `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`; falls back to the stub provider if any is missing |
| `400` on `/api/v1/auth/register` | Validation failed (Zod) | Inspect response body — usually a missing field or weak password. The platform requires `phone` (E.164), `nid` (BD format), `password` (≥ 8 chars), and `name` |
| Stale data after edits | In-memory store from a previous `dev:feat` | `curl http://localhost:3000/api/dev/reset` to wipe + reseed, then restart the server |
| Playwright baselines failing | Visual regression after a real change | Check whether the mockup changed without a baseline refresh. Refresh baselines **in CI** via `gh workflow run regenerate-baselines.yml` — never locally |
| Local baselines fail but CI is green | Platform drift (Windows vs `ubuntu-latest` rasterises the webfont differently) | **Expected.** Trust CI. Compare the CI "actual" PNG against the baseline in the uploaded `mockup-diffs` artifact |
| `webauthn_required` on an admin write | No registered credential, or the challenge expired (5 min) | Register a credential via `/admin`, then retry. Note that challenges are **not** consumed on use — see [KNOWN_ISSUES.md #6](KNOWN_ISSUES.md#6-webauthn-challenges-are-never-consumed) |
| A ticket's status trail disagrees with its status | A concurrent transition overwrote the other write | See [CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md](CONCURRENCY_AND_ACCOUNTABILITY_AUDIT.md) — this is a known defect, not a display bug |

---

## Where to go next

- **README.md** — project showcase, personas, architecture, mandated rules
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** — production hosting, env vars, runbooks
- **[API_DOCUMENTATION.md](API_DOCUMENTATION.md)** — all 77 operations
- **[ARCHITECTURE.md](ARCHITECTURE.md)** — the layers and the data model
- **[PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md)** — the go/no-go
- **[KNOWN_ISSUES.md](KNOWN_ISSUES.md)** — 31 open flags
- **docs/idea.md** — canonical problem statement
- **design-artifacts/C-UX-Scenarios/** — spec-as-contract artifacts
- **aidlc/spaces/default/memory/{org,team,project}.md** — the project memory
- **_progress/00-design-log.md** — per-Bolt progress record
- **AGENTS.md** — WDS / agent skill setup
