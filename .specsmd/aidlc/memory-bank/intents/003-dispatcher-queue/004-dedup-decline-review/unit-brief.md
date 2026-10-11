---
unit: 004-dedup-decline-review
intent: 003-dispatcher-queue
phase: inception
status: ready
created: 2026-10-11T23:55:00Z
updated: 2026-10-11T23:55:00Z
---

# Unit Brief: Dedup-Decline Review

## Purpose

Stand up the dispatcher's review surface
for citizen-declined dedup candidates.

When a citizen submits a ticket near an
existing ticket, the system flags it as a
possible duplicate. The citizen is asked
"is this the same as the existing report?"
and given two choices: confirm (mark as
duplicate, decline) or deny (it's a
different issue, proceed). The denial
event is logged as a structured event AND
flagged for city-side review (per the
2026-10-04 project.md correction).

This unit ships the dispatcher's view of
those flagged denials — a "possible
duplicate" queue where the dispatcher can
inspect the citizen's report, the existing
ticket it's near, the citizen's denial
reason (if any), and either:

- confirm the duplicate and link the two
  tickets (status → `closed` with reason
  `duplicate`); or
- dismiss the flag (the citizen was right
  — they're different issues; the flag
  is cleared and the ticket proceeds to
  triage normally).

The dispatcher cannot "force" a
deduplication; this is a review of the
citizen's denial.

## Scope

### In Scope

- New API:
  `GET /api/v1/dispatcher/dedup-flags`
  — list of tickets with a pending
  dedup-decline flag in the
  dispatcher's scope. Returns
  `{ flags: DedupFlag[] }` where each
  flag is `{ ticket, originalTicket,
  citizenReason?, flaggedAt }`.
- New API:
  `POST /api/v1/dispatcher/dedup-flags/[id]/confirm`
  — confirm the duplicate. Writes
  `AuditEntry` (`action:
  'dedup_confirmed'`), closes the
  citizen's ticket with reason
  `duplicate`, links the two tickets
  (sets `duplicateOfId` on the citizen's
  ticket).
- New API:
  `POST /api/v1/dispatcher/dedup-flags/[id]/dismiss`
  — dismiss the flag. Writes
  `AuditEntry`
  (`action: 'dedup_dismissed'`), clears
  the flag, the citizen's ticket
  proceeds to `submitted` (normal
  triage).
- New page:
  `app/dispatcher/dedup/page.tsx` —
  list of pending flags. Each row links
  to the ticket detail page with the
  original ticket shown side-by-side.
- The existing triage queue (Unit 002)
  shows tickets that are
  `(submitted, routed)`; dedup-decline
  flagged tickets are EXCLUDED from
  that queue while the flag is pending
  (the dispatcher must resolve the flag
  before triaging the ticket). This is
  a query filter on the queue API.
- Cross-ward / cross-department denial
  on every API.

### Out of Scope

- The map view (Unit 005, deferred).
- The crew-side view (Intent 004,
  deferred).
- The admin-side flag audit
  (Intent 005, deferred).
