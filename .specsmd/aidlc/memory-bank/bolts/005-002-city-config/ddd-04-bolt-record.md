---
bolt: 005-002-city-config
unit: 002-city-config
intent: 005-admin-city-setup
phase: construction
type: ddd-construction-bolt
status: done
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T18:15:00Z
---

# Bolt 005-002 — City Config UI + APIs + Dhaka Template

## Scope shipped

- 4 admin pages (`/admin/cities`, `/admin/cities/<id>/setup`,
  `/admin/cities/<id>/taxonomy`, `/admin/cities/<id>/wards`) —
  bilingual copy via `lib/i18n/keys.ts`.
- 8 admin API route handlers under
  `/api/v1/admin/cities/*` (cities + categories +
  departments + wards, full CRUD on each).
- `lib/admin/dhaka-template.ts` — `DHAKA_TEMPLATE`
  snapshot (8 departments, 8 categories sorted by
  slug ASC, 3 placeholder wards) +
  `applyDhakaTemplate(cityId, actorId)` that writes
  one `AuditEntry` per created entity with
  `afterValue.snapshotVersion = DHAKA_TEMPLATE_VERSION`.
- `lib/admin/ward-polygon.ts` — `validatePolygon(raw)`
  pure function (`polygon_not_closed |
  polygon_too_few_vertices | invalid_polygon |
  coordinates_out_of_range`).
- `requireRole` 2-arg / variadic-arg overload
  preserved in `lib/auth/guards.ts`.
- All routes gate on `requireRole(session, 'admin')`
  + `requireWebAuthn(session)`; the dev seam
  short-circuits both for the admin persona only.

## Tests added

| File | Count | Verified |
|------|-------|----------|
| `tests/unit/dhaka-template.test.ts` | 10 | All categories bind to a real dept, sorted ASC, narrow photo cap = 2 |
| `tests/unit/ward-polygon.test.ts` | 6 | Closed ring accepted; unclosed / too-few / non-Polygon / out-of-range / multi-ring rejected |
| `tests/unit/admin-scope.test.ts` | 5 | `requireRole` 401/403/200; `requireWebAuthn` 401 + dev seam short-circuit |
| `tests/17-admin-cities-light.spec.ts` | 15 | 11 API checks + 4 visual baselines (1440x900) |

## Verification

```
npx tsc --noEmit         → clean for bolt's own code
                            (16 pre-existing errors in
                            dispatcher/dedupFlag, crew ticket
                            trail, dispatcher map route
                            remain out of scope)
npm run test:unit        → 217/217 (10 + 6 + 5 new)
npm run test:mockups     → 15/15
curl -fs /               → 200
playwright
  17-admin-cities.spec   → 15/15
```

## Acceptance mapping

| # | Criterion (from unit-brief) | Implementation |
|---|-----------------------------|----------------|
| 1 | Cities overview lists every city with status + tickets/day | `app/admin/cities/page.tsx` table + `?status=${c.status}` link |
| 2 | Basic info is editable + saves to `City` | `app/admin/cities/[id]/setup/page.tsx` form |
| 3 | Departments + categories CRUD | `app/admin/cities/[id]/taxonomy/page.tsx` + 4 API siblings |
| 4 | Ward CRUD + polygon | `app/admin/cities/[id]/wards/page.tsx` + `validatePolygon` |
| 5 | Dhaka template pre-population | "Apply Dhaka template" CTA + `applyDhakaTemplate` |
| 6 | Every change writes `AuditEntry` | `writeAudit` per route |
| 7 | WebAuthn-mandatory for writes | `requireWebAuthn` in every write route + dev seam |

## Out-of-scope follow-ups

- Leaflet.draw ward polygon editor — the
  `validatePolygon` validator ships; the
  on-map draw UI is a v1.1 polish (the form
  accepts a pre-validated GeoJSON paste in
  the meantime).
- Cursor pagination on audit log — Bolt 005-004.
- Real OTP provider — Bolt 005-003.
