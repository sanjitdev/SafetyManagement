---
id: 014-theme-appearance
unit: 005-theme-and-i18n
intent: 002-citizen-report-flow
status: in-progress
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 014-theme-appearance

## User Story

**As a** citizen
**I want** to switch between a light and dark theme
**So that** the app is comfortable to use at any
time of day.

**As a** platform engineer
**I want** every component to read colors and tokens
from `tokens.css` (CSS variables)
**So that** the theme is a single point of change.

## Acceptance Criteria

- [x] **Given** `tokens.css`, **When** I inspect it,
  **Then** it defines the light + dark palettes via
  CSS variables.
- [x] **Given** `lib/theme/`, **When** I import the
  provider, **Then** it reads the theme from
  `localStorage` and applies it to the root.
- [x] **Given** the theme toggle, **When** I tap it,
  **Then** the theme switches; the choice persists to
  `localStorage`.
- [x] **Given** every component, **When** I inspect
  the source, **Then** colors are read from CSS
  variables (no inline colors / fonts).

## Technical Notes

- Light is the default; dark is opt-in.
- The toggle is in `components/theme-toggle.tsx`.

## Dependencies

### Requires
- (none — foundational)

### Enables
- Every other WO-001+ story (theme is per-page)

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `localStorage` is unavailable | Default to `'light'` |
| Browser prefers dark | v1: still default to `'light'` (explicit choice); v1.1: respect `prefers-color-scheme` |
| Token missing in `tokens.css` | v1: fall back to the OS default; v1.1: type-checked tokens |

## Out of Scope

- A high-contrast theme (deferred to v1.1 if needed).
- `prefers-color-scheme` detection (deferred to v1.1).

## Status

Working code on the happy path. The toggle works, the
choice persists, and `tokens.css` is the design-token
source of truth.