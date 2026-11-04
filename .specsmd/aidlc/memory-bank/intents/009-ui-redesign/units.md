---
intent: 009-ui-redesign
phase: inception
status: in-progress
created: 2026-11-02T18:10:00Z
updated: 2026-11-02T19:10:00Z
---

# Units: 009-ui-redesign

## Decomposition Strategy

The redesign decomposes **by wave**, not by surface. A wave is the
smallest unit that can be visually approved as a unit: the mockups are
designed together, the pages that use them are implemented together,
and the gate is the wave's full test suite. Splitting by persona (say,
"all the buttons" then "all the cards") would produce a system nobody
ever sees whole, and the approval gate would be meaningless.

Each wave has a hard shape:

1. **Mockups** — static HTML under
   `design-artifacts/D-Design-System/01-Visual-Design/mockups/`,
   built on `tokens.css` only, wired into `gallery.html` and the
   Playwright baseline spec.
2. **Approval gate** — a human opens the mockups and signs off.
   Recorded in `_progress/00-design-log.md`.
3. **Implementation** — the wave's routes are re-composed from
   `components/ui/` primitives.
4. **Route specs + baselines** — a Playwright route spec per route, and
   a committed visual baseline per route.
5. **Exit gate** — the full suite listed in `requirements.md` FR-8.

Wave 0 and Wave 1 precede the approval loop because a broken CI gate
masks every later regression, and because the foundation has to exist
before a single page can be composed from it.

This yields **8 Units** and **8 Bolts** — one bolt per wave.

## Requirement-to-Unit Mapping

- **FR-1** (CI unblocked) → `001-ci-unblock`
- **FR-2** (design foundation) → `002-design-foundation`
- **FR-3** (auth + public) → `003-auth-and-public-surfaces`
- **FR-4** (citizen) → `004-citizen-surfaces`
- **FR-5** (dispatcher) → `005-dispatcher-console`
- **FR-6** (crew) → `006-crew-field-app`
- **FR-7** (admin) → `007-admin-console`
- **FR-8** (verification) → `008-verification-and-signoff`

## Dependency Graph

```
001 (ci unblock) ──▶ 002 (design foundation) ──▶ 003 (auth + public)
                                                       │
                          ┌────────────────────────────┼────────────────────────────┐
                          ▼                            ▼                            ▼
                    004 (citizen)             005 (dispatcher)              006 (crew)
                          │                            │                            │
                          └────────────────────────────┼────────────────────────────┘
                                                       ▼
                                                    007 (admin)
                                                       │
                                                       ▼
                                            008 (verification + signoff)
```

- **001 → 002** is strict. A red CI gate cannot be trusted to catch a
  token-contrast regression.
- **002 → every wave** is strict. No page may be implemented before the
  primitives exist.
- **003, 004, 005, 006** are mutually independent — they touch
  disjoint route trees and disjoint mockup files.
- **007 → 008** is strict.
- **006 → 007** is *soft*: the admin console reuses the crew's
  high-contrast pattern for its "outdoor" city-setup screens, but the
  admin unit does not block on the crew unit.

## Units

### Unit 001 — CI Unblock

- **Type**: Backend-foundation (build-pipeline + guard fix)
- **FRs covered**: FR-1
- **Stories**: 1
- **Complexity**: Small (2 production files, 1 new unit test)
- **Description**: Move `assertProductionDatabaseConfig()` from
  module-load to first real DB use behind a lazy proxy over the
  Prisma client; fix the `prefer-const` error in the role-walkthrough
  spec.
- **Acceptance**:
  - The guard fires on the first request, never on the build.
  - `tests/unit/db-lazy-guard.test.ts` covers the lazy path.
  - lint 0 errors · tsc clean · unit green · build green · CI green on
    `main`.
- **Status**: shipped (commit `45062d1`)
- **File**: `units/001-ci-unblock/unit-brief.md`

