---
intent: 009-ui-redesign
created: 2026-11-02T18:00:00Z
status: in-progress
---

# Inception Log: 009-ui-redesign

## Overview

**Intent**: Redesign the entire CityFix surface set — from `/login`
through every citizen, dispatcher, crew and admin page — so the
product reads as a modern, professional civic platform rather than a
set of inline-styled screens.

**Type**: brown-field (frontend feature). Full-surface redesign on top
of the shipped v1; the backend, API, roles and transports are
unchanged.

**Created**: 2026-11-02

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | ✅ complete | requirements.md |
| System Context | ✅ complete | system-context.md |
| Units | ✅ complete | units.md |
| Unit briefs | ✅ complete (8) | units/001…008/unit-brief.md |
| Stories | ✅ complete (18) | units/001…008/stories/*.md |
| Bolt Plan | ✅ complete (8 bolt records) | ../../bolts/009-00{1,2,3}-*/bolt.md |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 8 (FR-1 … FR-8, one per wave) |
| Non-Functional Requirements | 4 categories (Performance, Accessibility, Reliability, Compliance) |
| Units | 8 (one per wave) |
| Stories | 18 |
| Bolts Planned | 8 |
| Mockups authored so far | 12 of 28 |

## Units Breakdown

| Unit | Stories | Bolt | Priority | State |
|------|---------|------|----------|-------|
| 001-ci-unblock | 1 | Bolt 009-001 | Must | shipped |
| 002-design-foundation | 5 | Bolt 009-002 | Must | shipped |
| 003-auth-and-public-surfaces | 2 | Bolt 009-003 | Must | mockups shipped |
| 004-citizen-surfaces | 2 | Bolt 009-004 | Should | not started |
| 005-dispatcher-console | 2 | Bolt 009-005 | Should | not started |
| 006-crew-field-app | 2 | Bolt 009-006 | Should | not started |
| 007-admin-console | 2 | Bolt 009-007 | Should | not started |
| 008-verification-and-signoff | 2 | Bolt 009-008 | Must | not started |

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|----------|
| 2026-11-02 | Decompose by wave, not by surface. | A wave is the smallest unit that can be visually approved as a unit; the mockup-approval gate is meaningless if the system is never seen whole. | Yes |
| 2026-11-02 | Wave 0 (CI unblock) precedes all design work. | CI had failed 18/18 runs; a red gate masks every later regression. | Yes |
| 2026-11-02 | Visual direction locked to Accessible + Swiss/Minimal. | Matches the civic-trust brand personality; high contrast works on cheap handsets and in daylight. | Yes |
| 2026-11-02 | Keep Noto Sans Bengali for Bangla **and** Latin; reject the skill's Poppins/Open Sans. | Poppins does not render Bangla. The skill's own product-wide run also proposed glassmorphism, which contradicts the locked flat/Swiss direction. | Yes |
| 2026-11-02 | Accept the skill's *auth-domain* output (Accessible & Ethical, single column, navy, 44px targets, no-emoji icons). | It agrees with the locked direction and gave the auth screens their concrete structure. | Yes |
| 2026-11-02 | Only two new runtime dependencies: `@phosphor-icons/react` + `recharts`. | One icon family, one chart library; both imported per-icon / dynamically. | Yes |
| 2026-11-02 | Do not draw a Dhaka North City Corporation seal. | Third-party authority marks are authentic or absent. A documented `Buildings` placeholder ships with a swap slot. | Yes |
| 2026-11-02 | `StatusPill` carries icon + word + colour, never colour alone. | WCAG + the greyscale-print rule. Enforced by unit test. | Yes |
| 2026-11-02 | Every chart ships a visible sortable data table. | "Never a chart without its data." Enforced by unit test. | Yes |
| 2026-11-02 | The public landing stays PII-stripped. | Anonymous visitors see status, category, ward and timestamp — never a reporter name, phone or exact address. | Yes |
| 2026-11-02 | Superseded mockups are retired, not kept in parallel. | Two competing designs for one surface makes the gallery useless as an approval artefact. | Yes |
| 2026-11-02 | Self-host Noto Sans Bengali before the final baseline regeneration. | The web font's load-time metrics made `11-public-landing` baselines drift by 82–156px between runs. | Open |

## Scope Changes

| Date | Change | Reason | Impact |
|------|--------|--------|--------|
| 2026-11-02 | The plan named 31 routes; the wave table routes them across 5 implementation waves. | The route list is long enough that one wave per persona is the right grain. | No scope change — the same routes. |
| 2026-11-02 | The plan's "15 committed baselines" became "25 and growing" after Wave 2. | Wave 2 added 10 mockup baselines. | Baseline count in the WDS outline and README updated. |

## Ready for Construction

**Checklist**:
- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete (plan decisions locked)
- [x] Wave 2 mockups approved by a human
- [x] Wave 2 page implementation shipped (story 008, 2026-11-11)
- [ ] Waves 3–6 mockups authored and approved

## Next Steps

1. Author the Wave 3 mockups (Unit 004 — citizen surfaces).
2. Route each wave to the Construction Agent with its bolt, in order:
   `009-004-citizen-surfaces`, `009-005-dispatcher-console`,
   `009-006-crew-field-app`, then the admin wave.
3. After each bolt, re-run the full gate and record the wave in
   `_progress/00-design-log.md`.

## Dependencies

- This intent depends on Intent 008 being complete — the display-name
  rule, the single-header rule and the PII posture it established are
  carried over. It is, as of 2026-10-27.
- Bolt 009-001 (CI unblock) is a hard prerequisite for 009-002 and
  everything after it. It shipped as `45062d1`.
- Bolt 009-002 (design foundation) is a hard prerequisite for every
  implementation wave — no page may be composed before the primitives
  exist. It shipped as `b279228`.
