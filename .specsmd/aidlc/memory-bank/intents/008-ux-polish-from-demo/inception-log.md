---
intent: 008-ux-polish-from-demo
created: 2026-10-14T18:00:00Z
status: complete
---

# Inception Log: 008-ux-polish-from-demo

## Overview

**Intent**: Close every UX gap surfaced by the slow-motion
citizen → dispatcher → crew → citizen demo
(`tests/22-slow-motion-e2e-demo.spec.ts`). The end-to-end
mechanics all work; the surface is leaking internal ids,
untranslated i18n keys, duplicate chrome, and a handful of
Bangla typos that make the experience feel unfinished.

**Type**: brown-field (defect-fix / enhancement on the
existing v1 surface).

**Created**: 2026-10-14

## Artifacts Created

| Artifact | Status | File |
|----------|--------|------|
| Requirements | ✅ complete | requirements.md |
| System Context | ✅ complete | system-context.md |
| Units | ✅ complete | units.md |
| Stories | ✅ complete (5 stories, status: ready) | units/001-003/stories/001-005-*.md |
| Bolt Plan | ✅ complete (3 bolt records) | ../../bolts/008-001-i18n-copy-fixup/bolt.md + ../../bolts/008-002-visible-chrome/bolt.md + ../../bolts/008-003-crew-after-photo-upload/bolt.md |

## Summary

| Metric | Count |
|--------|-------|
| Functional Requirements | 6 (FR-1 … FR-6) |
| Non-Functional Requirements | 4 categories (Performance, Security, Reliability, Compliance) |
| Audit-catalog entries | 12 (i18n misses) + 2 (typos) + 2 (chrome dedup) + 4 (raw ids) + 5 (other) = 25 |
| Units | 3 (001-i18n-copy-fixup, 002-visible-chrome, 003-crew-after-photo-upload) |
| Stories | 5 (all status: ready) |
| Bolts Planned | 3 |

## Units Breakdown

| Unit | Stories | Bolts | Priority |
|------|---------|-------|----------|
| 001-i18n-copy-fixup | 1 | Bolt 008-001 | Must |
| 002-visible-chrome | 3 | Bolt 008-002 | Must |
| 003-crew-after-photo-upload | 1 | Bolt 008-003 | Must |

## Bolt Plan

| Bolt | Type | Stories | Unit IDs | Complexity |
|------|------|---------|----------|------------|
| 008-001-i18n-copy-fixup | simple-construction-bolt | S-001.1 | 001 | Small |
| 008-002-visible-chrome | simple-construction-bolt | S-002.1, S-002.2, S-002.3 | 002 | Medium |
| 008-003-crew-after-photo-upload | simple-construction-bolt | S-003.1 | 003 | Small-to-Medium |

Sequence: any order. The three bolts are independent
enough that any order works. The team may land 008-001
first to clear the i18n noise and then tackle 008-002
and 008-003 in either order.

## Decision Log

| Date | Decision | Rationale | Approved |
|------|----------|-----------|----------|
| 2026-10-14 | Decompose by work-type, not by surface. | The three buckets (i18n data, visible chrome, route change) have different review cadences and can land in any order. | Yes |
| 2026-10-14 | Use a static-analysis script for the `t(...)` regression guard, not a runtime test. | Catches misses at lint time; faster; doesn't add a per-test cost. Wired to `npm run check:i18n`. | Yes |
| 2026-10-14 | One bolt per unit. | The units are independent; one bolt per unit keeps each PR reviewable. | Yes |
| 2026-10-14 | No new endpoints for FR-5. | The existing upload route already exists; the bolt only widens its input shape. | Yes |
| 2026-10-14 | Citizen `tkt_*` pill stays visible (intentional). | Citizens need the id to reference in support chats; this is a privacy-positive feature, not a leak. | Yes |
| 2026-10-14 | Admin names stay hidden in the trail. | The actor-name fallback for `admin` role stays as the role label. Matches the v1 privacy posture. | Yes |
| 2026-10-14 | Visual baselines are gating for FR-3, FR-4, FR-6 chrome. | Per `team.md` Forbidden — every chrome change ships a new baseline. | Yes |
| 2026-10-14 | FR-1 and FR-2 do NOT need new visual baselines. | Pure copy fixes; chrome is identical. | Yes |
| 2026-10-14 | FR-5 ships one new Playwright E2E. | The file-upload path is a new input shape; E2E coverage pins the contract. | Yes |

## Scope Changes

| Date | Change | Reason | Impact |
|------|--------|--------|--------|

## Ready for Construction

**Checklist**:
- [x] All requirements documented (with audit-catalog
      grounding)
- [x] System context defined
- [x] Units decomposed
- [x] Stories created for all units
- [x] Bolts planned
- [x] Human review complete

## Next Steps

1. Route to Construction Agent with Bolt 008-001 first
   (`/specsmd-construction-agent
   --unit="001-i18n-copy-fixup"
   --bolt-id="008-001-i18n-copy-fixup"`).
2. Construction Agent begins Bolt 008-001, then
   008-002, then 008-003 (in any order; the team's
   preference).
3. After each bolt, re-run the slow-motion demo
   (`tests/22-slow-motion-e2e-demo.spec.ts`) and
   diff the captured frames against the audit.

## Dependencies

- This intent depends on Bolt 007-001 (the citizen photo
  split + trail-marker filter) being shipped — it is, as
  of 2026-10-13. The trail-marker filter and the new
  photo groups are referenced by the FR-6 photo-card
  label.
- This intent depends on Bolt 007-002 (dispatcher crew
  picker) being shipped — it is, as of 2026-10-13. The
  new `dispatcher.assignCrew` keys are referenced by
  FR-6.
- This intent depends on `lib/i18n/keys.ts` being the
  single source of truth for copy — it is, and the
  FR-1 / FR-2 changes are localized to that file.
