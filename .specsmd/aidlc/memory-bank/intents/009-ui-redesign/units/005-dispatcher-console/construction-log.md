---
unit: 005-dispatcher-console
intent: 009-ui-redesign
created: 2026-11-12T23:10:00Z
last_updated: 2026-11-14T23:18:00Z
---

# Construction Log: dispatcher-console

## Original Plan

**From Inception**: 1 bolt planned
**Planned Date**: 2026-11-02

| Bolt ID | Stories | Type |
|---------|---------|------|
| 009-005-dispatcher-console | 011-dispatcher-mockups, 012-dispatcher-page-implementation | simple-construction-bolt |

## Replanning History

| Date | Action | Change | Reason | Approved |
|------|--------|--------|--------|----------|
| 2026-11-13 | mockup set replaced | The 5 page-per-page dispatcher mockups and `dispatcher-surfaces.css` were deleted; the dispatcher mockup is now `02-dispatcher-dashboard.html`, one of four role dashboards on a shared `dashboards.css` | The whole 21-file page-mockup set was replaced by four role dashboards (`3b2b70a`) | — |

## Current Bolt Structure

| Bolt ID | Stories | Status | Changed |
|---------|---------|--------|---------|
| 009-005-dispatcher-console | 011-dispatcher-mockups, 012-dispatcher-page-implementation | ✅ complete | 2026-11-14 |

## Execution History

| Date | Bolt | Event | Details |
|------|------|-------|---------|
| 2026-11-12 | 009-005-dispatcher-console | started | Stage 1: Plan — `implementation-plan.md` |
| 2026-11-13 | 009-005-dispatcher-console | stage-done | Stage 2 reconnaissance — four corrections recorded against the plan's assumptions (`ecc1a8b`, `61e85f8`) |
| 2026-11-13 | 009-005-dispatcher-console | story-done | Story 011 — the 5 dispatcher mockups + `dispatcher-surfaces.css` + gallery/README/spec wiring (`70bc91e`) |
| 2026-11-13 | 009-005-dispatcher-console | replan | The mockup set was replaced by four role dashboards (`3b2b70a`) |
| 2026-11-14 | 009-005-dispatcher-console | story-done | Story 012 — the SLA chip, the filter rail, the combobox, the reassign endpoint, the chart wiring and the KPI cards (`f6aa222`, `8050587`) |
| 2026-11-14 | 009-005-dispatcher-console | stage-done | Stage 3: Test — 8 dashboard baselines restored (`d24a226`) |

## Execution Summary

| Metric | Value |
|--------|-------|
| Original bolts planned | 1 |
| Current bolt count | 1 |
| Bolts completed | 1 |
| Bolts in progress | 0 |
| Bolts remaining | 0 |
| Replanning events | 1 |

## Stage 2 reconnaissance — four corrections to the plan

The plan was written on 2026-11-12 and carried four assumptions that
were wrong. Stage 2 verified each against the code before writing any
implementation, and recorded the correction in the plan itself rather
than in a later note.

| # | The plan assumed | Reality | Resolution |
|---|---|---|---|
| 1 | The wave is presentation-layer only | The queue endpoint took no `ward` parameter, and Zod **strips** an unknown key — so `ward=` was ignored in silence | `ward` added to `QuerySchema`, additive and narrowing-only, intersected with the session's ward |
| 2 | The endpoint accepts `status` | The enum was `submitted \| routed`, and an enum violation is a hard `400`, not a silent no-op | Enum widened to four states; the DB `where` moved to a code-level filter so `in_progress` is reachable at all |
| 3 | The SLA chip can read the target from what the API returns | `SlaPolicy` is seeded but **no application code read it**, and there is no field carrying it | `lib/dispatcher/sla-resolve.ts` resolves the policy server-side |
| 4 | — | The in-memory dev store had **no `slaPolicy` entity at all**, so `db.slaPolicy.findMany(...)` was `undefined.findMany` — a TypeError, not an empty result | Mirrored into `lib/dev-store.ts`: `DevSlaPolicy`, the `Map`, the five Dhaka policies, and an `slaPolicy` delegate |

