---
bolt: 005-004-audit-dashboard
unit: 004-audit-dashboard
intent: 005-admin-city-setup
phase: construction
stage: 5-bolt-record
status: done
created: 2026-10-12T22:00:00Z
---

# Stage 5 — Bolt Record (Bolt 005-004-audit-dashboard)

## Outcome

`done` (2026-10-12). All 5 acceptance criteria
from the unit-brief + ADM-007 are met. The
audit dashboard ships as a read-only view of
`AuditEntry` rows, gated by `requireRole('admin')`,
with cursor pagination + filter UI + a 30 s
polling cycle on the first page. Bolt is
ready for squash-merge to `prd-development`.

## Acceptance criteria (from paper)

| # | Criterion (from paper) | Implementation | Verified by |
|---|------------------------|----------------|-------------|
| 1 | Admin can see all 50 most-recent `AuditEntry` rows on page load | `app/api/v1/admin/audit` returns up to 50 rows sorted by `createdAt DESC` (default 7 d window); `app/admin/audit/page.tsx` renders the first page in a 6-col table | Vitest `clampLimit`; Playwright "GET with admin session → 200 + 5 entries + nextCursor null" |
| 2 | Filter by actor narrows the result set | `?actorId=user_admin_dncc` returns the 4 admin-authored rows; the OTP-fail row (citizen actor) is excluded | Playwright "GET ?actorId=user_admin_dncc → 200 + 4 entries" |
| 3 | Filter by action accepts a comma-list | `?action=create` returns 3 rows; the comma-list path is covered by the Zod schema (Zod `preprocess(splitCsv)`) | Playwright "GET ?action=create → 200 + 3 entries" |
| 4 | Filter by entityType rejects unknown values with 400 | `?entityType=garbage` returns 400 `invalid_input` (closed union from ADR-012) | Playwright "GET ?entityType=garbage → 400 invalid_input" |
| 5 | Date range filter narrows the result set | `?from=<now - 10m>&to=<now>` returns the 2 rows in the last 10 minutes (`otp_send_failed` + `ward_create`) | Playwright "GET ?from=<now-10m>&to=<now> → 200 + 2 entries" |
| 6 | Cursor pagination is stable | `?limit=2` returns 2 rows + a non-null `nextCursor`; the cursor is the `createdAt` of the last row, and the next-page query is `createdAt < cursor` (strict `<`) | Vitest "cursor adds `createdAt.lt`"; Playwright "GET ?limit=2 → 200 + 2 entries + nextCursor non-null" |
| 7 | Read-only surface (no write path) | Route handler is `export async function GET` only; no `POST` / `PUT` / `DELETE` exports | Static review |
| 8 | Cross-role denial | Anonymous → 401 `unauthenticated`; citizen → 403 `forbidden_role`; admin → 200 | Playwright "GET /api/v1/admin/audit with no session → 401" + "GET with a citizen session → 403" |
| 9 | Visual baseline (non-empty dashboard at 1440×900) | `tests-mockups/baselines/18-admin-audit-light.spec.ts/admin-audit-1440x900.png` captures the page with the first row open, showing the `twilio_api_error` JSON in the after-value pane | Playwright "GET with admin session + visual baseline (1440x900)" |
| 10 | Header pill in `/admin/cities` | `app/admin/cities/page.tsx` adds a `Link href="/admin/audit"` chip on the cities header row | Static review |

## Decision register (from Stage 3, with deltas)

- **ADR-013 (new)**: read-side vs write-side guard
  policy for the audit dashboard —
  `requireRole('admin')` only, no
  `requireWebAuthn`. Justified by the
  established split (Bolt 005-001 record):
  WebAuthn is a write-side property, the
  audit surface is read-only, and the dev
  seam still bypasses both for the admin
  persona.
- **ADR-010 (amended)**: `AuditEntry.entityType`
  is a closed union of 6 values. The audit
  query API uses `as never` cast at the
  Prisma boundary because the dev store's
  `findMany` accepts a wider string shape
  (the union is a runtime check in the
  Zod schema, not a compile-time check on
  the dev store). No production type drift.
- **ADR-011 (reaffirmed)**: the audit
  `entityId` is the raw Prisma ID (e.g.
  `city_dhaka_cc`); the page truncates the
  display to 14 chars + ellipsis + a
  `title` attr with the full ID for
  accessibility.

## Files shipped

**New (8 files):**

- `app/api/v1/admin/audit/route.ts` (116 lines)
- `app/admin/audit/page.tsx` (213 lines)
- `components/AdminAuditFilters.tsx` (148 lines)
- `components/AdminAuditTable.tsx` (175 lines)
- `lib/admin/audit-query.ts` (170 lines)
- `tests/unit/audit-query.test.ts` (98 lines, 14 checks)
- `tests/18-admin-audit-light.spec.ts` (248 lines, 9 API
  + 1 visual)
- `tests-mockups/baselines/18-admin-audit-light.spec.ts/admin-audit-1440x900.png`

**Modified (5 files):**

- `lib/db-switch.ts` (added `db.audit.findMany`)
- `lib/dev-store.ts` (5 seed rows + `findMany`)
- `lib/i18n/keys.ts` (22 new `admin.audit.*` keys)
- `app/admin/cities/page.tsx` (header pill)
- `_progress/00-design-log.md` (Bolt 005-004 entry)

## Test results

| Suite | Result |
|-------|--------|
| `npx tsc --noEmit` | clean for the bolt's own code; 16 pre-existing errors in `dispatcher/dedupFlag`, `crew` ticket trail, and `dispatcher map route` remain out of scope (unchanged) |
| `npm run test:unit` | 249/249 (235 + 14 new `audit-query` checks) |
| `npm run test:mockups` | 15/15 (no UI changes to global mockup HTML) |
| `npx playwright test tests/18-admin-audit-light.spec.ts` | 9/9 API + 1/1 visual (12.0 s) |
| `curl -fs http://localhost:3000/` | 200 |

The bolt's own code is clean; the 16 pre-existing
errors are unchanged by this work and are
filed under their own bolt records
(003-004-dispatcher-queue, 004-001-crew-app, etc.).

## Risks observed

- **Dev-store seed reset on server restart**: the
  `seed()` only runs at server start, so a fresh
  dev server is required for the new `AuditEntry`
  rows to appear. Playwright's `webServer` config
  manages this automatically; manual smoke tests
  need a server restart.
- **Visual baseline fragility**: the `otp_send_failed`
  row's `afterValue` is the deterministic stub
  payload from `lib/auth/otp.ts:58`
  (`{ error: 'twilio_api_error' }`); any future
  change to the stub's error shape would require
  re-baselining.
- **30 s polling cycle on the first page**: the
  `cursorRef` pattern avoids stale closures but
  the cycle fires even when the user is mid-typing
  in the filter rail. The URL-as-state pattern
  means a URL change resets the cursor; no race
  observed in the 9/9 Playwright runs.

## Out-of-scope (deferred, per unit-brief)

- CSV export (v1.1 in WO-004 §4.7)
- Real-time WebSocket/SSE updates (v1.1)
- Audit log redaction for future write paths (v1.1)
- Cross-city audit comparison view (v1.1)
- Per-actor drill-down `/admin/audit/[actorId]` (v1.1)

## Hand-off

Bolt 005-004 closes Intent 005 (admin city setup).
Intent 005 is `done` end to end. Next in the
trunk sequence is a different intent; the
`/admin/audit` header pill in `/admin/cities`
is the only navigation touch-point that lands
in this bolt.
