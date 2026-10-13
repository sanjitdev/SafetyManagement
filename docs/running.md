# Running CityFix — Frontend & Backend

> **One process, two surfaces.** CityFix is a single full-stack
> Next.js 14 repo. There is no separate backend service. The
> "backend" is the Next.js API routes (`app/api/`) served by the
> same `next dev` / `next start` process as the frontend. The data
> layer is either **PostgreSQL 16** (production) or an **in-memory
> dev store** (no Postgres required for local).

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
# 1. Install dependencies (Node 20 LTS required)
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

---

## Production mode (with PostgreSQL)

For a real run with persistent storage.

### 1. Prereqs

- **Node.js 20 LTS** (per `package.json → engines`)
- **PostgreSQL 16** running locally or reachable via `DATABASE_URL`

### 2. Configure

```sh
# Create .env (gitignored) with the database URL
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/cityfix"' >> .env

# Optional: real OTP provider (v1.1; otherwise the stub logs
# the code to Vercel function logs + returns it in dev_code)
# echo 'OTP_PROVIDER=twilio' >> .env
# echo 'TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' >> .env
# echo 'TWILIO_AUTH_TOKEN=your_token' >> .env
# echo 'TWILIO_FROM_NUMBER=+15555550100' >> .env
```

### 3. Sync schema + seed

```sh
# Apply Prisma schema to the database
npm run db:push

# Seed the Dhaka template (1 city, 10 wards, 3 departments,
# 6 categories, 1 user per role)
npm run db:seed
```

### 4. Build + start

```sh
# Production build
npm run build

# Start the production server
npm run start
#    Listens on http://localhost:3000
```

**Hosting target: Vercel (Hobby); production URL
`https://cityfix-bd.vercel.app`** (Vercel + Neon Postgres,
auto-deploy on push to `main`). Full deploy record:
`_progress/operations/cityfix-deployment.md` (URLs, env vars,
build SHAs) + `_progress/operations/vercel-neon-deploy-runbook.md`
(the reproducible how-to). The build output also runs on
Cloudflare Workers (`@cloudflare/next-on-pages`), Railway, or
any Node 20 host, but the production target is Vercel as of v1
launch (2026-10-12).

---

## Available scripts

All scripts are defined in `package.json`.

| Script | Command | What it does |
|---|---|---|
| `npm run dev` | `next dev -p 3000` | Bare dev server, fails on missing DB |
| `npm run dev:feat` | `cross-env CITYFIX_DEV_STORE=1 next dev -p 3000` | **Recommended for local**; in-memory store, no DB required |
| `npm run build` | `next build` | Production build |
| `npm run start` | `next start -p 3000` | Production server (after `build`) |
| `npm run typecheck` | `tsc --noEmit` | TypeScript strict compile check |
| `npm run test` | `playwright test` | Full Playwright suite (mockups + 19 route specs) |
| `npm run test:unit` | `vitest run` | 249 unit tests across 23 files |
| `npm run test:unit:watch` | `vitest` | Vitest watch mode |
| `npm run test:mockups` | `playwright test tests/01-mockups.spec.ts` | 15 visual baselines (gating) |
| `npm run test:update-baselines` | Same with `--update-snapshots` | Re-capture mockup PNGs (review diff before commit) |
| `npm run test:report` | `playwright show-report` | Open last Playwright HTML report |
| `npm run db:generate` | `prisma generate` | Prisma client codegen |
| `npm run db:migrate` | `prisma migrate dev` | Author + apply migration (v1.1 path) |
| `npm run db:push` | `prisma db push` | Sync schema without migration (v1 path) |
| `npm run db:seed` | `tsx prisma/seed.ts` | Seed Dhaka template |
| `npm run db:studio` | `prisma studio` | DB GUI |

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

Both `/api/dev/*` routes are no-ops in production (gated by
`process.env.CITYFIX_DEV_STORE === '1'`).

---

## Where the backend lives

There is no separate backend service. The API surface is the
`app/api/**/route.ts` files, served by the same Next.js process.
**40 route handlers**, organised by role:

### Citizen

