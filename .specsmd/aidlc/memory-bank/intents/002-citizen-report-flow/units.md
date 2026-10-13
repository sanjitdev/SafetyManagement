---
intent: 002-citizen-report-flow
phase: inception
status: in-progress
updated: 2026-10-11T18:00:00Z
---

# Citizen Report Flow - Unit Decomposition

## Units Overview

This intent decomposes into 5 units of work. Units 001,
003, 004, and 005 are substantially built; Unit 002
(auth-and-profile) is fully built.

### Unit 001: auth-and-profile

**Description**: Splash, welcome, language toggle,
register, verify-OTP, login — the auth funnel for a
new or returning citizen. Built and integrated.

**Stories**:
- 001-splash-welcome
- 002-registration-otp
- 003-login

**Deliverables**:
- `app/splash/page.tsx`
- `app/welcome/page.tsx`
- `app/register/page.tsx`
- `app/verify-otp/page.tsx`
- `app/login/page.tsx`
- `/api/auth/otp/request`
- `/api/auth/otp/verify`
- Bilingual toggle persisted to `localStorage`.

**Dependencies**:
- Depends on: Intent 001 (auth + session + serializer).
- Depended by: 002, 003, 004, 005.

**Estimated Complexity**: M.

### Unit 002: home-and-activity

**Description**: The home page (1.6) — map + side
panel of city activity. Built and integrated.

**Stories**:
- 004-home-activity
- 015-citizen-serializer-wiring

**Deliverables**:
- `app/home/page.tsx` (MapLibre + side panel).
- `/api/v1/activity` (already in Intent 001; this
  unit wires the citizen serializer).
- 15s polling.

**Dependencies**:
- Depends on: Intent 001.
- Depended by: 003 (the report flow's "Back to
  home" CTA).

**Estimated Complexity**: L.

### Unit 003: submit-report-flow

**Description**: The 5-step report flow + the dedup
prompt + the confirmation page. Built and integrated
end-to-end; some polishing on the geofence UX
remains.

**Stories**:
- 005-report-location
- 006-report-photo
- 007-report-category
- 008-report-note
- 009-dedup-prompt
- 010-confirmation
- 017-bootstrap-endpoint

**Deliverables**:
- `app/report/location/page.tsx`
- `app/report/photo/page.tsx`
- `app/report/category/page.tsx`
- `app/report/note/page.tsx`
- `app/report/summary/page.tsx` (dedup prompt)
- `app/report/[id]/submitted/page.tsx` (1.11)
- `lib/report-draft.ts` (sessionStorage draft)
- `/api/report/bootstrap`

**Dependencies**:
- Depends on: Intent 001, Unit 001, Unit 002.
- Depended by: Unit 004 (the report ID flows into
  my-reports).

**Estimated Complexity**: XL.

### Unit 004: my-reports

**Description**: The citizen's report list + detail +
status trail.

**Stories**:
- 011-my-reports
- 012-report-detail

**Deliverables**:
- `app/reports/page.tsx` (1.12)
- `app/reports/[id]/page.tsx` (1.13)
- Polling on both.

**Dependencies**:
- Depends on: Intent 001, Unit 001 (auth),
  Unit 003 (the report ID).
- Depended by: nothing (terminal).

**Estimated Complexity**: M.

### Unit 005: theme-and-i18n

**Description**: Light/dark theme toggle and the
bilingual UI plumbing.

**Stories**:
- 013-bilingual-ui
- 014-theme-appearance
- 016-push-subscribe (deferred to v1.1)

**Deliverables**:
- `components/theme-toggle.tsx`
- `lib/theme/` provider
- `lib/i18n/keys.ts` (typed key registry)
- `tokens.css` (design-token source of truth)
- `/api/v1/push/subscribe` (deferred)

**Dependencies**:
- Depends on: nothing (cross-cutting).
- Depended by: every unit (the theme + i18n are
  per-page).

**Estimated Complexity**: M.

## Unit Dependency Graph

```text
[Intent 001] ──> [Unit 001 auth-and-profile] ─┐
                                                 │
                          [Unit 005 theme-i18n] ──┤
                                                 │
              ┌──────────────────────────────────┤
              │                                  │
              v                                  v
[Unit 002 home-and-activity] ──> [Unit 003 submit-report-flow] ──> [Unit 004 my-reports]
```

## Execution Order

WO-001 was the active build. The original execution
order:

1. Day 1: Unit 001 (auth funnel).
2. Day 2: Unit 005 (theme + i18n baseline; cross-cutting).
3. Day 3-4: Unit 002 (home + activity).
4. Day 5-8: Unit 003 (5-step report flow + dedup
   + confirmation).
5. Day 9: Unit 004 (my reports).
6. Day 10: Polish + walking-skeleton verification.

## Status

This intent is **in-progress**. All 17 stories have
working code on the happy path; the geofence UX
rejection path on 1.7 and the push-subscribe endpoint
remain open. The next active work is the bolt plan in
`memory-bank/bolts/` (planned, not yet authored).