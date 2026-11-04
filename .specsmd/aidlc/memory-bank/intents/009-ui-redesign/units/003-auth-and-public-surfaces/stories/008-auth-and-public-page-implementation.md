---
story: 008-auth-and-public-page-implementation
unit: 003-auth-and-public-surfaces
intent: 009-ui-redesign
status: ready
created: 2026-11-02T18:25:00Z
updated: 2026-11-02T19:10:00Z
implemented: false
---

# Story 008 — Auth + Public Page Implementation

## User Story

**As a** citizen signing in for the first time
**I want** the auth screens to tell me exactly what is wrong and how
to fix it
**So that** I am never left guessing which field the platform
rejected.

## Acceptance Criteria

- **Given** the 5 Wave 2 mockups are approved
- **When** I open `/login`, `/register`, `/verify-otp`, `/`, `/feed` or
  `/splash`
- **Then** the page renders from `components/ui/` primitives — no
  hand-rolled `<button>`

- **And** **given** I submit the sign-in form with an invalid password
- **When** the request fails
- **Then** a focusable error summary appears above the form and links
  to the offending field
- **And** the field itself carries an inline `role="alert"` message
- **And** the show/hide toggle and the recovery path are both
  reachable by keyboard

- **And** every input has a `<label for>` — no placeholder-only field
- **And** the register page's password rules show a per-rule icon +
  word + colour
- **And** the OTP page names its delivery channel, shows the resend
  countdown and offers a recovery card
- **And** the public landing shows tabular figures and a PII-stripped
  feed
- **And** the feed's filter chips show live counts and the "new" state
  carries a badge as well as a tint

- **And** `tests/32-ui-redesign-auth.spec.ts` drives the real forms
  against the dev store, waiting for `window.next.router` before
  filling controlled inputs
- **And** new i18n keys ship `bn` + `en` together
  (`npm run check:i18n` green)
- **And** a committed baseline exists per route

## BDD Scenarios

### Scenario 1: The error summary is focusable and links to the field

```gherkin
Given I am on /login
When I submit a wrong password
Then an error summary is rendered with role="alert"
  And the summary links to the password field
  And the password field has an inline error message
```

### Scenario 2: The landing never leaks a reporter identity

```gherkin
Given I am an anonymous visitor on /
When I read the activity feed
Then I see no reporter name, phone number or exact address
  And I see OSM / MapLibre attribution
```

### Scenario 3: Hydration is awaited before typing

```gherkin
Given the Playwright route spec
When I fill a controlled input
Then the spec has waited for window.next.router first
```

## Out of Scope

- New endpoints or auth flows — the API is unchanged.
- The citizen, dispatcher, crew and admin routes — Units 004–007.

## Linked Files

- `app/login/page.tsx`
- `app/register/page.tsx`
- `app/verify-otp/page.tsx`
- `app/page.tsx`
- `app/feed/page.tsx`
- `app/splash/page.tsx`
- `components/PublicLandingExperience.tsx`
- `tests/32-ui-redesign-auth.spec.ts`
- `lib/i18n/keys.ts`

## Status

Ready — pending the human mockup-approval gate.
