# CityFix — Deployment Guide

**Documented:** 2026-11-08
**Codebase:** `main` @ `be9f2b0`
**Hosting target:** Vercel (project `cityfix`, `prj_av0zjUFXBo9rO70j4EtMJGtTAHaE`)
**Database:** Neon (hosted PostgreSQL 16)

---

## 1. Architecture in one paragraph

CityFix is a **single full-stack Next.js 14 app**. There is no separate backend service — the API is the `app/api/**/route.ts` route handlers, served by the same process as the frontend. The data layer is PostgreSQL 16 via Prisma in production, or an in-memory dev store locally. Deployment is therefore a single deployable unit plus one managed database.

```
┌─────────────────────────────┐
│  Vercel (Next.js 14)        │
│  ├─ app/**/page.tsx         │
│  ├─ app/api/**/route.ts     │
│  └─ lib/**                  │
└──────────┬──────────────────┘
           │ Prisma
┌──────────▼──────────────────┐
│  Neon (PostgreSQL 16)       │
└─────────────────────────────┘
           │
┌──────────▼──────────────────┐
│  Blob storage               │
│  S3 / R2 / MinIO            │
└─────────────────────────────┘
```

---

## 2. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **22 for CI**, ≥20 for runtime | `engines.node: >=20.0.0`. CI uses 22 — see [TESTING_REPORT.md §5](TESTING_REPORT.md#the-node-22-requirement) |
| PostgreSQL | 16 | Neon or equivalent managed Postgres |
| Vercel account | — | Project already linked (`.vercel/project.json`) |
| Twilio account | — | Only if `OTP_PROVIDER=twilio` |

---

## 3. Environment variables

### Required in production

| Variable | Example | Enforcement |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@ep-xxx.neon.tech/cityfix?sslmode=require` | **The db-guard throws in production if the host is loopback.** Handles both URL and libpq keyword forms |
| `SESSION_SECRET` | `openssl rand -hex 32` | `lib/auth/session.ts:22-28` throws if missing or `< 32` chars |
| `WEBAUTHN_RP_ID` | `cityfix-bd.vercel.app` | Must **not** be `localhost` in production |
| `WEBAUTHN_RP_ORIGIN` | `https://cityfix-bd.vercel.app` | Must be `https://` in production |
| `WEBAUTHN_RP_NAME` | `CityFix` | |
| `OTP_PROVIDER` | `twilio` | ⚠️ **Defaults to `stub` if unset** — see below |

### Required when `OTP_PROVIDER=twilio`

| Variable | Notes |
|---|---|
| `TWILIO_ACCOUNT_SID` | The provider throws if any of the three is missing |
| `TWILIO_AUTH_TOKEN` | |
| `TWILIO_FROM_NUMBER` | E.164 format |

### Optional

| Variable | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | — | Web Push is stubbed in v1 |
| `VAPID_PRIVATE_KEY` | — | |
| `VAPID_SUBJECT` | — | `mailto:` URL |
| `POLL_RATE_LIMIT_PER_SECOND` | `1` | Per-IP token bucket rate |
| `BLOB_PROVIDER` | `local` | ⚠️ **Must be `s3` in production** — see below |
| `BLOB_LOCAL_DIR` | local path | Dev only |
| `BLOB_LOCAL_BASE_URL` | `/api/blob` | Dev only — the serving route does not exist |
| `BLOB_PUBLIC_BASE_URL` | — | Production CDN/origin base |
| `BLOB_SIGNED_URL_TTL` | — | Presigned URL lifetime |

### Must be UNSET in production

