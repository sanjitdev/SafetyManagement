---
intent: 006-citizen-home-and-report-redesign
created: 2026-10-13T18:00:00Z
completed: null
status: in-progress
---

# Inception Log: citizen-home-and-report-redesign

## Overview

**Intent**: Visual + interaction redesign of the CityFix citizen
home (activity map) and 5-step report flow. UI-only — no backend,
no data-model changes. Refreshes the design-token palette to a
"professional civic service" register (high-contrast navy + accent
blue, accessible & ethical per the ui-ux-pro-max recommendation).

**Type**: brown-field (enhancement — the v1 surfaces work but feel
dated; the redesign improves visual + interaction without changing
business logic)

**Created**: 2026-10-13T18:00:00Z

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | ✅ Checkpoint 2 approved | requirements.md |
| System Context | ✅ (Checkpoint 3) | system-context.md |
| Units | ✅ (Checkpoint 3) | units.md |
| Unit briefs | ✅ (Checkpoint 3) | units/*/unit-brief.md (4 files) |
| Stories | ✅ (Checkpoint 3) | units/*/stories/*.md (14 files) |
| Bolt Plan | ✅ (Checkpoint 3) | memory-bank/bolts/006-*/bolt.md (3 files) |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 10 |
| Non-Functional Requirements | 5 categories (Performance, Scalability, Security, Reliability, Accessibility) |
| Units | 4 |
| Stories | 14 |
| Bolts Planned | 3 (006-001, 006-002, 006-003) |

## Units Breakdown

| Unit | Scope | Priority | Bolt |
|------|-------|----------|------|
| 001-token-system-refresh | FR-1 (palette + token value updates) | Must | 006-001 |
| 002-home-activity-redesign | FR-2 + FR-10 partial (ReportCard, FilterChipGroup, StatusPill) | Must | 006-002 (merged with 003) |
| 003-report-flow-shell | FR-3 + FR-10 (StepIndicator, ReportShell) | Must | 006-002 (merged with 002) |
| 004-report-flow-steps | FR-4, FR-5, FR-6, FR-7, FR-8, FR-9 (5 step pages + submitted) | Must | 006-003 |

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|----------|
| 2026-10-13T18:00:00Z | Classify as "Enhancement" not "Refactor" | The change touches the visual + interaction layer; business logic is untouched. Per the schema, "Enhancement" fits better than "Refactor" (which implies restructuring code without changing behavior — here we do change behavior at the UI level). | ✅ Checkpoint 2 |
| 2026-10-13T18:00:00Z | Refresh token **values**, keep token **names** | The existing token contract (`--color-primary`, `--space-5`, `--text-body-lg`, etc.) is already referenced in every component. Changing values cascades the change without code edits; changing names would require a find-and-replace across 50+ components. | ✅ Checkpoint 2 |
| 2026-10-13T18:00:00Z | Use the ui-ux-pro-max "Accessible & Ethical" palette as the anchor | The palette is purpose-built for "Government, healthcare, education, inclusive products, large audience, legal compliance, public" — the closest match to CityFix's civic register. Adapted to CityFix's existing token names. | ✅ Checkpoint 2 |
| 2026-10-13T18:00:00Z | Keep the 5-step report flow shape (no collapse to 3) | The 5-step flow is documented in the v1 spec (`docs/running.md`, design-artifacts) and the Bangladeshi user research (per `_progress/00-design-log.md`) supports the per-step cognitive load. Collapsing is a future v2 consideration. | ✅ Checkpoint 2 |
| 2026-10-13T18:00:00Z | One intent, 3 bolts (not multiple intents) | The home + report flow share a design language (same map component, same i18n patterns, same status-trail visual). Splitting into separate intents would risk drift between them. | ✅ Checkpoint 2 |
| 2026-10-13T18:00:00Z | Merge Units 002 + 003 into one bolt (006-002) | The home redesign consumes the primitives from Unit 003 (FilterChipGroup, ReportCard, StatusPill). Landing them in the same bolt prevents the home from having to import primitives that don't yet exist, and vice versa. | ✅ Checkpoint 3 (now) |
| 2026-10-13T18:00:00Z | 3 bolts (not 2) | The 5 step pages + submitted in Bolt 006-003 are large enough to warrant their own bolt; the foundation (006-001) and the primitives (006-002) are independent. 3 bolts gives each one a clean verification gate. | ✅ Checkpoint 3 (now) |
| 2026-10-13T18:00:00Z | Default resolutions for the 5 open questions | Q1 keep 5 steps; Q2 in scope (inherits automatically); Q3 show all + filter chips; Q4 "Add photo"; Q5 Bangla-only. None block construction; all can be overridden at any later point. | ✅ Checkpoint 3 (now, carried from requirements.md) |

