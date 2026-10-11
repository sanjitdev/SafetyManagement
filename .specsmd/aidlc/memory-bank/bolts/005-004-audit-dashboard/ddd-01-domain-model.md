---
bolt: 005-004-audit-dashboard
unit: 004-audit-dashboard
intent: 005-admin-city-setup
phase: construction
stage: 1-domain-model
status: ready
created: 2026-10-12T19:30:00Z
---

# Stage 1 — Domain Model (Bolt 005-004-audit-dashboard)

## Vocabulary

The domain nouns:

- **AuditEntry** — one row in the append-only audit log
  (`AuditEntry` Prisma model; `DevAuditEntry` in the dev
  store). Every state change the platform performs — ticket
  transitions, admin config edits, OTP delivery failures,
  WebAuthn revocations — is recorded as one
  `AuditEntry`. The shape is set in
  `lib/platform/audit.ts → AuditWriteInput` and is the
  source of truth for what can be written:

  ```
  {
    entityType: 'ticket' | 'city' | 'category'
             | 'department' | 'ward' | 'user',
    entityId: string,
    action: string,  // e.g. "create", "update", "delete",
                     //     "ticket.transition",
                     //     "otp_send_failed"
    actorId: string,
    beforeValue?: Record<string, unknown> | null,
    afterValue?:  Record<string, unknown> | null,
    id: string,         // aud_<uuid>
    timestamp: string,  // ISO 8601
  }
  ```

  The closed `entityType` union was fixed in Bolt 005-002
  per ADR-012 (the OTP bolt's decision register refused to
  widen the union and routed the `otp_send_failed` row to
  `entityType: 'user'`). This bolt does NOT widen the
  union.

- **AuditQuery** — the read-side query this bolt stands
  up. It is filter-shaped (actor, action, entityType, date
  range) + cursor-paginated, and resolves to a list of
  `AuditEntryView` rows. The query is admin-only (no
  cross-tenant read, no citizen read).

- **AuditEntryView** — the projection returned by the
  `GET /api/v1/admin/audit` route. Resolves
  `actorId → userName` server-side so the UI does not
  need a second round-trip. The shape is:
  ```
  {
    id: string,
    actorName: string,        // 'Rahim (citizen)' etc.
    actorRole: 'citizen' | 'dispatcher' | 'crew' | 'admin',
    action: string,
    entityType: AuditWriteInput['entityType'],
    entityId: string,
    beforeValue: Record<string, unknown> | null,
    afterValue:  Record<string, unknown> | null,
    createdAt: string,        // ISO 8601
  }
  ```
  `actorName` is the display form
  (`<name> (<role>)`); the raw `actorId` is intentionally
  NOT exposed to the UI (the admin has no need to resolve
  user IDs by hand and exposing them invites
  cross-customer correlation).

- **AuditCursor** — the pagination cursor. The cursor is
  the ISO timestamp of the last row on the previous page
  (`createdAt DESC` is the canonical sort). When
  `nextCursor === null` the result is the last page.

- **AuditFilters** — the filter state held by the page:
  ```
  {
    actorId?: string,
    action?: string[],       // any-of match
    entityType?: AuditWriteInput['entityType'][],
    from?: string,           // ISO; default = now - 7d
    to?: string,             // ISO; default = now
  }
  ```

- **AuditPage** — the read-side page surface
  (`app/admin/audit/page.tsx`). Read-only; the only
  state-changing surface this intent ships is the
  `writeAudit(...)` calls that already ship in Bolts
  005-001 / 002 / 003.

## Reused surfaces

- **`lib/platform/audit.ts → writeAudit(...)`** — the
  writer. The bolt does NOT touch it; it is the source
  of truth for the row shape and the closed
  `entityType` union. Every prior bolt (005-001, 002,
  003) writes through it.
- **`lib/db-switch.ts → db.audit.create(...)`** — the
  Prisma / dev-store dispatch. The bolt adds a new
  `db.audit.findMany(...)` for the read side (the
  existing surface is write-only).
- **`lib/auth/guards.ts → requireRole(session, 'admin')`**
  — the read-side guard. The bolt does NOT add
  `requireWebAuthn(...)` (read-side; matches the
  decision in Bolt 005-001 that WebAuthn gates writes
  only). Admins may view the audit log from any device
  — including a desktop without a registered
  authenticator — which is the same posture as
  `/admin/cities` (the existing admin read surface
  uses `requireRole('admin')` only).
