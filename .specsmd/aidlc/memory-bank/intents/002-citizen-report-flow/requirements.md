---
intent: 002-citizen-report-flow
phase: construction
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-12T20:00:00Z
---

# Requirements: Citizen Report Flow (WO-001)

## Intent Overview

Build the **WO-001 citizen surface** — the flow by
which a Rahim-archetype Dhaka resident signs up /
signs in, sees the city activity feed on the home
page, and submits a new report (with location,
photos, category, and a note) end-to-end. After
submit, the citizen sees the dedup prompt (1.10b) if
the system finds a near-pinned open ticket, or the
confirmation page (1.11) if not. The citizen can
also browse their own reports, see a status trail,
and (in v1.1) opt into push notifications.

The intent builds on the WO-000 platform layer
(Intent 001) and is the **first persona WO** in the
project. It is currently **in-progress** (per
`aidlc-state.md`); this specsmd capture brings it
under the unified planning layer with the rest of the
project.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Sign-up + sign-in via phone+OTP | Rahim can complete the flow in <90s | Must |
| See the city activity feed | Map + side panel render on home (1.6) | Must |
| Submit a report end-to-end | 5 steps + confirmation (1.7-1.11) | Must |
| See the dedup prompt | 1.10b renders on near-pin match | Must |
| See my own reports | Reports list + detail + trail | Must |
| Feel heard | Indefinite photo retention; citizen-initiated delete | Must |
| Trust signals | Status trail visible; submission confirmation | Must |
| Bilingual | Bangla + English, fully authored, toggle on splash/welcome | Must |

## Functional Requirements

### CITIZEN-REQ-001 — Splash + welcome + language toggle (1.1-1.2)

- **Description**: The first thing a visitor sees is the
  splash (1.1) with a single primary CTA into the
  welcome screen (1.2). The welcome screen offers
  **Register** and **Sign in** as primary actions
  and exposes a language toggle (Bangla ↔ English).
- **Acceptance Criteria**:
  - `app/splash/page.tsx` exists and renders 1.1.
  - `app/welcome/page.tsx` exists and renders 1.2.
  - The language toggle is visible on both pages.
  - `t(key, vars, lang)` is used for every user-facing
    string; no hardcoded copy.
- **Priority**: Must
- **Related Stories**: 001-splash-welcome

### CITIZEN-REQ-002 — Citizen registration (1.3-1.4)

- **Description**: A new user registers with phone +
  NID + name + password. They receive an SMS-OTP
  (stubbed in v1) and verify it on the verify-OTP
  page. On success, a session cookie is set and the
  user is redirected to home.
- **Acceptance Criteria**:
  - `app/register/page.tsx` exists and renders 1.3.
  - `app/verify-otp/page.tsx` exists and renders 1.4.
  - Zod validation on every input.
  - Argon2id password hash (OWASP 2024).
  - 6-digit OTP, 5-min TTL, 5 attempts.
  - On success: `Set-Cookie` + redirect to `/home`.
- **Priority**: Must
- **Related Stories**: 002-registration-otp

### CITIZEN-REQ-003 — Login (1.5)

- **Description**: A returning user signs in with
  phone + password. On success, a session cookie is
  set and the user is redirected to home.
- **Acceptance Criteria**:
  - `app/login/page.tsx` exists and renders 1.5.
  - Zod validation on every input.
  - Wrong password is rejected; rate-limited after 5
    attempts.
- **Priority**: Must
- **Related Stories**: 003-login

### CITIZEN-REQ-004 — Home / city activity feed (1.6)

- **Description**: The home page shows a map of
  recent activity plus a side panel listing the
  activity feed (status, distance, time). Polling
  cadence is 15s.
