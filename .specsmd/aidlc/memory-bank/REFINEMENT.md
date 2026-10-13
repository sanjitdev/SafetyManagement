---
standard: codebase-refinement
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Codebase Refinement

A diff-style audit of the existing CityFix codebase against
the specsmd memory-bank captured in this folder. This is the
bridge between the BMAD-built code and the specsmd
intent/story/bolt structure that the Construction Agent will
work from.

The goal is **not** to rewrite or refactor — it is to (a)
acknowledge what is already working, (b) capture explicit
gaps / deviations / known limitations, and (c) feed that
context into `bolts/plan.md` so the Construction Agent knows
where each story actually stands before it picks it up.

## Matrix: story × code reality

### Intent 001 — Platform Foundation (all `done`)

| Story | Status | Reality |
|-------|--------|---------|
| 001-city-config-models | done | `prisma/schema.prisma` defines City / Ward / Department / Category with polygon GeoJSON; prisma migrate + seed ran clean. |
| 010-backend-facade | done | `lib/db-switch.ts` exposes a `db.*` facade that toggles between `devDb` (in-memory) and `prismaClient` via `CITYFIX_DEV_STORE`. Used by every API route. |
| 002-user-otp-session | done | `lib/auth/{password,otp,session,guards}.ts` — argon2id password + OTP hash; HMAC-SHA256 signed session cookies; 14-day TTL. |
| 003-per-role-guards | done | `requireRole`, `requireSameCity`, `requireScope` in `lib/auth/guards.ts`. `requireSameWard` / `requireSameDepartment` are pending — see gaps below. |
| 004-citizen-serializer | done | `lib/serializers/ticket.ts` strips `assignedCrewId` and `internalNote` for citizens; anonymises dispatcher/crew actor label to "City corporation" / "সিটি কর্পোরেশন". |
| 005-audit-log | done | `lib/platform/audit.ts` writes structured audit entries; called from `app/api/tickets/route.ts` (dedup-detected, ticket creation). |
| 006-rate-limit | done | `lib/platform/rate-limit.ts` — in-process token bucket; used on `GET /api/tickets/:id`. |
| 007-dedup-prefilter | done | `lib/platform/dedup.ts` — Haversine + bounding-box pre-filter + city scope; Open statuses only. |
| 008-status-transitions | done | `lib/platform/transitions.ts` — strict state machine (`submitted → routed/cancelled → in_progress/cancelled → resolved/cancelled`); terminal states. |
| 009-push-scaffold | done | `lib/platform/push.ts` + `prisma/schema.prisma:200-213` `PushSubscription` model; subscription row + helpers. VAPID keys are stubbed (dev sends no-op). |
| 011-first-five-endpoints | done | All 5 API endpoints exist under `app/api/{tickets,dev}/*` + `app/api/auth/status/*` + `app/api/report/bootstrap/*`. Verified via curl in tests. |

### Intent 002 — Citizen Report Flow (`in-progress` per story)