- **`lib/i18n/keys.ts`** — the typed key registry. The
  bolt adds ~14 new `admin.audit.*` keys, all
  bilingual (`{ bn, en }`).
- **`lib/dev-store.ts`** — the in-memory store. The
  bolt adds (a) an `audit.findMany(...)` query and
  (b) 5 seed `AuditEntry` rows in `seed()` so the
  visual baseline captures a non-empty table.

## Domain rules (refined from unit-brief)

1. **Read-only surface**. The page + API only `find`;
   no `create` / `update` / `delete` of audit rows. The
   audit log is append-only by ADR-005.
2. **Admin-only**. `requireRole(session, 'admin')` is
   the sole guard. A non-admin session receives `403
   forbidden` (matches the cities route's read-side
   response shape).
3. **No WebAuthn for reads**. Per Bolt 005-001's
   decision (read-side vs write-side guard policy),
   `requireWebAuthn` is not invoked. The WebAuthn
   posture is a write gate; reads happen on the admin's
   primary desktop.
4. **Cursor pagination, not offset**. The cursor is the
   ISO timestamp of the last row of the previous page;
   the next query is
   `createdAt < cursor ORDER BY createdAt DESC LIMIT n+1`.
   The +1 row lets the route return
   `nextCursor: <row.createdAt>` when more rows exist
   and `nextCursor: null` when the result is the last
   page. (Offset pagination would be vulnerable to
   write-skew if an admin row arrives mid-scroll; the
   v1 set is small so the cost is moot, but cursor is
   the framework default per
   `team.md → Code Style → Type-safe boundary`.)
5. **`actorName` resolution is server-side**. The route
   hydrates `actorId → userName` + `actorRole` before
   returning; the page does not re-fetch users.
   Multi-actor fans-out is N+1-safe (a single
   `user.findMany({ where: { id: { in: actorIds } } })`
   call before serialisation).
6. **Filter UI is unidirectional**. Filters live in the
   page; the URL is the canonical state (the route is
   the only data source). The page pushes the filter
   set into the query string on every change; the route
   reads it back on every fetch. (This is the same
   shape as the dispatcher's triage queue; it makes
   filter state shareable.)
7. **No `csv_export` in v1**. The unit-brief marks
   export as v1.1 (the metric view ships; the export
   button is filed in the unit-brief's out-of-scope
   block). The page does not render an "Export" button.

## API surface (refined)

`GET /api/v1/admin/audit`

| Query | Type | Default | Notes |
|-------|------|---------|-------|
| `actorId` | string | (none) | exact match |
| `action` | string (single or comma-separated) | (none) | any-of |
| `entityType` | string (single or comma-separated) | (none) | any-of; values from the closed union |
| `from` | ISO 8601 | `now - 7d` | inclusive lower bound on `createdAt` |
| `to` | ISO 8601 | `now` | inclusive upper bound on `createdAt` |
| `cursor` | ISO 8601 | (none) | the `createdAt` of the last row on the previous page |
| `limit` | integer 1-100 | `50` | page size |

Response (200):

```
{
  entries: AuditEntryView[],
  nextCursor: string | null,
}
```

Error responses (matching the cities route):

| Status | Body | When |
|--------|------|------|
| 200 | `{ entries, nextCursor }` | success |
| 400 | `{ error: 'invalid_input', issues: [...] }` | Zod failure |
| 401 | `{ error: 'unauthenticated' }` | no session |
| 403 | `{ error: 'forbidden' }` | session role !== 'admin' |
| 500 | `{ error: 'unhandled' }` | unexpected throw |

The route is GET-only. No POST / PATCH / DELETE — the
audit log is append-only.

## Page surface (refined)

`app/admin/audit/page.tsx`

Layout (1440×900 desktop; matches the cities page):

- Top bar (h-12, `bg-bg`, `border-b`): brand "CityFix" +
  role badge "Admin" + a back-link "← Back to cities"
  → `/admin/cities` + lang toggle + theme toggle +
  logout.
- Left rail (w-72, `bg-surface`, `border-r`): filter UI
  (`<AdminAuditFilters />`).
  - **Actor** (`<input>` free-text, resolved to a
    `userId` on the server; v1 accepts a `userId`
    string as-is — there's no user-picker in v1
    because the v1 admin set is small, single-digit).
  - **Action** (`<input>` free-text, comma-separated).
  - **Entity type** (`<select>` enum-bound to the closed
    `entityType` union; single-select for v1).
  - **From** + **To** (date inputs, ISO-on-blur).
  - **Apply** button + **Reset** button (in the
    bottom row of the rail).
