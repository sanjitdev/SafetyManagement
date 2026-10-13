---
standard: tech-stack
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
source: design-artifacts/E-Development/000-tech-audit.md (2026-10-04)
---

# Tech Stack

## Overview

Core technology decisions for CityFix. Pinned by the **Mimir tech-audit
workflow** on 2026-10-04 and confirmed through WO-000 implementation.
The audit was the canonical source; this standard is its re-expression
in specsmd form. All "Open Questions for Mimir" choices in
WO-000 / WO-001 / WO-003 / WO-004 are either resolved here or
explicitly deferred to a named intent.

## Decisions

### Languages

- **TypeScript strict** — `tsconfig.json` `strict: true`, `isolatedModules: true`,
  `noEmit: true`, `target: ES2022`, `module: ESNext`. **Rationale**: type
  safety at every layer (API + UI + Prisma model) catches a class of bugs
  that the citizen-facing surface cannot afford.
- **TSX (React 18)** for the presentation layer.
- **No const-enum** — `isolatedModules: true` forbids it; use numeric/string
  literals.

### Framework

- **Next.js 14 App Router** with **TypeScript strict** and **Tailwind v3**.
  - `next.config.js` sets `serverActions.bodySizeLimit: 4mb` (photo upload
    budget).
  - Standard security headers (X-Content-Type-Options, Referrer-Policy,
    X-Frame-Options).
  - Path alias `@/` → repo root.
- **Node.js 20 LTS** runtime.
- **Single full-stack repo** (App Router API routes + UI). No separate
  backend in v1.

### Authentication & Authorization

- **HTTP-only signed session cookies** (HMAC-SHA256, 14-day TTL) for v1
  session management. `lib/auth/session.ts`.
- **argon2id** with OWASP 2024 parameters for password + OTP hashing.
  `lib/auth/password.ts`, `lib/auth/otp.ts`.
- **Four-role model**: `citizen / dispatcher / crew / admin`. `User.role`
  enum in Prisma + `lib/auth/guards.ts` (`requireRole`, `requireSameCity`,
  `requireScope`).
- **Citizen auth**: phone + NID + name + password + SMS-OTP (6-digit,
  5-min TTL, 5 attempts, argon2-hashed).
- **Admin WebAuthn mandatory for writes** (hardware key). v1 ships schema
  + challenge table; the four `/api/auth/webauthn/*` route handlers are
  deferred to WO-005.
- **Dispatcher + crew** sessions are bound to `(cityId, wardId?,
  departmentId?)` at login time; the API layer denies cross-scope reads
  and writes. WO-002 owns the dispatcher scope model.

### Data

- **PostgreSQL 16** as the system of record.
- **Prisma 5.22** for schema, types, and queries.
  - `onDelete: Restrict` on ownership relations (Ticket → reporter,
    category, ward), `onDelete: Cascade` on parent-child relations
    (City → Ward, User → OtpCode, Ticket → Trail), `onDelete: SetNull`
    on optional FKs (Ticket → assignedCrew, Category → department).
  - **No raw SQL** in app routes. Always go through the Prisma client
    from `lib/db.ts` (production) or `lib/db-switch.ts` (when the in-memory
    dev store is active).
- **R2 / MinIO / S3** for photo blob storage (deferred to v1.1; v1 stores
  base64 data URLs in `Ticket.photoUrls` for the dev-store demo).
- **Redis** for cross-process rate limit and push fan-out — **deferred to
  v1.1**. v1 uses an in-process token bucket in `lib/platform/rate-limit.ts`.

### Map

- **MapLibre GL JS** + **OpenStreetMap raster tiles** for v1 (no API key,
  matches lean-ops Goal 3).
- **Mapbox** tiles in production if load justifies; the free tier covers
  the v1 pilot (50k loads/month) and the overage path (Mapbox usage
  alert + OSM brownout fallback) is cheap to operate.
- **GeoJSON ward polygons** from the city config endpoint
  (`GET /cities/:id/wards` — v1 ships the schema only, the endpoint
  lands with the WO-002 dispatcher view).

### Push

- **Web Push API (VAPID)** for v1; service-worker delivery.
- **At-least-once delivery** with idempotency token.
- **FCM / APNs** deferred until native wrappers ship.
- v1: schema + helpers in `lib/platform/push.ts`; the actual
  `web-push.sendNotification(...)` wire call is stubbed and surfaces in
  `.env.example` for v1.1.

### Testing

- **Vitest** (in `tests/unit/`) for unit tests — path alias `@/`,
  `node` env, picks `tests/unit/**`.
- **Playwright** for visual regression and route specs.
  - `tests/01-mockups.spec.ts` covers the 7 design mockups (15 PNG
    baselines committed at `tests-mockups/baselines/01-mockups.spec.ts/`
    with `{name}-{WxH}.png` naming).
  - Per-WO route specs extend with `tests/<NN-wo-slug>.spec.ts` files.
  - **Visual regression tolerance**: `0.005` (per WO-001 acceptance
    criteria).
- **Per-Bolt test strategy** follows the project posture: test-after for
  greenfield; 80% line-coverage floor on `feature` scope. Confirmed
  green at WO-000 ship (57/57 unit tests, 15/15 mockup baselines).

### Package Manager

- **npm** (already in `package.json`; consistent with the existing
  `package-lock.json` and the GitHub Actions publish workflow).

### Tooling

- **TypeScript**: `npx tsc --noEmit` is the per-Bolt gate.
- **Prisma**: `prisma generate`, `prisma db push` (v1 dev), `prisma migrate
  dev` (v1.1+ when DATABASE_URL is real).
- **ESLint** and **Prettier** deferred (no `.eslintrc` / `.prettierrc` in
  the repo as of 2026-10-04); add to a v1.1 hardening Bolt.

## Deferred to PRD (not in this standard)

- **OTP SMS provider** — provider abstraction is in `lib/auth/otp.ts`;
  real provider chosen in WO-005 (admin setup).
- **Photo retention policy** — legal/privacy; deferred to WO-002.
- **Dedup radius default** — `City.dedupRadiusMeters = 50` is the seed
  default; per-city override permitted in the admin UI (WO-005).
- **Hosting target** — Cloudflare vs Vercel vs Railway; deferred to
  the WO-001 PRD ratification step.

## Cross-References

- **Source audit**: `design-artifacts/E-Development/000-tech-audit.md`.
- **Decisions register**: `standards/decision-index.md` — see ADR-001
  through ADR-007 for the rationale behind each pinned choice.
- **PRDs that consume this standard**:
  - Intent 001 (Platform Foundation) — shipped.
  - Intent 002 (Citizen Report Flow) — in progress.
