---
story: CREW-002-todays-assignments
unit: 002-todays-assignments
intent: 004-field-crew-app
phase: construction
status: done
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T02:00:00Z
---

# Story: CREW-002 — Today's Assignments

## Given / When / Then

### Acceptance 1 — List returns the crew's assignments

**Given** a crew session
**And** 3 tickets in the dev store where
`assignedCrewId = session.userId` (2 in
`routed`, 1 in `in_progress`)
**And** 1 ticket assigned to a different crew
member
**And** 1 ticket in `submitted` (not yet
routed)
**When** the crew member calls
`GET /api/v1/crew/tickets`
**Then** the response contains exactly the 3
assigned tickets, sorted by `createdAt` asc.

### Acceptance 2 — Empty state

**Given** a crew session
**And** 0 tickets assigned to this crew
member
**When** the crew member opens `/crew`
**Then** the page renders an empty-state
card with a friendly message (Bangla-
first; English fallback). No error.

### Acceptance 3 — Cross-role denial

**Given** a dispatcher / citizen / admin
session
**When** the dispatcher / citizen / admin
calls `GET /api/v1/crew/tickets`
**Then** the API returns `403` with
`{ error: 'forbidden_role' }`.

### Acceptance 4 — Anonymous denial

**Given** no session
**When** `/api/v1/crew/tickets` is hit
**Then** the API returns `401` with
`{ error: 'not_authenticated' }`.

### Acceptance 5 — Status filter

**Given** a crew session with 2 routed + 1
in_progress ticket
**When** the crew member calls
`GET /api/v1/crew/tickets?status=routed`
**Then** the response contains exactly the 2
routed tickets.

### Acceptance 6 — 30s polling

**Given** the page is open
**When** 30 seconds elapse
**Then** the page re-fetches the list. A
"Last refreshed Xs ago" indicator updates
after each poll. The list re-renders if the
response shape changed.

### Acceptance 7 — Mobile viewport

**Given** a 390x844 viewport
**When** the page renders
**Then** the layout is a single column, no
horizontal scroll, and the list rows are
tappable targets ≥ 44px tall.

## Technical Notes

- The list endpoint mirrors the dispatcher
  queue (Bolt 003-002) but with
  `assignedCrewId = session.userId` instead
  of `status ∈ [submitted, routed]`.
- The page is a client component
  (`'use client'`) with 30s polling
  (`setInterval` + `clearInterval` on
  unmount).
- The dev login redirect map (in
  `app/api/dev/login/route.ts`) is updated
  so `?role=crew` lands on `/crew`. The
  previous default of `/home` is replaced;
  admin still lands on `/home` because the
  admin console (Intent 005) is not yet
  built.
- The list page uses the same
  `dispatcher.queue.row.view` i18n key for
  the "Open" link text — the key is
  re-used for consistency. A new key
  `crew.list.row.open` is added for the
  Bangla copy.

## Out of Scope

- The ticket detail page (Unit 003) — the
  list row links to it but does not own
  the page.
- Real-time updates via WebSocket / SSE
  (v1.1 candidate).
- Manual location entry (v1.1 candidate;
  the v1 list renders without the
  distance column if Geolocation is
  denied).
- The offline cache (Unit 004). The list
  page is the *source* of the cache;
  Unit 004 hooks the cache into the page
  render and a few key fields.

## Dependencies

- Intent 001 (Unit 002) — `requireRole` /
  `requireScope` guards.
- Intent 001 (Unit 001) — `User` / `Session`
  models.
- Intent 003 (Unit 002) — the dispatcher's
  queue is the pattern this story
  mirrors. The shared header layout (brand
  + ward · department badge + lang toggle)
  is copied from the dispatcher page and
  parameterised for the crew.

## Cross-references

- `app/api/v1/crew/tickets/route.ts` (new,
  GET) — Bolt 004-002 deliverable.
- `app/crew/page.tsx` (new) — Bolt
  004-002 deliverable.
- `app/api/dev/login/route.ts` (delta) —
  redirect map updated.
- `lib/i18n/keys.ts` — new `crew.list.*`
  keys (≈5 keys).
- `tests/14-crew-assignments-light.spec.ts`
  (new) — Playwright spec.
- Visual baselines:
  `tests-mockups/baselines/14-crew-assignments-light.spec.ts/crew-list-{empty|populated}-390x844.png`.
