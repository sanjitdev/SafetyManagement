---
story: 008-auth-and-public-page-implementation
unit: 003-auth-and-public-surfaces
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:25:00Z
updated: 2026-11-12T14:10:00Z
implemented: true
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

Complete — implemented 2026-11-11.

The six surfaces (`/login`, `/register`, `/verify-otp`, `/`, `/feed`,
`/splash`) were re-composed to match their approved Wave 2 mockups
using presentation-layer changes only: every fetch, parameter, cursor,
validation rule, role gate and PII-stripping path is byte-identical to
the pre-existing implementation.

`tests/32-ui-redesign-auth.spec.ts` (18 tests) is the executable form
of this story and drives the real forms against the dev store.

### Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | 123 files / **2148 passed** |
| Route specs | `playwright test tests/ --ignore-snapshots` | **368 passed**, 12 failed (all pre-existing) |
| Story spec (dev store) | `playwright test tests/32-ui-redesign-auth.spec.ts` | **18 passed** |
| Story spec (real Postgres) | same, against `next dev` with no dev-store flag | **18 passed** |
| i18n | `npm run check:i18n` | ok (1091 keys) |

### The story spec runs against BOTH backends

The spec is backend-agnostic and was verified twice — against the
in-memory dev store and against the real local Postgres. Getting there
required three changes, each of which fixed a symptom that pointed
somewhere else:

1. **The id triple is discovered at runtime.** The spec used to post
   the dev-store ids (`city_dhaka_north` / `cat_streetlight` /
   `ward_14`). In real mode the ids are cuids, so the create answered
   403 `cross_city_forbidden` — the route rejects a foreign city id
   before it looks at the ward or the category. The spec now reads
   `(cityId, categoryId, wardId)` off the first row of
   `GET /api/v1/activity/public`, which is session-scoped, so the
   triple always belongs to the session's city.
2. **The ticket id comes from the response body**, not from a
   `/"id":"(tkt_[^"]+)"/` regex — the dev store mints `tkt_*` ids and
   Postgres mints cuids, and the response nests the ticket under
   `ticket.id`.
3. **The "all" chip count asserts the documented contract.** It counts
   the WHOLE fetched set, not the rows on screen — the feed paginates
   the LIST (`PAGE_SIZE = 20`) while the chips count over every
   ticket. The old assertion compared the chip against the rendered
   row count, which is only equal while the city has fewer tickets
   than one page.

### The twelve pre-existing failures

Not caused by this story, and each reproduced by stashing this change
set and re-running against `HEAD` (10c50a5):

- `tests/04-e2e-human-tester.spec.ts` — the admin status transition
  returns 401 because ADR-007 gates admin writes behind a fresh
  WebAuthn assertion. The spec predates that gate.
- `tests/20-citizen-photo-and-trail-light.spec.ts` (5) — the
  after-photo flow and its two visual baselines.
- `tests/27-admin-users-adoption.spec.ts` (6) — every admin user
  endpoint returns 401.

These twelve are the count **in dev-store mode**. In real mode the
same three specs report 23 failures, because they hard-code dev-store
ids and dev-only endpoints — a mode artefact, not a regression. The
dev-store count is the one that is comparable to `HEAD`.

### Notes for the reviewer

- **Zero hand-rolled `<button>` remain** across all six surfaces. The
  password reveal, the language pills, the resend control, the
  back-confirm dialog pair, the feed filter chips and the landing
  chips / reset / load-older all render from `components/ui/Button`.
  This was the one criterion the first pass missed.
- **A hydration mismatch was found and fixed on `/splash`.** An
  apostrophe inside a `<style>` CSS comment was HTML-escaped
  server-side, so the client render differed. The same class of bug
  was found and fixed on the landing page during the build.
- **The mockup baselines were regenerated in CI, not by hand.** The five
  Wave 2 mockup files were edited after the baselines were captured;
  regeneration is a CI concern (see the intent's open decisions).

