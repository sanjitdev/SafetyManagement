---
standard: story-index
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-27T00:00:00Z
---

# Story Index

The single source of truth for every story in the
CityFix specsmd memory-bank. Stories are numbered
within their unit (e.g., `001-splash-welcome` is
story 1 of `001-auth-and-profile`); the intent slug
prefix (e.g., `CITIZEN-001-...`) is **not** part of
the story ID — stories are unique by
`<unit-slug>/<story-slug>`.

The format is `<story-id> | <unit> | <intent> |
<status> | <title>`. The `path` column gives the
relative path under the memory-bank.

## Intent 001 — Platform Foundation (complete)

| Story | Unit | Status | Title | Path |
|-------|------|--------|-------|------|
| 001-city-config-models | 001-data-and-dev-store | done | Per-city config schema | `intents/001-platform-foundation/001-data-and-dev-store/001-city-config-models.md` |
| 010-backend-facade | 001-data-and-dev-store | done | Backend-agnostic facade + dev store | `intents/001-platform-foundation/001-data-and-dev-store/010-backend-facade.md` |
| 002-user-otp-session | 002-auth-and-serializers | done | User + OtpCode + Session + password | `intents/001-platform-foundation/002-auth-and-serializers/002-user-otp-session.md` |
| 003-per-role-guards | 002-auth-and-serializers | done | Per-role + per-scope guards | `intents/001-platform-foundation/002-auth-and-serializers/003-per-role-guards.md` |
| 004-citizen-serializer | 002-auth-and-serializers | done | Role-aware citizen serializer | `intents/001-platform-foundation/002-auth-and-serializers/004-citizen-serializer.md` |
| 005-audit-log | 003-platform-and-endpoints | done | Audit log + writeAudit | `intents/001-platform-foundation/003-platform-and-endpoints/005-audit-log.md` |
| 006-rate-limit | 003-platform-and-endpoints | done | In-process token bucket | `intents/001-platform-foundation/003-platform-and-endpoints/006-rate-limit.md` |
| 007-dedup-prefilter | 003-platform-and-endpoints | done | 50m Haversine pre-filter | `intents/001-platform-foundation/003-platform-and-endpoints/007-dedup-prefilter.md` |
| 008-status-transitions | 003-platform-and-endpoints | done | Status pipeline | `intents/001-platform-foundation/003-platform-and-endpoints/008-status-transitions.md` |
| 009-push-scaffold | 003-platform-and-endpoints | done | Push subscription schema + helpers | `intents/001-platform-foundation/003-platform-and-endpoints/009-push-scaffold.md` |
| 011-first-five-endpoints | 003-platform-and-endpoints | done | First five HTTP endpoints | `intents/001-platform-foundation/003-platform-and-endpoints/011-first-five-endpoints.md` |

## Intent 002 — Citizen Report Flow (complete)

All 16/17 stories shipped in Bolts 002-001
through 002-005. Story `016-push-subscribe`
remains `pending` (v1.1 deferred — VAPID
keys are empty in the prod env; the
push-subscribe route ships at
`app/api/v1/push/subscribe/route.ts` over the
`lib/platform/push.ts` scaffold, but the
outbound wire call is v1.1).

Status reconciled 2026-11-09: the 16 stories
below carried `status: in-progress` in their own
frontmatter while this index, the intent's
`units.md` and the code all recorded them as
shipped. Each was flipped to `done` after its code
reality was probed.

