---
unit: 004-audit-dashboard
intent: 005-admin-city-setup
phase: construction
status: complete
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T22:00:00Z
---

# Unit 004 — Audit Dashboard (Intent 005)

## Scope

A read-only view of the `AuditEntry` rows
written by every config change in Unit
002 (and, going forward, by every other
write in the platform). Filter UI: actor
(admin who performed the action),
action (`create` / `update` / `delete` /
`webauthn_register` / `webauthn_assert`
/ `otp_send_failed` / ...), entityType
(`City` / `Category` / `Department` /
`Ward` / `User` / ...), and date range
(last 24h / 7d / 30d / custom). Cursor
pagination. The page is the single
internal Aamir surface for "show me
who changed what, when" — the operational
answer to FIA 13 "Discoverable and
reversible config".

The unit is the last to ship because
every preceding unit writes at least one
`AuditEntry` row in the dev seed; the
unit's visual baseline needs non-empty
data.

## Stories owned

| Slug | Title | Status |
|------|-------|--------|
| ADM-007 | audit-dashboard | ready |

## Bolt candidate

`005-004-audit-dashboard` (one
`ddd-construction-bolt`).

## Reuse references

- `prisma/schema.prisma`:
  - `model AuditEntry { id, cityId?,
    entityType, entityId, action,
    actorId, beforeValue?, afterValue?,
    createdAt }` — already shipped in
    Intent 001.
- `lib/platform/audit.ts:32` `writeAudit(...)`
  — the writer. This unit reads; the
  writer is unchanged.
- `lib/db.ts` (production) /
  `lib/dev-store.ts` (dev) — the
  query layer. The new API hits the
  same `db.auditEntry.findMany` shape
  the existing routes use.
- `lib/auth/guards.ts:48`
  `requireRole('admin')` — every
  request to the audit API is gated
  by `requireRole('admin')` (no
  `requireWebAuthn` on read; WebAuthn
  is a write-side property).
- `components/Pagination.tsx` (in
  Intent 002's pagination pattern;
  the citizen's `/citizen/activity`
  page is the closest cousin) — the
  cursor pagination UI is the same
  shape.

## API surface (delta)

- **New**: `app/api/v1/admin/audit/route.ts`
  — GET. Query:
  - `actorId` (optional; filter by
    `actorId`).
  - `action` (optional; single or
    comma-list, e.g.,
    `?action=create,update`).
  - `entityType` (optional; e.g.,
    `?entityType=City,Ward`).
  - `from` / `to` (optional ISO
    timestamps; default = last 7
    days).
  - `cursor` (optional; the
    `createdAt` of the last row from
    the previous page; the response
    is sorted by `createdAt DESC` so
    cursor = the most-recent row's
    `createdAt`).
  - `limit` (optional integer, 1-100,
    default 50).
  - Returns: `{ entries:
    Array<AuditEntryView>, nextCursor:
    string | null }` where
    `AuditEntryView = { id, actorName,
    action, entityType, entityId,
    beforeValue, afterValue, createdAt
    }`. `actorName` is hydrated from
    `User.name` server-side (the
    client never sees the actor's
    PII beyond the display name).
  - Gated by `requireRole('admin')`.
    Admins see all `AuditEntry` rows
    in the system (no per-city scope
    on the audit view; an admin
    operating across multiple cities
    wants to see the full picture).
- **No write endpoints** — this is
  a read-only view.

## Pages (delta)

- **New**: `app/admin/audit/page.tsx` —
  Audit dashboard. Filter rail on
  the left: actor (multi-select;
  hydrated from the user list), action
  (multi-select of the enum values),
  entityType (multi-select of the
  enum values), date range (last 24h
  / 7d / 30d / custom with a date
  picker). Table on the right: actor,
  action, entityType, before / after
  (truncated to 80 chars with a
  "Show more" expansion), createdAt
  (Bangla-formatted with the
  inherited `formatBn` helper).
  Cursor pagination at the bottom.
  Empty state: "No entries match the
  current filters." 30s polling on
  the first page (matches the
  dispatcher + admin queue polling
  cadence).
