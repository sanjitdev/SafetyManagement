# Tech Audit — CityFix (000-tech-audit.md)

**Created:** 2026-10-04
**Author:** Mimir (Mimir tech-audit workflow)
**Lane:** Standalone WDS v1.0.0 (`C:\Users\BS707\.claude\wds\`)
**Status:** Complete — ready for Mimir PRD phase
**Brownfield state:** Greenfield (no `src/`, `backend/`, `app/` directories; existing assets are design docs + Playwright mockup baselines only)

---

## Purpose

Before any PRD is written, pin every cross-cutting tech-stack decision surfaced by WO-000 / WO-001 / WO-003 / WO-004. These choices are downstream-gating — once a PRD references them, changing them costs a re-PRD.

The audit documents:
1. **Framework + runtime** (frontend, backend, build tool)
2. **Map** (tile provider, library, fallback)
3. **Push notifications** (transport for v1 + deferred)
4. **Authentication** (citizen, dispatcher, crew, admin)
5. **Data + storage** (DB, ORM, blob storage, cache)
6. **Testing** (extends existing Playwright setup)

Each decision carries: **choice**, **rationale**, **alternatives rejected**, and **deferred items**. Recommendations from the Work Orders are adopted unless contradicted by the audit.

---

## 1. Framework + runtime

### Decision: v1 ships as a single full-stack Next.js 14+ (App Router) web app

- **Frontend + SSR routes:** Next.js 14 (App Router, React Server Components where useful)
- **Backend (BFF + API routes):** Next.js Route Handlers (`app/api/**/route.ts`) under the same repo; no separate backend service in v1
- **Language:** TypeScript everywhere (already pinned — `tsconfig.json` strict mode, ES2022)
- **Styling:** Tailwind CSS (mockups already use Tailwind via CDN — promoted to a real install with `tokens.css` as a thin compatibility layer for the custom properties)
- **Runtime:** Node.js 20 LTS (matches `package.json` engines)

### Rationale
- Single repo + single deployment is the leanest path to v1 (matches Goal 3: operate leanly across cities)
- App Router gives us per-route rendering control — the citizen report flow benefits from SSR for first paint + SEO-adjacent links; the dispatcher dashboard benefits from client-side reactivity
- Next.js route handlers give us the BFF without standing up a second service, but the code is structured so the API can be split out later if load profiling shows a need
- Tailwind + tokens.css is already the pattern the visual design established; reusing it removes a phase of photomathwork

### Rejected alternatives
- **Vite + React Router + Express** — splits frontend/backend into two deployments and two dev servers; Playwright config needs both, doubling visual-regression cost. Defer until split is justified.
- **Astro** — better for content sites; the dispatcher dashboard needs fine-grained reactivity that Astro's islands model makes awkward.
- **Remix / SvelteKit** — both viable; chose Next.js because the App Router's RSC + route-handler split is the closest fit to "BFF inside the frontend framework" for a v1 lean-ops posture.

### Deferred
- **Separate backend service.** If API load crosses X or if you need background workers that don't fit Route Handlers, split into `apps/web` + `apps/api`.
- **React Native / native wrappers.** PWA installable only in v1; native wrappers deferred.

---

## 2. Map

### Decision: MapLibre GL JS + OpenStreetMap raster tiles + Nominatim for reverse geocoding (dev); Mapbox tiles in prod

- **Library:** `maplibre-gl` (BSD-3, fork of Mapbox GL JS pre-license-change)
- **Tiles (dev):** OpenStreetMap raster tiles via the public tile server
- **Tiles (prod):** Mapbox vector tiles (commercial, Bangladesh coverage good) OR self-hosted OSM tile server (cheaper, more ops)
- **Reverse geocoding:** Nominatim (dev), Mapbox Geocoding API or self-hosted Pelias (prod)
- **Ward polygons:** GeoJSON, served from the city config endpoint (PLAT-REQ-003), rendered as a MapLibre source layer

### Rationale
- MapLibre + OSM is the lean-ops path the WO-001 open question recommended — no API key, no billing setup for v1 demo
- Same library works with Mapbox tiles when scaling past the OSM tile usage policy
- GeoJSON-on-server matches the data model (`Ward` entity with polygon, per PLAT-REQ-003)

### Rejected alternatives
- **Google Maps** — billing per present-load; not justified for a public-sector civic platform with a lean-ops posture
- **Mapbox GL JS directly** — license changed in v2; MapLibre keeps the same API without the license trap

### Deferred
- **Mapbox tiles** — keep OSM raster tiles until load justifies the upgrade (rough threshold: production traffic > X MAU)
- **Self-hosted OSM tile server** — only if commercial Mapbox is too expensive at scale

---

## 3. Push notifications

### Decision: Web Push API (VAPID) for v1; FCM deferred until a native wrapper exists

- **v1:** Web Push API with VAPID keys; service-worker-based delivery; subscribed at `/login` per PLAT-REQ-006
- **Deferred:** FCM (Firebase Cloud Messaging) when a native Android wrapper ships; APNs when a native iOS wrapper ships
- **At-least-once delivery** with idempotency token (per WO-000 acceptance criteria)

### Rationale
- WO-001 open-question recommendation adopted verbatim — no native apps in v1, so Web Push is the only transport that delivers on a civic-platform lean-ops posture
- VAPID keeps the server stateless; no per-device state in the notification table
- Idempotency token matches the polling + status-trail contracts already in WO-000

### Rejected alternatives
- **FCM-only** — needs a Firebase project + service-account key; over-engineered when only Web Push targets exist
- **APNs-only** — irrelevant until iOS native
- **Polling-only with no push** — fails Feature #9 "Push notifications for status changes" (FIA 17), which is gating for the "feel heard" loop

### Deferred
- **WebSocket push** — deferred to v1.1 (matches the polling-deferred-to-WebSocket language already in WO-000 PLAT-REQ-008)

---

## 4. Authentication

### Decision: session-cookie-based auth with role-bound sessions; WebAuthn for admin writes

- **Citizen auth:** phone + NID + name + password + OTP (per WO-000 PLAT-REQ-002 + Rahim's 1.3/1.5 specs)
  - Session: HTTP-only, SameSite=Lax, Secure cookie (signed/encrypted)
  - OTP: SMS via provider abstraction (provider chosen in WO-004 admin config); ≤ 5 min TTL, single-use, retry-cap documented
- **Dispatcher auth:** email + password + optional WebAuthn (defer optional to v1.1)
- **Crew auth:** provisioned by admin (no self-signup); username + password + optional WebAuthn
- **Admin auth:** WebAuthn mandatory for any city-write action; password + OTP (TOTP, not SMS) for read actions
- **Roles:** `citizen`, `dispatcher`, `crew`, `admin` — four roles only (Feature #18 deprioritization preserved)
- **Session binding:** dispatcher + crew sessions bind to a specific `(city, ward, department)` — no cross-scope queries

### Library choices
- **Password hashing:** `argon2` (Node-native binding via `@node-rs/argon2`)
- **Session:** `iron-session` or hand-rolled (defer choice until we need rotation)
- **WebAuthn:** `@simplewebauthn/server` + `@simplewebauthn/browser` (WO-000 open-question recommendation adopted)
- **OTP:** TOTP via `otpauth`; SMS via provider abstraction

### Rationale
- HTTP-only signed cookies defeat the most common XSS-theft vectors
- WebAuthn for admin writes preserves the Phase 1 (Strategy) decision that admin actions are non-negotiable
- Session binding to (city, ward, department) matches WO-000 acceptance criteria
- Four-role model preserves Feature #18 deprioritization (custom-role builder explicitly out)

### Rejected alternatives
- **JWT in localStorage** — vulnerable to XSS theft; session cookies are strictly better
- **OAuth-only (no password)** — Bangladesh SMS-OTP + password is the established pattern; OAuth adds no value for civic users
- **WebAuthn for everyone** — too high friction for citizens who may not have hardware keys; admin-only is correct

### Deferred
- **Passkeys for citizens** — wait for browser support to settle
- **Magic-link auth** — over-engineered for v1

---

## 5. Data + storage

### Decision: PostgreSQL + Prisma; S3-compatible blob storage; Redis cache (optional v1.1)

- **Primary DB:** PostgreSQL 16 (relational fits the per-city config + ticket + audit-log shapes cleanly)
- **ORM:** Prisma (TypeScript-native, generates types that match the strict-mode tsconfig)
- **Blob storage:** S3-compatible (R2 / MinIO / S3 — see §4)
- **Migrations:** Prisma Migrate; one migration per change-set; no auto-migrate in prod
- **Cache (optional v1.1):** Redis for polling-cursor throttling + per-city config hot reads

### Rationale
- PostgreSQL is the boring-correct choice for the shape of this data: hierarchical per-city config + ticket entities + audit log + per-user preferences
- Prisma's generated types remove a class of TypeScript errors at the data-layer boundary
- R2 / MinIO / S3 all speak S3; choose at deploy time, not now

### Rejected alternatives
- **SQLite** — works for dev, but multi-tenant per-city data + concurrent writes from multiple cities needs Postgres
- **MongoDB** — the data is highly relational; Mongo would force denormalization that hurts auditing
- **Drizzle instead of Prisma** — both viable; chose Prisma for the type-generation ergonomics and migration tooling
- **Hand-written SQL via `pg`** — too much boilerplate for the surface area

### Deferred
- **Redis** — v1.1 unless polling load justifies it
- **Read replicas** — only after traffic justifies
- **Multi-region** — single-region v1 (matches lean-ops)

---

## 6. Testing

### Decision: extend the existing Playwright setup; per-page spec tests + visual-regression via the existing `compare.ts` helper

- **Unit:** Vitest (TypeScript-native, fast; not yet pinned in `package.json` — add when first unit test is written)
- **Visual regression:** existing `tests/01-mockups.spec.ts` + `tests/helpers/compare.ts` — extend by adding `tests/02-routes.spec.ts` etc., one per WO, calling `compareMockupVsBuild({ name, mockupPath, buildUrl, viewport })` for each built route
- **E2E:** Playwright's `@playwright/test` covers it (already pinned)
- **Visual baseline refresh:** `npm run test:update-baselines` (already in `package.json`)
- **Build phase Playwright config:** set `use.baseURL` to the running web tier; add a `webServer` block that boots Next.js dev / production server before tests

### Rationale
- Existing `tests/helpers/compare.ts` already has the `compareMockupVsBuild({ mockupPath, buildUrl, viewport })` shape ready for the build phase — when Mimir wires a route, it adds a `buildUrl` and the helper diffs the built page against the committed mockup baseline
- Extending the existing setup (rather than introducing a second testing framework) keeps the surface area small
- Visual regression is the highest-leverage test type given how much of the spec is visual

### Rejected
- **Cypress** — redundant with Playwright
- **Storybook** — useful but not required; the `components.html` mockup gallery already serves the visual-reference role

### Deferred
- **Visual regression for non-mockup pages (3.4, 3.5)** — these don't have committed baselines yet; Mimir adds baselines during build per WO-003 "Tests" section