| Story | Unit | Status | Title | Path |
|-------|------|--------|-------|------|
| 001-splash-welcome | 001-auth-and-profile | done | Splash + welcome + language toggle | `intents/002-citizen-report-flow/001-auth-and-profile/001-splash-welcome.md` |
| 002-registration-otp | 001-auth-and-profile | done | Register + verify-OTP | `intents/002-citizen-report-flow/001-auth-and-profile/002-registration-otp.md` |
| 003-login | 001-auth-and-profile | done | Login (1.5) | `intents/002-citizen-report-flow/001-auth-and-profile/003-login.md` |
| 004-home-activity | 002-home-and-activity | done | Home / city activity feed (1.6) | `intents/002-citizen-report-flow/002-home-and-activity/004-home-activity.md` |
| 015-citizen-serializer-wiring | 002-home-and-activity | done | Citizen serializer wiring on /v1/activity | `intents/002-citizen-report-flow/002-home-and-activity/015-citizen-serializer-wiring.md` |
| 005-report-location | 003-submit-report-flow | done | Submit report — location (1.7) | `intents/002-citizen-report-flow/003-submit-report-flow/005-report-location.md` |
| 006-report-photo | 003-submit-report-flow | done | Submit report — photo (1.8) | `intents/002-citizen-report-flow/003-submit-report-flow/006-report-photo.md` |
| 007-report-category | 003-submit-report-flow | done | Submit report — category (1.9) | `intents/002-citizen-report-flow/003-submit-report-flow/007-report-category.md` |
| 008-report-note | 003-submit-report-flow | done | Submit report — note (1.10) | `intents/002-citizen-report-flow/003-submit-report-flow/008-report-note.md` |
| 009-dedup-prompt | 003-submit-report-flow | done | Submit report — dedup prompt (1.10b) | `intents/002-citizen-report-flow/003-submit-report-flow/009-dedup-prompt.md` |
| 010-confirmation | 003-submit-report-flow | done | Submit report — confirmation (1.11) | `intents/002-citizen-report-flow/003-submit-report-flow/010-confirmation.md` |
| 017-bootstrap-endpoint | 003-submit-report-flow | done | Bootstrap endpoint (city config) | `intents/002-citizen-report-flow/003-submit-report-flow/017-bootstrap-endpoint.md` |
| 011-my-reports | 004-my-reports | done | My reports (1.12) | `intents/002-citizen-report-flow/004-my-reports/011-my-reports.md` |
| 012-report-detail | 004-my-reports | done | Report detail with status trail (1.13) | `intents/002-citizen-report-flow/004-my-reports/012-report-detail.md` |
| 013-bilingual-ui | 005-theme-and-i18n | done | Bilingual UI (Bangla + English) | `intents/002-citizen-report-flow/005-theme-and-i18n/013-bilingual-ui.md` |
| 014-theme-appearance | 005-theme-and-i18n | done | Theme + appearance (light/dark) | `intents/002-citizen-report-flow/005-theme-and-i18n/014-theme-appearance.md` |
| 016-push-subscribe | 005-theme-and-i18n | pending | Push subscribe endpoint (deferred) | `intents/002-citizen-report-flow/005-theme-and-i18n/016-push-subscribe.md` |

## Intent 003 — Dispatcher Queue (complete)

All 9 stories shipped in Bolts 003-001 through
003-005, then 008-013 and 008-014. The map view
(DISP-007) was promoted from v1.1 deferred to v1
at the start of Bolt 003-005 per the design log's
bolt-progress note. The live monitor (DISP-008)
and performance reporting (DISP-009) were also
v1.1 deferred; both shipped in the 2026-10-27
batch build.