### Unit 002 — Design Foundation

- **Type**: Frontend feature (shared library)
- **FRs covered**: FR-2
- **Stories**: 5
- **Complexity**: Large (tokens, global CSS, icon registry, 27
  primitives, 5 chart primitives, 4 brand assets, 2 dependency
  additions, ~19 new test files)
- **Description**: Build the layer every later wave composes from —
  the AA-verified token system, the global CSS layer, the Phosphor
  icon registry, the primitive library, the chart primitives with data
  tables, and the CityFix brand assets.
- **Acceptance**:
  - Every primitive has a unit test and a barrel export.
  - Every colour pair clears AA in all three theme contexts.
  - `StatusPill` renders icon + word + colour.
  - Every chart ships a visible sortable data table.
  - Brand assets exist with attribution notices and a documented swap
    slot for the city seal.
- **Status**: shipped (commit `b279228`)
- **File**: `units/002-design-foundation/unit-brief.md`

### Unit 003 — Auth + Public Surfaces

- **Type**: Frontend feature (mockup + implementation)
- **FRs covered**: FR-3
- **Stories**: 2
- **Complexity**: Medium (5 mockups + 6 route re-compositions + 6
  route specs + ~10 new baselines)
- **Description**: Design and then build the entry surfaces — sign-in,
  account creation, phone verification, the anonymous landing, the
  signed-in activity feed and the splash.
- **Acceptance**:
  - The 5 mockups are approved, token-pure, emoji-free and wired into
    the gallery + baseline spec.
  - The 6 routes are composed from primitives, with a focusable error
    summary + inline `role="alert"` on every invalid-input path.
  - The public landing stays PII-stripped.
  - Route specs + baselines are committed.
- **Status**: mockups shipped; page implementation pending
- **File**: `units/003-auth-and-public-surfaces/unit-brief.md`

### Unit 004 — Citizen Surfaces

- **Type**: Frontend feature (mockup + implementation)
- **FRs covered**: FR-4
- **Stories**: 2
- **Complexity**: Medium (4 mockups + 9 route re-compositions + route
  specs + baselines)
- **Description**: The citizen hub, the five-step report flow, the
  confirmation, the list and the detail trail.
- **Acceptance**: Mockups approved; the report flow keeps its
  progress indicator, photo cap indicator, dedup prompt and the
  vertical `Timeline` trail; route specs + baselines committed.
- **Status**: not started
- **File**: `units/004-citizen-surfaces/unit-brief.md`

### Unit 005 — Dispatcher Console

- **Type**: Frontend feature (mockup + implementation)
- **FRs covered**: FR-5
- **Stories**: 2
- **Complexity**: Large (5 mockups + 6 route re-compositions + charts +
  route specs + baselines)
- **Description**: The dispatcher's cockpit — triage queue, ticket
  detail, map, dedup review, live monitor (dark ops board) and
  performance reporting.
- **Acceptance**: Mockups approved; the 3-region layout, sticky action
  bar, SLA countdown chip and searchable crew picker survive; the
  trend + category charts are labelled and tabular; route specs +
  baselines committed.
- **Status**: not started
- **File**: `units/005-dispatcher-console/unit-brief.md`

### Unit 006 — Crew Field App

- **Type**: Frontend feature (mockup + implementation)
- **FRs covered**: FR-6
- **Stories**: 2
- **Complexity**: Small-Medium (2 mockups + 2 route re-compositions)
- **Description**: Rashid's field surfaces — today's assignments and
  the hands-busy ticket detail in the high-contrast outdoor theme.
- **Acceptance**: Mockups approved; ≥48px touch targets; one-thumb
  capture; before/after photo labels preserved; `.theme-outdoor`
  preserved and AA-verified.
- **Status**: not started
- **File**: `units/006-crew-field-app/unit-brief.md`

### Unit 007 — Admin Console