Correction 4 was the hard blocker, and it is the direct application of
the standing rule *"the dev store must mirror every fix"*. Without it
the wave's own spec could not pass in dev mode.

A fifth gap surfaced with the ward decision: **the ward list had no
dispatcher-readable source.** `GET /api/v1/admin/cities/<id>/wards`
exists but is admin-gated. The ward list is folded into the queue
response's metadata block — the same precedent as
`pendingDedupCount`.

The mockup's own ward rail was also wrong: it listed four wards, but a
ward-bound dispatcher can only ever see their own, so three of the four
entries would have selected zero rows. The rail lists the wards the
signed-in dispatcher can actually **reach**.

## What shipped

| Deliverable | Where | Commit |
|---|---|---|
| SLA countdown chip | `components/ui/SlaCountdown.tsx`, `lib/dispatcher/sla.ts`, `lib/dispatcher/sla-resolve.ts` | `f6aa222` |
| Filter rail (status + ward) | `components/dispatcher/FilterRail.tsx` | `f6aa222` |
| Searchable crew picker | `components/ui/Combobox.tsx` | `f6aa222` |
| Reassign options endpoint | `app/api/v1/dispatcher/reassign-options/route.ts` | `f6aa222` |
| Chart kit wired | `app/dispatcher/monitor`, `app/dispatcher/performance` | `bae0548` |
| KPI cards | `components/ui/KpiCards.tsx` | `8050587` |
| Dashboard baselines | `tests-mockups/baselines/01-mockups.spec.ts/` (8 PNGs) | `d24a226` |

The SLA tone is carried **on the row** rather than re-derived by the
client, so the warning band cannot drift between the two.

## Two design decisions worth keeping

- **The SLA clock starts at `routed`,** not at submission — the trail
  is the only record of the transition.
- **A category with no policy reports "no target",** not "on time".
  A missing policy is not a pass.

## What did not ship

Recorded rather than glossed, because the plan's acceptance criteria
named them:

- **The 3-region layout shipped as two regions.** The filter rail and
  the ticket list are there; the detail pane is not. The page kept its
  dashboard shape, and the filters are read back from the URL rather
  than surviving an in-place selection.
- **`tests/34-ui-redesign-dispatcher.spec.ts` was never written.** The
  dispatcher regression net is the pre-existing family — `09`, `10`,
  `11`, `12`, `13`, `21`, `26`.
- **10 raw `<button>` elements remain** across the six routes
  (`tickets/[id]` 7, `dedup` 2, `map` 1). The plan called for zero.
- **`SlaBullet` still has 0 call sites.** The chip shipped; the chart
  variant did not, and the SLA bullet was on the performance mockup.

## The approval gate was never recorded

The design log's last Wave 4 entry (2026-11-12) says the mockups were
"awaiting human mockup approval". The 2026-11-13/14 work has **no
entry** in `_progress/00-design-log.md`, so the gate is the one
criterion of Story 011 that is genuinely unmet. This is a gap in the
record, not a statement about whether anyone approved — it needs a
human to say which.

## Verification

At `f6aa222`:

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — 2320 passed.
- `npm run lint` — 0 errors.
- `next build` — green.
- OpenAPI spec regenerates with no drift — 55 paths / 70 operations,
  against the route-parity test.

Re-verified at the reconciliation pass (2026-11-15, HEAD `8050587`):

- `npm run test:unit` — **2352 passed / 134 files**. The suite grew
  after `f6aa222`; the count above is the one that commit recorded.
- `npm run check:i18n` — ok, 1215 keys registered.

## Notes

- **The mockup set changed shape mid-wave.** The 21 page-per-page
  mockups authored through Wave 4 were replaced by four role dashboards
  on 2026-11-13 (`3b2b70a`). The 43 PNG baselines for the deleted
  page mockups were **deleted, not replaced** — they are captured on
  `ubuntu-latest`, because a Windows capture rasterises Bengali
  differently, and CI refills them on the next workflow run. The
  current committed set is 8 PNGs (4 dashboards × 2 viewports).
- **The baselines directory is the CI platform's, not the developer's.**
  Never hand-capture. See `project_visual_baselines.md`.