Status reconciled 2026-11-09: DISP-001 and DISP-002
carried `status: in-progress` and DISP-007 carried
`status: ready` in their own frontmatter while this
index and the code recorded all three as shipped.
Each was flipped to `done` after its code reality was
probed.

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| DISP-001-auth-scope | 001-auth-and-scope | done | Dispatcher auth + scope | `intents/003-dispatcher-queue/001-auth-and-scope/DISP-001-auth-scope.md` |
| DISP-002-triage-queue | 002-triage-queue | done | Triage queue | `intents/003-dispatcher-queue/002-triage-queue/DISP-002-triage-queue.md` |
| DISP-003-ticket-detail | 003-ticket-detail-and-transitions | done | Ticket detail + transitions | `intents/003-dispatcher-queue/003-ticket-detail-and-transitions/DISP-003-ticket-detail.md` |
| DISP-004-reassign | 003-ticket-detail-and-transitions | done | Re-assign to ward / department | `intents/003-dispatcher-queue/003-ticket-detail-and-transitions/DISP-004-reassign.md` |
| DISP-005-internal-notes | 003-ticket-detail-and-transitions | done | Internal notes | `intents/003-dispatcher-queue/003-ticket-detail-and-transitions/DISP-005-internal-notes.md` |
| DISP-006-dedup-decline | 004-dedup-decline-review | done | Dedup-decline review | `intents/003-dispatcher-queue/004-dedup-decline-review/DISP-006-dedup-decline-review.md` |
| DISP-007-map-view | 005-map-view | done | Map view (promoted v1.1 → v1) | `intents/003-dispatcher-queue/005-map-view/DISP-007-dispatcher-map.md` |
| DISP-008-live-monitor | 006-live-monitor | done | Dispatcher live monitor (v1.1 deferred → v1) | `intents/003-dispatcher-queue/006-live-monitor/DISP-008-live-monitor.md` |
| DISP-009-performance-reporting | 007-performance-reporting | done | Dispatcher performance reporting (v1.1 deferred → v1) | `intents/003-dispatcher-queue/007-performance-reporting/DISP-009-performance-reporting.md` |

## Intent 004 — Field Crew App (complete)

All 6 stories shipped in Bolts 004-001 through
004-004.

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| CREW-001-auth-scope | 001-auth-and-scope | done | Crew auth + scope | `intents/004-field-crew-app/001-auth-and-scope/CREW-001-auth-scope.md` |
| CREW-002-todays-assignments | 002-todays-assignments | done | Today's assignments | `intents/004-field-crew-app/002-todays-assignments/CREW-002-todays-assignments.md` |
| CREW-003-resolve | 003-ticket-detail-and-resolve | done | Resolve in the field | `intents/004-field-crew-app/003-ticket-detail-and-resolve/CREW-003-resolve.md` |
| CREW-004-resolution-note | 003-ticket-detail-and-resolve | done | Resolution note | `intents/004-field-crew-app/003-ticket-detail-and-resolve/CREW-004-resolution-note.md` |
| CREW-005-navigate | 003-ticket-detail-and-resolve | done | Map + navigate | `intents/004-field-crew-app/003-ticket-detail-and-resolve/CREW-005-navigate.md` |
| CREW-006-offline-read | 004-offline-read | done | Read-only on flaky network | `intents/004-field-crew-app/004-offline-read/CREW-006-offline-read.md` |

## Intent 005 — Admin City Setup (complete)

The 4-unit decomposition with 7 stories. Unit
briefs and story specs were filed when Intent
005 was promoted from `draft` to `in-progress`
on 2026-10-12; all 7 stories shipped in Bolts
005-001 through 005-004 by 2026-10-12T22:00.
Two further units — user management (ADM-008)
and the adoption dashboard (ADM-009) — were
v1.1 deferred and shipped in the 2026-10-27
batch build as Bolts 008-015 and 008-016.

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| ADM-001-webauthn | 001-webauthn-and-auth | done | WebAuthn (mandatory for writes) | `intents/005-admin-city-setup/001-webauthn-and-auth/ADM-001-webauthn.md` |
| ADM-002-wards | 002-city-config | done | Ward management (polygon draw) | `intents/005-admin-city-setup/002-city-config/ADM-002-wards.md` |
| ADM-003-categories | 002-city-config | done | Category management | `intents/005-admin-city-setup/002-city-config/ADM-003-categories.md` |
| ADM-004-departments | 002-city-config | done | Department management | `intents/005-admin-city-setup/002-city-config/ADM-004-departments.md` |
| ADM-005-dedup-radius | 002-city-config | done | Dedup radius override | `intents/005-admin-city-setup/002-city-config/ADM-005-dedup-radius.md` |
| ADM-006-real-otp | 003-real-otp-provider | done | Real OTP SMS provider | `intents/005-admin-city-setup/003-real-otp-provider/ADM-006-real-otp.md` |
| ADM-007-audit-dashboard | 004-audit-dashboard | done | Audit dashboard | `intents/005-admin-city-setup/004-audit-dashboard/ADM-007-audit-dashboard.md` |
| ADM-008-user-management | 005-user-management | done | Admin user management + CSV import (v1.1 deferred → v1) | `intents/005-admin-city-setup/005-user-management/ADM-008-user-management.md` |
| ADM-009-adoption-dashboard | 006-adoption-dashboard | done | Admin adoption dashboard (v1.1 deferred → v1) | `intents/005-admin-city-setup/006-adoption-dashboard/ADM-009-adoption-dashboard.md` |