- Main panel: table
  (`<AdminAuditTable entries={entries} />`):
  - Columns: `createdAt` (date, localised via
    `Intl.DateTimeFormat`), `actor` (`<name> (<role>)`),
    `action`, `entityType` (chip), `entityId`
    (truncated to 16 chars + tooltip on hover), a
    "Details" toggle that expands a `<pre>` of
    `beforeValue` + `afterValue` for that row.
- Below the table: cursor pagination
  (`Previous` / `Next` buttons, `nextCursor` is the
  ISO timestamp of the last row on the current page;
  the page pushes that into `?cursor=` on `Next`).
- Polling: 30 s `setInterval` refetch (matches the
  dispatcher queue / dedup cadence).

States: `loading` (skeleton rows), `error`
(generic message + retry), `empty` (no rows in the
filtered range — different from `loading`),
`ready` (entries + `nextCursor`).

The page is `'use client'`. The auth gate is via
`/api/auth/status` (same pattern as
`/admin/cities`); a non-admin session is redirected to
`/login`.

## Component surface (refined)

Two new components, both under `components/`:

- **`components/AdminAuditFilters.tsx`** — the left
  rail. Receives the current `AuditFilters` + an
  `onApply(filters)` callback. Internal state is
  uncontrolled inputs that flush to the parent on
  `Apply` (avoids round-tripping every keystroke).
  Bilingual via `t(...)` from
  `lib/i18n/keys.ts`.
- **`components/AdminAuditTable.tsx`** — the main
  panel. Receives `entries: AuditEntryView[]` +
  `loading: boolean` + `error: string | null` +
  `expanded: Set<string>` + `onToggleExpand(id)` +
  `onLoadMore: () => void` + `hasMore: boolean`. Pure
  presentational; no fetch.

A `components/AdminAuditRow.tsx` is NOT split out
because the row is simple (a `<tr>` with an expand
slot) and splitting it would add a file without
clarifying the surface. The expand-slot details are
inline in the table component.

## i18n keys (refined)

14 new keys under `admin.audit.*` (all `{ bn, en }`):

```
'admin.audit.title'
'admin.audit.subtitle'
'admin.audit.col.timestamp'
'admin.audit.col.actor'
'admin.audit.col.action'
'admin.audit.col.entityType'
'admin.audit.col.entityId'
'admin.audit.col.details'
'admin.audit.filter.actor'
'admin.audit.filter.action'
'admin.audit.filter.entityType'
'admin.audit.filter.from'
'admin.audit.filter.to'
'admin.audit.filter.apply'
'admin.audit.filter.reset'
'admin.audit.empty'
'admin.audit.error'
'admin.audit.loading'
'admin.audit.loadMore'
'admin.audit.back'
'admin.audit.expand.before'
'admin.audit.expand.after'
```

(That's 22 keys; the unit-brief estimated ~14 — the
extra 8 are the per-column labels and the load-more
button, which the brief's table surface needs but the
brief's "Filter UI" line item didn't enumerate
explicitly. All keys ship; the visual baseline
references 6 of them by id.)

## Dev store delta (refined)

The dev store currently seeds `audit: []` (empty). The
bolt adds 5 seed `AuditEntry` rows so the visual
baseline captures a non-empty table. The rows are
deterministic (timestamps are relative to seed time,
not absolute) and exercise the four most common
`action` shapes:

1. `action: 'create'`, `entityType: 'category'`,
   `actorId: 'user_admin_dncc'`,
   `afterValue: { slug: 'streetlight', ... }` —
   mirrors the `applyDhakaTemplate` audit row.
2. `action: 'update'`, `entityType: 'city'`,
   `actorId: 'user_admin_dncc'`,
   `beforeValue: { dedupRadiusMeters: 50 }`,
   `afterValue: { dedupRadiusMeters: 100 }` — the
   `ADM-005` dedup-radius edit.
3. `action: 'create'`, `entityType: 'ward'`,
   `actorId: 'user_admin_dncc'`,
   `afterValue: { number: 14, name: 'Ward 14', ... }`
   — mirrors the ward-draw save.
4. `action: 'otp_send_failed'`, `entityType: 'user'`,
   `actorId: 'user_citizen_rahim'`,
   `afterValue: { phone: '+8801...', provider: 'twilio', error: 'twilio_api_error' }`
   — mirrors the Bolt 005-003 audit-on-failure row.
