---
bolt: 005-004-audit-dashboard
unit: 004-audit-dashboard
intent: 005-admin-city-setup
phase: construction
stage: 2-technical-design
status: ready
created: 2026-10-12T19:35:00Z
---

# Stage 2 — Technical Design (Bolt 005-004-audit-dashboard)

## File map

**New (8 files):**

- `app/api/v1/admin/audit/route.ts` — the GET route
  handler (Zod query schema, `requireRole('admin')`,
  `actorName` resolution, cursor pagination).
- `app/admin/audit/page.tsx` — the read-only page
  (filter URL state, 30 s polling, cursor pagination,
  expand-on-row).
- `components/AdminAuditFilters.tsx` — the left-rail
  filter UI (pure presentational).
- `components/AdminAuditTable.tsx` — the main-panel
  table (pure presentational).
- `lib/admin/audit-query.ts` — the server-side query
  helper (filter + cursor + actorName hydration).
  Library-level, no React.
- `tests/unit/audit-query.test.ts` — Vitest unit test
  for the query helper (~8 checks).
- `tests/18-admin-audit-light.spec.ts` — Playwright
  spec (6 API checks + 1 visual baseline at 1440×900).
- `.specsmd/aidlc/memory-bank/bolts/005-004-audit-dashboard/ddd-04-bolt-record.md`
  — the bolt's acceptance record (Stage 5).

**Modified (5 files):**

- `lib/db-switch.ts` — add `db.audit.findMany(...)` to
  the dispatcher (Prisma + dev-store branches).
- `lib/dev-store.ts` — add 5 seed `AuditEntry` rows
  + the in-memory `findMany` implementation.
- `lib/i18n/keys.ts` — add 22 new `admin.audit.*`
  keys, all `{ bn, en }`.
- `app/admin/cities/page.tsx` — add a header pill
  → `/admin/audit` (matches the existing cities
  pill row).
- `_progress/00-design-log.md` — Bolt 005-004 entry
  appended.

## Type definitions (`lib/admin/audit-query.ts`)

```ts
import type { AuditWriteInput } from '@/lib/platform/audit';

export type AuditEntityType = AuditWriteInput['entityType'];
export type AuditRole = 'citizen' | 'dispatcher' | 'crew' | 'admin';

export interface AuditEntryView {
  id: string;
  actorId: string;
  actorName: string;     // "<name> (<role>)"
  actorRole: AuditRole;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue:  Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditQueryFilters {
  actorId?: string;
  action?: string[];     // any-of
  entityType?: AuditEntityType[];  // any-of
  from?: string;         // ISO; default = now - 7d
  to?: string;           // ISO; default = now
}

export interface AuditQueryInput extends AuditQueryFilters {
  cursor?: string;       // ISO; the createdAt of the last row on the previous page
  limit?: number;        // 1..100; default 50
}

export interface AuditQueryResult {
  entries: AuditEntryView[];
  nextCursor: string | null;
}

export interface AdminActor {
  id: string;
  name: string;
  role: AuditRole;
}

/** Public surface of the query helper. */
export interface AuditQueryService {
  list(input: AuditQueryInput): Promise<AuditQueryResult>;
  /** Test seam: build the `where` clause without touching the DB. */
  __buildWhere(
    input: AuditQueryInput,
  ): {
    where: Parameters<typeof db.audit.findMany>[0] extends infer A
      ? A extends { where?: infer W } ? W : never
      : never;
    fromIso: string;
    toIso: string;
  };
}
```

(The `__buildWhere` test seam exists so the Vitest
suite can verify the Zod-derived `where` shape without
hitting the dev store; the production path uses the
real `db.audit.findMany`.)

## Query helper implementation sketch

