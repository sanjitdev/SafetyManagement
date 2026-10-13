# Bolt 006-003 — Implementation Walkthrough

## What landed

### `/report/location` (S-004.1)
- Side card now uses the display type scale (`--text-display-md`)
  for the H1, the ink-secondary text color for instruction copy,
  and a tabular mono font for coordinates.
- The 480px cap is enforced via `var(--report-side-panel)` (the
  design token introduced in Bolt 006-001).
- On mobile (≤ 1024px) the layout collapses to a single column
  with the map taking 60% of the screen height and the card the
  remaining 40% (media query in `<style>` inside the page).
- The geofence-reject card uses `--color-destructive` as a 4px
  left border + a destructive X icon + the existing one-sentence
  body. The "Adjust the pin" button snaps the pin back to the
  nearest in-bounds point via the existing
  `clampToGeofence` helper.
- A second, mobile-only overlay banner mirrors the same reject
  UX so a phone user sees the error even though the card may be
  hidden behind the map.

### `/report/photo` (S-004.2)
- Added a primary "Add photo" action area (camera icon + label,
  96dp tall, full-width) that calls the file input. The input
  has `capture="environment"` so phones with `getUserMedia`
  open the rear camera; desktop falls back to the file picker.
- Live counter pill ("{count} of {cap} added") with
  `aria-live="polite"` semantics. The pill's dot changes from
  accent (in progress) to success (cap reached).
- The thumbnail grid became a horizontal scroll strip with
  remove "X" overlays. Each thumbnail has
  `role="listitem"` so the strip is exposed as a proper list
  to assistive tech.
- When the cap is reached, the primary action is disabled and
  a `title` tooltip explains the cap. The "Continue" button
  uses 50% opacity + `aria-disabled="true"` for the disabled
  state (matches the unit-brief acceptance criteria).

### `/report/category` (S-004.3)
- New search/filter input at the top with a magnifying-glass
  inline SVG. 200ms debounce via `setTimeout` in a
  `useEffect`.
- The list is now a 2-column CSS grid
  (`repeat(auto-fill, minmax(240px, 1fr))`) on desktop; 1
  column on mobile via the responsive collapse.
- Each card has an icon (circle-check), Bangla name (large),
  English name (caption, secondary text), and shows a checkmark
  badge in the top-right when selected. The card's
  `role="radio"` + `aria-checked` semantics make the grid
  function as a radio group.
- The exported `filterCategories` pure function is unit-tested
  in `tests/unit/components/reportStepHelpers.test.ts`.

### `/report/note` (S-004.4)
- Hard limit reduced from 500 to 280 to match the spec. A
  pure-logic `validateNote` helper (exported from the page
  module) is unit-tested in the same file.
- Visible `<label htmlFor="report-note-textarea">` above the
  field; helper text below (id `report-note-helper`) is wired
  to the textarea via `aria-describedby`.
- Character counter at the bottom-right with
  `aria-live="polite"` and a `font-variant-numeric:
  tabular-nums` style so the digits don't jitter.
- The border turns `--color-destructive` red and the counter
  turns red when the user attempts to exceed 280 chars; the
  submit button is also disabled.
- The submit button now has a spinner (CSS keyframe
  `report-spin`) when in flight and `aria-busy="true"` on the
  button.

### `/report/summary` (S-004.5)
- The "existing report" banner became a 2-column grid (1 col on
  mobile) with the thumbnail on the left and the label/status
  metadata on the right.
- A "Confirm" checkbox is now required before "Submit as new
  report" is enabled.
- The submit button has the same spinner + `aria-busy`
  pattern as the note step.
- Inline error card with a retry flow.

### `/report/[id]/submitted` (S-004.6)
- Replaced the inline SVG with a 96dp green checkmark
  (CircleCheck-style inline SVG, color from
  `--color-status-resolved`).
- H1 uses the display type scale (md on mobile, lg on desktop
  via media query).
- Reference ID is mono-fonted, `user-select: all` so the
  citizen can copy it the old-fashioned way, and there's a
  "Copy" button next to it. On click, the ID is written to
  the clipboard via `navigator.clipboard.writeText` (with a
  `document.execCommand('copy')` fallback for older browsers)
  and a "Copied" toast appears for 1.5s with
  `aria-live="polite"`.
- A new "What happens next" section (Bangla) lists the three
  steps the citizen can expect.
- The success checkmark animation (1.2s scale-pop) is gated
  on a `sessionStorage` flag (`cityfix.reportSubmittedAnimated.v1`)
  so reloads of the same URL don't re-animate.
- "View report" + "Back to home" CTAs unchanged in semantics;
  the "Back to home" now routes to `/home` (not `/`).

## Files touched

```
app/report/location/page.tsx                  (restructured)
app/report/photo/page.tsx                     (restructured)
app/report/category/page.tsx                  (restructured)
app/report/note/page.tsx                      (restructured)
app/report/summary/page.tsx                   (restructured)
app/report/[id]/submitted/page.tsx            (restructured)
lib/i18n/keys.ts                              (added ~20 keys)
tests/unit/components/reportStepHelpers.test.ts (new)
tests-mockups/baselines/07-report-see-and-pick-light.spec.ts/*.png  (regenerated)
tests-mockups/baselines/08-report-location-map-light.spec.ts/*.png  (regenerated)
tests-mockups/baselines/06-home-feed-light.spec.ts/*.png            (regenerated)
```

## Verification

- `npx tsc --noEmit` → clean
- `npm run test:unit` → 320 / 320 pass (10 new tests)
- `npm run test:mockups` → 15 / 15 pass
- `npx next build` → succeeds
- Live dev server: all 8 redesigned routes return HTTP 200
- Dev store (`/api/dev/login`) returns 303 (functional)

## Out-of-scope deferrals

- The 12-dispatcher-dedup test failures (5) are unrelated API
  tests that need seeded dispatcher data; they were failing
  before this bolt and remain failing.
- The 08 dedup-ring baseline regeneration timed out on
  `networkidle` (the map keeps polling). The other 10
  baselines in 07/08/06 regenerated successfully.
