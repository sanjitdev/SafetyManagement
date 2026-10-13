---
unit: 003-submit-report-flow
intent: 002-citizen-report-flow
phase: inception
status: ready
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Submit Report Flow

## Purpose

Stand up the 5-step report flow (location → photo →
category → note → confirmation) plus the dedup
prompt (1.10b) and the bootstrap endpoint that the
client reads on first paint. This is the **core
citizen value** in WO-001 — the moment a Rahim
resident turns their phone into a city-issue
reporter.

## Scope

### In Scope

- `app/report/location/page.tsx` (1.7)
- `app/report/photo/page.tsx` (1.8)
- `app/report/category/page.tsx` (1.9)
- `app/report/note/page.tsx` (1.10)
- `app/report/summary/page.tsx` (1.10b — dedup prompt)
- `app/report/[id]/submitted/page.tsx` (1.11)
- `lib/report-draft.ts` (sessionStorage draft)
- `/api/report/bootstrap`
- The POST `/api/tickets` happy path with dedup
  short-circuit.
- The geofence UX (R-1 design gap) on 1.7.

### Out of Scope

- The auth funnel (Unit 001).
- The home page (Unit 002).
- My reports (Unit 004).
- S3 photo upload (deferred to v1.1; v1 uses base64
  data URLs in `sessionStorage`).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CITIZEN-REQ-005 | Submit report — location (1.7) | Must |
| CITIZEN-REQ-006 | Submit report — photo (1.8) | Must |
| CITIZEN-REQ-007 | Submit report — category (1.9) | Must |
| CITIZEN-REQ-008 | Submit report — note (1.10) | Must |
| CITIZEN-REQ-009 | Submit report — dedup prompt (1.10b) | Must |
| CITIZEN-REQ-010 | Submit report — confirmation (1.11) | Must |
| CITIZEN-REQ-017 | Bootstrap endpoint (city config) | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| ReportDraft | SessionStorage draft of the in-flight report | `locationLat`, `locationLng`, `photoUrls[]`, `categoryId?`, `note?` |
| Ticket | (inherited from Intent 001) | `id`, `cityId`, `reporterId`, `wardId`, `categoryId`, `locationLat`, `locationLng`, `photoUrls`, `description`, `status` |
| TicketTrailEntry | (inherited) | `id`, `ticketId`, `actorId?`, `fromStatus?`, `toStatus?`, `note?`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `saveReportDraft(draft)` | Persist draft to sessionStorage | `ReportDraft` | `void` |
| `loadReportDraft()` | Read draft from sessionStorage | none | `ReportDraft \| null` |
| `clearReportDraft()` | Clear draft on submit | none | `void` |
| `POST /api/tickets` | Submit the report | `CreateTicketInput` | 201 Ticket \| 200 dedup_match |
| `GET /api/report/bootstrap?cityId=...` | City + categories + defaults | query | `{ city, wards, categories, defaults }` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 7 |
| Must Have | 7 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 005-report-location | Submit report — location (1.7) | Must | in-progress |
| 006-report-photo | Submit report — photo (1.8) | Must | in-progress |
| 007-report-category | Submit report — category (1.9) | Must | in-progress |
| 008-report-note | Submit report — note (1.10) | Must | in-progress |
| 009-dedup-prompt | Submit report — dedup prompt (1.10b) | Must | in-progress |
| 010-confirmation | Submit report — confirmation (1.11) | Must | in-progress |
| 017-bootstrap-endpoint | Bootstrap endpoint (city config) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `POST /api/tickets` + dedup + serializer |
| Intent 002 (Unit 001) | Auth-gated session |
| Intent 002 (Unit 002) | "Back to home" CTA |
| Intent 002 (Unit 005) | Theme + i18n |

### Depended By

| Unit | Reason |
|------|--------|
| 004-my-reports | The new ticket ID flows into the reports list |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| MapLibre GL JS | Map for 1.7 | Low (pinned) |
| Geolocation API | Browser API for 1.7 | None (built-in) |
| Camera + gallery | Browser API for 1.8 | None (built-in) |

## Technical Context

### Suggested Technology

- 5 client-rendered pages with a shared sessionStorage
  draft.
- `lib/report-draft.ts` exposes `saveReportDraft`,
  `loadReportDraft`, `clearReportDraft`.
- Bootstrap endpoint cached for 5 minutes on the
  client.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/report/location/page.tsx` → Geolocation API | browser | in-process |
| `app/report/location/page.tsx` → MapLibre | client | in-process |
| `app/report/photo/page.tsx` → Camera | browser | in-process |
| `app/report/category/page.tsx` → `/api/report/bootstrap` | HTTP | GET |
| `app/report/note/page.tsx` → `POST /api/tickets` | HTTP | POST |
| `app/report/summary/page.tsx` → `POST /api/tickets` (link or new) | HTTP | POST |
| `app/report/[id]/submitted/page.tsx` → `GET /api/tickets/:id` | HTTP | GET |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `ReportDraft` (in-flight) | sessionStorage | small | until submit or tab close |
| `Ticket` (created) | SQL | high | permanent |
| `TicketTrailEntry` | SQL | high | permanent |
| Photo URLs (v1) | base64 in `Ticket.photoUrls` | small | v1.1 → S3 |
| Photo URLs (v1.1) | S3 keys | medium | 365d unread lifecycle |

## Constraints

- Photo cap: 3 (cap 2 for narrow categories).
- Photo minimum: 1 (mandatory).
- Note max length: 280 chars.
- Dedup is a prompt (not an auto-merge) per
  `decision-index.md` ADR-006.
- v1: base64 photos; v1.1: S3.

## Success Criteria

### Functional

- [x] All 5 steps render with the right design tokens.
- [x] The draft persists across steps.
- [x] Submit returns 201 (or 200 dedup_match).
- [x] The dedup prompt renders on near-pin match.
- [x] The confirmation renders on success.
- [x] The bootstrap endpoint returns the right shape.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Visual regression baselines for 1.7-1.11 + 1.10b
  + bootstrap.
- [x] Tolerance 0.005.
- [x] End-to-end submit time < 60s (excluding
  photo capture).

### Quality

- [x] Unit tests for `lib/report-draft.ts`.
- [x] Visual baselines committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this unit would
take all seven stories because the 5 steps share a
single draft + dedup path.

## Notes

The 1.10b dedup prompt is **mandatory** — it cannot
be skipped even if the citizen submitted once already.
This prevents the "I submitted but it didn't show up"
anxiety from eroding the "feel heard" signal.
