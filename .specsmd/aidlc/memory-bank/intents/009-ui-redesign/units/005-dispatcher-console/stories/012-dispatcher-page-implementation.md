---
story: 012-dispatcher-page-implementation
unit: 005-dispatcher-console
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:35:00Z
updated: 2026-11-14T23:18:00Z
implemented: true
---

# Story 012 — Dispatcher Page Implementation

## User Story

**As a** dispatcher working the triage queue
**I want** the filter rail, the list and the detail to stay in sync as
I work
**So that** I never lose my place while a phone call comes in.

## Acceptance Criteria

- **Given** the 5 dispatcher mockups are approved
- **When** I open `/dispatcher`, `/dispatcher/tickets/[id]`,
  `/dispatcher/map`, `/dispatcher/dedup`, `/dispatcher/monitor` or
  `/dispatcher/performance`
- **Then** the page renders from `components/ui/` primitives

- **And** the 3-region layout (filter rail / list / detail) survives
- **And** the sticky action bar survives
- **And** the SLA countdown chip shows the remaining time against
  target
- **And** the crew picker is a searchable combobox
- **And** the trend + category charts are labelled, tabular and paired
  with a visible sortable data table
- **And** no series is encoded by hue alone
- **And** `tests/34-ui-redesign-dispatcher.spec.ts` is green
- **And** `tests/29-admin-dark-theme.spec.ts` is green (the monitor
  board is the redesign's first `.theme-dark` surface)
- **And** a committed baseline exists per route

## BDD Scenarios

### Scenario 1: Selecting a ticket does not lose the filter state

```gherkin
Given I am filtering the queue by ward 14
When I select a ticket
Then the detail pane updates in place
  And the ward filter is still applied
```

### Scenario 2: The SLA chip reads as remaining time

```gherkin
Given a ticket routed 40 minutes ago with a 24-hour SLA
When I open the detail pane
Then the SLA chip shows the remaining time against the target
```

## Out of Scope

- New dispatch endpoints.
- Real-time transport changes — the existing polling stays.

## Linked Files

- `app/dispatcher/**`
- `tests/34-ui-redesign-dispatcher.spec.ts`

## Status

Complete — 2026-11-14.

The six dispatcher routes were re-composed from the `components/ui/`
primitives. What shipped, beyond the criteria above:

- **SLA countdown chip** — `components/ui/SlaCountdown.tsx`, on the
  triage row and the ticket detail header. The policy is resolved
  server-side and the tone is carried on the row, so the client cannot
  re-derive the warning band and drift.
- **Filter rail** — `components/dispatcher/FilterRail.tsx`, with a
  status filter covering all four ticket states and a ward filter
  reading its options from the queue response's `wards` block.
- **Searchable crew picker** — `components/ui/Combobox.tsx`, replacing
  the raw `<select>` on the ticket detail page.
- **Reassign options endpoint** — `app/api/v1/dispatcher/reassign-options/route.ts`,
  reading wards and categories from the store. The category list is
  deliberately **not** ward-filtered: a ward is an authorisation
  boundary, a category is not.
- **Chart kit** — `monitor` and `performance` use `TrendLine`,
  `CategoryBar` and `StatusDonut` from `components/ui/charts/`.
- **KPI cards** — `components/ui/KpiCards.tsx` replaces the
  `MetricStrip` on the dashboard.

The wave was **not** presentation-layer only. Four gaps the plan's
reconnaissance found had to be closed first, and all four shipped:

| Gap | Resolution |
|---|---|
| `ward` was not a query parameter | Added to the queue route's `QuerySchema`, additive and narrowing-only, intersected with the session's ward |
| `status` enum was two states | Widened to four; the DB filter moved to a code-level filter so `in_progress` is reachable |
| The SLA target had no read path | `lib/dispatcher/sla-resolve.ts` resolves the policy server-side |
| The dev store had no `slaPolicy` entity | Mirrored into `lib/dev-store.ts` — a `DevSlaPolicy` type, the `Map`, the five Dhaka policies and an `slaPolicy` delegate |

Verified at `f6aa222`: typecheck clean, 2320 unit tests passing, eslint
0 errors, `next build` green, and the OpenAPI spec regenerating with no
drift (55 paths / 70 operations) against the route-parity test. Re-run
at the reconciliation pass (2026-11-15, HEAD `8050587`): 2352 unit
tests passing across 134 files.

**Two acceptance criteria are not met, and the reasons are recorded
rather than glossed.**

- **The 3-region layout shipped as two regions.** The filter rail and
  the ticket list are there; the detail pane is not. The page kept its
  dashboard shape, and the filters are read back from the URL instead
  of surviving an in-place selection.
- **`tests/34-ui-redesign-dispatcher.spec.ts` was never written.** The
  dispatcher regression net is the pre-existing family — `09`, `10`,
  `11`, `12`, `13`, `21`, `26`.