```ts
// lib/admin/audit-query.ts
import { db } from '@/lib/db-switch';
import type { AuditWriteInput } from '@/lib/platform/audit';

const DEFAULT_FROM_DAYS = 7;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function listAuditEntries(
  input: AuditQueryInput,
): Promise<AuditQueryResult> {
  const { where, fromIso, toIso } = buildWhere(input);
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT);
  const rows = await db.audit.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // +1 to detect "has more"
  });
  const hasMore = rows.length > limit;
  const trimmed = hasMore ? rows.slice(0, limit) : rows;
  const actors = await hydrateActors(
    [...new Set(trimmed.map((r) => r.actorId))],
  );
  const entries: AuditEntryView[] = trimmed.map((r) => {
    const a = actors.get(r.actorId);
    return {
      id: r.id,
      actorId: r.actorId,
      actorName: a ? `${a.name} (${a.role})` : r.actorId,
      actorRole: a?.role ?? 'citizen',
      action: r.action,
      entityType: r.entityType as AuditEntityType,
      entityId: r.entityId,
      beforeValue: r.beforeValue,
      afterValue: r.afterValue,
      createdAt: r.timestamp, // DevAuditEntry.timestamp ↔ AuditEntry.createdAt
    };
  });
  return {
    entries,
    nextCursor: hasMore ? trimmed[trimmed.length - 1].timestamp : null,
  };
}

function buildWhere(input: AuditQueryInput) {
  const toIso   = input.to   ?? new Date().toISOString();
  const fromMs  = input.from
    ? Date.parse(input.from)
    : Date.now() - DEFAULT_FROM_DAYS * 86_400_000;
  const fromIso = input.from ?? new Date(fromMs).toISOString();

  const where: Record<string, unknown> = {
    createdAt: { gte: fromIso, lte: toIso },
  };
  if (input.actorId) where.actorId = input.actorId;
  if (input.action?.length) {
    where.action = input.action.length === 1
      ? input.action[0]
      : { in: input.action };
  }
  if (input.entityType?.length) {
    where.entityType = input.entityType.length === 1
      ? input.entityType[0]
      : { in: input.entityType };
  }
  if (input.cursor) {
    (where.createdAt as Record<string, string>).lt = input.cursor;
  }
  return { where, fromIso, toIso };
}

function clampLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(n)));
}

async function hydrateActors(
  ids: string[],
): Promise<Map<string, AdminActor>> {
  if (!ids.length) return new Map();
  // The dev store does not expose a `user.findMany({ id: { in: ... } })`
  // in db-switch; we fan-out via per-id findUnique (the v1 admin set is
  // single-digit; this is N+1 only for actors, not rows). The future
  // bolt that grows the surface to the dispatcher should add a
  // `db.user.findManyByIds` helper.
  const out = new Map<string, AdminActor>();
  for (const id of ids) {
    const u = await db.user.findUnique({ where: { id } });
    if (u) {
      out.set(id, { id: u.id, name: u.name, role: u.role as AuditRole });
    }
  }
  return out;
}
```

The `where` builder is exported via
`__buildWhere(input)` (a thin re-export of
`buildWhere`) for the Vitest surface; the production
path does not call it directly.

## Route handler

`app/api/v1/admin/audit/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, getActiveSession } from '@/lib/db-switch';
import { ApiError, requireRole } from '@/lib/auth/guards';
import { listAuditEntries } from '@/lib/admin/audit-query';

const QuerySchema = z.object({
  actorId: z.string().min(1).max(80).optional(),
  action: z.string().min(1).max(120).optional(),       // comma-list
  entityType: z.string().min(1).max(40).optional(),    // comma-list
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const EntityTypeSchema = z.enum([
  'ticket', 'city', 'category', 'department', 'ward', 'user',
]);

export async function GET(req: NextRequest) {
  try {
    const session = await getActiveSession();
    if (!session) {
      return NextResponse.json(
        { error: 'unauthenticated' },
        { status: 401 },
      );
    }
    requireRole(session, 'admin');

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_input', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const q = parsed.data;
    if (q.entityType) {
      const list = q.entityType.split(',');
      for (const t of list) {
        if (!EntityTypeSchema.safeParse(t).success) {
          return NextResponse.json(
            { error: 'invalid_input', detail: `unknown entityType ${t}` },
            { status: 400 },
          );
        }
      }
    }
    const result = await listAuditEntries({
      actorId: q.actorId,
      action: q.action?.split(',').map((s) => s.trim()).filter(Boolean),
      entityType: q.entityType
        ?.split(',')
        .map((s) => s.trim())
        .filter(Boolean) as never,
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: q.limit,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code }, { status: e.status });
    }
    return NextResponse.json({ error: 'unhandled' }, { status: 500 });
  }
}
```

