# CityFix — Local Runbook

Fast paths for getting CityFix running locally, plus the environment quirks on
this machine that cost time on the first attempt.

Last verified: **2026-11-05** — Next.js 14.2.35, Node v24.19.0, npm 11.8.0.

---

## TL;DR — the 90-second path

```bash
cd "C:\ZDrive Folders\E2E_Training\SafetyManagement"

# 1. Is Postgres up? (should print POSTGRES UP)
node -e "const s=require('net').connect(5432,'127.0.0.1');s.on('connect',()=>{console.log('POSTGRES UP');s.destroy()});s.on('error',()=>console.log('POSTGRES DOWN'));setTimeout(()=>process.exit(0),1500)"

# 2. DB ready? (expect: "Database schema is up to date!")
npm run db:status

# 3. Seed personas (idempotent — safe to re-run)
npm run db:seed

# 4. Start the app on a FREE port (see "Port rules" below — 3000 is NOT free)
PORT=3100 npm run dev
```

Then open **http://localhost:3100** and log in with any persona below.

> **First request is slow.** Next.js dev compiles routes on demand — the first
> `/` request took ~29s, `/home` took ~85s. This is normal and one-time per
> route. A request that returns `000` (curl timeout) is usually still
> compiling — **re-request it**, don't restart the server.

---

## Port rules — read this before starting the server

**Port 3000 is NOT available on this machine.** A WSL2/Docker-forwarded app
serves it (returns HTTP 404 with `X-Request-Id` / `X-Download-Options: noopen`
headers). It is invisible to Windows `netstat` and to
`Get-NetTCPConnection`, so it looks free when it is not.

Consequences:

| Port | Status | Notes |
|------|--------|-------|
| 3000 | **TAKEN** | WSL2/Docker-forwarded app. Answers `404` on `/`. |
| 3001 | TAKEN | Unrelated Node app (`dist/main.js`, PID 22212). |
| 3002 | **REJECTED** | Bind fails with `EADDRINUSE` even though `netstat` shows nothing. Windows/WSL port reservation. |
| **3100** | **FREE — use this** | Inside the range `scripts/start-next.mjs` scans (3000–3100). |
| 3200+ | FREE | Verified bindable. |

`npm run dev` (no `PORT`) will try 3000, fail, and die. **Always set `PORT`.**

### Finding a free port

```bash
node -e "
const s=require('net').createServer();
s.once('error',()=>{console.log('FAIL');process.exit(0)});
s.listen(3100,()=>{console.log('OK');s.close();process.exit(0)});
"
```

Trust the **bind test**, not `netstat` — `netstat` misses WSL2-forwarded ports.

---

## Database

Postgres runs in Docker (`cerfectly-postgres`, `0.0.0.0:5432->5432/tcp`).

```bash
npm run db:status          # migration status
npm run db:seed            # seed city/wards/categories/personas (idempotent)
npm run db:setup           # migrate deploy + seed
npm run db:reset           # wipe + re-migrate (destructive)
```

The `db:*` scripts go through `scripts/load-env-local.mjs`, which injects
`.env.local` into the child process's environment. **The Prisma CLI only reads
`.env` and `.env.<NODE_ENV>`** — and this repo has no `.env` (it is gitignored).
That wrapper is why `npm run db:*` works when bare `npx prisma` fails with
`P1012: Environment variable not found: DATABASE_URL`.

> Do **not** run `npx prisma ...` directly. Also note `prisma` is not on the
> global PATH — only `node_modules/.bin/prisma` exists, which is why the
> npm-script indirection is needed.

### Seeded demo data

| Entity | Count |
|--------|-------|
| City | 1 — Dhaka North City Corporation (`dhaka-north`) |
| Wards | 50 (placeholder polygons) |
| Departments | 4 |
| Categories | 5 (Broken streetlight, Pothole / road damage, Drainage blocked, Garbage not collected, Other) |
| SLA policies | 5 |
| Personas | 6 (1 citizen, 1 dispatcher, 1 admin, 3 crew) |

