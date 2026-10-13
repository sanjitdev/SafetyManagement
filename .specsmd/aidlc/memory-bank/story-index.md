---
standard: story-index
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-13T19:45:00Z
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
push-subscribe endpoint is scaffolded in
`lib/platform/push.ts` but the wire call
is v1.1).

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

All 7 stories shipped in Bolts 003-001 through
003-005. The map view (DISP-007) was promoted
from v1.1 deferred to v1 at the start of
Bolt 003-005 per the design log's bolt-progress
note.

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| DISP-001-auth-scope | 001-auth-and-scope | done | Dispatcher auth + scope | `intents/003-dispatcher-queue/001-auth-and-scope/DISP-001-auth-scope.md` |
| DISP-002-triage-queue | 002-triage-queue | done | Triage queue | `intents/003-dispatcher-queue/002-triage-queue/DISP-002-triage-queue.md` |
| DISP-003-ticket-detail | 003-ticket-detail-and-transitions | done | Ticket detail + transitions | `intents/003-dispatcher-queue/003-ticket-detail-and-transitions/DISP-003-ticket-detail.md` |
| DISP-004-reassign | 003-ticket-detail-and-transitions | done | Re-assign to ward / department | `intents/003-dispatcher-queue/003-ticket-detail-and-transitions/DISP-004-reassign.md` |
| DISP-005-internal-notes | 003-ticket-detail-and-transitions | done | Internal notes | `intents/003-dispatcher-queue/003-ticket-detail-and-transitions/DISP-005-internal-notes.md` |
| DISP-006-dedup-decline | 004-dedup-decline-review | done | Dedup-decline review | `intents/003-dispatcher-queue/004-dedup-decline-review/DISP-006-dedup-decline-review.md` |
| DISP-007-map-view | 005-map-view | done | Map view (promoted v1.1 → v1) | `intents/003-dispatcher-queue/005-map-view/DISP-007-dispatcher-map.md` |

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

| Slug | Unit | Status | Title | Path |
|------|------|--------|-------|------|
| ADM-001-webauthn | 001-webauthn-and-auth | done | WebAuthn (mandatory for writes) | `intents/005-admin-city-setup/001-webauthn-and-auth/ADM-001-webauthn.md` |
| ADM-002-wards | 002-city-config | done | Ward management (polygon draw) | `intents/005-admin-city-setup/002-city-config/ADM-002-wards.md` |
| ADM-003-categories | 002-city-config | done | Category management | `intents/005-admin-city-setup/002-city-config/ADM-003-categories.md` |
| ADM-004-departments | 002-city-config | done | Department management | `intents/005-admin-city-setup/002-city-config/ADM-004-departments.md` |
| ADM-005-dedup-radius | 002-city-config | done | Dedup radius override | `intents/005-admin-city-setup/002-city-config/ADM-005-dedup-radius.md` |
| ADM-006-real-otp | 003-real-otp-provider | done | Real OTP SMS provider | `intents/005-admin-city-setup/003-real-otp-provider/ADM-006-real-otp.md` |
| ADM-007-audit-dashboard | 004-audit-dashboard | done | Audit dashboard | `intents/005-admin-city-setup/004-audit-dashboard/ADM-007-audit-dashboard.md` |

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

## Status legend

| Status | Meaning |
|--------|---------|
| `draft` | Story written, needs review |
| `ready` | Reviewed, ready for bolt |
| `in-progress` | Being implemented in a bolt |
| `done` | All acceptance criteria met + tests passing |
| `pending` | Deferred (e.g., 016-push-subscribe is v1.1) |