The route is GET-only. No POST / PATCH / DELETE — the
audit log is append-only.

## Page surface

`app/admin/audit/page.tsx`

The page is `'use client'`. The auth gate runs
once on mount via `fetch('/api/auth/status')`; a
non-admin session redirects to `/login`. The page
holds:

- `lang: 'bn' | 'en'` (localStorage-persisted, same
  `cityfix.preferred_language.v1` key as the other
  admin pages).
- `filters: AuditQueryFilters` — initialised from the
  URL `?actorId=&action=&entityType=&from=&to=`.
- `cursor: string | null` — the current page's
  forward cursor.
- `entries: AuditEntryView[]` — the current page.
- `loading: 'idle' | 'loading' | 'error'`.
- `expanded: Set<string>` — which rows are open.
- `error: string | null`.

The fetch effect is keyed on
`JSON.stringify({ filters, cursor, limit })` so a
filter change resets the cursor and refetches from
the top; the `Next` button pushes `cursor` into the
URL and refetches with the new cursor.

A 30 s `setInterval` triggers a refetch with the
current `cursor` (does NOT poll forward — the page is
a viewer, not a real-time feed; the polling is
"refresh the current view"). The interval is cleared
on unmount.

The page also renders a header pill row
(`← Back to cities` + lang + theme + logout) that
matches the existing admin pages' chrome.

## Component: AdminAuditFilters

Receives:

```ts
{
  initial: AuditQueryFilters,
  lang: Language,
  onApply: (filters: AuditQueryFilters) => void,
  onReset: () => void,
}
```

Internal state: uncontrolled inputs (avoid
round-tripping every keystroke). On `Apply`, the
component reads its inputs and calls
`onApply({ actorId, action, entityType, from, to })`.
The `action` field is comma-separated in the input
and split on `Apply`. Bilingual via `t(...)`.

## Component: AdminAuditTable

Receives:

```ts
{
  entries: AuditEntryView[],
  loading: boolean,
  error: string | null,
  expanded: Set<string>,
  onToggleExpand: (id: string) => void,
  onLoadMore: () => void,
  hasMore: boolean,
  lang: Language,
}
```

Renders:

- `<table>` with `<thead>` columns
  (`Timestamp`, `Actor`, `Action`, `Entity`,
  `Details`).
- `<tbody>` of rows; each row is
  `<tr>` with the 5 cells + a chevron `▶` / `▼` for
  the `Details` toggle. The expand slot is a second
  `<tr>` with `colSpan=5` that renders a `<pre>` of
  `beforeValue` + `afterValue` when the row is open.
- A footer row with the `Load more` button (visible
  when `hasMore === true`).
- Loading: 5 skeleton rows (the existing
  `animate-pulse` pattern from the cities page).
- Error: a single `<tr>` with the error message.
- Empty: a single `<tr>` with
  `t('admin.audit.empty')`.

## db-switch delta

Add to the `db.audit` block in
`lib/db-switch.ts`:

```ts
findMany: (args: {
  where?: {
    actorId?: string;
    action?: string | { in: string[] };
    entityType?: string | { in: string[] };
    createdAt?: { gte?: string; lte?: string; lt?: string };
  };
  orderBy?: { createdAt: 'asc' | 'desc' };
  take?: number;
}) =>
  isDevStore()
    ? devDb.audit.findMany(args as never)
    : (prismaClient.auditEntry.findMany(args as never) as unknown) as Awaited<
        ReturnType<typeof devDb.audit.findMany>
      >,
```

The Prisma shape uses `AuditEntry.createdAt` (a
`DateTime`); the dev store's `timestamp` is a string
ISO. The cast-as-never on the Prisma side keeps the
existing `devDb` shape as the visible type (the
production typing flows through the real Prisma
client at runtime).

