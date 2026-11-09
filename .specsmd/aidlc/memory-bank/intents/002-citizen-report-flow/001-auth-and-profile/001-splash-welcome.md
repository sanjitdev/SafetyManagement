---
id: 001-splash-welcome
unit: 001-auth-and-profile
intent: 002-citizen-report-flow
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-11-09T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 001-splash-welcome

## User Story

**As a** first-time visitor
**I want** to land on a splash screen (1.1) and then
a welcome screen (1.2) with a language toggle and two
primary CTAs — **Register** and **Sign in**
**So that** I can pick my action and my language
before committing.

## Acceptance Criteria

- [x] **Given** a fresh visit, **When** I open the app,
  **Then** I land on `/splash` (1.1).
- [x] **Given** the splash, **When** I tap the primary
  CTA, **Then** I am taken to `/welcome` (1.2).
- [x] **Given** the welcome, **When** I tap **Register**,
  **Then** I am taken to `/register` (1.3).
- [x] **Given** the welcome, **When** I tap **Sign in**,
  **Then** I am taken to `/login` (1.5).
- [x] **Given** the welcome, **When** I toggle the
  language, **Then** every user-facing string on the
  page switches.
- [x] **Given** the language toggle, **When** I refresh,
  **Then** my choice persists (localStorage).
- [x] **Given** every string, **When** I check, **Then**
  it goes through `t(key, vars, lang)`.

## Technical Notes

- The bilingual toggle is a **surface deviation** from
  the default Bangla-only reading of `project.md`; both
  locales are fully authored, the toggle just lets the
  citizen pick (per WO-001 feasibility decision).
- Tokens: `tokens.css` defines the design tokens; no
  inline colors.

## Dependencies

### Requires
- Intent 001 (session + serializer)
- Intent 002 (Unit 005 — bilingual UI plumbing)

### Enables
- 002-registration-otp (Register CTA)
- 003-login (Sign in CTA)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Returning user with a valid session | Welcome renders; "Continue" CTA bypasses auth (optional v1.1) |
| Returning user with an expired session | Welcome renders; "Sign in" is the primary CTA |
| Browser language hint is `bn` | Default language is `bn` |
| Browser language hint is `en` | Default language is `en` |
| `localStorage` is unavailable | Fall back to `DEFAULT_LANGUAGE = 'bn'` |

## Out of Scope

- Onboarding tour (deferred to v1.1 if added).
- Deep links to specific reports (deferred to v1.1).

## Status

Working code on the happy path. The pages render, the
toggle persists, and the CTAs route correctly. Visual
baselines for 1.1 + 1.2 are committed.