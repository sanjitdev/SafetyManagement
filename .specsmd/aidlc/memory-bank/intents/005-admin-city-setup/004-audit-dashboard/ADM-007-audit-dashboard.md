---
story: ADM-007-audit-dashboard
unit: 004-audit-dashboard
intent: 005-admin-city-setup
phase: construction
status: done
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T22:00:00Z
---

# Story: ADM-007 — Audit Dashboard

> Read-only view of every `AuditEntry`
> row in the system, filterable by
> actor, action, entityType, and date
> range. The single internal Aamir
> surface for "show me who changed
> what, when" — Feature #22 from the
> Feature Impact Analysis
> (Aamir's +6 "Defend setup decisions
> with audit trail").

## Given / When / Then

### Acceptance 1 — List

**Given** an admin on
`/admin/audit`
**When** the page loads
**Then** the most recent 50
`AuditEntry` rows are rendered in a
table (sorted by `createdAt DESC`),
with the filter rail on the left
(actor multi-select, action multi-
select, entityType multi-select,
date range).

### Acceptance 2 — Filter by actor

**Given** the admin selects "Anwar"
in the actor filter
**When** the filter applies
**Then** only `AuditEntry` rows
where `actorId = anwar_user_id`
are shown.

### Acceptance 3 — Filter by action

**Given** the admin selects
`create` and `update` in the
action filter
**When** the filter applies
**Then** only `AuditEntry` rows
where `action ∈ {create, update}`
are shown. A comma-list query param
(`?action=create,update`) is
accepted by the API.

### Acceptance 4 — Date range

**Given** the admin selects "Last
24h" in the date range
**When** the filter applies
**Then** only `AuditEntry` rows
where `createdAt > now() - 24h`
are shown. A custom range
(`?from=2026-10-01&to=2026-10-12`)
is accepted by the API.

### Acceptance 5 — Cursor pagination

**Given** the result set has more
than 50 rows
**When** the admin clicks "Load
more"
**Then** the next 50 rows are
fetched (cursor = the last row's
`createdAt`) and appended to the
table. The cursor is stable across
inserts (the query is `createdAt <
cursor`, not `createdAt <= cursor`).

### Acceptance 6 — Read-only

**Given** an admin on
`/admin/audit`
**When** the admin attempts to call
`POST /api/v1/admin/audit` (or any
non-GET method on the audit
endpoint)
**Then** the response is 405
`method_not_allowed`. The audit
log is a read-only surface.

### Acceptance 7 — Cross-role denial

**Given** a non-admin session
(citizen / dispatcher / crew)
**When** the session calls
`GET /api/v1/admin/audit`
**Then** the response is 403
`forbidden_role`. Anonymous
(no cookie) → 401.

## Technical Notes

- `actorName` is hydrated from
  `User.name` server-side; the
  client never sees the actor's
  PII beyond the display name.
- The audit view is admin-only;
  no per-city scope (an admin
  operating across multiple
  cities wants to see the full
  picture).
- The dev store's `seed()` adds
  4-5 `AuditEntry` rows on
  startup (covering: a `City`
  create, a `Category` update, a
  `Department` create, a `Ward`
  polygon save, and a
  `webauthn_register` event) so
  the visual baseline captures a
  non-empty table.
- The page polls every 30s on the
  first page (matches the
  dispatcher + admin queue
  polling cadence); cursor
  pagination is on-demand.
- The `beforeValue` / `afterValue`
  columns are truncated to 80
  chars with a "Show more"
  expansion; the JSON view is
  monospace, in a `pre` block.

## Cross-references

- `app/api/v1/admin/audit/route.ts` —
  new API (GET only; cursor-
  paginated; filterable).
- `app/admin/audit/page.tsx` —
  new page.
- `components/AuditTable.tsx` —
  client-only table + cursor
  pagination (new).
- `components/AuditFilters.tsx` —
  client-only filter rail (new).
- `lib/platform/audit.ts:32` `writeAudit(...)` —
  the writer; unchanged (this
  unit is read-only).
- `tests/unit/audit-query.test.ts` —
  Vitest unit test (new).
- `tests/18-admin-audit-light.spec.ts` —
  Playwright spec (new; + 1
  visual baseline at 1440x900).