- Auto-merge / silent dedup (the v1
  policy is flag-and-decline; auto-merge
  is rejected per the 2026-09-18
  decision).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| DISP-REQ-006 | Dedup-decline review | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Ticket` | (inherited) | full record; `duplicateOfId?` (set when the dispatcher confirms the dedup) |
| `DedupFlag` | New | `id`, `cityId`, `wardId`, `departmentId?`, `ticketId` (the new one, citizen's), `originalTicketId` (the existing one), `citizenReason?`, `flaggedAt`, `status: 'pending' | 'confirmed' | 'dismissed'`, `resolvedById?`, `resolvedAt?` |
| `AuditEntry` | (inherited) | `action: 'dedup_confirmed' | 'dedup_dismissed'` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `GET /api/v1/dispatcher/dedup-flags` | List pending flags in the dispatcher's scope | session | `{ flags: DedupFlag[] }` |
| `POST /api/v1/dispatcher/dedup-flags/[id]/confirm` | Confirm the duplicate | path id | `{ status: 'confirmed', ticket: ... }` |
| `POST /api/v1/dispatcher/dedup-flags/[id]/dismiss` | Dismiss the flag | path id | `{ status: 'dismissed', ticket: ... }` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 1 |
| Must Have | 1 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| DISP-006-dedup-decline-review | Dedup-decline review (confirm / dismiss) | Must | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| Intent 001 (Unit 003) | `db.ticket.findMany` |
| Intent 001 (Unit 001) | `serializeTicketForRole` |
| Intent 003 (Unit 001) | `requireRole` + `requireScope` |
| Intent 002 (Unit 001) | Dedup-decline log line shape (the citizen's denial writes a structured event with a `flagged` boolean; this unit consumes the flagged subset) |

### Depended By

None (terminal unit of this intent).

## Technical Context

### Suggested Technology

- New API routes:
  - `app/api/v1/dispatcher/dedup-flags/route.ts`
    (GET).
  - `app/api/v1/dispatcher/dedup-flags/[id]/confirm/route.ts`
    (POST).
  - `app/api/v1/dispatcher/dedup-flags/[id]/dismiss/route.ts`
    (POST).
- New page:
  `app/dispatcher/dedup/page.tsx`.
- New table: `DedupFlag` (or a derived
  view over the existing dedup-decline
  log; a dedicated table is preferred
  for clean indexing). If a table is
  created, the citizen-side dedup
  handler (Intent 002 Unit 001) writes
  a row on denial.
- `writeAudit(...)` for both confirm
  and dismiss actions.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `app/dispatcher/dedup/page.tsx` → `GET /api/v1/dispatcher/dedup-flags` | HTTP | GET (no polling; the dispatcher re-fetches to see new flags) |
| `app/dispatcher/dedup/page.tsx` → `POST /api/v1/dispatcher/dedup-flags/[id]/confirm` | HTTP | POST |
| `app/dispatcher/dedup/page.tsx` → `POST /api/v1/dispatcher/dedup-flags/[id]/dismiss` | HTTP | POST |
| Triage queue (Unit 002) → excludes tickets with a pending flag | SQL | query filter |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `DedupFlag` rows | SQL | low (per-city) | until `confirmed` / `dismissed` |
| `AuditEntry` rows for `dedup_confirmed` / `dedup_dismissed` | SQL | one per resolution | permanent (audit) |
| `Ticket.duplicateOfId` on confirmed duplicates | SQL | one per confirmed pair | permanent |

## Constraints

- The confirm path closes the citizen's
  ticket with reason `duplicate` and
  links to the original. The original
  ticket is untouched (it stays in
  its current status; the new ticket
  is the one that was a duplicate).
- The dismiss path clears the flag;
  the citizen's ticket moves from
  "pending dedup review" to
  `submitted` and joins the normal
  triage queue.
- Out-of-scope flag id returns 404 (not
  403) — same rule as the ticket detail
  page.
- The dispatcher's per-ticket scope
  (ward + department) applies to the
  flag list: flags outside the
  dispatcher's scope are not visible.
- The dedup view does NOT poll — same
  v1 rule as the detail page.
- A ticket can have AT MOST ONE
  pending dedup flag; if a second
  citizen report comes in near the same
  original ticket before the first is
  resolved, it becomes its own flag
  with its own `originalTicketId`.

## Success Criteria

### Functional

- [ ] `GET /api/v1/dispatcher/dedup-flags`
      returns the pending flags in the
      dispatcher's scope.
- [ ] A dispatcher bound to ward_14
      cannot see a flag whose ticket is
      in ward_15 (404 on the flag
      detail).
- [ ] `POST .../confirm` writes
      `AuditEntry`
      (`action: 'dedup_confirmed'`),
      sets `Ticket.status: 'closed'`,
      `Ticket.closeReason: 'duplicate'`,
      `Ticket.duplicateOfId: <original>`.
- [ ] `POST .../dismiss` writes
      `AuditEntry`
      (`action: 'dedup_dismissed'`),
      sets `Ticket.status: 'submitted'`,
      clears the flag.
- [ ] The triage queue (Unit 002 API)
      excludes tickets with a pending
      `DedupFlag` row.
- [ ] The dedup page renders each
      pending flag as a row showing
      ticket summary, original ticket
      summary, citizen's reason (if
      any), and Confirm / Dismiss
      buttons.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.
- [ ] `npm run test:mockups` is green.
- [ ] Visual regression baseline for
      the dedup page (light theme,
      1440x900).

### Quality

- [ ] Unit test for the confirm /
      dismiss handlers.
- [ ] Playwright route spec
      `tests/12-dispatcher-dedup-light.spec.ts`.
- [ ] Visual baseline committed.

## Bolt Suggestions

A single `ddd-construction-bolt` for this
unit because the work is one list API +
two action APIs + one page + one test
spec + one new table migration.

## Notes

The dedup-decline flow was designed in
the 2026-10-04 corrections block:
"Dedup-decline is logged as a structured
event AND flagged for city-side review;
the structured event is privacy-respecting
and the flag surfaces possible duplicates
to the WO-002 dispatcher for a manual
dedup decision". This unit implements the
"flag surfaces ... for a manual dedup
decision" half.

The "confirm" path corresponds to the
"manual dedup decision" — the dispatcher
overrides the citizen's "this is a
different issue" denial because the
evidence (proximity, photo similarity,
category match) is strong enough to
deduplicate. The "dismiss" path is the
"the citizen was right" outcome.

The dedup view lives at
`/dispatcher/dedup` (a top-level route
alongside `/dispatcher`). The triage
queue adds a "View dedup flags (N)" link
in the header pointing to
`/dispatcher/dedup` when N > 0.
