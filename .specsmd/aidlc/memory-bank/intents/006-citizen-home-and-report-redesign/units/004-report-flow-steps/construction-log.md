# Unit 004 — Report Flow Steps Construction Log

## Bolt 006-003 (Bolt type: ddd-construction-bolt, 5 stages)

### Stage 1 — Plan
- Read all 6 step pages + the submitted page.
- Read the layout, the tokens.css, and the new primitives
  (ReportShell, StepIndicator, StatusPill, etc.).
- Wrote `.specsmd/aidlc/memory-bank/bolts/006-003-report-steps/implementation-plan.md`.
- Updated the bolt frontmatter to `in-progress`.

### Stage 2 — Domain design
- Mapped each story's acceptance criteria to a concrete code
  change in the implementation plan. Identified the new i18n
  keys to add to `lib/i18n/keys.ts`.

### Stage 3 — Code generation
- Refactored all 6 step pages + the layout to use the new
  design language consistently (display type scale, token
  colors, monospace, sticky bottom action pattern).
- Added 20 new i18n keys (photo, category, note, summary,
  confirmation copy).
- Added a new pure-logic helper file
  (`tests/unit/components/reportStepHelpers.test.ts`) covering
  `filterCategories` and `validateNote`.

### Stage 4 — Build & test
- `npx tsc --noEmit` clean
- `npm run test:unit` → 320 / 320 (10 new tests)
- `npm run test:mockups` → 15 / 15
- `npx next build` succeeds
- Regenerated 10 Playwright baselines for the redesigned pages
  (07-report-see-and-pick, 08-report-location-map,
  06-home-feed)
- Restarted the dev server with `CITYFIX_DEV_STORE=1` so
  authenticated flow tests can sign in.

### Stage 5 — Operations handoff
- Dev server is live at `http://localhost:3000/`
- All 8 redesigned routes return HTTP 200
- The intent is ready for user browser verification.
