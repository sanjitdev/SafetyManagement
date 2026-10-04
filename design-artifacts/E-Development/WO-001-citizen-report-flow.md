# Work Order — WO-001 Citizen Report Flow

**Created:** 2026-10-04
**Author:** Freya (from approved Phase 2/3/4 artifacts)
**Status:** Ready for PRD
**Priority:** Critical
**Depends on:** WO-000 Platform Foundation

---

## Objective

Build the **citizen-facing** flow — everything Rahim the Reporter sees and does from app open through submitting a report, tracking its status, and receiving the resolution notification. 14 pages, **web-first (1440 × 900 large + 1024 × 768 medium design canvases)**. Bangla-first, English-secondary throughout. Web re-skin (Phase B, 2026-10-04): the mobile-first (390 × 844) layout was retired in favor of a web entry surface, with Rashid's field-crew pages retaining a phone-width fallback (see WO-003).

This is the primary end-user surface. Without it, no reports are filed and the platform has no data.

---

## Why This Matters

From the Feature Impact Analysis:

- **#1 One-tap report submission** (FIA 20) — directly addresses Rahim's P5 (Reclaim his own time, FIA 13), N4 (Avoid the time-sink of official reporting, FIA 13), and P1 (Restore normal life, FIA 14). The single most-used flow.
- **#2 Live status trail visible to citizen** (FIA 20) — directly addresses Rahim's P3 (Feel heard enough, FIA 14) and N2 (Escape the helplessness of shouting into the void, FIA 14). The trust loop.
- **#9 Push notifications for status changes** (FIA 17) — the "feel heard" loop has to reach the citizen where he is.
- **#7 City activity feed + map** (FIA 11) — Rahim's power-user behavior (10+ opens/day) depends on this.
- **#15 In-app onboarding tutorial** (FIA 5, Medium) — reduces first-time friction.

**Headline from Persona 02:** Rahim is split evenly between *fixing the world* (P1, FIA 14) and *being heard* (P3, FIA 14). Both must be in v1, neither substitutes for the other. Pages 1.6 (home) and 1.13 (activity feed) serve the first; pages 1.11–1.12 (confirmation + detail) and 1.14 (notification) serve the second.

---

## Scope

### In scope (14 pages — `01-rahim-the-reporter/`)

| Page | Route (per spec) | Purpose |
|---|---|---|
| 1.1 Splash | `/` | App open, permission preflight, route by auth state |
| 1.2 Welcome | `/welcome` | First-run only — brand voice, single CTA |
| 1.3 Registration | `/register` | Phone + NID + name + password (no signup before first report — but registration *is* required before submit per Persona security stance) |
| 1.4 Verification (OTP) | `/verify` | OTP entry, single-use, time-limited |
| 1.5 Login | `/login` | Returning user; phone + password |
| 1.6 Home / City Activity | `/home` | Top bar + persistent map + 480px side panel + top-bar Report CTA (Phase B — replaces mobile FAB + bottom sheet) |
| 1.7 Report — Location Confirm | `/report/location` | Confirm GPS pin (or drag) |
| 1.8 Report — Photo Capture | `/report/photo` | Camera or gallery, ≤ 3 photos |
| 1.9 Report — Category Pick | `/report/category` | Pick from city's configured categories |
| 1.10 Report — Note & Submit | `/report/note` | Optional text note, review, submit |
| 1.11 Report Submitted — Confirmation | `/report/:id/submitted` | Centered 640px card on neutral surface + 4-step status trail + ticket ID + two-button CTA (Phase B — replaces mobile sticky CTA) |
| 1.12 My Reports Detail | `/reports/:id` | Before/after photos + metadata + feedback prompt + status trail |
| 1.13 City Activity Feed | `/activity` | Reverse-chronological civic activity map + list |
| 1.14 Resolution Notification | (push) | Native push on resolved transition |

### Out of scope

- Auth implementation details → WO-000 (this WO only consumes auth endpoints)
- Backend ticket creation, dedup logic → WO-000
- Status trail storage → WO-000
- Push notification infrastructure → WO-000
- Dispatcher / field crew / admin UI → WO-002, WO-003, WO-004
- Public ward-level dashboard → deferred per Feature #6 (consumed indirectly via activity feed)

---

## Specs & Scenarios Affected