## dev-store delta

In `lib/dev-store.ts`:

```ts
audit: {
  create(args: { data: Omit<DevAuditEntry, 'id' | 'timestamp'> }): DevAuditEntry {
    // ... existing
  },
  findMany(args: {
    where?: {
      actorId?: string;
      action?: string | { in: string[] };
      entityType?: string | { in: string[] };
      createdAt?: { gte?: string; lte?: string; lt?: string };
    };
    orderBy?: { createdAt: 'asc' | 'desc' };
    take?: number;
  }): DevAuditEntry[] {
    const all = [...getStore().audit];
    const filtered = all.filter((row) => {
      if (args.where?.actorId && row.actorId !== args.where.actorId) return false;
      if (args.where?.action) {
        if (typeof args.where.action === 'string') {
          if (row.action !== args.where.action) return false;
        } else if (!args.where.action.in.includes(row.action)) {
          return false;
        }
      }
      if (args.where?.entityType) {
        if (typeof args.where.entityType === 'string') {
          if (row.entityType !== args.where.entityType) return false;
        } else if (!args.where.entityType.in.includes(row.entityType)) {
          return false;
        }
      }
      if (args.where?.createdAt) {
        const t = Date.parse(row.timestamp);
        if (args.where.createdAt.gte && t < Date.parse(args.where.createdAt.gte)) return false;
        if (args.where.createdAt.lte && t > Date.parse(args.where.createdAt.lte)) return false;
        if (args.where.createdAt.lt  && t >= Date.parse(args.where.createdAt.lt)) return false;
      }
      return true;
    });
    const dir = args.orderBy?.createdAt === 'asc' ? 1 : -1;
    filtered.sort((a, b) => dir * (a.timestamp < b.timestamp ? -1 : 1));
    return args.take ? filtered.slice(0, args.take) : filtered;
  },
},
```

In the `seed()` function, append 5 `AuditEntry` rows
to the `audit: []` initialisation:

```ts
const now = Date.now();
const audit: DevAuditEntry[] = [
  {
    id: 'aud_seed_otp_fail',
    entityType: 'user',
    entityId: 'user_citizen_rahim',
    action: 'otp_send_failed',
    actorId: 'user_citizen_rahim',
    beforeValue: null,
    afterValue: {
      phone: '+8801712345678',
      provider: 'twilio',
      error: 'twilio_api_error',
    },
    timestamp: new Date(now - 1 * 60_000).toISOString(),
  },
  {
    id: 'aud_seed_ward_create',
    entityType: 'ward',
    entityId: 'ward_14',
    action: 'create',
    actorId: 'user_admin_dncc',
    beforeValue: null,
    afterValue: {
      number: 14,
      name: 'Ward 14',
      nameBn: 'ওয়ার্ড ১৪',
      polygonGeoJson: '<truncated for seed>',
    },
    timestamp: new Date(now - 5 * 60_000).toISOString(),
  },
  {
    id: 'aud_seed_dedup_update',
    entityType: 'city',
    entityId: 'city_dhaka_north',
    action: 'update',
    actorId: 'user_admin_dncc',
    beforeValue: { dedupRadiusMeters: 50 },
    afterValue:  { dedupRadiusMeters: 100 },
    timestamp: new Date(now - 30 * 60_000).toISOString(),
  },
  {
    id: 'aud_seed_category_create',
    entityType: 'category',
    entityId: 'cat_streetlight',
    action: 'create',
    actorId: 'user_admin_dncc',
    beforeValue: null,
    afterValue: {
      slug: 'streetlight',
      name: 'Streetlight',
      nameBn: 'বাতি',
      departmentId: 'dept_streetlight',
    },
    timestamp: new Date(now - 60 * 60_000).toISOString(),
  },
  {
    id: 'aud_seed_city_create',
    entityType: 'city',
    entityId: 'city_dhaka_north',
    action: 'create',
    actorId: 'user_admin_dncc',
    beforeValue: null,
    afterValue: {
      slug: 'dhaka-north',
      name: 'Dhaka North City Corporation',
      nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
      defaultLanguage: 'bn',
      dedupRadiusMeters: 50,
    },
    timestamp: new Date(now - 24 * 60 * 60_000).toISOString(),
  },
];
```