| Variable | Why |
|---|---|
| `CITYFIX_DEV_STORE` | ⚠️ **No production guard exists.** Setting it disables the database, **unsigns the session cookie**, and bypasses the WebAuthn gate. See [SECURITY_AUDIT.md §5.4](SECURITY_AUDIT.md#54-production-db-guard--libplatformdb-guardts) |
| `DEV_SKIP_WEBAUTHN` | Bypasses the entire WebAuthn gate. Correctly double-gated on `isDevStore()`, but do not rely on that alone |
| `CITYFIX_DEV_PROMOTE_SECRET` | Gates four privilege-escalation endpoints that are **not** `isDevStore()`-gated |

> **The first action item before any production launch is to check these three in the deployed environment.** Whether they are set determines whether [SECURITY_AUDIT.md](SECURITY_AUDIT.md) findings #1, #3 and #4 are theoretical or live.

---

## 4. Local development

### Quick start — no database

```bash
npm install
npm run db:generate
npm run dev:feat        # CITYFIX_DEV_STORE=1, in-memory store
```

Open `http://localhost:3000`. The splash screen → register → home flow works with no Postgres.

### Production mode — with PostgreSQL

```bash
# 1. Configure
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/cityfix"' >> .env.local

# 2. Migrate + seed (Dhaka template: 1 city, 10 wards, 3 departments,
#    6 categories, 1 user per role)
npm run db:setup

# 3. Build + start
npm run build
npm run start
```

`npm run start` runs `scripts/start-next.mjs`, which finds the next free port between 3000 and 3100 if 3000 is taken.

### Reproducing the CI environment locally

```bash
node scripts/ci-env.mjs npm run test:unit
node scripts/ci-env.mjs npx next build
```

This is the honest reproduction of the CI gate — the same in-memory store, the same placeholder credentials, the same `NODE_ENV` handling. It is how the module-load database guard was caught in the first place.

---

## 5. Deploying to Vercel

### Automatic

Push to `main` → Vercel builds and deploys.

The build runs `npm run build` → `prisma generate && next build`.

### Manual

```bash
npm i -g vercel
vercel link                    # .vercel/project.json already exists
vercel --prod
```

### Required Vercel configuration

| Setting | Value | Why |
|---|---|---|
| Framework preset | Next.js | Default detection works |
| Node version | 22 | Matches CI — see below |
| Build command | `npm run build` | Default |
| Install command | `npm ci` | Default |
| Environment variables | The table in §3 | Set in the Vercel project settings |

**The Node version must be 22.** `jsdom@30` → `undici@8` requires `engines.node >= 22.19.0`; on Node 20 the Zstd constant it reaches for is undefined and the module throws at import time. This bit CI for a month before it was found. `engines.node` in `package.json` stays `>=20.0.0` because that is the *runtime* floor — but the Vercel build and test steps should pin 22 to match CI.

### Applying migrations

`prisma migrate deploy` must run **before** the new version serves traffic:

```bash
vercel env pull .env.production.local
npm run db:migrate:deploy
```

Vercel does not run migrations as part of the build by default. Options:

1. **A separate CI job** that runs on merge to `main`, before the Vercel deploy is allowed to promote.
2. **A Vercel build step** that runs `prisma migrate deploy` — risky if the build is retried.

The recommended path is a CI job, because `migrate deploy` is not safe to run concurrently.

---

## 6. Production checklist

Run through this before the first production traffic.

### Environment

- [ ] `DATABASE_URL` points at **Neon** (not loopback — the db-guard enforces this)
- [ ] `SESSION_SECRET` is ≥32 random characters, unique to this deployment
- [ ] `WEBAUTHN_RP_ID` is the production hostname
- [ ] `WEBAUTHN_RP_ORIGIN` is the production https origin
- [ ] `OTP_PROVIDER=twilio` — **not** the default `stub`
- [ ] `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` are set
- [ ] `BLOB_PROVIDER=s3` with the S3 credentials and `BLOB_PUBLIC_BASE_URL`
- [ ] `CITYFIX_DEV_STORE` is **unset**
- [ ] `DEV_SKIP_WEBAUTHN` is **unset**
- [ ] `CITYFIX_DEV_PROMOTE_SECRET` is **unset**

### Code

- [ ] The four `/api/dev/*` promote routes are `isDevStore()`-gated (finding #3) — **or the routes are deleted**
- [ ] `dev_code` is not returned in the OTP response (finding #1)
- [ ] `OTP_MAX_ATTEMPTS` is enforced (finding #2)
- [ ] `PUT /api/profile` is WebAuthn-gated (finding #5)
- [ ] WebAuthn challenges are consumed on use (finding #6)

### Verification

- [ ] `npm run build` succeeds
- [ ] `npm run test:unit` passes
- [ ] `npm run test:unit:coverage` passes the 80% floor
- [ ] `npm run test:mockups` passes **on CI**
- [ ] `curl -fs https://<host>/` returns 2xx
- [ ] A real citizen can register, receive an OTP, verify it, and submit a report
- [ ] An admin can register a WebAuthn credential and perform a write
- [ ] Photos upload to blob storage and render on the ticket

---

## 7. Rollback

| Scenario | Action |
|---|---|
| Bad deploy | Vercel: Project → Deployments → promote the previous deployment. Instant; no rebuild |
| Bad migration | `prisma migrate deploy` is forward-only. Restore from a Neon point-in-time recovery, then fix forward. Take a Neon branch before every migration |
| Bad seed / template data | `npm run db:seed` is idempotent for the Dhaka template. Re-run it |
| Secrets leaked | Rotate in Vercel, redeploy. Sessions are server-side rows, so `DELETE FROM "Session"` invalidates every session immediately |
| A bad release blocking users | Roll back the deploy first, investigate second |

**Before every migration, create a Neon branch or snapshot.** The rollback path for a schema change is a database restore, not a code revert.

---

## 8. Monitoring and observability

**Current state: minimal.** There is no error-tracking service, no APM, and no log aggregation configured. What exists:

| Signal | Where |
|---|---|
| Structured audit trail | The `AuditEntry` table — every state change, queryable at `GET /api/v1/admin/audit` |
| Vercel function logs | `console.info` / `console.error` — including the OTP stub's code log |
| Vercel deployment health | The Vercel dashboard |

**Gaps worth closing before the pilot:**

- [ ] **Error tracking** (Sentry or equivalent) — the `Result<T, E>` service layer swallows errors by design, so a failing request can look like a success
- [ ] **Uptime check** on `GET /api/auth/status`
- [ ] **Database alerting** on Neon — connection saturation, slow queries
- [ ] **SLA alerting** — the `SlaPolicy` model exists and the dispatcher monitor computes against it, but nothing notifies when a ticket breaches
- [ ] **OTP delivery monitoring** — with Twilio, a delivery failure is currently invisible
- [ ] **Web Push delivery logging** — `lib/platform/push.ts` is stubbed in v1

---

## 9. Operational runbooks

### "The map is blank"

1. Check the CSP — `connect-src` must list `tile.openstreetmap.org` **and** the `a/b/c.tile.openstreetmap.org` subdomains. The bare host must be listed explicitly; `*.tile.…` matches subdomains only.
2. Check `demotiles.maplibre.org` is in `connect-src` — MapLibre fetches glyph ranges from it. Without it, map pins render as invisible dots with only a CSP console error.
3. Test `https://tile.openstreetmap.org/{z}/{x}/{y}.png` from the deployment region.

### "The Bangla text renders in the wrong font"

The app loads Noto Sans Bengali from Google Fonts. If `fonts.googleapis.com` is in `style-src` and `fonts.gstatic.com` is in `font-src`, the font loads. Otherwise the UI silently falls back to a system font — a real, app-wide defect, not a nit.

**Long-term fix:** self-host the webfont as a local file rather than a network fetch. This is tracked in the Intent 009 inception log. It would also eliminate the platform-drift problem in the visual baselines (different rasterisation per platform), because the font would no longer depend on a CDN.

### "SMS is not being delivered"

1. Confirm `OTP_PROVIDER=twilio` — if unset, the default is `stub`, which only logs the code.
2. Confirm all three `TWILIO_*` variables are set — the provider throws if any is missing.
3. Check `TWILIO_FROM_NUMBER` is E.164.
4. The Twilio provider has a 3-attempt backoff (`[100, 200, 400]ms`) and treats 4xx as permanent.

### "Admin writes fail with `webauthn_required`"

1. Is a credential registered? `GET /api/v1/admin/cities/{id}/users` won't show it — check the `User.webAuthnChallenge` column.
2. Is the challenge fresh? Challenges expire after 5 minutes. Complete a new assertion.
3. **Known issue:** challenges are not consumed on use (finding #6), so this should not happen — but a *stale* challenge row can satisfy the check.
4. Is `DEV_SKIP_WEBAUTHN=1` set in production? It bypasses the gate entirely, so this symptom would not appear. If it *does* appear, the seam is correctly disabled.

---

## 10. Related documents

- [SECURITY_AUDIT.md](SECURITY_AUDIT.md) — the launch blockers this guide defers to
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — the 31 flags
- [ARCHITECTURE.md](ARCHITECTURE.md) — the layers and the dev-store seam
- [TESTING_REPORT.md](TESTING_REPORT.md) — what CI verifies before deploy
- [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) — the overall go/no-go

> **Note:** `docs/running.md` is the older, local-development-focused guide. Its script and route tables are stale (it lists 40 route handlers, 249 unit tests and 15 baselines; the current counts are 61 handlers, 1,851 unit tests and 25 baselines). This document supersedes it for production concerns, but `running.md` should be refreshed.
