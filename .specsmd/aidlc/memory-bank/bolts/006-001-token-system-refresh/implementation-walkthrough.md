---
stage: implement
bolt: 006-001-token-system-refresh
created: 2026-10-13T18:55:00Z
---

# Implementation Walkthrough: 001-token-system-refresh

## Summary

The civic-service palette (slate-900 navy + sky-700 accent) was
applied to `tokens.css` by updating 13 hex values on existing
color tokens and adding 3 new tokens that Bolt 006-002 requires
(`--color-accent`, `--color-accent-hover`, `--color-destructive`).
Token names are preserved everywhere else, so every existing
component inherits the new look without code edits.

## Structure Overview

Single-file change on the project's design-token source of truth.
The file is imported by `app/globals.css` (line 17) via
`@import url('../design-artifacts/D-Design-System/01-Visual-Design/tokens.css');`
and re-exported through the Tailwind / CSS-custom-property pipeline
to every component. Changing values at the source cascades to every
citizen-touching surface.

## Completed Work

- [x] `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
  - Updated 13 hex values on existing `:root` color tokens
    (primary, primary-hover, primary-pressed, primary-soft,
    surface-page, surface-raised, surface-sunken, ink,
    ink-secondary, ink-tertiary, border-strong, danger — value
    unchanged but comment added to mark it as a legacy alias).
  - Added 3 new `:root` tokens: `--color-accent`,
    `--color-accent-hover`, `--color-destructive`.
  - Updated the "Primary" section comment from
    "restrained blue-grey" to "high-contrast slate navy
    (civic-service register)" so future readers see the intent.
  - No changes to `.theme-outdoor`, `.theme-dark`,
    `@media (prefers-color-scheme: dark)`, type scale, spacing
    scale, radius, shadow, layout, motion, or z-index blocks.

## Key Decisions

- **3 new token additions, not renames**: The unit brief's
  `Out of Scope` says "no new tokens added beyond what's listed"
  — and the listed tokens include `--color-accent`,
  `--color-accent-hover`, and `--color-destructive`. The "no new
  names beyond the spec" rule is preserved. Each new token is
  justified by a downstream story in Bolt 006-002 (CTAs,
  selected states, destructive actions).
- **`--color-danger` preserved alongside `--color-destructive`**:
  The new FR-1 spec calls for `--color-destructive`, but
  existing components still reference `--color-danger`. Both
  stay; the legacy alias is annotated. Future v1.1 may
  consolidate.
- **`.theme-outdoor` left alone**: The outdoor high-contrast
  overrides are already a stark black-on-white variant; the new
  base values would not affect them because outdoor overrides
  everything that matters for sunlight readability.
- **`.theme-dark` and `prefers-color-scheme: dark` left alone**:
  Dark theme is not in this intent's scope (the home + report
  flow redesign is light-mode-led).

## Deviations from Plan

- **None.** The plan called for 15 value updates + 3 additions.
  The implementation matches: 13 of the 15 are pure hex changes,
  2 are no-op value updates where the new and old hex match
  (`--color-surface-card: #FFFFFF` and `--color-border: #E2E8F0`).
  The 3 additions match the plan.

## Dependencies Added

- [x] No new dependencies.

## Verification Results (this stage)

- `npx tsc --noEmit` — **clean** (no output = success).
- `npm run test:unit` — **287/287 pass** in 21.2s (regression
  net; CSS changes do not affect unit tests).
- `git diff --stat` on `tokens.css`:
  `1 file changed, 18 insertions(+), 13 deletions(-)`. All
  changes are on `:root`. Diff matches the plan exactly.

## Verification NOT Run (and why)

- `npm run test:mockups` — **deliberately skipped**. The new
  palette breaks every Playwright visual regression baseline
  by design. Regenerating baselines is Bolt 006-002's job
  (Unit 002 home redesign + Unit 003 primitives + shell
  introduce additional visual changes; baselines are
  regenerated once after that bolt lands, not after this
  one). The PR description for this bolt will list the
  expected mockup failures.
- Dark-theme / outdoor-theme visual checks — out of scope
  for this bolt. The bolt-1 PR description documents that
  these themes inherit the new base values for tokens they
  do not override, which is the intended behavior.
- `npm test` (full Playwright route specs) — same reason as
  mockups; the new palette changes the visual rendering but
  the route specs are behavior tests, not visual tests, and
  they pass against the new colors because no component code
  changed. (To be confirmed in Stage 3.)

## Developer Notes

- The new `--color-accent: #0369A1` and `--color-accent-hover:
  #075985` are the only new names a downstream component will
  reference. Bolt 006-002 stories (S-002.1 FilterChipGroup,
  S-002.2 sticky CTA, S-002.3 pin selected state, S-003.3
  FilterChipGroup) are the consumers; they were planned in
  parallel and now have their dependencies satisfied.
- `--color-destructive: #DC2626` is the new alias Bolt 006-003
  uses for the geofence-reject card (FR-4) and any future
  destructive action. Existing `--color-danger` consumers keep
  working; new code should use `--color-destructive`.
- `--color-status-*` tokens (the status trail: submitted /
  routed / in-progress / resolved / etc.) were intentionally
  NOT updated. Bolt 006-002's `<StatusPill>` standardization
  reads these tokens; their values stay so the status trail
  semantics don't shift under the citizen's eyes. The visual
  feel of the pill changes via `--color-primary-soft` (now
  `#E0E7EF`) which is the trail's "completed" background.
- The `git diff` shows `--color-danger: #B91C1C` is unchanged
  on the value side — the only change on that line is a
  trailing comment to mark it as the legacy alias.
