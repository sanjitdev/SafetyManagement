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
| Deployment URL (current build) | `https://cityfix-kmx55a3ii-super-max1.vercel.app` |
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

> **Status (as of 2026-10-12):** Vercel default "All Environments" (login
> wall on every URL, including production). User has decided to revisit
> the setting themselves. **For a citizen-facing app, this must be
> changed to "Standard Protection" (preview-only) before launch**, or
> citizens will see a Vercel login wall instead of the app.

Recommended: Project Settings → Security → Deployment Protection →
"Standard Protection" (production publicly accessible, preview URLs
gated to Vercel account).

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
| Migrations | `prisma/migrations/20261012102438_init/migration.sql` (applied) |
| Seeded | Dhaka North City Corporation + 3 departments + 5 categories + 50 placeholder wards |
| Roles enum | `citizen / dispatcher / crew / admin` |
| Tables | City, Ward, Department, Category, User, Session, Ticket, TicketEvent, Photo, DedupFlag, AuditEntry, WebAuthnChallenge |

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

## Auto-deploy (Phase C — pending)

**Status**: GitHub repo wired to Vercel project via dashboard
on 2026-10-12. Test push `0bb694e` ("test: trigger Vercel
auto-deploy on push to main") did **not** trigger a build
as of the capture time (~75s after the push). Most likely
cause: the Vercel GitHub App is installed on the user's GitHub
account but `sanjitdev/SafetyManagement` is not on its
repository allowlist.

Fix:
1. `https://github.com/settings/installations` → Vercel →
   Configure → Repository access → Add repository →
   `sanjitdev/SafetyManagement` → Save
2. (Optional) `vercel.com/super-max1/cityfix/settings/git` →
   Disconnect, then Connect again, to re-register the webhook
3. Push another empty commit to confirm: Vercel should
   start a build within ~30s

To enable (from scratch):
1. Vercel dashboard → `cityfix` project → Settings → Git → Connect
2. Pick `sanjitdev/SafetyManagement`
3. Production Branch = `main`
4. Save

If the build doesn't fire after the click, also check
`https://github.com/settings/installations` → Vercel →
Configure → confirm `sanjitdev/SafetyManagement` is in
"Repository access".

No GitHub Actions needed; Vercel polls the repo via its own webhook.

## Out of scope (deferred)

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
