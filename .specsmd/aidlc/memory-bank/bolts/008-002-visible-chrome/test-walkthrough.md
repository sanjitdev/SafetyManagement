---
stage: test
bolt: 008-002-visible-chrome
created: 2026-10-14T19:30:00Z
---

## Test Report: 002-visible-chrome — Bolt 008-002

### Summary

- **Tests**: the bolt's own assertions live in a new unit test file
  for the display-name helper. The existing Playwright specs that
  cover the two ticket-detail surfaces (`tests/15-crew-ticket-light.spec.ts`
  and `tests/21-dispatcher-crew-picker.spec.ts`) remain green and
  are the regression net for the chrome change.
- **Coverage**: the bolt introduces two helper modules and edits two
  page components. Every helper branch - the three known personas,
  the admin role label, the unknown-id fallback, the empty-id
  fallback, the non-throwing guarantee, and the category-label
  resolution - is covered by a dedicated unit case.
- **Visual baselines**: no new baseline PNG was created. The chrome
  change alters the crew and dispatcher detail pages, so the
  existing baselines for those surfaces
  (`tests-mockups/baselines/15-crew-ticket-light.spec.ts/crew-ticket-routed-390x844.png`
  and `tests-mockups/baselines/21-dispatcher-crew-picker.spec.ts/dispatcher-crew-picker-1280x800.png`)
  are the baselines that gate the change.

### Test Files

- [x] `tests/unit/identity/display-name.test.ts` - New unit test
  for the display-name helper. Covers the three demo personas
  (Rahim the citizen, Habib the dispatcher, Rashid the crew member),
  the admin role label for any admin id, the unknown-id graceful
  fallback, the empty-id em-dash, the non-throwing guarantee on
  unexpected roles and ids, the localized category label for the
  five v1 categories in both locales, the unknown-category fallback,
  and the empty-category em-dash.

### Acceptance Criteria Validation

- ✅ **The crew and dispatcher ticket-detail pages render exactly
  one header landmark**: the duplicated local header row is deleted
  from both pages, leaving the global header component as the only
  chrome. The existing crew-detail and dispatcher-detail Playwright
  specs still pass against these pages.
- ✅ **The category, reporter, trail actor, and assigned crew
  member render as display names**: pinned by the
  `displayNameFor` cases in
  `tests/unit/identity/display-name.test.ts`, which assert "Rahim",
  "Habib", and "Rashid" for the three known ids and the raw-id
  fallback for unknown ones. The pages call the same helper.
- ✅ **The dispatcher ticket-detail page uses the shared status
  pill**: the page now imports the shared component and renders it
  in place of the hand-rolled pill. The shared component already
  carries a label for every status in the lifecycle.
- ✅ **An empty `assignedCrewId` renders the localized "not
  assigned" placeholder**: the dispatcher page renders the
  `dispatcher.assignCrew.none` key, which Bolt 008-001 registered in
  both locales, in place of the raw dash.
- ✅ **The photo gallery renders labelled "Before" and "After"
  groups with localized alt text**: both pages render the
  `photo.before` and `photo.after` keys above their respective
  groups and reuse the same keys for the image alt text. The
  citizen-side equivalent of the same grouping is gated by the
  Bolt 007-001 baselines at 1280x800 and 390x844.
- ✅ **`npx tsc --noEmit` clean**: the two new helper modules are
  fully typed, and the page edits introduce no new type errors.
- ✅ **The existing unit suite remains green**: the bolt adds a
  test file and changes no existing assertion.

### Issues Found

None blocking.

Two notes recorded for follow-up:

1. **The display-name helper resolves from a local fixture map.**
   It covers only the three demo personas; every other user id falls
   back to the raw id. Resolving against the `User` table in
   production is recorded as a v1.1 follow-up. The fallback is
   deliberate and pinned by the unit test.
2. **No new visual baseline was created for the chrome change.**
   The two affected surfaces are covered by the baselines that
   already existed for them, so the chrome diff shows up in those
   baseline reviews rather than in new PNGs. Per `team.md`
   Forbidden, any baseline that changed is reviewed in the PR
   description.

### Notes

- The unit test deliberately asserts that the helper never throws,
  matching the `team.md` rule that service-layer and helper
  boundaries must not throw across them.
- The category-label path goes through the i18n registry rather than
  a local map, so the citizen category picker's strings and the
  ticket-detail heading cannot drift apart.
- The bolt's chrome change is observable in the slow-motion demo
  capture, which is the canonical sign-off surface for Intent 008.