- **Header pill**: added in
  `app/admin/cities/page.tsx` to
  point at `/admin/audit` (same row
  as the "Set up new city" CTA).

## Components (delta)

- **New**: `components/AuditTable.tsx` —
  client-only. Renders the table +
  the cursor pagination. Receives
  `entries`, `nextCursor`, `onLoadMore`
  as props. The expansion of
  `beforeValue` / `afterValue` is
  local state.
- **New**: `components/AuditFilters.tsx` —
  client-only. Renders the filter
  rail. Receives `filters`, `onChange`
  as props. Debounces the date-range
  picker (300ms) to avoid spamming
  the API on every keystroke.

## i18n keys (delta)

New keys under `admin.audit.*` (≈ 14
keys; each `{ bn, en }`). Examples:
- `admin.audit.title` — "Audit log" /
  "অডিট লগ".
- `admin.audit.subtitle` — "Every
  config change is recorded here."
- `admin.audit.filter.actor` —
  "Actor".
- `admin.audit.filter.action` —
  "Action".
- `admin.audit.filter.entityType` —
  "Entity type".
- `admin.audit.filter.dateRange` —
  "Date range".
- `admin.audit.col.actor` —
  "Actor".
- `admin.audit.col.action` —
  "Action".
- `admin.audit.col.entity` —
  "Entity".
- `admin.audit.col.before` —
  "Before".
- `admin.audit.col.after` —
  "After".
- `admin.audit.col.when` —
  "When".
- `admin.audit.empty` — "No entries
  match the current filters.".
- `admin.audit.loadMore` — "Load
  more".

## Tests (delta)

- **Vitest**: `tests/unit/audit-query.test.ts`
  (new). ~8 checks:
  - The query applies the actor
    filter.
  - The query applies the action
    filter (single + comma-list).
  - The query applies the entityType
    filter.
  - The query applies the date-range
    filter.
  - The query orders by `createdAt
    DESC`.
  - The query cursorizes correctly
    (a row with `createdAt` <
    `cursor` is not in the next
    page).
  - The query enforces `limit` (1-100,
    default 50).
  - The query rejects unknown
    `entityType` values with 400
    (Zod-validated).
- **Playwright**: `tests/18-admin-audit-light.spec.ts`
  (new). API checks: anonymous →
  401; citizen → 403; admin → 200
  with the seeded entries; the
  filter combinations narrow the
  result set correctly; the cursor
  returns the next page. + 1 visual
  baseline (audit dashboard at
  1440x900, light theme, English
  labels, with the seeded entries
  visible — the page is non-empty
  because the dev seed adds 4-5
  `AuditEntry` rows).

## Verification

- `npx tsc --noEmit` clean.
- `npm run test:unit` green.
- `npm run test:mockups` green.
- `curl -fs http://localhost:3000/`
  200.
- `npx playwright test
  tests/18-admin-audit-light.spec.ts`
  green.
- The dev store's `seed()` adds 4-5
  `AuditEntry` rows on startup so
  the visual baseline captures a
  non-empty table.

## Out of scope (deferred)

- CSV export of the audit log. The
  WO-004 acceptance criteria list
  CSV export on the
  post-launch-adoption dashboard
  (page 4.7), not the audit
  dashboard; the unit is filed for
  v1.1 in the bolt plan's
  out-of-scope.
- Real-time updates (WebSocket /
  SSE). The page polls every 30s;
  a v1.1 bolt may add a
  server-sent-event stream.
- Audit log redaction (PII fields
  like the citizen's phone number
  are never written to `beforeValue`
  / `afterValue` today; a v1.1 bolt
  may add a redaction layer for
  future write paths).
- Cross-city audit comparison. An
  admin operating across multiple
  cities can already see all rows;
  a "group by city" view is a v1.1
  enhancement.
- Per-actor drill-down. The
  filter is the closest cousin;
  a dedicated `/admin/audit/[actorId]`
  page is a v1.1 follow-up.