- **Type**: Frontend feature (mockup + implementation)
- **FRs covered**: FR-7
- **Stories**: 2
- **Complexity**: Large (5 mockups + 10 route re-compositions + the
  densest data-table work + charts)
- **Description**: The admin's surfaces — console, tickets, ticket
  detail, audit stream, city setup, wards, taxonomy, users and the
  adoption dashboard.
- **Acceptance**: Mockups approved; sortable + focusable table
  headers with `aria-sort`; bulk selection; CSV-export affordance;
  audit actor + action chips; adoption KPI row + trend + category bar
  + SLA bullet; route specs + baselines committed.
- **Status**: not started
- **File**: `units/007-admin-console/unit-brief.md`

### Unit 008 — Verification & Sign-off

- **Type**: Cross-cutting (full gate + documentation)
- **FRs covered**: FR-8
- **Stories**: 2
- **Complexity**: Medium (regenerate ~43 baselines + the accessibility
  pass + 4 documentation files)
- **Description**: Regenerate every committed baseline, capture the new
  ones, run the full gate across every theme and locale, and refresh
  the project documentation.
- **Acceptance**: The full gate in FR-8 is green; the accessibility
  pass is signed off; the design log, the WDS outline and the design
  system hub are current.
- **Status**: not started
- **File**: `units/008-verification-and-signoff/unit-brief.md`

## Stories Per Unit (Summary)

| Unit | Stories |
|------|---------|
| 001 | S-001.1: Lazy production DB guard |
| 002 | S-002.1: Token + global CSS system<br>S-002.2: Phosphor icon registry<br>S-002.3: UI primitive library<br>S-002.4: Chart primitives with data tables<br>S-002.5: CityFix brand assets |
| 003 | S-003.1: Auth + public mockups<br>S-003.2: Auth + public page implementation |
| 004 | S-004.1: Citizen mockups<br>S-004.2: Citizen page implementation |
| 005 | S-005.1: Dispatcher mockups<br>S-005.2: Dispatcher page implementation |
| 006 | S-006.1: Crew mockups<br>S-006.2: Crew page implementation |
| 007 | S-007.1: Admin mockups<br>S-007.2: Admin page implementation |
| 008 | S-008.1: Full gate + accessibility pass<br>S-008.2: Project documentation refresh |

**Total: 18 stories** across 8 units → **8 bolts** (one per wave).

## Bolt Plan (Summary)

| Bolt | Type | Stories | Unit IDs | Complexity |
|------|------|---------|----------|------------|
| 009-001 | simple-construction-bolt | S-001.1 | 001 | Small |
| 009-002 | simple-construction-bolt | S-002.1 … S-002.5 | 002 | Large |
| 009-003 | simple-construction-bolt | S-003.1, S-003.2 | 003 | Medium |
| 009-004 | simple-construction-bolt | S-004.1, S-004.2 | 004 | Medium |
| 009-005 | simple-construction-bolt | S-005.1, S-005.2 | 005 | Large |
| 009-006 | simple-construction-bolt | S-006.1, S-006.2 | 006 | Small-Medium |
| 009-007 | simple-construction-bolt | S-007.1, S-007.2 | 007 | Large |
| 009-008 | simple-construction-bolt | S-008.1, S-008.2 | 008 | Medium |

Sequence: 001 → 002 → 003 → {004, 005, 006} → 007 → 008. Units 004,
005 and 006 may run in any order, and in parallel if the team splits.

## Open Items

- The mockup approval gate is a human sign-off. The mechanism is a
  recorded note in `_progress/00-design-log.md` per wave.
- The route spec naming convention for the new per-route specs
  (`tests/32-ui-redesign-*.spec.ts` onward) is fixed in Unit 003's
  unit-brief.
- The `/dispatcher/monitor` dark board needs a `.theme-dark` variant
  of the monitor mockup; the exact switch behaviour is fixed in
  Unit 005's unit-brief.
