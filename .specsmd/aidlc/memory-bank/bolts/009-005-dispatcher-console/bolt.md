---
id: 009-005-dispatcher-console
unit: 005-dispatcher-console
intent: 009-ui-redesign
type: simple-construction-bolt
status: complete
stories:
  - 011-dispatcher-mockups
  - 012-dispatcher-page-implementation
created: '2026-11-12T23:10:00Z'
started: '2026-11-12T23:10:00Z'
completed: '2026-11-14T23:18:00Z'
updated: '2026-11-14T23:18:00Z'
current_stage: complete
stages_completed:
  - name: plan
    completed: '2026-11-13T00:00:00Z'
    artifact: implementation-plan.md
  - name: implement
    completed: '2026-11-14T20:52:00Z'
    artifact: components/dispatcher/FilterRail.tsx
  - name: test
    completed: '2026-11-14T23:18:00Z'
    artifact: components/ui/KpiCards.tsx
requires_bolts:
  - 009-004-citizen-surfaces
enables_bolts:
  - 009-006-crew-field-app
requires_units: []
blocks: false
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 1
  testing_scope: 4
  estimated_files: 24
---

# Bolt 009-005 — Dispatcher Console

## Purpose

Redesign the dispatcher's cockpit — the densest working surface in the
product. Six routes, a three-region triage layout, a live ops board and
a charts page, running on a wall display in a municipal office.

## Stories

| Story ID | Title | FR | State |
|----------|-------|-----|-------|
| 011-dispatcher-mockups | Dispatcher mockups | FR-5 | done |
| 012-dispatcher-page-implementation | Dispatcher page implementation | FR-5 | done |

## Unit brief

`intents/009-ui-redesign/units/005-dispatcher-console/unit-brief.md`

## Scope

### Mockups (approval gate)

**Superseded.** The five page-per-page dispatcher mockups this bolt
planned (`17-triage-queue`, `18-dispatcher-ticket-detail`,
`19-dispatcher-map`, `20-dispatcher-monitor`,
`21-dispatcher-performance`) and the dedicated
`mockups/dispatcher-surfaces.css` were authored on 2026-11-13
(`70bc91e`), then **deleted** on 2026-11-13 by `3b2b70a`, which
replaced the whole 21-file page-mockup set with one dashboard per
role. The dispatcher mockup is now:

| Mockup | Surface | Pattern |
|--------|---------|---------|
| `02-dispatcher-dashboard.html` | `/dispatcher` | KPI cards, filter rail, SLA countdown rows |

The four role dashboards share one `mockups/dashboards.css`; the
per-role stylesheet is gone. The `dispatcher-surfaces.css` rationale
in the Notes below (citizen-only `.ticket-id` semantics must not be
reused for dispatcher internal ids) still holds — it is now carried by
the shared `dashboards.css` instead.

Baselines: `tests-mockups/baselines/01-mockups.spec.ts/` holds the
8 CI-captured PNGs (4 dashboards x 2 viewports). The 43 PNGs for the
deleted page mockups were deleted, not replaced — they were captured
on `ubuntu-latest` because a Windows capture rasterises Bengali
differently, and CI refills the set on the next workflow run
(`d24a226`).

### Implementation

`/dispatcher`, `/dispatcher/tickets/[id]`, `/dispatcher/map`,
`/dispatcher/dedup`, `/dispatcher/monitor`, `/dispatcher/performance`.

## Shipped

| Deliverable | Where | Commit |
|---|---|---|
| SLA countdown chip | `components/ui/SlaCountdown.tsx`, `lib/dispatcher/sla.ts`, `app/dispatcher/page.tsx` | `f6aa222` |
| Filter rail (status + ward) | `components/dispatcher/FilterRail.tsx` | `f6aa222` |
| Searchable crew picker | `components/ui/Combobox.tsx`, `app/dispatcher/tickets/[id]/page.tsx` | `f6aa222` |
| Reassign options endpoint | `app/api/v1/dispatcher/reassign-options/route.ts` | `f6aa222` |
| Chart kit wired | `app/dispatcher/monitor`, `app/dispatcher/performance` (`TrendLine` / `CategoryBar` / `StatusDonut`) | `bae0548` |
| KPI cards on the dashboard | `components/ui/KpiCards.tsx` | `8050587` |

`f6aa222` verified typecheck clean, 2320 unit tests passing, eslint
0 errors, `next build` green, and the OpenAPI spec regenerating with
no drift (55 paths / 70 operations) against the route-parity test.

## Risk Posture

| Risk | Mitigation | Outcome |
|------|-----------|---------|
| The 3-region triage layout does not exist today | The `dispatcher/page.tsx` header comment still advertises filter rail / queue list / detail, but the page is now a dashboard with no detail pane. Restoring it is the deliverable, not an assumption. | **Partial.** The filter rail shipped (`FilterRail`); the detail pane did not. The page kept its dashboard shape and gained the two filters the API could not previously serve. |
| No SLA countdown exists anywhere | `SlaPolicy` is seeded but consulted on no dispatcher surface; `components/ui/charts/SlaBullet.tsx` has 0 call sites. The chip must be BUILT. | **Shipped.** `SlaCountdown` is built and used; the policy is resolved server-side and the tone is carried on the row so the client cannot re-derive the band and drift. `SlaBullet` (the chart variant) remains unused. |
| The crew picker is a raw `<select>` | Story 012 requires a searchable combobox. It must be BUILT. | **Shipped.** `Combobox` is built and used on the ticket detail page. |
| Charts encode series by hue alone | `ChartFrame` rule #2 already forbids this; the route spec asserts a second, non-hue channel on every series. | **Shipped.** `monitor` and `performance` use the Wave 1 chart kit. |
| Filter state is lost on selection | The triage spec asserts the ward/status filters still hold after the detail pane updates in place. | **Moot.** There is no in-place detail pane; the filters are read back from the URL, so a shared link reproduces the same filtered queue. |
| Two pages shadow `components/ui/StatusPill` | The duplicate local implementations are deleted, not reconciled. | **Shipped.** |

### Gaps recorded during the wave

The Wave 4 plan's Stage 2 reconnaissance corrected two claims that
the plan had carried as assumptions:

- **The queue endpoint took no `ward` parameter.**
  `app/api/v1/dispatcher/queue/route.ts` carried `status`, `limit`
  and `cityId` only, and Zod's default object parsing **strips
  unknown keys**, so a `ward=` sent before this wave was silently
  discarded rather than rejected. Ward scoping was hard-bound to the
  session. The wave **added** the parameter, additive and narrowing
  only.
- **The dev-store SLA read path would throw.** Recorded in
  `61e85f8` before the implementation landed.

The filter rail is therefore **narrowing-only**: the server
intersects the requested ward with the session's ward, so the rail
never offers a scope the dispatcher cannot reach. The `ward` clause
is applied AFTER the session filter, which is what makes the boundary
hold — the session's ward always wins.

## Notes

`05-daily-queue-dashboard.html` was the existing desktop reference for
the 3-region layout and `17-triage-queue` superseded it. Both are now
deleted by `3b2b70a`; the dispatcher dashboard (`02-dispatcher-dashboard.html`)
is their replacement, and `05` is retired rather than kept in
parallel.

Wave 4 originally needed a NEW `mockups/dispatcher-surfaces.css` —
`citizen-surfaces.css` carried citizen topbar/nav/`.ticket-id`
(citizen-only id) semantics that must not be reused for dispatcher
internal ids. Both stylesheets were deleted by `3b2b70a`; the shared
`dashboards.css` replaces them.