## Scope Changes

(none yet)

## Ready for Construction

**Checklist**:
- [x] All requirements documented (10 FRs + 5 NFR categories)
- [x] System context defined
- [x] Units decomposed (4 units)
- [x] Stories created for all units (14 stories)
- [x] Bolts planned (3 bolts)
- [x] Human review complete (Checkpoint 2 + Checkpoint 3)

## Next Steps

1. **Checkpoint 3 (now)**: surface all artifacts for user approval
2. **Checkpoint 4**: route to Construction Agent
3. Construction: Bolt 006-001 (foundation) → Bolt 006-002 (primitives + home) → Bolt 006-003 (step pages)

## Dependencies

**Foundation → must land first**:
- **001-token-system-refresh** (Bolt 006-001) — every other unit
  depends on the new token values being live. Without this, the
  home + report-flow redesign has nothing to render against.

**Then in parallel-after-foundation (merged into one bolt)**:
- **002-home-activity-redesign** + **003-report-flow-shell** land
  in the same bolt (Bolt 006-002). The home consumes the
  primitives from the shell, and the shell has nothing to
  anchor against without the home.

**Last**:
- **004-report-flow-steps** (Bolt 006-003) depends on the shell
  being in place. Could be split into two bolts (steps 1–3 +
  steps 4–5 + submitted) at the construction agent's discretion,
  but the current plan keeps them as one bolt for a single
  verification gate.

## Open Questions (carried from requirements.md)

| # | Question | Default (if no answer) | Status |
|---|----------|------------------------|--------|
| 1 | Keep 5-step shape or collapse to 3? | Keep 5 steps | ✅ Locked at Checkpoint 2 |
| 2 | Apply token refresh to `.theme-outdoor`? | Yes (in scope; inherited automatically) | ✅ Locked at Checkpoint 2 |
| 3 | Home map: all tickets or open-only by default? | All, with "All / Open / Mine" filter chips | ✅ Locked at Checkpoint 2 |
| 4 | Photo step CTA: "Take photo" or "Add photo"? | "Add photo" (works on desktop too) | ✅ Locked at Checkpoint 2 |
| 5 | Submitted page "What happens next" list: Bangla only or bilingual? | Bangla only, English toggle reveals both | ✅ Locked at Checkpoint 2 |

## Artifact Inventory

```
.specsmd/aidlc/memory-bank/intents/006-citizen-home-and-report-redesign/
├── inception-log.md                    (this file)
├── requirements.md                     (Checkpoint 2 ✅)
├── system-context.md                   (Checkpoint 3 ✅)
├── units.md                            (Checkpoint 3 ✅)
└── units/
    ├── 001-token-system-refresh/
    │   ├── unit-brief.md
    │   └── stories/
    │       └── S-001.1-token-values-updated.md
    ├── 002-home-activity-redesign/
    │   ├── unit-brief.md
    │   └── stories/
    │       ├── S-002.1-side-panel-hierarchy-and-filter-chip-group.md
    │       ├── S-002.2-sticky-cta-and-floating-map-controls.md
    │       └── S-002.3-pin-selected-and-unselected-states.md
    ├── 003-report-flow-shell/
    │   ├── unit-brief.md
    │   └── stories/
    │       ├── S-003.1-step-indicator-primitive.md
    │       ├── S-003.2-report-shell-and-sticky-bars.md
    │       ├── S-003.3-filter-chip-group-primitive.md
    │       └── S-003.4-report-card-and-status-pill-standardization.md
    └── 004-report-flow-steps/
        ├── unit-brief.md
        └── stories/
            ├── S-004.1-location-step-redesign.md
            ├── S-004.2-photo-step-redesign.md
            ├── S-004.3-category-step-redesign.md
            ├── S-004.4-note-step-redesign.md
            ├── S-004.5-summary-step-redesign.md
            └── S-004.6-submitted-confirmation-redesign.md

.specsmd/aidlc/memory-bank/bolts/
├── 006-001-token-system-refresh/bolt.md
├── 006-002-home-and-shell/bolt.md
└── 006-003-report-steps/bolt.md
```
