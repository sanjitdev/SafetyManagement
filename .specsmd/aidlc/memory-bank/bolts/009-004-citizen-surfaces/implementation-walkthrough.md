---
stage: implement
bolt: 009-004-citizen-surfaces
created: 2026-11-12T22:30:00Z
---

## Implementation Walkthrough: citizen-surfaces

### Summary

Two stories shipped. The four citizen mockups (`13`–`16`) establish the
visual contract for the citizen hub, the five-step report flow, the
report list and the report detail trail, and they are wired into the
gallery, the design README and the visual-baseline spec. The nine
citizen routes are then re-composed from the `components/ui/`
primitives to match that contract, without touching the API surface,
the role model, the transports or the data model.

Two foundations were carried alongside the pages. The public ticket
reference became a short `#TIX-NNNN` code derived from the internal id,
because the mockups and the shipped code had been telling different
stories for the whole of v1. The icon-only button primitive was rebuilt
so its tappable area meets the 44px touch floor without changing the
size of the visible control.

### Structure Overview

The wave adds no new module boundaries. The mockups are static HTML
built on `tokens.css` plus one shared stylesheet, `citizen-surfaces.css`,
that carries the chrome common to all four (`topbar`, `nav`, the ticket
reference pill, status rows, focus rings, selection and scrollbar
theming). The pages compose the existing primitives — `Button`,
`IconButton`, `StatusPill`, `Timeline`, `MetricStrip`, `FilterChipGroup`,
`StepIndicator`, `ReportStepAside`, `ReportStepPrimary` — and add no
primitive of their own.

Two small shared modules back the pages. `lib/report-status-group.ts`
owns the citizen-facing status grouping and its counting, so the filter
chips and the row list cannot disagree about what "Open" means.
`lib/format/ticket-id.ts` owns the public code derivation.

### Completed Work

**Story 009 — the mockups**

- [x] `design-artifacts/D-Design-System/01-Visual-Design/mockups/13-home-city-activity.html` - the citizen hub: map card, activity panel and KPI strip, rendered in the dark default.
- [x] `design-artifacts/D-Design-System/01-Visual-Design/mockups/14-report-shell.html` - the five-step report flow shell with the photo step in detail, the step rail, the live photo-cap indicator and the fixed bottom action bar.
- [x] `design-artifacts/D-Design-System/01-Visual-Design/mockups/15-my-reports.html` - the filterable list of the citizen's own reports, each row carrying the public `#TIX-` reference.
- [x] `design-artifacts/D-Design-System/01-Visual-Design/mockups/16-report-detail-trail.html` - the vertical status trail with a per-step icon and timestamp, plus the labelled before/after photo groups.
- [x] `design-artifacts/D-Design-System/01-Visual-Design/mockups/citizen-surfaces.css` - the chrome shared by all four mockups; one stylesheet rather than four copies.
- [x] `design-artifacts/D-Design-System/01-Visual-Design/gallery.html` - cards for the four new mockups, the count raised to 16 and the coverage matrix extended.
- [x] `design-artifacts/D-Design-System/01-Visual-Design/README.md` - the file table, the tree and the coverage rationale.
- [x] `tests/01-mockups.spec.ts` - the four new mockups registered for the large and medium viewports.
- [x] `tests-mockups/README.md` - the baseline table extended for the new rows.

**Story 010 — the pages**

- [x] `app/home/page.tsx` - the citizen hub: a CTA on its own brand-filled surface, the figures through one shared metric surface, and the activity panel.
- [x] `app/report/(create)/layout.tsx` - the focused flow shell: the step rail, the progress sentence, and the flow variant of the app chrome.
- [x] `app/report/(create)/location/page.tsx` - step one: the map, the geofence, the ward and the reverse-geocoded address.
- [x] `app/report/(create)/photo/page.tsx` - step two: the filled and empty photo slots, the live cap indicator and its accessible name, the first-photo guidance and the remove control.
- [x] `app/report/(create)/category/page.tsx` - step three: the category grid.
- [x] `app/report/(create)/note/page.tsx` - step four: the note field with its counter and its over-limit state.
- [x] `app/report/(create)/summary/page.tsx` - step five: the dedup prompt with both options explained, the confirm gate and the fixed submit bar.
- [x] `app/report/[id]/submitted/page.tsx` - the confirmation surface.
- [x] `app/reports/page.tsx` - the filterable list of the citizen's own reports.
- [x] `app/reports/[id]/page.tsx` - the detail trail with the before/after photo groups and the public reference pill.
- [x] `app/reports/[id]/feedback-prompt.tsx` - the feel-heard feedback prompt.
- [x] `app/verify-otp/page.tsx` - the phone-verification step, re-composed to the same shell.

**Shared chrome and primitives**

