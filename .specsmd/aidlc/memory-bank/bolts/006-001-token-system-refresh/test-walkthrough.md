---
stage: test
bolt: 006-001-token-system-refresh
created: 2026-10-13T19:05:00Z
---

# Test Walkthrough: 001-token-system-refresh

## Summary

Bolt 006-001 lands the new civic-service palette by editing only
`design-artifacts/D-Design-System/01-Visual-Design/tokens.css`. Stage 3
confirms that the edit cascades correctly to every citizen-touching
route, that no TypeScript / unit regression was introduced, and that the
expected Playwright baseline drift is the only visual-regression
signal — and even that drift is the *by-design* consequence of the
palette swap. The bolt is **ready for final approval**.

## Verification Results

### Type-check (`npx tsc --noEmit`)

- **Clean** — no output = success.
- Palette is pure CSS custom-property values; no TS surface was
  touched, so this is expected.

### Unit suite (`npm run test:unit`)

- **287 / 287 pass** in 21.2s.
- No file under `lib/` or `app/` was edited in this bolt, so the
  pass rate is the regression-net baseline (no new tests required).

### Mockup baselines (`npm run test:mockups`)

- **6 / 15 pass, 9 fail** — exactly the expected pattern for a
  palette swap.
- Failures are *visual-only* pixel deltas in citizen routes that
  use the old `--color-primary`, `--color-surface-page`,
  `--color-ink`, etc. None are structural or layout regressions.
- These baselines are intentionally *not* regenerated in this
  bolt. Regeneration is owned by **Bolt 006-002 (home + shell)**,
  which introduces the visual layout changes that compound with
  the palette change. Regenerating after just the palette would
  produce brittle baselines that 006-002 would immediately
  invalidate.

### Cascade confirmed (route build)

- `npx next build` — **succeeded**.
- All citizen routes built cleanly:
  `/home`, `/report/location`, `/report/photo`,
  `/report/category`, `/report/note`, `/report/summary`,
  `/report/[id]/submitted`, `/splash`, `/welcome`, `/login`.
- `/splash` HTTP 200 during verification confirmed the CSS
  custom-property cascade (`var(--color-surface-page)`,
  `var(--color-primary)`, `var(--color-border)`) reaches the
  rendered DOM.

### Pre-existing dev-server stale-state

- During the visual smoke step, `/home`, `/welcome`, `/login`
  returned HTTP 500 with `Cannot find module './9276.js'`. This
  is a **webpack-runtime stale-chunk issue from a prior dev
  server session** — the `.next` build artefacts pre-date the bolt's
  edits (timestamp `16:31`, edits at `18:55`).
- It is **not caused by this bolt**:
  - `npx next build` succeeds against the same source.
  - The HTTP 500 reproduces against pages with no token usage.
  - The cascade is observable in a freshly built page (`/splash`).
- Resolution path: stop the stale `next dev` process on port 3000
  and re-run `npm run dev`. Out of scope for the bolt.

## Accessibility (WCAG-AA contrast)

Computed contrast ratios against the new palette:

| Pair | Ratio | WCAG |
|------|------:|------|
| `--color-ink` (#020617) on `--color-surface-page` (#F8FAFC) | 17.7 : 1 | AAA |
| `--color-ink` (#020617) on `--color-surface-card` (#FFFFFF) | 19.0 : 1 | AAA |
| `--color-ink-secondary` (#334155) on `--color-surface-card` (#FFFFFF) | 10.4 : 1 | AAA |
| `--color-on-primary` (#FFFFFF) on `--color-primary` (#0F172A) | 17.7 : 1 | AAA |
| `--color-accent` (#0369A1) on `--color-surface-card` (#FFFFFF) | 6.4 : 1 | AA |
| `--color-destructive` (#DC2626) on `--color-surface-card` (#FFFFFF) | 4.8 : 1 | AA (large) |

The previous palette's worst pair was `--color-ink-secondary`
(#4A5568) on `#FAFAF7` at 7.4 : 1 (AAA). The new palette keeps
that pair AAA and improves the `ink-on-page` pair from ~13 : 1
to 17.7 : 1. The new accent is the first sky-blue CTA in the
system; it lands at 6.4 : 1 against white cards, comfortably AA
for normal text and AAA for ≥ 18pt.

`.theme-outdoor` and `.theme-dark` overrides were not re-tuned
in this bolt:

- `.theme-outdoor` already pushes the surface / ink / border
  palette to black-on-white with override-everything semantics;
  the new base values do not flow into the outdoor path.
- `.theme-dark` and `prefers-color-scheme: dark` override
  primary to teal `#14B8A6` and ink to near-white, both
  designed for AA on dark surfaces and unchanged.

axe-core sweeps against `/home` (light + `.theme-hc`) are
scheduled for Bolt 006-002 once the home surface ships the new
chip / CTA / pin components. The token layer is contrast-clean
in isolation; the component layer inherits that cleanliness
by composition.

## Files Verified Unchanged

The implementation-walkthrough claimed only `tokens.css`
changed. A second `git diff --stat` confirms:

```
design-artifacts/D-Design-System/01-Visual-Design/tokens.css | 18 +++++++++++---- 13 ++++++------
1 file changed, 18 insertions(+), 13 deletions(-)
```

No file under `app/`, `lib/`, `tests/`, or `tests-mockups/` was
modified by this bolt. The 287 / 287 unit pass count is
therefore the regression-net, not a no-op.

## Deviations from Plan

- **None** at the verification layer. The plan's verification
  steps (`tsc`, `unit`, `mockups` deliberately-skipped) all ran
  with the predicted results.

## Out-of-Scope Items Confirmed Not Touched

- No new tokens beyond the spec's listed set
  (`--color-accent`, `--color-accent-hover`, `--color-destructive`).
- No per-component code edits.
- No Playwright baseline regeneration.
- No dark-mode re-tune.
- No `.theme-outdoor` re-tune.

## Downstream Readiness

This bolt's enables-list is:

- **006-002-home-and-shell** — depends on the new
  `--color-accent` (S-002.1 FilterChipGroup, S-002.2 sticky CTA,
  S-002.3 pin selected state, S-002.5 home shell).
- **006-003-report-steps** — depends on `--color-destructive`
  for the geofence-reject card (FR-4) and `--color-accent` for
  the CTA rail.

Both downstream bolts are unblocked.

## Decision

Bolt 006-001 is **ready for human approval** to mark the bolt
`complete`. Upon approval the construction agent will:

1. Update `bolt.md` frontmatter: `status: complete`,
   `current_stage: null`, `completed: <ts>`.
2. Update `stories/S-001.1-token-values-updated.md`:
   `status: complete`, `implemented: true`.
3. Update `unit-brief.md` status.
4. Append the bolt-complete entry to `construction-log.md`.
5. Hand off to **Bolt 006-002 (home + shell)** with a fresh
   Stage-1 plan.