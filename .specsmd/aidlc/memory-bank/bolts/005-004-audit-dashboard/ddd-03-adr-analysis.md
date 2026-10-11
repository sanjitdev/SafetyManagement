---
bolt: 005-004-audit-dashboard
unit: 004-audit-dashboard
intent: 005-admin-city-setup
phase: construction
stage: 3-adr-analysis
status: ready
created: 2026-10-12T19:45:00Z
---

# Stage 3 — ADR Analysis (Bolt 005-004-audit-dashboard)

## Decision register (delta)

| # | Decision | Source | Status | Notes |
|---|----------|--------|--------|-------|
| 1 | `GET /api/v1/admin/audit` is **read-only** and gated by `requireRole('admin')` only (no `requireWebAuthn`) | Stage 1 domain rules #1, #2, #3; Bolt 005-001 read-side vs write-side guard policy | Affirmed (Bolt 005-004) | Matches the existing `/api/v1/admin/cities` read posture. WebAuthn gates writes only. |
| 2 | Cursor pagination (not offset) for the audit feed | Stage 1 domain rule #4; `team.md → Code Style → Type-safe boundary` | Affirmed (Bolt 005-004) | The cursor is the ISO timestamp of the last row; the next query is `createdAt < cursor`. Stable under appends (the audit log is append-only). |
| 3 | `actorName` is server-side resolved (single fan-out `user.findUnique` per actor) | Stage 1 domain rule #5; ADR-005 four-role model | Affirmed (Bolt 005-004) | The v1 admin set is single-digit; the N+1 is per-actor, not per-row. v1.1 may add `db.user.findManyByIds`. |
| 4 | Filter state lives in the URL (the route is the only data source) | Stage 1 domain rule #6 | Affirmed (Bolt 005-004) | Filter changes reset the cursor. The page pushes the filter set into the query string on every Apply. |
| 5 | No CSV export in v1 | Stage 1 out-of-scope list; unit-brief "Out of scope (deferred)" | Deferred (v1.1) | The metric view ships; the export button is a v1.1 follow-up. |
| 6 | No real-time updates (WebSocket/SSE) in v1 | Stage 1 out-of-scope list; unit-brief | Deferred (v1.1) | 30 s polling refreshes the current page; Next button advances. |
| 7 | The closed `AuditWriteInput.entityType` union is NOT widened | ADR-012 (Bolt 005-003) | Affirmed (Bolt 005-004) | The audit dashboard is a read surface; it does not write new entity types. The bolt's seed uses only the existing 6 types. |
| 8 | Read-side `actorName` projection does NOT include phone, NID, or email | Stage 1 actorName privacy note | Affirmed (Bolt 005-004) | The dashboard is admin-only; the admin's role already grants them access to user details, but the surface is a viewer, not a CRM. |
| 9 | The dev store gets 5 seed `AuditEntry` rows (deterministic timestamps) | Stage 1 dev store delta; ADR-004 backend-agnostic facade | Affirmed (Bolt 005-004) | The visual baseline captures row 1 open; the seed is `Date.now() - N * 60_000` so the order is stable. |
| 10 | The page polls the **current** view, not a live feed | Stage 1 polling note; `team.md → Mandated` (no architectural ceremony for v1) | Affirmed (Bolt 005-004) | Same posture as the dispatcher queue; the 30 s interval is `setInterval(refetch, 30_000)`, not a `setInterval(fetch(next), ...)`. |
| 11 | The dev store's `audit.findMany` is a thin filter+sort+slice | Stage 2 db-switch delta; ADR-004 | Affirmed (Bolt 005-004) | The Prisma path uses the real `prisma.auditEntry.findMany(...)`; the dev path is a 12-line filter loop. |
| 12 | The audit dashboard is **not** gated by `requireWebAuthn` even when the admin's WebAuthn credentials are missing | Bolt 005-001 read-side vs write-side guard policy; ADR-007 | Affirmed (Bolt 005-004) | WebAuthn is a write gate. Reads happen on the admin's primary desktop, which may or may not have a registered authenticator. The cities read surface already uses this posture. |

**Total decisions in this Bolt**: 12 (all affirmed or
deferred; no new ADR-013 — the bolt is a view over
existing data and the decisions are project-policy
inheritances, not new project-wide policy).

## ADR-013 — Audit dashboard read posture (`requireRole('admin')` only; cursor pagination; URL-as-state)

### Context

The audit dashboard is the admin's read-side view of
the `AuditEntry` rows written by every prior Bolt in
this intent. The unit-brief scoped it as
"1 read-only API + 1 read-only page + 1 cursor-
paginated table + 1 filter rail + 30 s polling + 1
visual baseline". Three posture questions need an
explicit decision:

1. **Guard policy** — should the read side require
   `requireWebAuthn(session)` (matching the write
   policy in Bolt 005-001), or just
   `requireRole(session, 'admin')` (matching the
   existing `/api/v1/admin/cities` read)?
2. **Pagination** — offset (familiar, simple,
   vulnerable to write-skew) or cursor (less
   familiar, stable under appends)?
3. **State** — local component state (no
   shareable links) or URL-as-state (the route is
   the only data source; a citizen or a new tab can
   reproduce the view)?

Bolt 005-001 already settled the read-side vs
write-side guard policy: WebAuthn gates writes only.
This bolt inherits that decision. The pagination and
state questions are bolt-specific.

### Decision

1. **Read guard**: `requireRole('admin')` only.
   `requireWebAuthn(session)` is NOT invoked. The
   audit dashboard is admin-only at the role layer;
   the WebAuthn posture is a write gate, applied at
   `/api/v1/admin/cities` POST / PATCH / DELETE and
   every other write under `/api/v1/admin/*`. The
   read side stays open to any device the admin
   happens to be on (a desktop without a registered
   authenticator can still review the audit trail).