| Story | Status | Reality | Notes |
|-------|--------|---------|-------|
| 001-splash-welcome | in-progress | `app/splash/page.tsx` + `app/welcome/page.tsx` exist; both run the first-run gate via `localStorage.cityfix.welcome_seen.v1`. Two-column welcome hero matches mockup 01. | Splash's `bundle-failed` retry has no Playwright baseline yet. |
| 002-registration-otp | in-progress | `app/register/page.tsx` (5 fields, validation on blur, password show/hide, 201 → `/verify-otp?phone=…`, 409 inline conflict, 429/5xx top-level toast). `app/verify-otp/page.tsx` exists. Server routes `app/api/v1/auth/register` + `/send-otp` + `/verify-otp` exist. | Dev OTP is hard-coded to `"000000"` per stub doc — production OTP provider is `Intent 005 / ADM-006`. |
| 003-login | in-progress | `app/login/page.tsx` exists with phone + password. `app/api/v1/auth/login` route exists. Session cookie is set on success. | No lockout / no rate-limit on login (in-memory token bucket is keyed on `(actor, ticket)` only). **Gap G2.** |
| 004-home-activity | in-progress | `app/home/page.tsx` (1.6) — two-region layout, status filter pills, 15s polling, notification prompt banner, "feed.error" empty state, map with SVG placeholder. Auth gate via `/api/auth/status`. | Notification permission banner calls `Notification.requestPermission` but does not subscribe via `/api/v1/push/subscribe` (the banner is the trust UX but the actual subscription is wired only in `005-theme-and-i18n / 016-push-subscribe` which is deferred). |
| 015-citizen-serializer-wiring | in-progress | `app/api/v1/activity/route.ts` calls `serializeTicketForRole` for every ticket. `GET /api/tickets/:id` (citizen path) also serialises. | Internal actor labels verified in unit test `tests/unit/serializer.test.ts`. |
| 005-report-location | in-progress | `app/report/location/page.tsx` (1.7) — draggable map, ward lookup, two-region layout, **R-1 geofence reject UX** with `out-of-bounds` warning card + "snap to boundary" CTA. | City boundary is hard-coded to `{ southLat: 23.74, northLat: 23.85, westLng: 90.34, eastLng: 90.48 }` (Dhaka North). Production should read `Ward.polygonGeoJson` from `/api/report/bootstrap`. **Gap G1 (design gap noted in WO-001 feasibility R-1).** |
| 006-report-photo | in-progress | `app/report/photo/page.tsx` (1.8) — multi-photo capture, default cap 3, narrow-category cap 2 (looked up on category step). Dev reads files via FileReader → base64 data URLs. | Production photo pipeline (S3 / R2 / MinIO + signed uploads) is deferred — the dev seed persists data URLs in `Ticket.photoUrls` for the demo. |
| 007-report-category | in-progress | `app/report/category/page.tsx` (1.9) — Bangla-first category picker with narrow-cap hint. | OK |
| 008-report-note | in-progress | `app/report/note/page.tsx` (1.10) — 500-char limit, count meter, POST to `/api/tickets`, dedup routing. | OK |
| 009-dedup-prompt | in-progress | `app/report/summary/page.tsx` (1.10b) — reads dedup context from sessionStorage(`cityfix.reportDedup.v1`); shows existing ticket preview with photo + status + distance; "Link to this report" + "Submit as new" CTAs. Re-POSTs with `dedupDeclineTicketId`. | The decline-noted toast wired on the next page is fine; the audit log entry `ticket.dedup_detected` is written by the **first** POST attempt only (not on the decline), which matches ADR-006. |
| 010-confirmation | in-progress | `app/report/[id]/submitted/page.tsx` (1.11) — 4-step trail preview, ticket-id mono pill, two CTAs (View report / Back home), decline-noted toast. | Trail preview is hard-coded to "step 1 done, step 2 current" for a fresh ticket — once a dispatcher routes the ticket the trail becomes real-data (not implemented in dev). |
| 017-bootstrap-endpoint | in-progress | `app/api/report/bootstrap/route.ts` — returns `{ city, ward, categories }`; auth-gated to citizens. | OK |
| 011-my-reports | in-progress | `app/reports/page.tsx` (1.12). Lists the citizen's own tickets. | OK |
| 012-report-detail | in-progress | `app/reports/[id]/page.tsx` (1.13) — status trail rendered from `serializeTicketForRole`'s trail array. | OK |
| 013-bilingual-ui | in-progress | `lib/i18n/keys.ts` + typed `t(key, vars, lang)` helper; `localStorage.cityfix.preferred_language.v1` for client override; city-default fallback. Bangla-first per WO-001 PRD. | OK |
| 014-theme-appearance | in-progress | `lib/theme/appearance.ts` + `lib/theme/ThemeProvider.tsx` + `app/appearance-boot.tsx`. Light/dark persisted via localStorage. | Playwright baselines cover light theme primarily; dark-mode baselines pending. |
| 016-push-subscribe | **pending** | `app/api/v1/push/subscribe/route.ts` exists; subscription row stored on `POST`. The home-page banner does not yet POST to it. | **Deferred to v1.1** per story file — the route is built but the wiring on the home page is intentionally not done. |