## Intent 005 v1.1 launch-polish (Bolt 005-005 — hotfix, complete)

Bolt 005-005 is a launch-readiness hotfix bundle
that landed as four commits on 2026-10-12; it
intentionally bypasses the unit-bolt decomposition
because the work is a coordinated set of small
ship-blockers rather than a single story. Scoped
and tracked in `_progress/00-design-log.md` under
`### 2026-10-12 — v1.1 launch-polish hotfix (Bolt 005-005)`.

The four defects closed:

1. **OSM tiles blank in prod** — CSP `connect-src`
   wildcard was over-narrow; added the bare
   `tile.openstreetmap.org` host.
   (`next.config.js:75`).
2. **`/` (home) was a dead-end for anonymous
   visitors** — the route rendered a dev-only
   "Sign in as Rahim" placeholder in prod. Now
   `/` is a server component that redirects
   authenticated users to `/home` and otherwise
   renders a bilingual public landing surface
   with `?next=` deep links.
3. **Welcome / home separation collapsed** —
   `/welcome` was deleted; its responsibilities
   moved into the redesigned `/` public landing
   + `/home` authenticated home.
4. **Top-right user menu dropdown with logout**
   added to the global `AppHeader`, with
   `?next=` deep links back to the page the user
   was on.

No new story IDs; tracked under the v1.1 launch
umbrella. Three follow-up dev-tooling commits
(`/api/dev/promote-admin`,
`/api/dev/issue-session`,
`/api/dev/bootstrap-admin`) are scoped to the
same hotfix and are not duplicated here.

## Intent 006 — Citizen Home & Report Redesign (complete)