5. `action: 'create'`, `entityType: 'city'`,
   `actorId: 'user_admin_dncc'`,
   `afterValue: { slug: 'dhaka-north', ... }` — the
   cities-overview create row.

The five rows are sorted `createdAt DESC` so the
most-recent (`otp_send_failed`) renders first; the
visual baseline captures row 1 + rows 2-5 collapsed.

The seed timestamps use `Date.now() - N * 60_000`
so the row order is deterministic across test runs
and the visual baseline is stable.

## Reuse pattern: the `findMany` shape

The dev store's `db.audit.findMany` signature
follows the existing `db.ticket.findMany` shape
(filter `where` + sort `orderBy` + `take`):

```ts
db.audit.findMany({
  where?: {
    actorId?: string,
    action?: { in: string[] } | string,
    entityType?: { in: string[] } | string,
    createdAt?: { gte?: string, lte?: string },
    createdAtLt?: string,   // cursor
  },
  orderBy?: { createdAt: 'asc' | 'desc' },
  take?: number,
}): DevAuditEntry[]
```

The `createdAtLt` field is a thin wrapper around
`createdAt: { lt: ... }` so the cursor input is a
flat ISO string (matches the API's `?cursor=` shape).
The dev store sorts on the `timestamp` field (the
in-memory equivalent of the Prisma `createdAt`).

## Acceptance mapping (refined)

| # | Unit-brief criterion | Implementation |
|---|------------------------|----------------|
| 1 | Auth gate | `requireRole(session, 'admin')` in the API + `/api/auth/status` redirect in the page. |
| 2 | Filters work | `where` clause built from the four query params (actorId, action, entityType, from/to). |
| 3 | Cursor pagination | `nextCursor: <last.createdAt>` when more rows exist; `null` when last page. |
| 4 | 30s polling | `setInterval` in the page, identical to the queue page. |
| 5 | `actorName` resolved | Server-side `user.findMany({ where: { id: { in: actorIds } } })` before serialise. |
| 6 | Bilingual | All 22 i18n keys carry `{ bn, en }`. |
| 7 | Visual baseline | Pillow baseline at 1440x900, light theme, English, 5 rows. |

## Out of scope (confirmed)

- **CSV export**: unit-brief marked v1.1. The page does
  not render an export button. The unit-brief's
  "out of v1 scope" callout stays.
- **Real-time updates**: unit-brief filed as
  deferred. The 30 s polling is the v1 ceiling.
- **Audit redaction**: not in the unit-brief; the
  `beforeValue` / `afterValue` JSON may carry PII
  (e.g., the citizen's phone in the OTP-fail row);
  redaction is a v1.1 hardening step. The v1
  `actorName` projection does NOT include the actor's
  phone or NID.
- **Cross-city grouping**: not in the unit-brief. v1
  is a flat list of all audit rows the admin's session
  is allowed to see (admins are cross-city actors; the
  set is not partitioned by city).
- **Per-actor drill-down**: the v1 page has an
  `actorId` filter (free-text input); a dedicated
  `/admin/audit/actors/[id]` is a v1.1 follow-up.

## Ready-for-checklist

- [ ] `app/api/v1/admin/audit/route.ts` ships with
      `requireRole('admin')`, the Zod query schema,
      and the `actorName` resolution.
- [ ] `components/AdminAuditFilters.tsx` + `components/AdminAuditTable.tsx`
      are pure presentational, no fetch.
- [ ] `app/admin/audit/page.tsx` is `'use client'`,
      reads filter state from the URL, pushes back
      on every change, 30 s polling, cursor pagination.
- [ ] `lib/db-switch.ts` adds `db.audit.findMany(...)`
      with the dev-store and Prisma branches.
- [ ] `lib/dev-store.ts` adds 5 seed `AuditEntry` rows
      + the in-memory `findMany` implementation.
- [ ] 22 new `admin.audit.*` i18n keys authored in both
      `bn` + `en`.
- [ ] Header pill on `/admin/cities` → `/admin/audit`
      (matches the existing cities header pattern).
- [ ] `tests/unit/audit-query.test.ts` — 8 Vitest
      checks (factory, filter combinations, cursor
      pagination boundary, empty result).
- [ ] `tests/18-admin-audit-light.spec.ts` — 6 API
      checks + 1 visual baseline at 1440×900.
- [ ] `ddd-04-bolt-record.md` records the 7
      acceptance criteria.
- [ ] `npx tsc --noEmit` + `npm run test:unit` +
      `npm run test:mockups` + the new Playwright spec
      are all green.
