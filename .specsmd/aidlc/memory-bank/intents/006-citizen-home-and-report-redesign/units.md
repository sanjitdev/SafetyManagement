---
intent: 006-citizen-home-and-report-redesign
phase: inception
status: in-progress
created: 2026-10-13T18:10:00Z
updated: 2026-10-13T18:10:00Z
---

# Units: Citizen Home & Report-Flow Redesign

## Decomposition Strategy

The intent is decomposed along two axes:

1. **Foundation first** — the token system must land before any
   visual redesign is visible. This is the gating Unit (001).
2. **Layout primitives vs. page instances** — the new primitives
   (StepIndicator, ReportShell, FilterChipGroup, ReportCard) are
   extracted in their own Unit (003) so that Units 002 and 004 can
   compose them without duplicating layout code.

This yields **4 Units**:

| # | Unit | FRs | Bolt |
|---|------|-----|------|
| 001 | Token System Refresh | FR-1 | Bolt 006-001 (foundation) |
| 002 | Home Activity Redesign | FR-2, FR-10 (partial) | Bolt 006-002 (parallel with 003) |
| 003 | Report Flow Shell & Primitives | FR-3, FR-10 (rest) | Bolt 006-003 (parallel with 002) |
| 004 | Report Flow Steps | FR-4, FR-5, FR-6, FR-7, FR-8, FR-9 | Bolt 006-004 (last) |

## Dependency Graph

```
001 (Token System)
  │
  ├──► 002 (Home Redesign)        ──┐
  │                                 ├── both depend on 003's primitives
  └──► 003 (Shell & Primitives)   ──┘
                                      │
                                      ▼
                                   004 (5 Step Pages + Submitted)
```

- **001 → 002**: Home redesign renders against the new tokens. Cannot
  land before 001.
- **001 → 003**: Report shell renders against the new tokens. Cannot
  land before 001.
- **003 → 002**: Home uses `<ReportCard>` and `<FilterChipGroup>` from
  FR-10; these are extracted in 003. (Order 003 then 002; they can also
  land in the same bolt, see below.)
- **003 → 004**: All 5 step pages + submitted page use `<ReportShell>`,
  `<StepIndicator>`, etc. Cannot land before 003.
- **002 ⊥ 003**: 002 and 003 share dependencies (both need 001), and
  003 exports primitives that 002 consumes. They land in **the same
  bolt** (Bolt 006-002/003 are merged into Bolt 006-002 — see bolt
  plan).

## Units

### Unit 001 — Token System Refresh