The 4-unit decomposition with 14 stories. All
three bolts landed on 2026-10-13:
`006-001-token-system-refresh` (foundation),
`006-002-home-and-shell` (Units 002+003 merged),
and `006-003-report-steps` (Unit 004). The
intent's design goal is the visual + interaction
refresh against the new civic-service palette
(`tokens.css` FR-1) and the layout primitives
(`StepIndicator`, `ReportShell`,
`FilterChipGroup`, `ReportCard`, `StatusPill`).

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| S-001.1 | 001-token-system-refresh | done | Token values updated to new palette | `intents/006-citizen-home-and-report-redesign/units/001-token-system-refresh/stories/S-001.1-token-values-updated.md` |
| S-002.1 | 002-home-activity-redesign | done | Side-panel hierarchy + filter chip group | `intents/006-citizen-home-and-report-redesign/units/002-home-activity-redesign/stories/S-002.1-side-panel-hierarchy-and-filter-chip-group.md` |
| S-002.2 | 002-home-activity-redesign | done | Sticky CTA + floating map controls | `intents/006-citizen-home-and-report-redesign/units/002-home-activity-redesign/stories/S-002.2-sticky-cta-and-floating-map-controls.md` |
| S-002.3 | 002-home-activity-redesign | done | Pin selected / unselected states | `intents/006-citizen-home-and-report-redesign/units/002-home-activity-redesign/stories/S-002.3-pin-selected-and-unselected-states.md` |
| S-003.1 | 003-report-flow-shell | done | StepIndicator primitive | `intents/006-citizen-home-and-report-redesign/units/003-report-flow-shell/stories/S-003.1-step-indicator-primitive.md` |
| S-003.2 | 003-report-flow-shell | done | ReportShell + sticky top/bottom bars | `intents/006-citizen-home-and-report-redesign/units/003-report-flow-shell/stories/S-003.2-report-shell-and-sticky-bars.md` |
| S-003.3 | 003-report-flow-shell | done | FilterChipGroup primitive (keyboard + ARIA) | `intents/006-citizen-home-and-report-redesign/units/003-report-flow-shell/stories/S-003.3-filter-chip-group-primitive.md` |
| S-003.4 | 003-report-flow-shell | done | ReportCard + StatusPill standardization | `intents/006-citizen-home-and-report-redesign/units/003-report-flow-shell/stories/S-003.4-report-card-and-status-pill-standardization.md` |
| S-004.1 | 004-report-flow-steps | done | Location step redesign | `intents/006-citizen-home-and-report-redesign/units/004-report-flow-steps/stories/S-004.1-location-step-redesign.md` |
| S-004.2 | 004-report-flow-steps | done | Photo step redesign | `intents/006-citizen-home-and-report-redesign/units/004-report-flow-steps/stories/S-004.2-photo-step-redesign.md` |
| S-004.3 | 004-report-flow-steps | done | Category step redesign | `intents/006-citizen-home-and-report-redesign/units/004-report-flow-steps/stories/S-004.3-category-step-redesign.md` |
| S-004.4 | 004-report-flow-steps | done | Note step redesign | `intents/006-citizen-home-and-report-redesign/units/004-report-flow-steps/stories/S-004.4-note-step-redesign.md` |
| S-004.5 | 004-report-flow-steps | done | Summary step redesign | `intents/006-citizen-home-and-report-redesign/units/004-report-flow-steps/stories/S-004.5-summary-step-redesign.md` |
| S-004.6 | 004-report-flow-steps | done | Submitted confirmation redesign | `intents/006-citizen-home-and-report-redesign/units/004-report-flow-steps/stories/S-004.6-submitted-confirmation-redesign.md` |

Post-Bolt chrome-unification + a11y follow-up
(commit `097a7ab` on 2026-10-13) is in scope of
S-002.1 + S-002.3 + S-003.2: the global
`AppHeader` now ships on every page, the
hand-rolled top bars on `/home` and `/feed`
were removed, the inner `<header>` landmarks
were demoted to `<div>` (one landmark per
page), the bogus `ওয়ার্ড <cuid>` label on
`/reports/[id]` was fixed by joining
`ward.name` / `ward.nameBn` through
`lib/serializers/ticket.ts` +
`lib/dev-store.ts` + `lib/db-switch.ts`, and
the dead `variant="compact"` prop was stripped
from 8 `ThemeToggle` call sites. Recorded in
`_progress/00-design-log.md` under
`## 2026-10-13 — Chrome unification + ward
name join` (added in the same sync).

## Intent 007 — Citizen Resolution Visibility (complete)