---

## Persona logins

**Password for every persona: `12345678`**

| Role | Name | Phone | Lands on |
|------|------|-------|----------|
| citizen | Rahim | `+8801711000000` | `/home` |
| dispatcher | Habib | `+8801711000001` | `/dispatcher` |
| admin | Anwar | `+8801711000003` | `/admin` |
| crew | Rashid | `+8801711000002` | `/crew` |
| crew | Karim | `+8801711000004` | `/crew` |
| crew | Jamal | `+8801711000005` | `/crew` |

Phone format matters — the login route normalizes to `+8801XXXXXXXXX`. The
seeded rows are in `+8801711...` format. `01711000000` **fails** with
`401 wrong_credentials`.

Rashid and Jamal are both streetlight crew, but Jamal sits in **Ward 20** while
the others are in **Ward 14** — that mismatch makes the cross-ward reject path
testable.

### Admin writes need WebAuthn

Admin **reads** work with a plain password login. Admin **writes** go through
`requireWebAuthn` (ADR-007) and answer `401 webauthn_required` without a
registered credential. For local dev set:

```bash
DEV_SKIP_WEBAUTHN=1
```

This is gated on `isDevStore()`, still requires a session, and runs **after**
the `requireRole(session, 'admin')` check — so a non-admin still gets 403.
Production never reads it.

---

## Two backends — pick one

`lib/db-switch.ts` routes every call by `process.env.CITYFIX_DEV_STORE`.

| Command | Backend | Needs Postgres | Notes |
|---------|---------|----------------|-------|
| `npm run dev` | **Real Postgres** | Yes | Full fidelity. Use this to exercise real data. |
| `npm run dev:feat` | In-memory dev store | No | Fast. Seeding is simulated. |

`CITYFIX_DEV_STORE=1` (what `dev:feat` sets) is also what the Vitest and
Playwright configs set by default.

### Dev-only routes

`/api/dev/*` is gated on `CITYFIX_DEV_PROMOTE_SECRET` in `.env.local`
(`local-dev-promote-secret`). With it unset, the whole tree returns 404.

- `POST /api/dev/issue-session` — mint a session for any `userId`, no password.
  Useful for reaching staff surfaces without a password-login path.
- `POST /api/dev/promote-admin` — promote the signed-in user to `admin`.
- `POST /api/dev/reset` — reset the dev store.
- `GET /api/dev/list-users` — list seeded users.

---

## Tests

### Unit tests — Vitest

```bash
npm run test:unit              # full suite
npm run test:unit:watch        # watch mode
npx vitest run tests/unit/<file>.test.ts   # single file
```

**Verified 2026-11-05: 1429/1430 pass (98 files).**

The one failure is `tests/unit/otp-provider.test.ts` → *"writes an AuditEntry
with action otp_send_failed on provider error"*, which **times out at 5000ms**
under full-suite load. It **passes in isolation** (18/18) — it is a load
flake, not a defect. Re-run just that file to confirm:

```bash
npx vitest run tests/unit/otp-provider.test.ts
```

Vitest sets `CITYFIX_DEV_STORE=1` by default, so **the unit suite needs no
Postgres**.

### Mockup baselines — Playwright

```bash
npm run test:mockups                    # 25 visual-regression baselines
npm run test:update-baselines           # re-record baselines (review the diff!)
```

**Verified 2026-11-05: 25/25 pass.**

