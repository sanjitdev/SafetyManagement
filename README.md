# CityFix

> **Citizen-powered city issue reporting and tracking.**
> People report broken streetlights, potholes, garbage, waterlogging,
> and open drains with photos and location. The system routes reports
> to the responsible authority, detects duplicate complaints, tracks
> resolution status, and lets citizens see whether and when the issue
> was fixed.

The repository folder is named `SafetyManagement`; the product name is
**CityFix** (see [`docs/idea.md`](docs/idea.md) for the canonical problem
statement). The brand line is a civic-platform promise: *"Make silence
unmaintainable."*

CityFix is a four-role, web-first civic platform built on **Next.js 14
(App Router) + TypeScript strict + Prisma + PostgreSQL 16** with
**MapLibre GL JS** maps and a **Bangla-first / English-secondary**
i18n surface. v1 ships **33 spec'd screens across 4 UX scenarios**, a
platform layer with audit, dedup, transitions, push, and rate-limit
subsystems, and a Playwright + Vitest test suite that gates every
merge.

---

## Table of contents

1. [The problem](#the-problem)
2. [The idea](#the-idea)
3. [The psychological insight](#the-psychological-insight)
4. [Personas](#personas)
5. [What v1 ships](#what-v1-ships)
6. [The four UX scenarios](#the-four-ux-scenarios)
7. [Screenshots](#screenshots)
8. [Tech stack](#tech-stack)
9. [Architecture](#architecture)
10. [Local development](#local-development)
11. [Testing posture](#testing-posture)
12. [Project layout](#project-layout)
13. [Mandated + Forbidden rules](#mandated--forbidden-rules)
14. [Construction loop](#construction-loop)
15. [Shipped state](#shipped-state)
16. [License](#license)

---

## The problem

> In large cities, people regularly encounter broken streetlights,
> potholes, open drains, overflowing garbage, damaged roads,
> waterlogging, and other public infrastructure problems. However,
> there is often no simple, centralized way to report these issues,
> track their progress, or know whether they have actually been
> resolved.
>
> Reports are scattered across phone calls, social media, messaging
> apps, and different government channels. This makes it difficult for
> citizens to know where to report a problem, who is responsible, and
> when it will be fixed.

— *Source: [`docs/idea.md`](docs/idea.md) (2026-09-18)*

## The idea

> CityFix would provide a single platform where citizens can report
> city problems with photos and locations, while authorities can verify,
> prioritize, assign, and track them through to resolution.

CityFix turns the scattered flow of *report → forward → forget* into a
structured, observable pipeline where every submitted report produces
a **status trail** (`Submitted → Routed → In progress → Resolved`),
a **dedup decision** (50 m default radius), and an **audit log** that
both the citizen and the city corporation can read.

## The psychological insight

> **Civic observability is the visibility layer that makes silence
> unmaintainable; trust signals (status trail, push, feel-heard
> feedback) are how observability translates into restored trust.**

— *Source: `aidlc/spaces/default/memory/project.md` → WO-001 intent
framing (2026-10-04)*

The headline finding from the trigger-map workshop is that
CityFix's make-or-break constraint is not citizen acquisition — it
is whether the city corporation's silence becomes visible. Rahim
the Reporter (Persona 02) has a top positive force on a 14-point
scale: **"Feel heard enough to keep hoping"** (FIA 14). The
platform is the proof that his voice lands somewhere; if the status
trail is fast and visible, he returns; if the system is silent, he
reverts to cynicism immediately.

Habib the Handler (Persona 03) carries the matching burden inside
the city corporation — his top negative force is **"Stop being the
place where citizen reports go to die"** (FIA 14). The platform
shrinks his paper-and-phone chaos into a structured queue with an
audit trail he can point to when his supervisor asks *what
happened to this report?*

Both halves of the trust loop must ship in v1. Neither substitutes
for the other.

---

## Personas

CityFix is built around four personas identified during the trigger
map workshops (see `design-artifacts/B-Trigger-Map/` for the full
FIA-scored profiles).

### Rahim — the Reporter *(priority 02, primary citizen)*

> *An office employee in Dhaka, in his late 20s or 30s, who
> commutes the same roads every weekday and lives with his family
> in a neighborhood he knows intimately.*

| | |
|---|---|
| **Role** | Citizen (registered) |
| **Problem** | "I've tried reporting through the system before. The experience was so slow and unproductive that I gave up." |
| **Driving force** | "Feel heard enough to keep hoping" (FIA 14) |
| **Surface** | Mobile web app — Home / City Activity map, 6-step report flow, My Reports detail, push notification |
| **Surface files** | `app/home/`, `app/report/*`, `app/reports/`, `app/reports/[id]/`, `app/feed/` |

### Habib — the Handler *(priority 03, authority dispatcher)*

> *A mid-level desk officer at a Dhaka city corporation ward office,
> handling incoming citizen complaints. He supervises a small team
> that maintains paper registers and forwards complaints to field
> crews.*

| | |
|---|---|
| **Role** | Authority dispatcher (scoped to `(city, ward, department)`) |
| **Problem** | "The paper trail stops at my desk. When a citizen calls back, I often have no good answer." |
| **Driving force** | "See citizen issues actually resolved" (FIA 14) |
| **Surface** | Desktop web app — Daily Queue Dashboard (3-region filter / list / detail), Ticket Detail, Assign-to-Crew, Ward Performance Snapshot |
| **Surface files** | `app/dispatcher/`, `app/dispatcher/tickets/[id]/`, `app/dispatcher/dedup/`, `app/dispatcher/map/` |

### Rashid — the Resolver *(priority 04, field crew)*

> *A field crew member for a Dhaka city corporation. He has practical,
> hands-on expertise — he knows how to fix the thing, even if he
> doesn't always know the formal procedure for reporting it.*

| | |
|---|---|
| **Role** | Field crew (scoped to `(city, ward, department)`) |
| **Problem** | "I've filled out paper job sheets that no one ever reads. I have had supervisors who insisted on documentation that added nothing to my day." |
| **Driving force** | "Get the next job with all the right information" (FIA 15) |
| **Surface** | PWA, mobile-first, outdoor-readable (`.theme-outdoor` for in-progress) — Field App Home, Assignment Detail, In Progress, Before/After Capture, Mark Resolved |
| **Surface files** | `app/crew/`, `app/crew/tickets/[id]/` |

### Aamir — the Administrator *(priority 05, administrative)*

> *A senior officer at a city corporation — likely an IT or systems
> lead — designated to set up and operate the platform for his city.*

| | |
|---|---|
| **Role** | Administrator (WebAuthn-mandatory for all city writes) |
| **Problem** | "Every configuration choice should be discoverable, documented, and reversible. I do not trust magic." |
| **Driving force** | "Land the platform cleanly in his city" (FIA 15) |
| **Surface** | Desktop web app — Cities Overview, City Setup, Departments & Categories, Wards & Boundaries, User Provisioning, Post-Launch Adoption Dashboard, Audit Log |
| **Surface files** | `app/admin/`, `app/admin/cities/`, `app/admin/cities/[id]/`, `app/admin/audit/` |

---

## What v1 ships

- **4 UX scenarios** → **33 spec'd screens** (spec-as-contract pattern;
  see `design-artifacts/C-UX-Scenarios/00-ux-scenarios.md`).
- **28 user-facing routes** under `app/` (citizen / dispatcher /
  crew / admin).
- **40 API route handlers** under `app/api/` covering registration,
  OTP, session, tickets, transitions, dedup, push, dispatcher queue,
  crew assignments, admin CRUD, and audit.
- **13 Prisma models** under `prisma/schema.prisma` (City, Ward,
  Department, Category, User, OtpCode, WebAuthnChallenge, Session,
  PushSubscription, Ticket, TicketTrailEntry, AuditEntry, ...).
- **9 platform subsystems** under `lib/platform/`, `lib/auth/`, and
  `lib/serializers/` (audit, dedup, transitions, push, rate-limit,
  OTP, session, guards, serializer boundary).
- **Bilingual surface** (Bangla-first, English-secondary) via a
  typed key registry at `lib/i18n/keys.ts`.
- **7 hero visual mockups** (HTML + Tailwind + `tokens.css`) under
  `design-artifacts/D-Design-System/01-Visual-Design/mockups/`.

## The four UX scenarios

The scenario files at `design-artifacts/C-UX-Scenarios/` are the
spec-as-contract artifacts Mimir builds against. The user explicitly
skipped wireframes in favour of a *specs → mockups → Playwright
baselines → build* pipeline.

| # | Scenario | Archetype | Screens | Entry |
|---:|---|---|---:|---|
| 1 | Rahim reports a broken streetlight | Rahim the Reporter (citizen) | 14 | Installs app after seeing it on Facebook; spots broken streetlight on evening commute |
| 2 | Habib runs his ward's morning queue | Habib the Handler (dispatcher) | 7 | Opens admin console at shift start on desktop/tablet |
| 3 | Rashid fixes his first job of the day | Rashid the Resolver (field crew) | 5 | Opens PWA on phone, push notification for new assignment |
| 4 | Aamir sets up Chattogram | Aamir the Administrator (admin) | 7 | Opens Admin Console to onboard city #2 |

### Scenario 1 — Rahim reports a broken streetlight (14 screens)

App Open / Splash → Welcome (first run) → Registration (phone + NID +
password) → Verification (OTP) → Login (returning) → **Home / City
Activity** (map + side panel) → Report: Location Confirm → Report:
Photo Capture (1-3 photos) → Report: Category Pick → Report: Note
(optional) → **Report Submitted** (4-step status trail) → **My
Reports Detail** (before/after photos) → City Activity Feed →
Resolution Notification (push).

**Running it:** see [`docs/running.md`](docs/running.md) for the
full quickstart (in-memory dev store, no Postgres required) plus
production-mode setup, available scripts, dev-login shortcut, API
surface, and troubleshooting.

### Scenario 2 — Habib runs his ward's morning queue (7 screens)

Login (web) → **Daily Queue Dashboard** (3-region filter / list /
detail) → Ticket Detail → Assign to Crew (modal) → Monitor Updates
(live feed, 10-30s polling) → Resolve Confirmation → Ward
Performance Snapshot (end of shift).

### Scenario 3 — Rashid fixes his first job of the day (5 screens)

**Field App Home** (My Assignments + one-shot location refresh) →
Assignment Detail → **Status: In Progress** (full-bleed
`.theme-outdoor` high-contrast theme) → Resolve: Before/After
Capture (1-3 photos) → Confirmation: Mark Resolved.

### Scenario 4 — Aamir sets up Chattogram (7 screens)

Admin Console Login (WebAuthn) → **Cities Overview** → City Setup
(Basic Info) → Departments & Categories → Wards & Boundaries
(GeoJSON editor) → User Provisioning → Post-Launch Adoption
Dashboard.

---

## Screenshots

The Playwright mockup baselines under
`tests-mockups/baselines/01-mockups.spec.ts/` are the committed
visual source-of-truth (gating in CI, tolerance 0.005). Six
foundational mockups are embedded below for first-time readers.

### Welcome — first-run brand entry

![Welcome — first-run brand entry](tests-mockups/baselines/01-mockups.spec.ts/01-welcome-1440x900.png)

*Two-column web hero (brand + tagline + CTA left, abstract city map
right). Collapses to single column at medium viewport. Bangla-first,
English-secondary toggleable in the top-right.*

### Home / City Activity — Rahim's hub

![Home / City Activity — Rahim's hub](tests-mockups/baselines/01-mockups.spec.ts/02-home-city-activity-1440x900.png)

*Persistent MapLibre + OpenStreetMap canvas centered on the citizen's
city, rendering every in-scope ticket as a circle pin coloured by
status. Side panel lists the activity feed; top-bar Report CTA opens
the 6-step submission flow.*

### Report Submitted — confirmation with status trail

![Report Submitted — confirmation with status trail](tests-mockups/baselines/01-mockups.spec.ts/03-report-submitted-1440x900.png)

*Centered 640px card on neutral background. 4-step status trail
(`Submitted → Routed → In progress → Resolved`), ticket ID, and a
sticky pair of CTAs. This is the "I was heard" moment — the trust
loop is closed with proof, not just a thank-you.*

### My Reports Detail — before / after photos

![My Reports Detail — before / after photos](tests-mockups/baselines/01-mockups.spec.ts/04-my-reports-detail-1440x900.png)

*Two-column gallery + metadata. Citizen photo(s) at the top, status
trail on the left, metadata + feel-heard feedback prompt on the
right. Stacks to single column at medium.*

### Daily Queue Dashboard — Habib's three-region layout

![Daily Queue Dashboard — Habib's three-region layout](tests-mockups/baselines/01-mockups.spec.ts/05-daily-queue-dashboard-1440x900.png)

*Filter rail (left) / ticket list (centre) / ticket detail (right)
at 1440 × 900. Collapsible filter rail on smaller laptops. The
audit trail + transition controls live in the right pane.*

### Status: In Progress — Rashid's outdoor high-contrast theme

![Status: In Progress — Rashid's outdoor high-contrast theme](tests-mockups/baselines/01-mockups.spec.ts/07-status-in-progress-1440x900.png)

*Full-bleed `.theme-outdoor` — near-white background, pure-black
text, no greys. Designed for direct-sunlight readability on LCD
and OLED. Auto-switches by ambient-light sensor if available.
Top strip + hero block + step log + progress note composer + primary
"Fixed — take photo" CTA.*

---

## Tech stack

### Production dependencies (`package.json → dependencies`)

| Package | Version | Purpose |
|---|---|---|
| `next` | `^14.2.18` | Framework — App Router + Server Actions |
| `react` | `^18.3.1` | UI runtime |
| `react-dom` | `^18.3.1` | UI runtime (server + browser) |
| `@prisma/client` | `^5.22.0` | ORM + type generation |
| `@node-rs/argon2` | `^2.0.2` | Argon2id password hashing (OWASP 2024 params) |
| `otpauth` | `^9.0.0` | TOTP secret / code generation for citizen SMS-OTP |
| `@simplewebauthn/server` | `^10.0.0` | Admin WebAuthn registration + assertion (server) |
| `@simplewebauthn/browser` | `^10.0.0` | Admin WebAuthn registration + assertion (browser) |
| `maplibre-gl` | `^4.7.1` | Map canvas for citizen / dispatcher / crew surfaces |
| `twilio` | `^4.23.0` | SMS provider (production path; stub in dev) |
| `zod` | `^3.23.8` | Schema validation at every external API boundary |

### Dev dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.6.0` | TypeScript strict compiler |
| `prisma` | `^5.22.0` | Prisma CLI |
| `tailwindcss` | `^3.4.15` | Utility CSS (token-anchored theme) |
| `autoprefixer` | `^10.4.20` | PostCSS plugin |
| `postcss` | `^8.4.49` | CSS pipeline |
| `cross-env` | `^10.1.0` | Set `CITYFIX_DEV_STORE=1` on `dev:feat` |
| `vitest` | `^2.1.5` | Unit test runner |
| `@playwright/test` | `^1.63.0` | Visual baselines + per-WO route specs |

### Runtime

- **Node.js 20 LTS** (per `package.json → engines`).

### Pinned architecture decisions (`aidlc/spaces/default/memory/project.md`)

- **Framework**: Next.js 14 (App Router) + TypeScript strict +
  Tailwind v3 + `tokens.css` (design-token source of truth).
- **Map**: MapLibre GL JS + OpenStreetMap raster tiles (dev/demo);
  Mapbox tiles in prod if load justifies. GeoJSON ward polygons
  from the city config endpoint.
- **Push**: Web Push API (VAPID) for v1; service-worker delivery.
  FCM / APNs deferred.
- **Auth**: HTTP-only signed session cookies; four-role model
  (`citizen / dispatcher / crew / admin`); citizen phone + NID +
  password + SMS-OTP; admin WebAuthn mandatory for writes.
- **Data**: PostgreSQL 16 + Prisma (TypeScript types, migrations).
  R2 / MinIO / S3 for blobs. Redis deferred to v1.1.
- **i18n**: Bangla-first, English-secondary; typed key registry at
  `lib/i18n/keys.ts`.

---

## Architecture

CityFix is a **single full-stack Next.js repo**. No separate backend
in v1. The platform layer (`lib/platform/`, `lib/auth/`,
`lib/serializers/`, `lib/db.ts`) is consumed by every page and API
route.

### The four-role model

Decided in Inception (2026-09-18) and pinned in
`aidlc/spaces/default/memory/project.md → Decided`. The four roles
are:

| Role | Surface | Auth | Scope |
|---|---|---|---|
| `citizen` | Mobile web app | Phone + NID + password + SMS-OTP | Own reports + city activity feed |
| `dispatcher` | Desktop web app | Password + OTP (per-city) | `(city, ward, department)` queue |
| `crew` | PWA (mobile-first) | Persistent session | `(city, ward, department)` assignments |
| `admin` | Desktop web app | Password + **WebAuthn mandatory for writes** | Cross-city configuration + audit |

### Platform subsystem table

| Subsystem | Module | PLAT-REQ |
|---|---|---|
| **Audit log** | `lib/platform/audit.ts` (`writeAudit(...)` with before / after JSON) | PLAT-REQ-007 |
| **Dedup** | `lib/platform/dedup.ts` (haversine + bounding-box pre-filter, 50 m default, reads `city.dedupRadiusMeters`) | PLAT-REQ-004 |
| **Rate limit** | `lib/platform/rate-limit.ts` (in-process token bucket, 1 req/sec default) | PLAT-REQ-008 |
| **Transitions** | `lib/platform/transitions.ts` (atomic update + trail + audit; `InvalidTransitionError`) | PLAT-REQ-005 |
| **Push** | `lib/platform/push.ts` (`subscribeUser`, `unsubscribeUser`, `fanOutForTicket`, `sendTicketPush`; wire-call deferred to v1.1) | PLAT-REQ-006 |
| **OTP** | `lib/auth/otp-provider/{types,stub,twilio,index}.ts` (provider abstraction, swappable per env) | PLAT-REQ-002 |
| **Session** | `lib/auth/session.ts` (HTTP-only signed cookies, HMAC-SHA256, 14-day TTL) | PLAT-REQ-002 |
| **Guards** | `lib/auth/guards.ts` (`requireRole`, `requireSameCity`, `requireScope`, `requireWebauthn` + `ApiError`) | PLAT-REQ-002 |
| **Serializer** | `lib/serializers/ticket.ts` (citizen-facing hides `assignedCrewId`, `internalNote`; maps `actorId` → "সিটি কর্পোরেশন"/"City corporation") | PLAT-REQ-001 |

### API surface

40 route handlers under `app/api/`, organised by role:

- **Citizen**: `v1/auth/{register,login,verify-otp,send-otp}`, `tickets`
  (POST create with dedup), `tickets/[id]` (GET with rate limit + scope),
  `tickets/[id]/transition` (POST role-scoped), `tickets/[id]/photos/[idx]`
  (DELETE), `v1/activity` (GET city feed), `v1/push/subscribe`
  (POST/DELETE).
- **Dispatcher**: `v1/dispatcher/queue` (GET), `v1/dispatcher/tickets/[id]`
  (GET), `v1/dispatcher/tickets/[id]/transition` (POST),
  `v1/dispatcher/dedup-flags` (GET), `v1/dispatcher/dedup-flags/[id]/{confirm,dismiss}`,
  `v1/dispatcher/map/tickets` (GET — powers the dispatcher map).
- **Crew**: `v1/crew/tickets` (GET), `v1/crew/tickets/[id]` (GET),
  `v1/crew/tickets/[id]/transition` (POST), `v1/crew/tickets/[id]/photos` (POST).
- **Admin**: `v1/admin/cities` (CRUD), `v1/admin/cities/[id]/{categories,departments,wards}` (CRUD),
  `v1/admin/audit` (GET with filters).
- **WebAuthn**: `auth/webauthn/{register,assertion,revoke,login}`.
- **Dev (non-prod only)**: `dev/login` (role-shorted session bootstrap),
  `dev/reset` (reset in-memory dev store).

### Data model

13 Prisma models under `prisma/schema.prisma`:

- `City` — top-level tenant; owns `dedupRadiusMeters`, `defaultLocale`.
- `Ward` — belongs to `City`; carries `polygonGeoJson` (GeoJSON for map overlay).
- `Department` — routing target; belongs to `City`.
- `Category` — belongs to `Department`; citizen-facing issue class.
- `User` — `role` enum (`citizen / dispatcher / crew / admin`),
  scoped to `(city, ward, department)`.
- `OtpCode` — 6-digit, 5-min TTL, argon2-hashed.
- `WebAuthnChallenge` — server-side challenge store for admin.
- `Session` — server-side record (HTTP-only signed cookie carries the
  session id; 14-day TTL).
- `PushSubscription` — Web Push (VAPID) endpoint per user.
- `Ticket` — the citizen report; `status` enum (`submitted / routed
  / in_progress / resolved / closed / cancelled`); location lat / lng;
  before-photo refs; `dedupDeclinedAt` flag.
- `TicketTrailEntry` — append-only status trail.
- `AuditEntry` — append-only audit log; powers `admin/audit`.

### Serializer boundary

Citizen-facing responses always flow through
`lib/serializers/ticket.ts`. Internal fields (`assignedCrewId`,
`internalNote`) are stripped, and `actorId` values are mapped to
human-readable labels ("সিটি কর্পোরেশন" / "City corporation"). The
serializer is the single chokepoint — no citizen-facing API route
returns a raw Prisma result.

---

## Local development

### Quickstart

```sh
# 1. Install dependencies (Node 20 LTS required)
npm install

# 2. Generate the Prisma client
npm run db:generate

# 3. Start the dev server with the in-memory dev store
#    (no Postgres required; resets on restart)
npm run dev:feat
#    → open http://localhost:3000

# 4. Sanity checks
npm run typecheck      # tsc --noEmit (must be clean)
npm run test:unit      # vitest
npm run test:mockups   # Playwright visual baselines
```

### Dev login shortcut (no real OTP required)

In `dev:feat` mode, `GET /api/dev/login?role={citizen|dispatcher|crew|admin}`
boots a session for a seeded user. Useful for Playwright and for
clicking through the four personas without SMS-OTP:

```
GET /api/dev/login?role=citizen
GET /api/dev/login?role=dispatcher
GET /api/dev/login?role=crew
GET /api/dev/login?role=admin
```

`GET /api/dev/reset` wipes the in-memory store and reseeds the Dhaka
template (one city, 10 wards, 3 departments, 6 categories, one user
per role).

### Construction Verification Command

The recorded end-to-end verification, per
`aidlc/spaces/default/memory/project.md → Walking Skeleton`:

```sh
npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/
```

This is the canonical pre-Bolt / pre-PR gate.

### Production-mode (Postgres)

For a real run against Postgres:

```sh
# Set DATABASE_URL in .env (or .env.local — both .gitignored)
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/cityfix"' >> .env

# Apply schema (migrations author deferred to v1.1; v1 ships `db push`)
npm run db:push

# Seed the Dhaka template
npm run db:seed

# Start in production mode
npm run build && npm run start
```

**Hosting target: Vercel (Hobby); production URL
`https://cityfix-bd.vercel.app` (Vercel + Neon Postgres, auto-deploy
on push to `main`).** Full deploy record:
`_progress/operations/cityfix-deployment.md` (URLs, env vars, build
SHAs) + `_progress/operations/vercel-neon-deploy-runbook.md` (the
reproducible how-to). The build output also runs on Cloudflare
Workers (`@cloudflare/next-on-pages`), Railway, or any Node 20 host,
but the production target is Vercel as of v1 launch (2026-10-12).

---

## Testing posture

The project's testing posture is **test-after** (affirmed in
`aidlc/spaces/default/memory/team.md → Testing Posture`) with an
**80% line-coverage floor** on `mvp / enterprise / feature / infra /
classic` scopes (inherited from `aidlc/spaces/default/memory/org.md
→ Testing Posture`).

### Live counts (last verified 2026-10-12)

- **23 unit-test files** under `tests/unit/`
- **249 unit tests passing** (`npm run test:unit`)
- **15 visual mockup baselines** under
  `tests-mockups/baselines/01-mockups.spec.ts/` (committed as PNG
  pixel-exact references; visual regression is **gating**)
- **19 route specs** under `tests/` (one per Work Order Bolt; some
  re-baselined mid-Bolt as the surfaces evolved)

### Visual regression

Playwright baselines are **gating** in this team. Every new mockup
adds a baseline; every baseline is updated with
`npm run test:update-baselines` and reviewed as part of the PR.
Tolerance is **0.005** (per `team.md`).

### Commands

| Command | What it runs |
|---|---|
| `npm run typecheck` | `tsc --noEmit` — TypeScript strict compile check |
| `npm run test:unit` | Vitest run — all `tests/unit/**.test.ts` |
| `npm run test:mockups` | Playwright run on `tests/01-mockups.spec.ts` — visual baselines |
| `npm run test:update-baselines` | Same as above with `--update-snapshots` (review the diff before commit) |
| `npm run test` | Full Playwright suite (mockups + 19 route specs) |
| `npm run test:report` | Opens the last Playwright HTML report |

---

## Project layout

```
.
├── app/                      # Next.js 14 App Router (citizen / dispatcher / crew / admin)
│   ├── home/                 # Rahim — Home / City Activity
│   ├── report/               # Rahim — 6-step report flow
│   ├── reports/              # Rahim — My Reports list + detail
│   ├── feed/                 # Rahim — City activity feed
│   ├── dispatcher/           # Habib — Daily queue, ticket detail, dedup, map
│   ├── crew/                 # Rashid — Assignments, in-progress, resolve
│   ├── admin/                # Aamir — Cities, taxonomy, wards, audit
│   └── api/                  # 40 API route handlers (v1/{auth,dispatcher,crew,admin,push})
├── components/               # Shared React components (CityActivityMap, MapView, etc.)
├── lib/                      # Service layer + serializers + i18n + auth guards + db switch
│   ├── platform/             # audit, dedup, transitions, push, rate-limit
│   ├── auth/                 # password, otp, session, guards, otp-provider/
│   ├── serializers/          # ticket (citizen-facing field stripping)
│   ├── i18n/                 # keys.ts (typed key registry) + t()
│   └── db.ts                 # Prisma singleton (HMR-safe)
├── prisma/                   # Production schema + seed (Dhaka template)
├── tests/                    # Playwright route specs (one per WO Bolt)
│   └── unit/                 # Vitest unit tests (23 files, 249 tests)
├── tests-mockups/baselines/  # Playwright visual baselines (gating, tolerance 0.005)
├── design-artifacts/         # WDS product brief, trigger map, UX scenarios, design system, PRDs
│   ├── A-Product-Brief/      # product-brief.md, content-language.md
│   ├── B-Trigger-Map/        # 4 personas + feature-impact.md (FIA scoring)
│   ├── C-UX-Scenarios/       # 4 scenarios × 33 spec'd screens (spec-as-contract)
│   ├── D-Design-System/      # tokens.css, components.html, mockups/01-07
│   └── E-Development/        # 5 Work Orders + 000-tech-audit.md + 000-PRD.md
├── _progress/                # 00-design-log.md — the project's progress record
├── aidlc/                    # AI-DLC memory bank (intents, units, stories, bolts)
│   └── spaces/default/memory/ # org.md, team.md, project.md, phase rules
├── docs/                     # idea.md (canonical problem statement) + running.md (run guide)
├── AGENTS.md                 # WDS / agent skill setup for this project
└── README.md                 # ← you are here
```

---

## Mandated + Forbidden rules

The team's top rules for new contributors, condensed from
`aidlc/spaces/default/memory/team.md` and
`aidlc/spaces/default/memory/project.md`. Read both files in full
before opening your first PR.

### Mandated

- **ALWAYS** run `npx tsc --noEmit` before declaring a Bolt complete.
- **ALWAYS** run `npm run test:unit` after editing any file under `lib/`.
- **ALWAYS** run `npm run test:mockups` after editing any mockup HTML
  or `tokens.css`.
- **ALWAYS** write audit log entries via `writeAudit(...)` from
  `lib/platform/audit.ts` for any state-changing operation.
- **ALWAYS** use the platform serializer
  `lib/serializers/ticket.ts` when exposing tickets to citizens —
  internal fields must be stripped.
- **ALWAYS** localize user-facing copy through `lib/i18n/keys.ts`;
  `t(key, vars)` is the only way to surface user copy.
- **ALWAYS** commit Bolt work with the Bolt slug as the commit
  message; preserve Bolt history on the source branch.

### Forbidden

- **NEVER** throw exceptions across service-layer boundaries — return
  `Result` types or use the established `ApiError` class from
  `lib/auth/guards.ts`.
- **NEVER** use raw SQL or Prisma client from app routes — always go
  through service functions in `lib/`.
- **NEVER** hard-code user-facing copy in components — always go
  through `t(...)` from `lib/i18n/keys.ts`.
- **NEVER** merge Bolts with failing visual regression tests —
  Playwright baselines are gating.
- **NEVER** edit `aidlc-state.md` directly — only the engine's
  state-transition hooks write state.
- **NEVER** change the four-role model, WebAuthn-mandatory-for-admin,
  or dedup-not-merge without re-running UX Review + Work Order
  revision.
- **NEVER** delete the `aidlc/spaces/default/knowledge/documentkb/`
  tree — identity and tombstones are gone forever.

---

## Construction loop

CityFix is built via the **AI-DLC Construction loop**. Each unit
ships as one **Bolt** — a single commit on `prd-development`
(the project's trunk branch — note: the project's trunk is
`prd-development`, not the org-default `main`; see
`aidlc/spaces/default/memory/team.md → Way of Working`) named by the
Bolt slug.

```
intents (one per Work Order)
  └─ units (the slice of the WO being built)
       └─ bolts (the atomic commits — one bolt = one commit)
            └─ design-log entry (one line per bolt in
               _progress/00-design-log.md)
```

The design log at **`_progress/00-design-log.md`** is the project's
single source of truth for progress outside `aidlc-state.md`. Every
Bolt gets one entry. The `aidlc/` memory bank holds the
intents / units / bolts / audit / artifacts.

`AGENTS.md` carries the full agent setup; this README is the project
entry point for human readers.

---

## Shipped state

**Live in production on `https://cityfix-bd.vercel.app`** (Vercel
+ Neon Postgres, auto-deploy on push to `main`).
All 5 AIDLC intents are `complete`:
- 001 Platform Foundation (WO-000)
- 002 Citizen Report Flow (WO-001 — Rahim)
- 003 Dispatcher Queue (WO-002 — Habib)
- 004 Field Crew App (WO-003 — Rashid)
- 005 Admin City Setup (WO-004)

The most recent commits on `main` (per the AIDLC memory-bank
maintenance log):

| Commit | Title | What shipped |
|---|---|---|
| `7d14742` | `fix(v1-readiness): Prisma implementation of getTicketWithTrail` | Critical v1 launch fix — read-side ticket endpoints (activity, dispatcher queue, crew list, dedup-flags) now work in production. `getTicketWithTrail` was dev-store-only; now backed by a Prisma query against `Ticket` + `TicketTrailEntry` + `Category.departmentId`. |
| `1e69589` | `docs: log OTP fix (commit 11459db) in design log + deployment record` | Doc sync for the OTP dev_code fix. |
| `11459db` | `fix(otp): surface dev_code in send-otp response while OTP_PROVIDER=stub` | Citizens can now see the 6-digit code on `/verify-otp` (yellow "Dev code" hint box). The page's existing wiring reads `data.dev_code` from the response; the route was stripping it in prod. |
| `e88562f` | `docs: capture alias-vs-domain gotcha + live URL verification` | `_progress/operations/vercel-domain-vs-alias.md` — the `vercel alias` vs tracked project domain distinction (this is the gotcha behind the `cityfix-bd` URL conversion). |
| `9501f07` | `docs: add commit table entries + verification log for URL switch` | Build artifacts table + verification log for the URL switch. |
| `d809fe5` | `chore: switch primary production URL to cityfix-bd.vercel.app` | Aliased current build to `cityfix-bd.vercel.app`; WebAuthn env vars rotated to match. |
| `fcbb88c` | `docs: log auto-deploy verification + WebAuthn env var rotation` | Auto-deploy end-to-end test green; deploy docs updated. |
| `ff8dde3` | `fix: correct production URL in deploy docs` | WebAuthn env var rotation to `cityfix-theta.vercel.app`; doc URL fixes. |
| `f540124` | `chore: add initial Prisma migration + seed fix + tsx dep` | Initial migration, seed syntax fix, tsx in devDeps. |
| `9067ddb` | `fix: unblock Vercel production build` | Lazy WebAuthn guard, useSearchParams → window.location.search. |
| `16f7e03` | `chore: harden for Vercel production deploy` | Phase A: WebAuthn guard, HSTS/CSP headers, env example, build script. |

The AIDLC v1 launch readiness decision (2026-10-12) is
captured in
`_progress/operations/cityfix-deployment.md` (search
"v1 launch readiness"). The 5 known v1.1 follow-ups
(Twilio real SMS, VAPID push, custom domain, GH Actions
CI, CSV audit export) are explicitly deferred — none
blocks v1 launch.

Earlier Bolts (WO-001 Rahim's full 14-screen flow, WO-002
Habib's queue + dedup + map, the platform layer, the web
re-skin, the walking-skeleton scaffold) live in the design
log under `_progress/00-design-log.md`.

---

## License

Private project; all rights reserved.

### Footnotes

- Canonical problem statement: [`docs/idea.md`](docs/idea.md)
- How to run the project: [`docs/running.md`](docs/running.md)
- Canonical persona profiles: `design-artifacts/B-Trigger-Map/0{2,3,4,5}-persona-*.md`
- Canonical scenario specs: `design-artifacts/C-UX-Scenarios/00-ux-scenarios.md`
- Canonical design tokens: `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
- Canonical Work Orders: `design-artifacts/E-Development/WO-000..004-*.md`
- Canonical project memory: `aidlc/spaces/default/memory/{org,team,project}.md`
- Per-Bolt progress: `_progress/00-design-log.md`
- Agent setup: `AGENTS.md`
