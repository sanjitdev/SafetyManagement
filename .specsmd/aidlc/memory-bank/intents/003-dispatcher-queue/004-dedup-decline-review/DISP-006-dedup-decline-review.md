---
story: DISP-006-dedup-decline-review
unit: 004-dedup-decline-review
intent: 003-dispatcher-queue
phase: construction
status: done
created: 2026-10-11T23:55:00Z
updated: 2026-10-12T01:00:00Z
---

# Story: DISP-006 — Dedup-Decline Review (confirm / dismiss)

## Given / When / Then

### Acceptance 1 — Pending flags visible

**Given** a dispatcher session bound to
`(city_dhaka_north, ward_14, dept_streetlight)`
and 2 pending dedup flags in scope (1 in
ward_14, 1 in ward_15)
**When** the dispatcher opens
`/dispatcher/dedup`
**Then** the page lists 1 flag (the
ward_15 one is filtered out by
`requireScope`).

### Acceptance 2 — Flag detail

**Given** a pending flag with
`ticket = <citizen's report on a
streetlight at 23.78, 90.41>` and
`originalTicket = <existing report at
23.781, 90.412, 30m away, in_progress>`
**When** the dispatcher opens the flag
**Then** the page renders BOTH ticket
summaries side by side: category,
location, age, status, distance
between pins (rounded to 5m), and the
citizen's reason text (if they
provided one when declining the
dedup).

### Acceptance 3 — Confirm duplicate

**Given** a pending flag
**When** the dispatcher clicks "Confirm
duplicate" and the API
`POST /api/v1/dispatcher/dedup-flags/[id]/confirm`
succeeds
**Then** the citizen's ticket moves to
`status: 'closed'`,
`closeReason: 'duplicate'`,
`duplicateOfId: <original>`; an
`AuditEntry` is written with
`action: 'dedup_confirmed'`; the flag
row is updated to
`status: 'confirmed'`,
`resolvedById: <dispatcher>`,
`resolvedAt: <now>`; the page
re-renders without that flag in the
pending list.

### Acceptance 4 — Dismiss flag

**Given** a pending flag
**When** the dispatcher clicks "Dismiss"
and the API
`POST /api/v1/dispatcher/dedup-flags/[id]/dismiss`
succeeds
**Then** the citizen's ticket moves to
`status: 'submitted'`; an `AuditEntry`
is written with
`action: 'dedup_dismissed'`; the flag
row is updated to
`status: 'dismissed'`,
`resolvedById: <dispatcher>`,
`resolvedAt: <now>`; the ticket now
appears in the dispatcher's triage
queue (Unit 002).

### Acceptance 5 — Cross-ward denial (404)

**Given** a dispatcher in ward_14
**When** the dispatcher visits
`/dispatcher/dedup/<flag_in_ward_15>`
**Then** the page returns 404 (flag
indistinguishable from nonexistent).

### Acceptance 6 — Triage queue excludes pending flags

**Given** a citizen's ticket in
`ward_14` with a pending dedup flag
**When** the dispatcher opens
`/dispatcher` (the triage queue)
**Then** the ticket is NOT in the
queue. After the dispatcher dismisses
the flag, the ticket appears in the
queue.

### Acceptance 7 — Audit trail visibility

**Given** a confirmed dedup
**When** the dispatcher views either
ticket's detail page
**Then** the page shows the
`dedup_confirmed` audit entry (under
the trail or in a "Dedup history"
section) with the link to the other
ticket.

## Technical Notes

- The confirm / dismiss APIs are POST
  (action endpoints) — no body
  required; the action is the path.
- The `DedupFlag` table is new:
  ```prisma
  model DedupFlag {
    id                String   @id @default(cuid())
    cityId            String
    wardId            String
    departmentId      String?
    ticketId          String   // the citizen's new ticket
    originalTicketId  String   // the existing ticket
    citizenReason     String?
    status            String   // 'pending' | 'confirmed' | 'dismissed'
    flaggedAt         DateTime @default(now())
    resolvedById      String?
    resolvedAt        DateTime?

    ticket            Ticket   @relation("FlaggedTicket", fields: [ticketId], references: [id])
    originalTicket    Ticket   @relation("OriginalTicket", fields: [originalTicketId], references: [id])
  }
  ```
- The citizen's dedup-decline handler
  (Intent 002 Unit 001) creates the
  `DedupFlag` row on denial. The exact
  shape of the citizen's reason is
  stored on the row.
- The Unit 002 queue query adds
  `NOT EXISTS (SELECT 1 FROM DedupFlag
  WHERE ticketId = Ticket.id AND status
  = 'pending')` to the `WHERE` clause.
- The page is a client component
  (Confirm / Dismiss buttons + re-fetch
  on success). No polling (same v1
  rule as the detail page).

## Out of Scope

- The map view (Unit 005, deferred).
- Auto-merge (rejected per the
  2026-09-18 decision; dispatcher
  decision is the only path to
  dedup).
- The citizen-side dedup prompt (Intent
  002 Unit 001; already in place).
- The admin-side flag audit
  (Intent 005, deferred).

## Dependencies

- Intent 001 (Unit 001) — `Ticket` model
  + `duplicateOfId` field (added in
  this bolt's Prisma migration).
- Intent 001 (Unit 002) — `requireRole` /
  `requireScope` guards.
- Intent 003 (Unit 001) — same guards.
- Intent 002 (Unit 001) — the
  citizen's dedup-decline handler
  writes the `DedupFlag` row on
  denial.

## Cross-references

- `app/api/v1/dispatcher/dedup-flags/route.ts` —
  new API (GET).
- `app/api/v1/dispatcher/dedup-flags/[id]/confirm/route.ts` —
  new API (POST).
- `app/api/v1/dispatcher/dedup-flags/[id]/dismiss/route.ts` —
  new API (POST).
- `app/dispatcher/dedup/page.tsx` —
  new page.
- `app/dispatcher/page.tsx` — triage
  queue (Unit 002) excludes pending
  flags; this bolt adds a "View
  dedup flags (N)" header link.
- `lib/platform/audit.ts` —
  `writeAudit(...)` (inherited).
- `prisma/schema.prisma` — new
  `DedupFlag` table.
- `tests/12-dispatcher-dedup-light.spec.ts` —
  Playwright route spec.
- `tests-mockups/baselines/12-dispatcher-dedup-light.spec.ts/` —
  1 visual baseline (light theme,
  1440x900, English labels).
- `tests/unit/dedup-flag.test.ts` —
  unit test for the confirm / dismiss
  handlers.