- `app/api/v1/auth/register/route.ts` — POST register
- `app/api/v1/auth/login/route.ts` — POST login
- `app/api/v1/auth/verify-otp/route.ts` — POST verify OTP
- `app/api/v1/auth/send-otp/route.ts` — POST send OTP
- `app/api/tickets/route.ts` — POST create (with dedup)
- `app/api/tickets/[id]/route.ts` — GET (with rate limit + scope)
- `app/api/tickets/[id]/transition/route.ts` — POST role-scoped
- `app/api/tickets/[id]/photos/[idx]/route.ts` — DELETE photo
- `app/api/v1/activity/route.ts` — GET city feed
- `app/api/v1/push/subscribe/route.ts` — POST/DELETE push subscription

### Dispatcher (Habib)

- `app/api/v1/dispatcher/queue/route.ts` — GET queue
- `app/api/v1/dispatcher/map/tickets/route.ts` — GET map pins
- `app/api/v1/dispatcher/tickets/[id]/route.ts` — GET ticket
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

- `app/api/v1/admin/cities/route.ts` — CRUD cities
- `app/api/v1/admin/cities/[id]/route.ts` — GET/PATCH/DELETE city
- `app/api/v1/admin/cities/[id]/categories/route.ts` — CRUD categories
- `app/api/v1/admin/cities/[id]/departments/route.ts` — CRUD departments
- `app/api/v1/admin/cities/[id]/wards/route.ts` — CRUD wards
- `app/api/v1/admin/cities/[id]/categories/[catId]/route.ts`
- `app/api/v1/admin/cities/[id]/departments/[deptId]/route.ts`
- `app/api/v1/admin/cities/[id]/wards/[wardId]/route.ts`
- `app/api/v1/admin/audit/route.ts` — GET audit log

### WebAuthn (admin writes)

- `app/api/auth/webauthn/register/route.ts`
- `app/api/auth/webauthn/assertion/route.ts`
- `app/api/auth/webauthn/revoke/route.ts`
- `app/api/auth/webauthn/login/route.ts`

### Misc

- `app/api/auth/status/route.ts` — GET session status
- `app/api/report/bootstrap/route.ts` — POST report-flow bootstrap

### Dev-only (gated by `CITYFIX_DEV_STORE=1`)

- `app/api/dev/login/route.ts` — role-shorted session bootstrap
- `app/api/dev/reset/route.ts` — wipe + reseed in-memory store

All handlers go through the service layer in `lib/` — no raw Prisma
or raw SQL in route handlers (per the Forbidden rules in
`aidlc/spaces/default/memory/team.md`).

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
| `npm run test:unit` | 249 unit tests pass |
| `npm run test:mockups` | 15 visual baselines match (gating) |
| `curl -fs http://localhost:3000/` | Server returns 2xx on `/` |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `EADDRINUSE :::3000` | Old dev server still running | Kill it: `Get-Process -Name node \| Stop-Process` (PowerShell) or `pkill -f "next dev"` (bash) |
| `PrismaClientInitializationError` on first request | `DATABASE_URL` not set or DB unreachable | Set it (production mode) or use `npm run dev:feat` (in-memory store) |
| `Cannot find module '@prisma/client'` | Prisma client not generated | `npm run db:generate` after `npm install` |
| Map shows blank tiles on `/home` | OSM tile CDN unreachable from your network | Check `https://tile.openstreetmap.org/{z}/{x}/{y}.png` in a browser. (Per project memory, the OSM Tile Usage Policy forbids heavy production use — a paid provider is the scale path.) |
| `OTP_PROVIDER=twilio` but SMS doesn't send | Missing Twilio credentials or from-number | Check `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER`; falls back to the stub provider if any is missing |
| `400` on `/api/v1/auth/register` | Validation failed (Zod) | Inspect response body — usually a missing field or weak password. The platform requires `phone` (E.164), `nid` (BD format), `password` (≥ 8 chars), and `name` |
| Stale data after edits | In-memory store from a previous `dev:feat` | `curl http://localhost:3000/api/dev/reset` to wipe + reseed, then restart the server |
| Playwright baselines failing | Visual regression after a real change | Review the diff, then `npm run test:update-baselines` and commit the new PNGs |

---

## Where to go next

- **README.md** — project showcase, personas, architecture, mandated rules
- **docs/idea.md** — canonical problem statement
- **design-artifacts/C-UX-Scenarios/** — spec-as-contract artifacts
- **aidlc/spaces/default/memory/{org,team,project}.md** — the project memory
- **_progress/00-design-log.md** — per-Bolt progress record
- **AGENTS.md** — WDS / agent skill setup