2. **Cursor pagination**: the cursor is the ISO
   timestamp of the last row on the previous page.
   The next query is
   `createdAt < cursor ORDER BY createdAt DESC LIMIT n+1`.
   The `+1` row lets the route return
   `nextCursor: <row.createdAt>` when more rows
   exist; `nextCursor: null` when the result is the
   last page. Offset pagination is rejected because
   the v1 set is small but the framework default is
   cursor (per `team.md → Code Style → Type-safe
   boundary` and the dispatcher queue's
   `nextCursor` precedent).
3. **URL-as-state**: the page reads filter state from
   `?actorId=&action=&entityType=&from=&to=` on mount
   and pushes the filter set back into the URL on
   every `Apply`. The cursor lives in component
   state (it's a position, not a user-controlled
   filter); the `Next` button pushes it into the URL
   for shareable back-links.

### Consequences

- **No WebAuthn for the audit view**: matches the
  cities read surface. The admin can review the
  audit log from any device, including a desktop
  with no registered authenticator. The decision
  is consistent with Bolt 005-001's read-side vs
  write-side posture.
- **Cursor pagination is stable under appends**: a
  new audit row landing while the admin scrolls
  does not shift the page (the cursor points to a
  specific timestamp and the next page is strictly
  below it). Deletes are not a concern (the log is
  append-only by ADR-005).
- **Filter state is shareable**: a citizen or
  auditor can be sent a link like
  `/admin/audit?action=delete&from=2026-10-01` and
  see the same view the admin who applied the
  filter saw. The URL is the canonical state.
- **No CSV export**: the unit-brief deferred it to
  v1.1. The page does not render an export button.
  v1.1 bolt will add it.
- **No real-time updates**: the unit-brief deferred
  WebSocket / SSE. 30 s polling is the v1 ceiling.

### Alternatives rejected

- **`requireWebAuthn` for the audit view** —
  identical to the write policy. Rejected because
  the dashboard is a viewer; the WebAuthn posture is
  a write gate. An admin who has just registered a
  new authenticator would not be able to read the
  audit log from a second device that does not
  have the authenticator plugged in. The
  `requireRole('admin')`-only posture is the
  Bolt 005-001 precedent and is the right
  trade-off for a read surface.
- **Offset pagination** — `?page=2&limit=50`. Simpler
  in the URL; vulnerable to write-skew if a row
  arrives mid-scroll. The v1 set is small so the
  bug is rare, but cursor is the framework default
  and the dispatcher queue's `nextCursor` is the
  precedent. Cursor wins.
- **Local component state for filters** — the filter
  set lives in `useState`, not the URL. Rejected
  because the shareable-link use case is real (an
  auditor or a citizen who has the URL can reproduce
  the view; the audit log is a transparency surface,
  not a private viewer).
- **Server-side filtering on `actorName` (fuzzy
  match)** — the v1 surface accepts `actorId`
  (exact match) only. A fuzzy name-match is a v1.1
  follow-up. v1 admins are single-digit; the
  `actorId` lookup is sufficient.
- **Cross-city grouping** — the v1 set is a flat
  list of all audit rows the admin can see. The
  city filter is a v1.1 follow-up.

### Follow-ups (deferred)

- **CSV export** — v1.1 bolt (1 button +
  1 API + the existing `actorName` resolution).
- **Real-time updates (WebSocket / SSE)** — v1.1+
  observability. The 30 s polling is the v1 ceiling.
- **Audit redaction** — v1.1 hardening. The
  `beforeValue` / `afterValue` JSON may carry PII
  (e.g., the citizen's phone in the OTP-fail row).
  The `actorName` projection does NOT include the
  actor's phone or NID; the `afterValue` content is
  raw.
- **`actorName` fuzzy match** — v1.1. v1 accepts
  `actorId` only.
- **Per-actor drill-down page** — v1.1
  (`/admin/audit/actors/[id]`). v1's `actorId`
  filter is the closest equivalent.
- **Cross-city grouping** — v1.1. v1 is a flat list.

## Cross-references

- **`lib/platform/audit.ts`** — the writer; not
  touched.
- **`lib/db-switch.ts`** — adds `db.audit.findMany`
  (Prisma + dev-store branches).
- **`lib/dev-store.ts`** — adds 5 seed `AuditEntry`
  rows + the in-memory `findMany` implementation.
- **`lib/i18n/keys.ts`** — adds 22 new
  `admin.audit.*` keys.
- **`lib/auth/guards.ts`** — `requireRole(session,
  'admin')` is the read-side guard. No new
  `requireWebAuthn` is added.
- **`tests/unit/audit-query.test.ts`** — 8 Vitest
  checks (new).
- **`tests/18-admin-audit-light.spec.ts`** — 6 API
  checks + 1 visual baseline at 1440×900 (new).
- **`decision-index.md`** — this bolt does NOT file
  ADR-013 (the decisions are project-policy
  inheritances, not new project-wide policy). The
  `ADR-013` text above is captured here for the
  bolt record; if a future bolt touches the same
  surface, the decision text is the source of
  truth.

## Paperwork reconciliation

The 005-003 ADR analysis flagged that **ADR-010**
(polygon-based geofence, deferred from the
citizen-report flow) and **ADR-011** (v1.1 platform
hardening, deferred from the auth-and-profile unit)
are referenced in source but not filed in
`decision-index.md`. The reconciliation is the
v1.1 follow-up; the audit dashboard bolt is
otherwise a clean read surface. Filed as a
deferred paperwork item; out of scope for this
bolt.
