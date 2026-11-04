---
story: 017-full-gate-and-accessibility-pass
unit: 008-verification-and-signoff
intent: 009-ui-redesign
status: draft
created: 2026-11-02T18:50:00Z
updated: 2026-11-02T18:50:00Z
implemented: false
---

# Story 017 — Full Gate + Accessibility Pass

## User Story

**As a** reviewer of the redesign
**I want** the full gate green and an explicit accessibility pass
**So that** "modern and professional" is a verified claim rather than
an opinion.

## Acceptance Criteria

- **Given** units 001–007 are complete
- **When** I run the full gate
- **Then** every command is green:

  | Gate | Command | Target |
  |------|---------|--------|
  | Types | `npx tsc --noEmit` | clean |
  | Lint | `npm run lint` | 0 errors |
  | Unit | `npm run test:unit` | green |
  | Coverage | `npm run test:unit:coverage` | ≥80% |
  | Visual | `npm run test:mockups` | green |
  | i18n | `npm run check:i18n` | green |
  | Build | `npm run build` | green |
  | Route specs | `tests/32`–`tests/36` | green |
  | CI | — | green on `main` |

- **And** every committed baseline is regenerated or captured
- **And** the superseded baselines (`02-home-city-activity`,
  `05-daily-queue-dashboard`, `06-field-app-home`,
  `07-status-in-progress`) are retired so the gallery shows one design
  per surface

- **And** the accessibility pass is complete:
  - contrast audited on every token pair in all three theme contexts
  - keyboard walk on `/login` and `/dispatcher` — tab order, focus
    visibility, focusable error summaries, no keyboard trap
  - `prefers-reduced-motion` honoured
  - every icon-only control has a screen-reader label
  - no colour-only status encoding anywhere

## BDD Scenarios

### Scenario 1: The gate is green

```gherkin
Given the redesign is complete
When I run the full gate
Then every command exits zero
```

### Scenario 2: The keyboard can complete a sign-in

```gherkin
Given I am on /login with no mouse
When I tab through the form and submit
Then I reach every field and the submit button in order
  And each focused element has a visible focus ring
```

## Out of Scope

- Fixing pre-existing issues outside the redesign's surface.

## Linked Files

- `tests-mockups/baselines/01-mockups.spec.ts/**`
- `tests/01-mockups.spec.ts`
- `tests/29-admin-dark-theme.spec.ts`
- `tests/32-ui-redesign-*.spec.ts` … `tests/36-ui-redesign-*.spec.ts`

## Status

Draft.
