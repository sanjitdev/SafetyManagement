---
story: 005-chart-primitives-with-data-tables
unit: 002-design-foundation
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:20:00Z
updated: 2026-11-02T19:10:00Z
implemented: true
---

# Story 005 — Chart Primitives with Data Tables

## User Story

**As a** dispatcher or admin reading a trend
**I want** the chart's underlying data reachable without a chart
**So that** I can read exact values and the page survives a
colour-blind reading.

## Acceptance Criteria

- **Given** the chart primitives
- **When** I import from `components/ui/charts/`
- **Then** `ChartFrame`, `TrendLine`, `TrendLineCanvas`,
  `CategoryBar`, `CategoryBarCanvas`, `SlaBullet` and `StatCard` are
  available

- **And** `TrendLine` renders its heading
- **And** `TrendLine` keeps the data table behind a toggle that
  reports its state
- **And** no series is encoded by hue alone — every series carries a
  label
- **And** `SlaBullet` is hand-rolled SVG (Recharts has no bullet
  chart)
- **And** `recharts` is `dynamic()`-imported wherever it is used, so
  server components stay server components

## BDD Scenarios

### Scenario 1: The data is reachable without the chart

```gherkin
Given a TrendLine with three points
When I render it
Then a data-table toggle is present
  And the toggle reports its pressed state
```

### Scenario 2: The chart is labelled

```gherkin
Given a TrendLine with two series
When I render it
Then each series carries a visible label
```

## Out of Scope

- The page-level charts — Units 005 and 007.

## Linked Files

- `components/ui/charts/**`
- `tests/unit/components/Charts.test.tsx`
- `package.json` (`recharts`)

## Status

Shipped — commit `b279228`.