The 5 seed rows are deterministic; the visual
baseline captures the table with row 1 open and
rows 2-5 collapsed.

The dev store also needs `user_admin_dncc` to be a
seed actor so the `actorName` hydration can find a
real name. The admin persona is already a seed user
(per the dev-session / dev-login flow); no new
fixture is needed.

## i18n keys (delta)

Append to `lib/i18n/keys.ts` (after the existing
`admin.dedup.outOfRange` line):

```ts
// WO-005 (Intent 005) — Audit dashboard
'admin.audit.title':     { bn: 'অডিট লগ',     en: 'Audit log' },
'admin.audit.subtitle':  {
  bn: 'প্ল্যাটফর্মের সব স্টেট-পরিবর্তনের অডিট ট্রেইল।',
  en: 'Audit trail for every state change on the platform.',
},
'admin.audit.col.timestamp': { bn: 'সময়',       en: 'Timestamp' },
'admin.audit.col.actor':      { bn: 'কে',         en: 'Actor' },
'admin.audit.col.action':     { bn: 'কাজ',        en: 'Action' },
'admin.audit.col.entityType': { bn: 'এন্টিটি',    en: 'Entity' },
'admin.audit.col.entityId':   { bn: 'আইডি',       en: 'ID' },
'admin.audit.col.details':    { bn: 'বিস্তারিত',   en: 'Details' },
'admin.audit.filter.actor':       { bn: 'অভিনেতা (ID)', en: 'Actor (ID)' },
'admin.audit.filter.action':      { bn: 'কাজ',          en: 'Action' },
'admin.audit.filter.entityType':  { bn: 'এন্টিটি ধরন',   en: 'Entity type' },
'admin.audit.filter.from':        { bn: 'শুরু',          en: 'From' },
'admin.audit.filter.to':          { bn: 'শেষ',           en: 'To' },
'admin.audit.filter.apply':       { bn: 'প্রয়োগ',         en: 'Apply' },
'admin.audit.filter.reset':       { bn: 'রিসেট',          en: 'Reset' },
'admin.audit.empty':       { bn: 'কোনো অডিট এন্ট্রি নেই', en: 'No audit entries' },
'admin.audit.error':       { bn: 'অডিট লোড করা যায়নি',   en: 'Could not load audit log' },
'admin.audit.loading':     { bn: 'লোড হচ্ছে...',          en: 'Loading...' },
'admin.audit.loadMore':    { bn: 'আরো লোড করুন',          en: 'Load more' },
'admin.audit.back':        { bn: '← শহরসমূহে ফিরুন',      en: '← Back to cities' },
'admin.audit.expand.before': { bn: 'আগে',  en: 'Before' },
'admin.audit.expand.after':  { bn: 'পরে',  en: 'After' },
```

## cities header pill (delta)

`app/admin/cities/page.tsx` — add a small "Audit" pill
in the top-bar (right of the existing brand + role
badge, before the lang toggle), linking to
`/admin/audit`. The pill reuses the same styling as
the existing "Set up" + "View" pills.

## Vitest (delta)

`tests/unit/audit-query.test.ts` — 8 checks:

1. `buildWhere({})` returns
   `{ createdAt: { gte: <now-7d>, lte: <now> } }`
   (no filters, default 7d window).
2. `buildWhere({ actorId: 'u1' })` adds
   `actorId: 'u1'`.
3. `buildWhere({ action: ['a', 'b'] })` adds
   `action: { in: ['a', 'b'] }`; single-element array
   collapses to a string.
4. `buildWhere({ entityType: ['city'] })` adds
   `entityType: 'city'`.
5. `buildWhere({ from, to })` overrides the default
   window.
