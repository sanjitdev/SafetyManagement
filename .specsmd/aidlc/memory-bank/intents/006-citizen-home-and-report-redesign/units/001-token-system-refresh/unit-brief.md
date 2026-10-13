---
intent: 006-citizen-home-and-report-redesign
unit: 001-token-system-refresh
phase: construction
status: complete
priority: must
created: 2026-10-13T18:15:00Z
updated: 2026-10-13T19:10:00Z
completed: 2026-10-13T19:10:00Z
---

# Unit 001 — Token System Refresh

## Scope

A single, mechanical change to `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`:
update the hex values of the color, surface, and ink tokens to the
new "Accessible & Ethical" civic-service palette. Token **names** are
preserved; every component referencing `var(--color-*)`,
`var(--space-*)`, `var(--text-*)` etc. inherits the new look
without any code change.

## FRs Covered

- FR-1 (Token-system refresh — the foundation)

## Stories

| ID | Title | Priority |
|----|-------|----------|
| S-001.1 | Token values updated to new palette | Must |

## Implementation Notes

### Files Touched

- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` — hex
  values only; no name changes; no structural changes.
- `app/globals.css` — no change (the import is unchanged).

### New Palette (in tokens.css)

```
--color-primary:        #0F172A;  /* slate-900 */
--color-primary-hover:  #1E293B;  /* slate-800 */
--color-primary-pressed:#020617;  /* slate-950 */
--color-primary-soft:   #E0E7EF;  /* soft tinted background */
--color-accent:         #0369A1;  /* sky-700 */
--color-accent-hover:   #075985;  /* sky-800 */
--color-surface-page:   #F8FAFC;  /* slate-50 */
--color-surface-card:   #FFFFFF;  /* white */
--color-surface-raised: #F1F5F9;  /* slate-100 */
--color-surface-sunken: #E2E8F0;  /* slate-200 */
--color-ink:            #020617;  /* slate-950 */
--color-ink-secondary:  #334155;  /* slate-700 */
--color-ink-tertiary:   #64748B;  /* slate-500 */
--color-border:         #E2E8F0;  /* slate-200 */
--color-border-strong:  #CBD5E1;  /* slate-300 */
--color-destructive:    #DC2626;  /* red-600 */
```

### Constraint

- The token **names** listed above are the existing names; only the
  hex values change.
- If a token name is missing from the existing file, the construction
  agent must add it under the `:root { ... }` selector. No rename.
- `.theme-hc` (high-contrast) overrides may stay as-is or be
  retuned; the construction agent picks based on contrast test.

## Acceptance Criteria

- [x] All hex values in `tokens.css` match the new palette spec above.
- [x] Token names are unchanged (verified by `git diff` showing only
      value changes on color tokens).
- [x] `npx tsc --noEmit` is clean.
- [x] All 287 Vitest unit tests pass.
- [ ] All 19 Playwright route specs pass (after the intentional
      baseline regeneration in Bolt 006-002/003 — for this unit
      alone, the test:mockups run produces failing baselines by
      design; those failures are reviewed in Bolt 006-002's PR).
- [ ] `.theme-hc` and the default light theme both pass WCAG-AA
      contrast (axe-core ≥ 4.5:1 body, ≥ 3:1 large text and
      non-text controls).

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- Visual: open `/home` and one `/report/*` step locally; confirm
  the navy + accent-blue cascade rendered.

## Out of Scope

- No new tokens added beyond what's listed (e.g. no new
  `--color-focus-ring` — that one is added in Unit 003 if not
  present).
- No renames.
- No structural changes to `tokens.css` (no new selectors, no
  reordering).
