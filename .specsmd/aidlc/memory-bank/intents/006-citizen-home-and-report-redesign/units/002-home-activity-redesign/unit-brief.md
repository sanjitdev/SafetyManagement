---
intent: 006-citizen-home-and-report-redesign
unit: 002-home-activity-redesign
phase: construction
status: complete
priority: must
created: 2026-10-13T18:20:00Z
updated: 2026-10-13T19:35:00Z
completed: 2026-10-13T19:35:00Z
depends_on: [001-token-system-refresh, 003-report-flow-shell]
---

# Unit 002 — Home Activity Redesign

## Scope

Update `/home` (citizen activity map + recent reports side panel) to
the new visual + interaction spec. The two-region layout is
preserved; the visual hierarchy, pin states, side panel rhythm, and
CTA placement are sharpened.

## FRs Covered

- FR-2 (Home page — Activity Map redesign)
- FR-10 (Layout primitives — consumer side; produces FilterChipGroup,
  ReportCard, StatusPill from Unit 003)

## Stories

| ID | Title | Priority |
|----|-------|----------|
| S-002.1 | Side-panel hierarchy + Filter chip group | Must |
| S-002.2 | Sticky CTA + floating map controls | Must |
| S-002.3 | Pin selected/unselected states | Must |

## Implementation Notes

### Files Touched

- `app/home/page.tsx` (or equivalent) — restructure the side panel
  to use the new `<ReportCard>` + `<FilterChipGroup>` primitives.
- `app/home/_components/` (if exists) — refresh the map pin
  component to the new selected/unselected state.
- `components/map/MapControls.tsx` (if exists) — move map controls
  to a floating action cluster, 48dp touch targets.
- `app/home/_components/CtaButton.tsx` (if exists) — pin to bottom
  on mobile.

### Constraint

- The two-region layout is preserved at ≥ 1025px (map left, side
  panel right); stacked at narrower widths.
- No new dependencies. The icon set is lucide-react (existing).
- Bangla-first: every new string goes through
  `lib/i18n/keys.ts`.

### Open Question (from `requirements.md`)

- **Q3 (default)**: home map shows all tickets by default with
  filter chips for "All / Open / Mine". The construction agent
  confirms the default at Bolt plan time.

## Acceptance Criteria

- [ ] FR-2 acceptance criteria met.
- [ ] At 375 / 768 / 1024 / 1440 px, the layout holds without
      horizontal scroll or overlap.
- [ ] Map is always ≥ 320px tall.
- [ ] Selecting a pin updates the URL to `?ticket=<id>` and
      scrolls the side panel to the matching card.
- [ ] Filter chip group is keyboard-navigable (Tab + Enter, arrow
      keys for chip group) with a 3-4px visible focus ring.
- [ ] The CTA is reachable in ≤ 1 tap from any scroll position on
      mobile (sticky bottom).
- [ ] Floating map controls have 48dp touch targets and a
      `--color-surface-card` background.
- [ ] All Bangla copy comes from `lib/i18n/keys.ts`.
- [ ] axe-core shows zero serious or critical issues on `/home`.
- [ ] All 287 unit tests + 19 Playwright route specs pass.
- [ ] `npx tsc --noEmit` is clean.
- [ ] Playwright mockup baselines for `/home` are reviewed in the
      PR (per `team.md` Forbidden).

## Verification

- `npx tsc --noEmit && npm run test:unit && npm run test:mockups`
- Manual: open `/home` locally; click each pin; click each
  filter chip; resize the window to 375 / 768 / 1024 / 1440.

## Out of Scope

- No changes to the dispatcher / crew / admin surfaces.
- No new API routes; the home consumes existing `GET /api/v1/tickets`.
- No new pin data; pin density cap (200 per viewport) is the
  existing MapLibre cluster pattern — not changed.