- **Acceptance Criteria**:
  - `app/home/page.tsx` exists and renders 1.6.
  - MapLibre GL JS + OSM tiles render in dev.
  - Side panel shows the 20 most recent tickets in
    the citizen's city.
  - Each item shows: category icon, distance (if the
    citizen's location is set), short title, relative
    time.
  - Polls `/api/v1/activity?limit=20&status=...` every
    15s.
- **Priority**: Must
- **Related Stories**: 004-home-activity

### CITIZEN-REQ-005 — Submit report — location (1.7)

- **Description**: The first step of the report flow
  shows a map with the citizen's current location;
  the citizen confirms or moves the pin. A two-region
  layout keeps the map top-half, the form bottom-half
  on a 390×844 viewport.
- **Acceptance Criteria**:
  - `app/report/location/page.tsx` exists and renders
    1.7.
  - Geolocation API requested on mount; fallback to a
    default city center if denied.
  - Geofence check: if the pin is outside the city's
    polygon, show the geofence-reject UX.
  - "Next" advances to `/report/photo` with the pin
    in sessionStorage.
- **Priority**: Must
- **Related Stories**: 005-report-location

### CITIZEN-REQ-006 — Submit report — photo (1.8)

- **Description**: The second step lets the citizen
  capture 1-3 photos (cap 3; cap 2 for narrow
  categories). At least one photo is mandatory.
- **Acceptance Criteria**:
  - `app/report/photo/page.tsx` exists and renders
    1.8.
  - Camera capture + gallery picker both supported.
  - Cap: 3 photos (2 for narrow categories).
  - Minimum: 1 photo.
  - Photos are stored as base64 data URLs in
    `sessionStorage` for the v1 dev-store demo
    (S3 in v1.1).
- **Priority**: Must
- **Related Stories**: 006-report-photo

### CITIZEN-REQ-007 — Submit report — category (1.9)

- **Description**: The third step lets the citizen
  pick a category. Categories are loaded from the
  bootstrap endpoint. Each category has a name (BN +
  EN) and a department hint.
- **Acceptance Criteria**:
  - `app/report/category/page.tsx` exists and renders
    1.9.
  - Categories load from
    `/api/report/bootstrap?cityId=...` (cached).
  - Selected category is stored in sessionStorage.
  - "Next" advances to `/report/note`.
- **Priority**: Must
- **Related Stories**: 007-report-category

### CITIZEN-REQ-008 — Submit report — note (1.10)

- **Description**: The fourth step lets the citizen
  write a short free-text note (optional, ≤ 280
  chars). They then tap "Submit".
- **Acceptance Criteria**:
  - `app/report/note/page.tsx` exists and renders
    1.10.
  - Note is optional; max 280 chars.
  - "Submit" calls `POST /api/tickets`.
  - On 201: redirect to `/report/summary` (1.10b).
  - On 200 dedup_match: redirect to
    `/report/summary?dedup=true&...`.
  - On 400: stay on page with translated error key.
- **Priority**: Must
- **Related Stories**: 008-report-note

### CITIZEN-REQ-009 — Submit report — dedup prompt (1.10b)

- **Description**: After a `dedup_match: true`
  response, the citizen sees a prompt showing the
  existing ticket (status, distance, time) and two
  actions: "Link to this report" (joins the trail) or
  "Submit a new report anyway" (creates a new ticket
  and flags the dedup-decline for dispatcher review).
- **Acceptance Criteria**:
  - `app/report/summary/page.tsx` exists and renders
    1.10b.
  - On "Link": a `TicketTrailEntry` is appended to
    the existing ticket with a `note` describing the
    citizen's choice; redirect to confirmation.
  - On "Submit anyway": a new ticket is created;
    dedup-decline is logged + flagged for dispatcher
    review; redirect to confirmation.
- **Priority**: Must
- **Related Stories**: 009-dedup-prompt

### CITIZEN-REQ-010 — Submit report — confirmation (1.11)

- **Description**: The final step shows the
  confirmation page with the new ticket ID, a short
  status, and a CTA to either see my reports or
  return home.
- **Acceptance Criteria**:
  - `app/report/[id]/submitted/page.tsx` exists and
    renders 1.11.
  - "See my reports" → `/reports`.
  - "Back to home" → `/home`.
- **Priority**: Must
- **Related Stories**: 010-confirmation

### CITIZEN-REQ-011 — My reports (1.12)

- **Description**: The citizen's report list with
  status, category, time, and a chevron to detail.
  Polls every 30s.
- **Acceptance Criteria**:
  - `app/reports/page.tsx` exists and renders 1.12.
  - Lists tickets where `reporterId == session.userId`.
  - Each item: status pill, category, time.
  - Polls `/api/tickets` every 30s.
- **Priority**: Must
- **Related Stories**: 011-my-reports

### CITIZEN-REQ-012 — Report detail with status trail (1.13)

- **Description**: A single report page with a
  timeline of status changes and notes. Internal
  notes are hidden from the citizen.
- **Acceptance Criteria**:
  - `app/reports/[id]/page.tsx` exists and renders
    1.13.
  - Timeline sourced from `TicketTrailEntry`.
  - Internal notes are filtered out for citizens.
  - Polls `/api/tickets/:id` every 30s.
- **Priority**: Must
- **Related Stories**: 012-report-detail

### CITIZEN-REQ-013 — Bilingual UI (Bangla + English)

- **Description**: Every user-facing string goes
  through `t(key, vars, lang)` from
  `lib/i18n/keys.ts`. The language toggle on splash
  / welcome switches the active language; the rest
  of the app picks it up.
- **Acceptance Criteria**:
  - `lib/i18n/keys.ts` is the typed key registry.
  - `t(key, vars, lang)` resolves with the right
    language.
  - The toggle persists to `localStorage` and falls
    back to city default → `DEFAULT_LANGUAGE = 'bn'`.
  - Bangla is the canonical locale; English is
    secondary; both are fully authored.
- **Priority**: Must
- **Related Stories**: 013-bilingual-ui

### CITIZEN-REQ-014 — Theme + appearance (light/dark)

- **Description**: A light/dark theme toggle
  accessible from the home page. The token system
  in `tokens.css` is the source of truth for both
  palettes.
- **Acceptance Criteria**:
  - `components/theme-toggle.tsx` exists.
  - `lib/theme/` provides the appearance provider.
  - `tokens.css` is the design-token source of truth.
  - The toggle persists to `localStorage`.
- **Priority**: Must
- **Related Stories**: 014-theme-appearance

### CITIZEN-REQ-015 — Citizen-facing serializer wiring

- **Description**: Every endpoint that returns a
  ticket to a citizen MUST route through
  `serializeTicketForRole('citizen', ticket)`.
  Internal fields are stripped.
- **Acceptance Criteria**:
  - `GET /api/tickets` uses the citizen serializer.
  - `GET /api/tickets/:id` uses the citizen
    serializer.
  - `GET /api/v1/activity` uses the citizen
    serializer.
  - `POST /api/tickets` uses the citizen serializer
    on the response.
- **Priority**: Must
- **Related Stories**: 015-citizen-serializer-wiring

### CITIZEN-REQ-016 — Push subscribe endpoint (no wire call yet)

- **Description**: A `POST /api/v1/push/subscribe`
  endpoint that the service worker can call to
  register a subscription. The actual
  `web-push.sendNotification(...)` wire call is
  v1.1.
- **Acceptance Criteria**:
  - `app/api/v1/push/subscribe/route.ts` exists.
  - Zod-validated `{ endpoint, p256dh, auth }`.
  - Auth-gated.
  - 204 on success.
- **Priority**: Should
- **Related Stories**: 016-push-subscribe

### CITIZEN-REQ-017 — Bootstrap endpoint (city config)

- **Description**: A `GET /api/report/bootstrap`
  endpoint that returns the city, wards, categories,
  and i18n key the client needs to render the report
  flow. Caches for 5 minutes on the client.
- **Acceptance Criteria**:
  - `app/api/report/bootstrap/route.ts` exists.
  - Returns `{ city, wards, categories, defaults }`.
  - Auth-gated.
  - 5-minute client cache.
- **Priority**: Must
- **Related Stories**: 017-bootstrap-endpoint

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Submit report (full flow) | Time to confirmation | < 60s (excluding photo capture) |
| Home page load | p95 latency | < 1.5s on 3G |
| Activity feed poll | p95 latency | < 200ms |
| Bootstrap endpoint | p95 latency | < 200ms (with 5-min client cache) |

### Scalability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Concurrent reports | Submits / sec | 10 |
| Activity feed size | Items | 20 (v1 hard cap) |
| Photos per report | Items | 1-3 (cap 2 for narrow) |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Session cookie | HTTP-only, signed, 14-day TTL | Inherited from Intent 001 |
| Citizen serializer | Hides internal fields | Inherited from Intent 001 |
| Cross-city denial | API layer | Inherited from Intent 001 |
| CSRF | SameSite=Lax cookie | v1.1 adds CSRF token |

### Reliability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Unit test coverage | Lines on `lib/` | ≥ 80% |
| Visual regression | Playwright baselines | tolerance 0.005 |
| Construction Verification Command | green | `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/` |

### Compliance

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Citizen PII | Indefinite retention + citizen-initiated delete | `aidlc-state.md` WO-001 feasibility |
| Photo retention | 365-day unread-photo lifecycle | (WO-001 feasibility decision) |

## Constraints

### Technical Constraints (inherited from standards)

- See `memory-bank/standards/tech-stack.md`,
  `data-stack.md`, `coding-standards.md`,
  `system-architecture.md`, `api-conventions.md`.

### Intent-specific constraints

- Online-only submit (no offline queue); ≤ 60s target
  assumes an active network.
- All user-facing copy goes through `t(...)` from
  `lib/i18n/keys.ts`; hardcoded strings are forbidden.
- Photos are base64 data URLs in v1 (S3 in v1.1).
- Map tiles: Mapbox free → paid (chosen over OSM
  everywhere); OSM brownout fallback if Mapbox
  overage.

### Business Constraints

- This is the first persona WO and gates on Intent
  001 (Platform Foundation) being complete — it is.
- The 1.6 home side panel scrolls inside its region;
  v1 ships no app-level pagination.
- The dedup prompt is mandatory; cannot be skipped
  even if the citizen submitted once already
  (prevents accidental "I submitted but it didn't
  show up" anxiety).

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| Mapbox free tier covers the v1 pilot (50k loads/month) | Overage charges | Usage alert + OSM brownout fallback |
| Argon2id + 5-min OTP + 5 attempts is enough friction for citizens | Citizen abandons the flow | UX Review can revisit; `decision-index.md` ADR-005 |
| Indefinite retention + citizen-initiated delete is the "feel heard" reading | Privacy review pushback | 365-day unread-photo lifecycle policy (`aidlc-state.md` WO-001 feasibility) |
| Dedup as prompt (not auto-merge) preserves trust | Dispatcher complains about duplicates | WO-002 dispatcher view surfaces dedup-declines for manual review |
| Online-only submit is acceptable at pilot scale | Citizen reports from poor-network areas | v1.1: optimistic local draft / service worker |

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Real OTP SMS provider | Tech lead | WO-004 | Stubbed in v1; real provider chosen in WO-004 |
| Geofence reject UX path | UX + Engineering | WO-001 | R-1 design gap; resolved at 1.7 implementation |
| Photo retention cap (365d vs indefinite) | Product owner | WO-001 | Indefinite + citizen-initiated delete (WO-001 feasibility) |
| Real hosting target | Tech lead | WO-001 PRD | `localhost` for now; PRD ratifies the host |
| Bilingual toggle on splash (vs deep in settings) | UX | WO-001 | Toggle on splash + welcome; per feasibility decision |

## Status notes

This intent is **in-progress**. The home, reports,
feed, location, photo, category, note, summary,
submitted, register, verify-otp, login, splash, and
welcome pages all exist in the repo. The bootstrap
endpoint exists. The push subscribe endpoint is
deferred.

Construction Bolts for the remaining work are listed
under `memory-bank/bolts/002-...` (planned, not yet
authored).