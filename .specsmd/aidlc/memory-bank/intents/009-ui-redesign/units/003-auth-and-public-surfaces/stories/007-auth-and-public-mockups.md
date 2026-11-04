---
story: 007-auth-and-public-mockups
unit: 003-auth-and-public-surfaces
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:25:00Z
updated: 2026-11-02T19:10:00Z
implemented: true
---

# Story 007 — Auth + Public Mockups

## User Story

**As a** reviewer of the redesign
**I want** five static mockups for the entry surfaces
**So that** I can approve the direction before a line of page code is
written.

## Acceptance Criteria

- **Given** the Wave 1 foundation
- **When** I open `gallery.html`
- **Then** I see 12 mockups — the 7 Wave 1 ones plus 5 new cards
- **And** the coverage matrix lists the 5 new surfaces

- **And** the 5 mockups exist:
  `08-login.html`, `09-register.html`, `10-verify-otp.html`,
  `11-public-landing.html`, `12-feed.html`

- **And** every mockup references only `var(--color-*)` tokens defined
  in `tokens.css` — no hard-coded hex
  (`tests/unit/ui/mockup-tokens.test.ts`)
- **And** every mockup uses inline SVG icons — no emoji
- **And** every mockup's copy is Bangla-first
- **And** `tests/01-mockups.spec.ts` captures all five at 1440×900 and
  1024×768
- **And** 10 committed baselines exist under
  `tests-mockups/baselines/01-mockups.spec.ts/`
- **And** `npm run test:mockups` → **25/25** green

## BDD Scenarios

### Scenario 1: The sign-in mockup shows the civic story

```gherkin
Given mockups/08-login.html
When I open it at 1440x900
Then I see a form column on the left
  And I see a dark civic-story column on the right
  And at 1024x768 the story column collapses
```

### Scenario 2: The register mockup shows live password rules

```gherkin
Given mockups/09-register.html
When I open it
Then I see a three-stage progress rail
  And each password rule shows an icon, a word and a colour
```

### Scenario 3: The OTP mockup names its delivery channel

```gherkin
Given mockups/10-verify-otp.html
When I open it
Then I see six single-digit input boxes
  And I see the masked phone number
  And I see a delivery-state card naming SMS
  And I see a resend countdown
  And I see a recovery card
```

### Scenario 4: The landing shows live stats and a PII-free feed

```gherkin
Given mockups/11-public-landing.html
When I open it
Then I see a stats strip with tabular figures
  And I see a map card with status-coloured pins and a legend
  And I see a trust row
  And I see an activity feed with status pills that carry icon, word and colour
  And I see OSM / MapLibre attribution
```

### Scenario 5: The feed shows a "new" item by shape, not tint alone

```gherkin
Given mockups/12-feed.html
When I open it
Then I see the signed-in app header
  And I see sticky filter chips with live counts
  And the newest row carries a "new" badge
```

## Out of Scope

- The page implementation — Story 008.
- The citizen, dispatcher, crew and admin mockups — Units 004–007.

## Linked Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/08-login.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/09-register.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/10-verify-otp.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/11-public-landing.html`
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/12-feed.html`
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html`
- `tests/01-mockups.spec.ts`
- `tests/unit/ui/mockup-tokens.test.ts`

## Status

Shipped.