**Scenario:** `01-rahim-the-reporter-reports-a-broken-streetlight.md`

**All 14 page specs (full content, implementation contract):**
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.1-splash/1.1-splash.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.2-welcome/1.2-welcome.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.3-registration/1.3-registration.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.4-verification-otp/1.4-verification-otp.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.5-login/1.5-login.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.6-home-city-activity/1.6-home-city-activity.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.7-report-location-confirm/1.7-report-location-confirm.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.8-report-photo-capture/1.8-report-photo-capture.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.9-report-category-pick/1.9-report-category-pick.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.10-report-note-submit/1.10-report-note-submit.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.11-report-submitted-confirmation/1.11-report-submitted-confirmation.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.12-my-reports-detail/1.12-my-reports-detail.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.13-city-activity-feed/1.13-city-activity-feed.md`
- `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/1.14-resolution-notification/1.14-resolution-notification.md`

**Visual mockups (the implementation must match):**
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/01-welcome.html` → page 1.2
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/02-home-city-activity.html` → page 1.6
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/03-report-submitted.html` → page 1.11
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/04-my-reports-detail.html` → page 1.12

**Strategy inputs:**
- `design-artifacts/A-Product-Brief/01-product-brief.md` — citizen section, dual-audience design implication
- `design-artifacts/A-Product-Brief/02-content-language.md` — Bangla-first voice
- `design-artifacts/A-Product-Brief/03-visual-direction.md` — calm, honest, Bangla-first
- `design-artifacts/B-Trigger-Map/02-persona-rahim-the-reporter.md` — full persona + FIA forces
- `design-artifacts/B-Trigger-Map/06-feature-impact.md` — Features #1, #2, #7, #9, #13, #15

---

## Dependencies

- **WO-000 Platform Foundation** — must complete first. This WO consumes: `POST /auth/register`, `POST /auth/verify-otp`, `POST /auth/login`, `GET /tickets?mine=true`, `GET /tickets/:id`, `POST /tickets` (with dedup), `GET /cities/:id/categories`, push subscription endpoint, i18n service.

---

## Acceptance Criteria

Verifiable criteria Mimir must satisfy before this WO is marked done. Each criterion maps to a spec page.

### Auth flow (1.3, 1.4, 1.5)

- [ ] Registration accepts phone (unique per city), NID, name, password; rejects duplicate phones with clear BN/EN error
- [ ] OTP screen shows 6-digit input, resend timer (60s), rate-limit feedback
- [ ] Login returns session token; session bound to citizen's city
- [ ] Returning user lands on `/home` (1.6), not `/welcome` (1.2)

### Splash (1.1)

- [ ] App open renders in ≤ 2s on mid-range Android
- [ ] Location permission requested at splash with BN/EN copy from spec
- [ ] Notifications permission deferred to `/home` after first successful report (per UX Review revision #1)
- [ ] Routes correctly by auth state: not-authed → `/welcome`, authed-no-reports → `/home`, authed-with-reports → `/home`

### Welcome (1.2)

- [ ] First-run only; returning users never see this screen
- [ ] Single CTA per spec; brand voice per `02-content-language.md`

### Home / City Activity (1.6)

- [ ] Map shows nearby pins filtered by GPS radius (from splash permission)
- [ ] Side panel (max-width 480px on large viewport; collapses below the map at medium) shows activity feed (3–5 most recent items per spec)
- [ ] **Top-bar Report CTA** is the primary action (Phase B — replaces mobile FAB); meets 44×44 minimum touch target
- [ ] Visual must match `mockups/02-home-city-activity.html` to within `tolerance: 0.005` pixel diff (Playwright) at large (1440 × 900) and medium (1024 × 768) viewports

### Report submission flow (1.7, 1.8, 1.9, 1.10)

- [ ] Location confirm page shows pin on map; drag-to-adjust enabled
- [ ] Photo capture allows 1–3 photos; gallery and camera sources
- [ ] Category list comes from `GET /cities/:id/categories` (city-specific, populated by Aamir)
- [ ] Note is optional; max length per spec
- [ ] Submit POSTs to `/tickets`; if dedup_match flag is true, UI shows "Looks similar to an existing report — link to it instead?" prompt (NOT auto-merge — Feature #3 design rationale)
- [ ] Whole flow: tap top-bar Report CTA to submit confirmation ≤ 60 seconds on a mid-range device (Feature #1 success criterion)

### Report Submitted Confirmation (1.11)

- [ ] Shows ticket ID, status trail (4 steps: submitted → routed → in progress → resolved), current step highlighted
- [ ] Two-button CTA pair ("View report" / "Back to home") inside the centered 640px card (Phase B — replaces mobile sticky CTA)
- [ ] Visual must match `mockups/03-report-submitted.html` to within `tolerance: 0.005`

### My Reports Detail (1.12)

- [ ] Shows before/after photos (Rashid captures in WO-003); horizontal scroll with "+n" overflow indicator (UX Review revision #6 — multi-photo default cap = 3, narrow-category cap = 2, mandatory minimum = 1)
- [ ] Status trail visible to citizen; internal actors anonymized
- [ ] Feedback prompt visible after resolved status
- [ ] Visual must match `mockups/04-my-reports-detail.html` to within `tolerance: 0.005`

### City Activity Feed (1.13)

- [ ] Reverse-chronological feed; map and list toggle
- [ ] Each item: thumbnail, category, ward, age, status pill
- [ ] 10+ opens/day target depends on this being real-time (10–30s polling per WO-000)

### Resolution Notification (1.14)

- [ ] Native push on resolved transition (consumed via WO-000 PLAT-REQ-006)
- [ ] Tapping push deep-links to 1.12 with the resolved ticket

### Cross-cutting

- [ ] Bangla is the default; English toggle in user menu works per `02-content-language.md`
- [ ] All copy matches the calm, honest brand voice from Product Brief — **never over-promise** (Gap Analysis: city cannot prevent injury)
- [ ] Visual regression: all 4 hero mockups pass Playwright `npm run test:mockups` at `tolerance: 0.005`
- [ ] Browser-verified on Chromium at web viewports **1440 × 900 (large) and 1024 × 768 (medium)**

---

## Do Not Change

- The **Bangla-first, English-secondary** default. Any change needs Saga re-review.
- The **dedup prompt, not auto-merge** pattern. Citizen agency is non-negotiable.
- The **registration-before-first-report** gate (Persona security stance — phone + NID + OTP). Rahim must be identified.
- The **deferred notification permission** (UX Review revision #1 — after first successful report, not at splash).
- The **multi-photo default cap = 3** (UX Review revision #6).
- The **internal-actor-anonymization** in status trail — citizens see "City corporation", not specific dispatcher names.
- The **4-status enum** (`submitted → routed → in_progress → resolved`). Any new state must be added across all four WOs and the platform data model.

---

## Reference Files

**Page specs (14):** see Specs section above.

**Visual mockups:** 4 Rahim hero mockups in `design-artifacts/D-Design-System/01-Visual-Design/mockups/` (01–04). Rashid's field-crew mockups (06–07) live under WO-003.

**Design system:** `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` (all colors, type, spacing, motion).

**Strategy:** `design-artifacts/A-Product-Brief/{01-product-brief,02-content-language,03-visual-direction}.md`, `design-artifacts/B-Trigger-Map/{02-persona-rahim-the-reporter,06-feature-impact}.md`.

**Tests:**
- `tests/01-mockups.spec.ts` — visual regression on Rahim mockups 01–04 at large + medium; Rashid mockups 06–07 at large + medium + 390 × 844 phone fallback
- `tests/helpers/compare.ts` — Playwright helper
- `tests-mockups/baselines/01-mockups.spec.ts/` — committed baselines

**Prior WO:** `design-artifacts/E-Development/WO-000-platform-foundation.md`

---

## Open Questions for Mimir

1. **Offline queue for photo capture.** Spec says "photo capture saves locally with deferred upload." Is this in WO-000 platform or WO-001? Recommendation: WO-000 (storage layer), consumed in WO-001.
2. **Map tile provider.** Mapbox vs. MapLibre vs. Google Maps for Bangladeshi coverage. Recommendation: MapLibre with OpenStreetMap tiles for v1 (no API key required; matches lean-ops Goal 3).
3. **Push notification service.** Web Push API vs. FCM (Android) vs. APNs (iOS). Recommendation: Web Push for v1 (no native app); FCM deferred until native wrappers are introduced.