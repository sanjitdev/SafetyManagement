---
unit: 004-my-reports
intent: 002-citizen-report-flow
phase: inception
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: My Reports

## Purpose

Stand up the citizen's report list (1.12) and detail
(1.13) — the "follow up on what I submitted" surface.
Polling cadence is 30s.

## Scope

### In Scope

- `app/reports/page.tsx` (1.12) — list with status
  pill, category, time, chevron.
- `app/reports/[id]/page.tsx` (1.13) — single report
  with status trail.
- 30s polling on both.
- Internal notes filtered out for citizens.

### Out of Scope

- The auth funnel (Unit 001).
- The home page (Unit 002).
- The 5-step report flow (Unit 003).
- Dispatcher / crew views (Intents 003 / 004).
- Push notifications (deferred to v1.1).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CITIZEN-REQ-011 | My reports (1.12) | Must |
| CITIZEN-REQ-012 | Report detail with status trail (1.13) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| Ticket | (inherited from Intent 001) | `id`, `cityId`, `reporterId`, `wardId`, `categoryId`, `locationLat`, `locationLng`, `photoUrls`, `description`, `status`, `assignedCrewId?`, `internalNote?` |
| TicketTrailEntry | (inherited) | `id`, `ticketId`, `actorId?`, `fromStatus?`, `toStatus?`, `note?`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `GET /api/tickets` | List the citizen's own reports | cookie | `{ tickets: [...] }` |
| `GET /api/tickets/:id` | Read a single report (citizen serializer) | `:id` | `{ ticket }` |

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
| 011-my-reports | My reports (1.12) | Must | in-progress |
| 012-report-detail | Report detail with status trail (1.13) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `/api/tickets` + `/api/tickets/:id` |
| Intent 002 (Unit 001) | Auth-gated session |
| Intent 002 (Unit 003) | The report ID |

### Depended By

Nothing (terminal).

### External Dependencies

None.

## Technical Context

### Suggested Technology

- React 18 + Next.js 14 App Router client components
  (the polling requires `window`).
- `useEffect` + `useState` for polling.
- `t(key, vars, lang)` for every user-facing string.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/reports/page.tsx` → `/api/tickets` | HTTP | GET (30s polling) |
| `app/reports/[id]/page.tsx` → `/api/tickets/:id` | HTTP | GET (30s polling) |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `Ticket` rows (citizen's own) | SQL | per citizen | permanent |
| `TicketTrailEntry` (for the detail) | SQL | per ticket | permanent |

## Constraints

- Polling cadence 30s.
- v1 hard cap: `take: 20` (no pagination).
- Internal notes are filtered out for citizens
  (the citizen serializer already strips them;
  the trail render must not re-introduce them).

## Success Criteria

### Functional

- [x] My reports renders on `/reports`.
- [x] Report detail renders on `/reports/:id`.
- [x] Each list item: status pill, category, time.
- [x] Detail shows the status trail.
- [x] Internal notes are filtered out.
- [x] Polling cadence 30s.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Visual regression baselines for 1.12 + 1.13.
- [x] Tolerance 0.005.

### Quality

- [x] Visual baselines committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit would
take both stories because the list + detail share the
same polling + serializer pattern.

## Notes

The 1.13 detail page is **client-rendered** for the
same reason as 1.6 (polling + async bootstrap). The
trail is sourced from `TicketTrailEntry` rows scoped
to the ticket ID.
