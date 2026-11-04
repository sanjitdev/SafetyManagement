---
story: 002-token-and-global-css-system
unit: 002-design-foundation
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:20:00Z
updated: 2026-11-02T19:10:00Z
implemented: true
---

# Story 002 — Token + Global CSS System

## User Story

**As a** page author
**I want** every colour, type step, radius, shadow and icon size
declared once in `tokens.css`
**So that** two pages can never disagree about what "primary" means.

## Acceptance Criteria

- **Given** the locked Accessible + Swiss palette
- **When** I read `tokens.css`
- **Then** `--color-primary` is `#1E40AF`, `--color-accent` is
  `#0369A1`, `--color-ink` is `#020617`, `--color-surface-page` is
  `#F8FAFC`, `--color-success` is `#15803D`, `--color-danger` is
  `#C81E1E`
- **And** `--shadow-focus`, `--icon-size-{sm,md,lg}`, `--border-input`
  and `--border-focus` are defined

- **And** **Given** the `.theme-dark` block
- **When** I compare it to the light block
- **Then** it defines no token the light block lacks
  (`tests/unit/admin-theme-tokens.test.ts`)

- **And** **Given** a `prefers-color-scheme: dark` preference
- **When** the page renders
- **Then** the dark tokens apply without a class

- **And** **Given** the `.theme-outdoor` block
- **When** I read it
- **Then** it is still pure black on pure white — deliberately not
  softened

- **And** the Bangla body line-height floor is 1.6
- **And** `app/globals.css` provides a focus-visible ring, a
  reduced-motion block, 8px rhythm utilities, `.sr-only`, a Bangla
  line-height correction and print styles
- **And** `app/layout.tsx` carries `themeColor` `#2C5282`

## BDD Scenarios

### Scenario 1: Every shipped colour pair clears AA

```gherkin
Given the token file
When I check every foreground/background pair in :root
Then every pair clears WCAG AA
```

### Scenario 2: No undefined token reference

```gherkin
Given a mockup, the component library or the gallery
When I collect every var(--token) reference
Then every name is declared in tokens.css
```

## Out of Scope

- Component implementations — Story 004.
- The chart primitives — Story 005.

## Linked Files

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
- `app/globals.css`
- `app/layout.tsx`
- `tests/unit/ui/tokens-contrast.test.ts`
- `tests/unit/ui/mockup-tokens.test.ts`
- `tests/unit/admin-theme-tokens.test.ts`

## Status

Shipped — commit `b279228`.
