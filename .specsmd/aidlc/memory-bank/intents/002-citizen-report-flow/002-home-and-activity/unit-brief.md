---
unit: 002-home-and-activity
intent: 002-citizen-report-flow
phase: inception
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Home and Activity

## Purpose

Stand up the home page (1.6) — the post-login landing
the citizen sees on every return visit. The page is a
two-region layout: a MapLibre map of recent activity
and a side panel listing the 20 most recent tickets
in the citizen's city. Polling cadence is 15s.

## Scope

### In Scope

- `app/home/page.tsx` (1.6).
- MapLibre GL JS + OpenStreetMap tiles in dev.
- Side panel with category icon, distance, time.
- 15s polling on `/api/v1/activity?limit=20`.
- The citizen serializer wiring on the activity feed.
- The "Submit a new report" CTA into the 5-step flow.

### Out of Scope

- The auth funnel (Unit 001).
- The 5-step report flow (Unit 003).
- My reports (Unit 004).
- Mapbox paid tiles (deferred; v1 uses OSM raster).
- Push notifications (deferred to v1.1).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CITIZEN-REQ-004 | Home / city activity feed (1.6) | Must |
| CITIZEN-REQ-015 | Citizen-facing serializer wiring | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Ticket | (inherited from Intent 001) | `id`, `cityId`, `reporterId`, `wardId`, `categoryId`, `locationLat`, `locationLng`, `status`, `photoUrls` |
| Category | (inherited) | `id`, `cityId`, `slug`, `name`, `departmentId?` |
| City | (inherited) | `id`, `slug`, `name`, `dedupRadiusMeters`, `locale` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `GET /api/v1/activity?limit=20&status=...` | List the 20 most recent tickets in the citizen's city | query | `{ tickets: [...] }` |
| `serializeTicketForRole('citizen', ticket)` | Strip internal fields | role, ticket | `SerializedTicket` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 2 |
| Must Have | 2 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 004-home-activity | Home / city activity feed (1.6) | Must | in-progress |
| 015-citizen-serializer-wiring | Citizen-facing serializer wiring on /v1/activity | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `/api/v1/activity` |
| Intent 002 (Unit 001) | Auth-gated session |
| Intent 002 (Unit 005) | Theme + i18n |

### Depended By

| Unit | Reason |
|------|--------|
| 003-submit-report-flow | "Back to home" CTA |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| MapLibre GL JS | Map | Low (pinned) |
| OpenStreetMap raster tiles | Tiles | Low (no API key) |

## Technical Context

### Suggested Technology

- React 18 + Next.js 14 App Router client component
  (the map needs `window`).
- `useEffect` + `useState` for polling.
- `t(key, vars, lang)` for every user-facing string.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/home/page.tsx` → `/api/v1/activity` | HTTP | GET (15s polling) |
| `app/home/page.tsx` → MapLibre | client | in-process |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `Ticket` rows (activity slice) | SQL | high (last 20) | permanent |

## Constraints

- v1 hard cap: `take: 20` (no pagination).
- Polling cadence 15s.
- Citizen serializer MUST strip internal fields.

## Success Criteria

### Functional

- [x] Home page renders on `/home`.
- [x] Map shows recent activity.
- [x] Side panel shows the 20 most recent tickets.
- [x] Each item: category, distance, time, status pill.
- [x] "Submit a new report" CTA enters the 5-step
  flow.
- [x] Polling cadence 15s.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Visual regression baseline for 1.6 captured.
- [x] Tolerance 0.005.

### Quality

- [x] Unit tests for the activity feed.
- [x] Visual baseline committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit would
take the two stories because the home page is one
file.

## Notes

The 1.6 page is **client-rendered** because the
bootstrap is async and the polling requires `window`.
The page-level server component is rejected at the
file boundary; the file starts with `'use client'`.