### Intent 003 / 004 / 005 — Sketch only

The `requirements.md` + `units.md` exist for each of
`003-dispatcher-queue`, `004-field-crew-app`,
`005-admin-city-setup`. No stories yet — these are deferred
until their upstream intent ships.

## Known gaps

Each gap is recorded for the Construction Agent to either
(a) close in a Bolt, (b) explicitly defer to v1.1, or (c)
escalate to the human.

### Gap G1 — Geofence is hard-coded (R-1)

**File**: `app/report/location/page.tsx:45-50`

**Issue**: The city boundary used for the out-of-bounds
warning is a constant box around Dhaka North. Production
should read the city's polygon from the bootstrap payload
(`Ward.polygonGeoJson` is already on the model).

**Existing mitigation**: For the dev demo, the box is
sufficient because the seed only has Dhaka North. The
warning card + "move to boundary" CTA both work.

**Recommended action**: Bolt `002-003-submit-report-flow`
should replace `CITY_BOUNDARY` with a derived
polygon-on-screen check using
`bootstrap.city.boundaryGeoJson ?? bootstrap.ward?.polygonGeoJson`.
When absent, fall back to the current box but log a
dev-only warning. This is **a 1-day task** that can ride
along with the 1.7 polish Bolt.

### Gap G2 — No login throttle (security)

**File**: `app/api/v1/auth/login/route.ts`

**Issue**: `lib/platform/rate-limit.ts` is keyed on
`(actor, ticket)` and is used only on `GET /api/tickets/:id`.
Login, register, send-OTP, and verify-OTP are
**unthrottled**, which means an attacker can brute-force a
4-digit dev OTP (literally `0000`–`9999`) and a citizen
password (8-char min, bcrypt is slow but not bounded).

**Recommended action**: Bolt `002-001-auth-and-profile`
should add a second token bucket keyed on
`(ip, 'login')` and `(phone, 'login')` with a 5/min cap.
Out of scope for WO-001 acceptance (PRD leaves throttle
out of v1), but the specsmd construction Bolt should
flag this as **bolt-deferred-to-v1.1** if the security
review raises it.

### Gap G3 — No `requireSameWard` / `requireSameDepartment`

**File**: `lib/auth/guards.ts`

**Issue**: `requireScope(session, wardId, departmentId)`
covers the dispatcher/crew scope check, but there are no
narrower helpers. The dispatcher WO-002 (Intent 003) and
crew WO-003 (Intent 004) will need them. The current
intents are sketch-only so this is not a v1 acceptance
blocker, but it lands in the **Construction Agent's**
"things to refine" list.

**Recommended action**: Add in Bolt `002-001-auth-and-profile`
(or a v1.1 micro-Bolt): `requireSameWard` and
`requireSameDepartment` for finer-grained guards when
WO-002/WO-003 unblock.

### Gap G4 — VAPID stubbed

**File**: `lib/platform/push.ts`

**Issue**: VAPID keys are placeholders; `sendTicketPush`
is a no-op in dev. This is intentional — the WO-001 PRD
defers real push to v1.1 — but it means the
decline-noted toast + post-resolve notifications don't
fire on `localhost`.

**Recommended action**: Document as **bolt-deferred-to-v1.1**
in story `016-push-subscribe`; keep the API surface stable
so the wiring is one Bolt away when WO-002 (Intent 003)
adds the dispatcher transitions that fire pushes.

### Gap G5 — Visual regression on dark theme

**File**: `tests-mockups/baselines/01-mockups.spec.ts`