6. `buildWhere({ cursor: '<iso>' })` adds
   `createdAt.lt = '<iso>'`.
7. `listAuditEntries({ limit: 200 })` clamps to 100
   and returns at most 100 rows.
8. `listAuditEntries({ limit: 0 })` clamps to 1.

## Playwright (delta)

`tests/18-admin-audit-light.spec.ts` — 6 API checks
+ 1 visual baseline:

- **API checks** (auth-gated, login as
  `user_admin_dncc` via the dev-session route):
  1. `GET /api/v1/admin/audit` returns 200 with
     `{ entries: [...5 rows], nextCursor: null }`.
  2. `?actorId=user_admin_dncc` returns 4 rows
     (excludes the `otp_send_failed` row whose actor
     is the citizen).
  3. `?action=create` returns 3 rows.
  4. `?entityType=user` returns 1 row
     (the `otp_send_failed` row).
  5. `?from=<now - 10m>&to=<now>` returns 2 rows
     (the `otp_send_failed` row at -1m + the
     `ward_create` row at -5m; the others are out of
     range).
  6. `?limit=2` returns 2 rows + `nextCursor` non-null
     (the +1 detection).
- **Visual baseline**: at 1440×900, light theme,
  English, no filter, with the first row open (the
  `otp_send_failed` row's `beforeValue` / `afterValue`
  JSON rendered in a `<pre>`).

The baseline image lands in
`tests-mockups/baselines/18-admin-audit-light.spec.ts/`.

## Verification

Per the recorded Construction Verification Command:

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

Plus:

- `npx playwright test tests/18-admin-audit-light.spec.ts`
- Manual smoke: log in as
  `user_admin_dncc` (dev login
  `?role=admin`), open `/admin/audit`,
  confirm 5 rows render + the
  `actorName` shows the admin's
  display name + the timestamp
  is in `en-US` short format.
- Out-of-scope: `?action=delete` returns 3 rows
  (the seed set has no `delete` action; the filter
  returns an empty set, not an error).

Expected results:

- `tsc --noEmit` — clean for the bolt's own code
  (the 16 pre-existing TS errors in dispatcher /
  dedupFlag / crew / map remain out of scope).
- `npm run test:unit` — 235/235 + 8 new (the
  `audit-query` suite).
- `npm run test:mockups` — 15/15 (no UI changes
  to the global mockup HTML).
- `curl -fs http://localhost:3000/` — 200.

## Risk + design notes

- **N+1 actor hydration**: the `hydrateActors` helper
  fans out to `user.findUnique` per actor. The v1
  admin set is single-digit; the page is one query
  per row, not one query per page. A v1.1 bolt may
  add `db.user.findManyByIds` to make this a single
  query.
- **No WebAuthn for reads**: matches the Bolt 005-001
  decision (read-side vs write-side guard policy).
  The admin can review the audit log from a desktop
  that has no registered authenticator.
- **Cursor stability under writes**: cursor pagination
  is stable under appends (a new row lands at
  `createdAt DESC` order's top; the cursor points
  to the last row on the previous page and the
  next page starts strictly below it). Deletes
  would shift the page but the audit log is
  append-only, so this is moot.
- **Visual baseline fragility**: the seed rows have
  deterministic timestamps relative to `Date.now()`
  (offsets of 1m / 5m / 30m / 60m / 24h), so the
  baseline is stable across runs. The first row is
  always the `otp_send_failed` row.
- **Filter URL state**: the page pushes the filter
  set into the URL on every Apply; the route is
  the only data source. A citizen who lands on
  `/admin/audit?action=create` sees the same view
  the admin who applied the filter saw.
- **Polling vs cursor**: the 30 s polling refreshes
  the current page (does NOT page forward). The
  Next button is the only way to advance. This is
  the same posture as the dispatcher queue.
- **`actorName` privacy**: the projection is
  `<name> (<role>)` only. The actor's phone, NID,
  and email are NOT exposed. The `actorId` is
  exposed (it appears in the URL on a filter
  apply); the admin's role already grants them
  access to user details, and the dashboard is
  admin-only.