> ### ⚠ The Playwright config hardcodes port 3000 — it will fail here
>
> `playwright.config.ts` sets `webServer.url` and `use.baseURL` to
> `http://localhost:3000`. Port 3000 is taken, so Playwright's own server
> keeps restarting (3000 → 3001 → 3002 → 3003) and dies with
> `Error: Timed out waiting 60000ms from config.webServer`.
>
> **The suite itself is fine** — it passes on a free port. Use a temporary
> config override:
>
> ```bash
> cat > pw-port-check.config.ts <<'EOF'
> import base from './playwright.config';
> const PORT = 3210;
> export default {
>   ...base,
>   webServer: {
>     ...(base.webServer as Record<string, unknown>),
>     command: `cross-env PORT=${PORT} npm run dev:feat`,
>     url: `http://localhost:${PORT}`,
>     reuseExistingServer: false,
>     timeout: 120_000,
>   },
>   use: {
>     ...(base.use as Record<string, unknown>),
>     baseURL: `http://localhost:${PORT}`,
>   },
> };
> EOF
>
> npx playwright test tests/01-mockups.spec.ts -c pw-port-check.config.ts
> rm pw-port-check.config.ts
> ```
>
> A permanent fix would parameterise the port in `playwright.config.ts` via
> `process.env.PORT`. Not done yet — flagging rather than silently changing
> a gating test config.

### Typecheck

```bash
npm run typecheck      # tsc --noEmit
```

**Verified 2026-11-05: clean.** This is a mandated pre-Bolt gate.

---

## Verification command

The project's recorded Construction Verification Command (from
`aidlc/spaces/default/memory/project.md`) is:

```
npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/
```

**Two caveats on this machine:**

1. `npm run test:mockups` fails on the hardcoded port 3000 — use the
   override above.
2. `curl http://localhost:3000/` hits the **other** app, not CityFix. Use
   your actual port: `curl -fs http://localhost:3100/`.

---

## Common problems

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EADDRINUSE :::3000` on `npm run dev` | Port 3000 is the WSL2 app | Set `PORT=3100` |
| `EADDRINUSE :::3002` but netstat shows nothing | Windows/WSL port reservation | Use 3100 or higher |
| `Error: Timed out waiting 60000ms from config.webServer` | Playwright wants port 3000 | Use the config override above |
| `P1012: Environment variable not found: DATABASE_URL` | Ran `npx prisma` directly | Use `npm run db:*` |
| `'prisma' is not recognized` | Prisma not on global PATH | Use `npm run db:*` |
| curl returns `000` on first hit | Route still compiling | Re-request — do not restart |
| `401 wrong_credentials` with a seeded phone | Wrong phone format | Use `+8801711000000` format |
| `404` on `/api/dev/*` | `CITYFIX_DEV_PROMOTE_SECRET` unset | Set it in `.env.local` |
| `401 webauthn_required` on an admin write | WebAuthn gate (ADR-007) | Set `DEV_SKIP_WEBAUTHN=1` |

---

## Useful scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server, real Postgres |
| `npm run dev:feat` | Dev server, in-memory store |
| `npm run build` | `prisma generate && next build` |
| `npm run start` | Production start (auto-picks a free port 3000–3100) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm run check:i18n` | Verify i18n key registry consistency |
| `npm run db:studio` | Prisma Studio |

---

## Environment notes

- `.env.local` is the **only** env file (`.env` is gitignored). Next.js loads
  it automatically; the Prisma CLI needs the `load-env-local.mjs` wrapper.
- `.env.local` currently contains a live `VERCEL_OIDC_TOKEN` and the Postgres
  password in plaintext. It is gitignored, but rotate the token if it was ever
  committed or shared.
- `WEBAUTHN_RP_ORIGIN` points at `https://cityfix.vercel.app`. Local WebAuthn
  ceremonies will fail against a different origin — use `DEV_SKIP_WEBAUTHN=1`
  locally.
- `.env.local.backup` exists alongside `.env.local`.

---

## Docs

- Product brief — `docs/idea.md`, `design-artifacts/A-Product-Brief/`
- Design artifacts — `design-artifacts/` (the contract the build follows)
- Mockup baselines — `tests-mockups/baselines/01-mockups.spec.ts/`
- Progress log — `_progress/00-design-log.md`
- AIDLC state — `aidlc-state.md` (do **not** edit by hand)