- [x] `components/AppShell.tsx` - the flow variant: no role sidebar, no inline nav, and no report CTA, so a step page cannot navigate away from the draft in progress.
- [x] `components/AppHeader.tsx` - the flow variant of the header: brand, task tag and the two global controls.
- [x] `components/ui/IconButton.tsx` - the touch-target rebuild (see Key Decisions).
- [x] `components/ui/ReportStepAside.tsx` - the shared step aside: one pill format, one heading scale, one action row.
- [x] `app/globals.css` - the single-column rule for the focused flow shell.

**Foundations**

- [x] `lib/format/ticket-id.ts` - the public code derivation: a FNV-1a hash of the internal id rendered as four base-36 characters.
- [x] `lib/report-status-group.ts` - the citizen-facing status grouping and its counting.
- [x] `lib/i18n/keys.ts` - every new user-facing string, in Bangla and English.

**Tests**

- [x] `tests/33-ui-redesign-citizen.spec.ts` - the citizen route spec: the flow progress and cap indicator, the dedup prompt, the report list, the detail trail and photo groups, the absence of any raw internal id, and the public code's provenance.
- [x] `tests/unit/format/ticket-id.test.ts` - the public code's shape, determinism and backend-independence.
- [x] `tests/unit/lib/report-status-group.test.ts` - the status grouping and the parity between the chips and the API's own filter.
- [x] `tests/unit/components/IconButton.test.tsx` - the touch-target contract alongside the accessible-name contract.
- [x] `tests/unit/ui/mockup-tokens.test.ts` - the token-purity check widened to cover the shared stylesheet as well as the mockups.
- [x] `tests/32-ui-redesign-auth.spec.ts` - the language-cookie fix, so the English-copy assertions read the server's English render.

### Key Decisions

- **The public ticket reference is derived, not stored.** The mockups render `#TIX-NNNN` and the shipped code rendered a dev-store id or a Prisma cuid. A new column would have been the clean answer but it is a data-model change, and this wave is presentation-only. The code is a FNV-1a hash of the internal id rendered as four base-36 characters, so both backends produce the same shape. A sequential public code stays a candidate for the data-model layer.
- **The icon button's hit area is the button, and the visible control is drawn inside it.** Three earlier arrangements were measured in a browser and all failed: sizing padding on the button grew the painted control to 58px; a transparent overlay on the button resolved its inset against the padding box and came up short; the same overlay on a wrapper was a sibling of the button and swallowed every click. Making the button itself 44 by 44 and drawing the visual inside it is the only arrangement where a click at the edge of the target reaches the handler.
- **The flow shell drops the sidebar and the report CTA.** The sidebar's third item points at the first step of the flow the citizen is already in the middle of, and the header's report CTA points at the same place. Either one silently discards a draft. The avatar is kept: the report flow is the only place a signed-in citizen can log out.
- **The step position is stated once per surface.** The rail states it as a sentence under the rail, and the aside states it as a pill. The summary step previously carried a third, hand-rolled form with different numerals and different spacing; it now uses the shared aside like every other step.
- **Token purity is a test, not a discipline.** An undefined `var()` resolves to nothing and silently drops the declaration it belongs to, which is how a token rename broke seven mockups with no console error and no build error.
- **The route spec is backend-agnostic.** The city, category and ward are discovered off the first row of the public activity feed rather than hard-coded, the ticket id is read from the response body, and the chip counts are asserted against the API's own total rather than the rendered row count.

### Deviations from Plan

- **The flow shell keeps the avatar.** The mockup's flow bar omits it, but the flow shell carries the only logout control a signed-in citizen can reach. Recorded in `_progress/00-design-log.md`.
- **The summary step's submit control sits in the fixed bottom bar, not in the card.** The card keeps the "link to the existing report" option, which is a decision about the existing report rather than the flow's continue control.
- **The em-dash carve-out is explicit.** The craft brief's prose rule and its own quoted progress sentence contradicted each other. The brief now carves out the progress sentence's separator as structural rather than decorative, and the step-5 pill's divergent em-dash form is gone with the shared aside.
- **The eight visual baselines are not in the tree.** They are generated on the CI platform by the baseline-regeneration workflow, never captured by hand on a Windows machine.

### Dependencies Added

- [x] `playwright` - the citizen route spec and the visual baselines. Already a project dependency.

### Developer Notes

- One dev server per `.next`. Two servers against the same directory corrupt the route manifest: routes 404 while still existing on disk, and the symptom looks exactly like a code defect.
- Baselines are captured on `ubuntu-latest`. A Google Fonts metric difference between platforms silently moves a page height and breaks a baseline.
- The route spec needs the pinned clock in the test process, or the time-window assertions fail as if the product were broken.
- `route.continue` with rewritten headers hangs if the original content length is replayed. Delete it before the override.
- The em-dash ban covers prose, not a delimiter that carries meaning. The progress sentence's separator is the one sanctioned exception.