Inception started 2026-10-13. The 3-unit
decomposition with 5 stories was filed when
Intent 007 was promoted from `draft` to
`in-progress`; all 5 stories shipped in
Bolts `007-001` (co-locates Units 001+002;
foundation) and `007-002` (Unit 003;
dispatcher feature). The intent's three open
questions were resolved at the requirements
checkpoint (Checkpoint 1) — see
`intents/007-citizen-resolution-visibility/requirements.md`.

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| 001-prisma-migration-and-serializer-exposes-before-and-after-photo-urls | 001-citizen-photo-split | done | Prisma migration + serializer exposes `beforePhotoUrls` and `afterPhotoUrls` | `intents/007-citizen-resolution-visibility/units/001-citizen-photo-split/stories/001-prisma-migration-and-serializer-exposes-before-and-after-photo-urls.md` |
| 002-page-renders-two-labelled-photo-groups | 001-citizen-photo-split | done | `/reports/[id]` renders two labelled photo groups | `intents/007-citizen-resolution-visibility/units/001-citizen-photo-split/stories/002-page-renders-two-labelled-photo-groups.md` |
| 003-trail-marker-filter-with-i18n-and-regression-guard | 002-trail-marker-filter | done | Citizen trail filter + i18n key + regression-guard test | `intents/007-citizen-resolution-visibility/units/002-trail-marker-filter/stories/003-trail-marker-filter-with-i18n-and-regression-guard.md` |
| 004-patch-assign-crew-endpoint-with-ward-gate-and-audit | 003-dispatcher-crew-picker | done | `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` endpoint with ward gate + audit | `intents/007-citizen-resolution-visibility/units/003-dispatcher-crew-picker/stories/004-patch-assign-crew-endpoint-with-ward-gate-and-audit.md` |
| 005-dispatcher-ticket-detail-picker-ui-and-visual-baseline | 003-dispatcher-crew-picker | done | Dispatcher ticket-detail picker UI + visual baseline | `intents/007-citizen-resolution-visibility/units/003-dispatcher-crew-picker/stories/005-dispatcher-ticket-detail-picker-ui-and-visual-baseline.md` |

## Intent 008 — UX Polish from Slow-motion Demo (complete)

Inception opened 2026-10-14. The 3-unit
decomposition with 5 stories was filed when
Intent 008 was promoted from `draft` to
`in-progress`; the audit catalog is grounded
in the 21 frames captured by
`tests/22-slow-motion-e2e-demo.spec.ts`. All
5 stories shipped in Bolts `008-001` (i18n
copy fixup), `008-002` (visible chrome), and
`008-003` (crew after-photo file upload).

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| 001-register-missing-i18n-keys-and-typos | 001-i18n-copy-fixup | done | Register missing i18n keys and typos | `intents/008-ux-polish-from-demo/units/001-i18n-copy-fixup/stories/001-register-missing-i18n-keys-and-typos.md` |
| 001-dedupe-header-chrome-on-ticket-detail-pages | 002-visible-chrome | done | Dedupe header chrome on ticket-detail pages | `intents/008-ux-polish-from-demo/units/002-visible-chrome/stories/001-dedupe-header-chrome-on-ticket-detail-pages.md` |
| 002-render-display-names-on-ticket-surfaces | 002-visible-chrome | done | Render display names on ticket surfaces | `intents/008-ux-polish-from-demo/units/002-visible-chrome/stories/002-render-display-names-on-ticket-surfaces.md` |
| 003-chrome-polish-status-pill-assignedcrew-icon-buttonlabel | 002-visible-chrome | done | Chrome polish — status pill, assigned crew, icon, button label, photo card | `intents/008-ux-polish-from-demo/units/002-visible-chrome/stories/003-chrome-polish-status-pill-assignedcrew-icon-buttonlabel.md` |
| 001-crew-after-photo-accepts-multipart | 003-crew-after-photo-upload | done | Crew after-photo accepts multipart | `intents/008-ux-polish-from-demo/units/003-crew-after-photo-upload/stories/001-crew-after-photo-accepts-multipart.md` |

## Intent 009 — UI Redesign (in-progress)

