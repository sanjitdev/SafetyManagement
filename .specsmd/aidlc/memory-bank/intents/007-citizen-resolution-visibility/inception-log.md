---
intent: 007-citizen-resolution-visibility
created: 2026-10-13T19:50:00Z
completed: 2026-10-13T20:25:00Z
status: complete
---

# Inception Log: 007-citizen-resolution-visibility

## Overview

**Intent**: Close the three remaining gaps in the citizen-side
end-to-end loop so that a reporter can clearly see the resolution
of their report once the field crew has fixed the issue:
(1) before/after photo split on `/reports/[id]`,
(2) filter the `after_photo:` marker from the citizen-visible
trail, and (3) dispatcher-side crew picker on
`/dispatcher/tickets/[id]`.

**Type**: brown-field (defect-fix / enhancement on the existing
v1 surface — the loop mechanics are already in place; this
intent polishes the citizen-visible seams).

**Created**: 2026-10-13

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | ✅ complete (Checkpoint 1 + 2 passed) | requirements.md |
| System Context | ✅ complete | system-context.md |
| Units | ✅ complete | units.md (+ units/001-003/unit-brief.md) |
| Stories | ✅ complete (5 stories, status: ready) | units/001-003/stories/001-005-*.md |
| Bolt Plan | ✅ complete (2 bolt records) | ../../bolts/007-001-citizen-photo-and-trail-foundation/bolt.md + ../../bolts/007-002-dispatcher-crew-picker/bolt.md |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 3 |
| Non-Functional Requirements | 5 categories (Performance, Scalability, Security, Reliability, Compliance) |
| Units | 3 (001-citizen-photo-split, 002-trail-marker-filter, 003-dispatcher-crew-picker) |
| Stories | 5 (all status: ready) |
| Bolts Planned | 2 (Bolt 007-001 ddd-construction-bolt, Bolt 007-002 simple-construction-bolt) |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
|------|---------|-------|----------|
| 001-citizen-photo-split | 2 | Bolt 007-001 (shared) | Must |
| 002-trail-marker-filter | 1 | Bolt 007-001 (shared) | Must |
| 003-dispatcher-crew-picker | 2 | Bolt 007-002 | Must |

## Bolt Plan

| Bolt | Type | Stories | Unit IDs | Complexity |
|------|------|---------|----------|------------|
| 007-001-citizen-photo-and-trail-foundation | ddd-construction-bolt | 001, 002, 003 | 001-citizen-photo-split, 002-trail-marker-filter | Medium |
| 007-002-dispatcher-crew-picker | simple-construction-bolt | 004, 005 | 003-dispatcher-crew-picker | Medium |

Sequence: Bolt 007-001 first (foundation), then Bolt 007-002 (sequencing only — not a compile-time dependency).

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|----------|
| 2026-10-13 | Scope = all three: before/after photo split, `after_photo:` prefix filter, dispatcher crew picker. | The user confirmed via AskUserQuestion that all three gaps are in scope for this intent. Push notifications, the "Resolved!" celebration surface, and real-time polling are explicitly excluded as v1.1 follow-ups. | Yes |
| 2026-10-13 | Type = Enhancement (not defect-fix or refactoring). | The end-to-end mechanics work; this is a polish/enhancement pass on citizen-visible seams, not a defect or a refactor. | Yes |
| 2026-10-13 | Filter the `after_photo:` marker at the serializer layer, not at the render layer. | Single source of truth: any future citizen surface that reads the trail (push, email, etc.) will benefit from the same filter. The marker format stays stable for the audit pipeline. | Yes |
| 2026-10-13 | Crew assignment scope = ward-scoped. | Confirmed via Checkpoint 1 Q1. The picker lists crew users whose `homeWardId` matches the ticket's `wardId`. Centralized in one service function so a future department-scope switch is a single edit. | Yes |
| 2026-10-13 | Trail-marker scope = `after_photo:` only. | Confirmed via Checkpoint 1 Q2. A regression-guard unit test asserts no `^[a-z_]+:` marker-shaped string reaches the citizen branch, so any future marker fails the build until explicitly handled. | Yes |
| 2026-10-13 | Photo storage = same array, no discriminator; FR-1 includes a Prisma migration. | Confirmed via Checkpoint 1 Q3. The migration adds `uploadedByRole` (or splits into two columns); the serializer exposes `beforePhotoUrls` and `afterPhotoUrls`; existing rows backfill cleanly to the citizen-only view. | Yes |
| 2026-10-13 | Out-of-scope scope-check = nothing more to exclude. | Confirmed via Checkpoint 1 Q4. Current Won't list (push, "Resolved!" celebration, real-time polling) is sufficient; anything new gets parked as a follow-up story. | Yes |
| 2026-10-13 | Acceptance bar = unit + Playwright E2E + visual baseline for all three FRs. | Confirmed via Checkpoint 1 Q5. Matches the team's gating posture (Playwright baselines are gating per team.md). FR-2 ships with unit tests only — no new user-visible control means no new E2E or visual baseline. | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
|------|--------|--------|--------|

## Ready for Construction

**Checklist**:
- [x] All requirements documented
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete

## Next Steps

1. Route to Construction Agent with Bolt 007-001 first
   (`/specsmd-construction-agent --unit="001-citizen-photo-split"
   --bolt-id="007-001-citizen-photo-and-trail-foundation"`).
2. Construction Agent begins Bolt 007-001 (foundation) and
   then Bolt 007-002 (dispatcher feature).

## Dependencies

- This intent depends on Bolt 004-003 (the crew after-photo
  endpoint that writes the `after_photo:` marker) being shipped —
  it is, as of 2026-10-12. No re-derivation of the marker format.
- This intent depends on the existing dispatcher PATCH route
  (`app/api/v1/dispatcher/tickets/[id]/route.ts`) being in place —
  it is, as of Intent 003 (Dispatcher Queue, complete 2026-10-12).
  The crew-picker FR may add a sibling route or extend the
  existing one; resolved at the units stage.
- This intent depends on the existing `SerializedTicket` type
  (`lib/serializers/ticket.ts`) being the single citizen-facing
  serializer — it is, and the FR-1 / FR-2 changes are localized
  to that file's citizen branch plus the consumer
  (`app/reports/[id]/page.tsx`).