**Issue**: Visual baselines exist for the light theme; the
dark theme is wired in `lib/theme/appearance.ts` but
has no Playwright baselines.

**Recommended action**: Bolt `002-005-theme-and-i18n`
should add `02-dark-theme.spec.ts` + at least 3 baselines
(login, home, report/location) to cover the dark surface.
Until then, the dark path is "trust the design system".

### Gap G6 — No dispatcher surface = no real audit events

**File**: `lib/platform/audit.ts`

**Issue**: `writeAudit` is called from `POST /api/tickets`
for `ticket.dedup_detected`. There is no other audit
producer in WO-001 (citizens don't have admin actions).
Once Intent 003 ships, transitions will produce many more
audit entries; the schema is fine for that volume.

**Recommended action**: No action in WO-001 Bolts. The
audit log is an `005-admin-city-setup / ADM-007-audit-dashboard`
deliverable for v1.1.

## Per-bolt refinement notes

These are the practical pointers the Construction Agent
should carry into each Bolt of Intent 002.

### Bolt 002-001-auth-and-profile

- Source: `app/splash/page.tsx`, `app/welcome/page.tsx`,
  `app/register/page.tsx`, `app/verify-otp/page.tsx`,
  `app/login/page.tsx`.
- These pages already run locally; the Bolt is mostly
  **bolt-decision + ddd-01/02 paperwork + visual-baseline
  capture** plus closing **Gap G2** (or deferring it).
- The dev OTP is `"000000"` per `lib/auth/otp.ts` —
  document this as the dev fixture, do not "fix" it.

### Bolt 002-002-home-and-activity

- Source: `app/home/page.tsx`, `app/api/v1/activity/route.ts`,
  `lib/serializers/ticket.ts` (story 015 wiring).
- The activity route already exists and serialises
  correctly; the Bolt is **DDD paperwork + visual baselines**
  + test coverage for the 4 filter pills.
- The notification prompt banner is **trust UX only**;
  the actual subscription POST (`/api/v1/push/subscribe`)
  is deferred (story 016).

### Bolt 002-003-submit-report-flow

- Source: `app/report/{location,photo,category,note,summary}/page.tsx`,
  `app/report/[id]/submitted/page.tsx`,
  `app/api/report/bootstrap/route.ts`, `app/api/tickets/route.ts`.
- 5 pages + 2 routes exist; the Bolt is mostly closing
  **Gap G1** (city polygon dynamic boundary) and capturing
  per-page visual baselines.
- A natural split is `3a` (1.7/1.8/1.9 — location, photo,
  category) and `3b` (1.10/1.10b/1.11 — note, summary,
  submitted, plus bootstrap). The plan lets the
  Construction Agent split if the surface justifies it.

### Bolt 002-004-my-reports

- Source: `app/reports/page.tsx` (1.12),
  `app/reports/[id]/page.tsx` (1.13).
- Pages exist; Bolt is **paperwork + baselines + status
  trail integration test** (a ticket moved from `submitted`
  → `routed` → `in_progress` → `resolved` should show all
  four trail entries).

### Bolt 002-005-theme-and-i18n

- Source: `lib/i18n/keys.ts`, `lib/theme/{appearance,ThemeProvider}.{ts,tsx}`,
  `app/appearance-boot.tsx`.
- Closes **Gap G5** — add dark-theme visual baselines.
- Story `016-push-subscribe` stays `pending` (v1.1).

## Status

The codebase survey is **complete** — see the matrix above.
The 5 Intents are tracked in `story-index.md`; the 5 Bolts
of Intent 002 are tracked in `bolts/plan.md`. The
Construction Agent can begin from a known-good baseline.

## Cross-references

- **Active intent**: `intents/002-citizen-report-flow/`.
- **Bolt plan**: `bolts/plan.md`.
- **Story index**: `story-index.md`.
- **Decision index**: `standards/decision-index.md`.