Inception opened 2026-11-02. The 8-unit decomposition is **one unit
per wave** — CI unblock, design foundation, auth + public, citizen,
dispatcher, crew, admin, verification — because a wave is the
smallest unit that can be visually approved as a unit. Waves 0 and 1
have shipped (`45062d1`, `b279228`); the Wave 2 mockups (`08`–`12`)
are authored and baselined, and the Wave 2 page implementation waits
on the human mockup-approval gate.

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| 001-lazy-production-db-guard | 001-ci-unblock | done | Lazy production DB guard | `intents/009-ui-redesign/units/001-ci-unblock/stories/001-lazy-production-db-guard.md` |
| 002-token-and-global-css-system | 002-design-foundation | done | Token + global CSS system | `intents/009-ui-redesign/units/002-design-foundation/stories/002-token-and-global-css-system.md` |
| 003-phosphor-icon-registry | 002-design-foundation | done | Phosphor icon registry | `intents/009-ui-redesign/units/002-design-foundation/stories/003-phosphor-icon-registry.md` |
| 004-ui-primitive-library | 002-design-foundation | done | UI primitive library | `intents/009-ui-redesign/units/002-design-foundation/stories/004-ui-primitive-library.md` |
| 005-chart-primitives-with-data-tables | 002-design-foundation | done | Chart primitives with data tables | `intents/009-ui-redesign/units/002-design-foundation/stories/005-chart-primitives-with-data-tables.md` |
| 006-cityfix-brand-assets | 002-design-foundation | done | CityFix brand assets | `intents/009-ui-redesign/units/002-design-foundation/stories/006-cityfix-brand-assets.md` |
| 007-auth-and-public-mockups | 003-auth-and-public-surfaces | done | Auth + public mockups | `intents/009-ui-redesign/units/003-auth-and-public-surfaces/stories/007-auth-and-public-mockups.md` |
| 008-auth-and-public-page-implementation | 003-auth-and-public-surfaces | done | Auth + public page implementation | `intents/009-ui-redesign/units/003-auth-and-public-surfaces/stories/008-auth-and-public-page-implementation.md` |
| 009-citizen-mockups | 004-citizen-surfaces | draft | Citizen mockups | `intents/009-ui-redesign/units/004-citizen-surfaces/stories/009-citizen-mockups.md` |
| 010-citizen-page-implementation | 004-citizen-surfaces | draft | Citizen page implementation | `intents/009-ui-redesign/units/004-citizen-surfaces/stories/010-citizen-page-implementation.md` |
| 011-dispatcher-mockups | 005-dispatcher-console | draft | Dispatcher mockups | `intents/009-ui-redesign/units/005-dispatcher-console/stories/011-dispatcher-mockups.md` |
| 012-dispatcher-page-implementation | 005-dispatcher-console | draft | Dispatcher page implementation | `intents/009-ui-redesign/units/005-dispatcher-console/stories/012-dispatcher-page-implementation.md` |
| 013-crew-mockups | 006-crew-field-app | draft | Crew mockups | `intents/009-ui-redesign/units/006-crew-field-app/stories/013-crew-mockups.md` |
| 014-crew-page-implementation | 006-crew-field-app | draft | Crew page implementation | `intents/009-ui-redesign/units/006-crew-field-app/stories/014-crew-page-implementation.md` |
| 015-admin-mockups | 007-admin-console | draft | Admin mockups | `intents/009-ui-redesign/units/007-admin-console/stories/015-admin-mockups.md` |
| 016-admin-page-implementation | 007-admin-console | draft | Admin page implementation | `intents/009-ui-redesign/units/007-admin-console/stories/016-admin-page-implementation.md` |
| 017-full-gate-and-accessibility-pass | 008-verification-and-signoff | draft | Full gate + accessibility pass | `intents/009-ui-redesign/units/008-verification-and-signoff/stories/017-full-gate-and-accessibility-pass.md` |
| 018-project-documentation-refresh | 008-verification-and-signoff | draft | Project documentation refresh | `intents/009-ui-redesign/units/008-verification-and-signoff/stories/018-project-documentation-refresh.md` |

## Status legend

| Status | Meaning |
|--------|---------|
| `draft` | Story written, needs review |
| `ready` | Reviewed, ready for bolt |
| `in-progress` | Being implemented in a bolt |
| `done` | All acceptance criteria met + tests passing |
| `pending` | Deferred (e.g., 016-push-subscribe is v1.1) |