- **Type**: Foundation
- **FRs covered**: FR-1
- **Stories**: 1
- **Complexity**: Small (mechanical, no behavioral change)
- **Description**: Update the hex values of all color, surface, and
  ink tokens in `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
  to the new civic-service palette. Token names are unchanged, so
  every component inherits the new look without code edits.
- **Acceptance**:
  - All hex values in `tokens.css` match the new palette spec.
  - `npx tsc --noEmit` is clean.
  - All 287 unit tests pass.
  - All 19 Playwright route specs pass.
  - All existing Playwright mockup baselines **fail** by design (the
    new palette changes every surface); the construction agent must
    regenerate them and surface the diff in the PR.
  - `.theme-hc` (high-contrast) still passes WCAG-AA contrast.
- **File**: `units/001-token-system-refresh/unit-brief.md`

### Unit 002 — Home Activity Redesign

- **Type**: Page redesign (consumer of FR-10 primitives)
- **FRs covered**: FR-2, FR-10 partial (consumes `<ReportCard>` +
  `<FilterChipGroup>` + `<StatusPill>`)
- **Stories**: 3
- **Complexity**: Medium
- **Description**: Update `/home` to the new visual + interaction
  spec: pin states, side-panel hierarchy, sticky-bottom CTA, floating
  map controls. Uses the new primitives from Unit 003.
- **Acceptance**:
  - All FR-2 acceptance criteria met.
  - The two-region layout (map + side panel) is preserved at
    ≥ 1025px; stacked at narrower widths.
  - Filter chip group is keyboard-navigable.
  - Sticky CTA on mobile (≤ 640px) is reachable in 1 tap from any
    scroll position.
- **File**: `units/002-home-activity-redesign/unit-brief.md`

### Unit 003 — Report Flow Shell & Primitives

- **Type**: Shared infrastructure
- **FRs covered**: FR-3, FR-10 (full)
- **Stories**: 4
- **Complexity**: Medium
- **Description**: Build the layout primitives that both the home
  page and the 5-step report flow compose:
  - `<StepIndicator>` (numbered circles + connecting line)
  - `<ReportShell>` (sticky top bar + sticky bottom action bar +
    in-card action row on desktop)
  - `<FilterChipGroup>` (chip-style toggle, keyboard-navigable)
  - `<StatusPill>` (already exists in some form — standardize the
    visual against the new palette)
  - `<ReportCard>` (denser list row + map variant)
  - And the `/report/*` layout that all 5 step pages + the
    submitted page share.
- **Acceptance**:
  - All new primitives live under `components/ui/`.
  - Each primitive has at least one Vitest unit test.
  - The primitives do not import from app routes.
  - All FR-3 acceptance criteria met.
  - The shell is visually consistent at 375 / 768 / 1024 / 1440 px.
- **File**: `units/003-report-flow-shell/unit-brief.md`

### Unit 004 — Report Flow Steps (5 steps + submitted)

- **Type**: Page redesign (5 step pages + confirmation)
- **FRs covered**: FR-4, FR-5, FR-6, FR-7, FR-8, FR-9
- **Stories**: 6
- **Complexity**: Large
- **Description**: Update each of the 5 step pages + the submitted
  confirmation to the new visual + interaction spec. Each page
  composes `<ReportShell>` from Unit 003.
- **Acceptance**:
  - All FR-4 through FR-9 acceptance criteria met.
  - The step transition is client-side; no full-page reload.
  - Form state is preserved across step changes (existing behavior,
    not changed by this intent).
  - Reduced-motion respect: every transition collapses to instant
    when `prefers-reduced-motion: reduce` is set.
- **File**: `units/004-report-flow-steps/unit-brief.md`

## Stories Per Unit (Summary)

| Unit | Stories |
|------|---------|
| 001 | S-001.1: Token values updated to new palette |
| 002 | S-002.1: Side-panel hierarchy + Filter chip group<br>S-002.2: Sticky CTA + floating map controls<br>S-002.3: Pin selected/unselected states |
| 003 | S-003.1: StepIndicator primitive<br>S-003.2: ReportShell + sticky top/bottom bars<br>S-003.3: FilterChipGroup primitive (keyboard + ARIA)<br>S-003.4: ReportCard + StatusPill standardization |
| 004 | S-004.1: Location step redesign<br>S-004.2: Photo step redesign<br>S-004.3: Category step redesign<br>S-004.4: Note step redesign<br>S-004.5: Summary step redesign<br>S-004.6: Submitted confirmation redesign |

**Total: 14 stories** across 4 units → **3 bolts** (Bolt 006-001
foundation, Bolt 006-002 = Units 002+003 merged, Bolt 006-003 = Unit 004).

## Bolt Plan (Summary; full details in `bolts/`)

| Bolt | Units | Stories | Complexity |
|------|-------|---------|------------|
| 006-001 | 001 | S-001.1 | Small — token values only |
| 006-002 | 002 + 003 | 7 stories | Medium — 2 redesigns + 5 primitives |
| 006-003 | 004 | 6 stories | Large — 5 step pages + submitted |

## Open Items

- The 5 open questions in `requirements.md` (5-step shape,
  theme-outdoor scope, map filter, photo CTA copy, language
  posture) have provisional defaults in `inception-log.md` and are
  re-stated in each unit-brief where relevant. None block unit
  decomposition.
- The construction agent may propose merging 002 and 003 into one
  bolt (already done above) or splitting 004 into two bolts (steps
  1–3 + steps 4–5 + submitted) at the bolt-plan stage. The current
  plan is 3 bolts; the construction agent owns the call.
