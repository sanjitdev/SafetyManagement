---
story: ADM-005-dedup-radius
unit: 002-city-config
intent: 005-admin-city-setup
phase: construction
status: ready
created: 2026-10-12T05:30:00Z
updated: 2026-10-12T05:30:00Z
---

# Story: ADM-005 — Dedup Radius Override

> Per-city override of
> `City.dedupRadiusMeters` (default 50m
> per `prisma/schema.prisma`). Aamir's
> lever on Feature #3 (per-city dedup
> tuning). Lives on the same
> `/admin/cities/[id]/taxonomy` page
> as the categories + departments; a
> slider at the top of the page.

## Given / When / Then

### Acceptance 1 — Read

**Given** an admin on
`/admin/cities/[id]/taxonomy`
**When** the page loads
**Then** the dedup-radius slider
shows the current
`City.dedupRadiusMeters` value
(default 50m, min 1, max 500).

### Acceptance 2 — Update

**Given** the slider is at 50m
**When** the admin drags the slider
to 100m and clicks "Save"
**Then** `City.dedupRadiusMeters` is
persisted as 100, the citizen's
dedup pre-filter
(`lib/platform/dedup.ts →
findCandidateTickets`) immediately
uses 100m on the next submission,
and an `AuditEntry` is written with
`entityType: 'City', action: 'update',
beforeValue: { dedupRadiusMeters: 50
}, afterValue: { dedupRadiusMeters:
100 }`.

### Acceptance 3 — Out-of-range input

**Given** the admin enters a value
below 1m or above 500m
**When** the admin attempts to save
**Then** the page shows the
validation error ("Dedup radius must
be between 1 and 500 meters") and
the API is not called.

### Acceptance 4 — Cross-city write

**Given** an admin in
`city_dhaka_north`
**When** the admin updates
`city_chittagong.dedupRadiusMeters`
**Then** the request is allowed
(admins bypass the cross-city
guard). An `AuditEntry` is written
with `actorId: <admin user>,
entityType: 'City', entityId:
'city_chittagong', action: 'update'`.

## Technical Notes

- The slider is a native HTML
  `<input type="range" min="1"
  max="500" step="1">` — no
  third-party component. Bangla
  formatting on the numeric label
  (`৫০` for 50, `১০০` for 100) via
  the inherited `formatBn` helper.
- The default 50m is the seed
  value (`prisma/schema.prisma →
  City.dedupRadiusMeters
  @default(50)`); the per-city
  override is the admin's lever
  for cities where 50m is too
  aggressive (dense urban core)
  or too lenient (sparse rural
  ward).
- The slider is "Save" + not
  auto-save; the citizen flow
  doesn't see a 50m → 100m
  jump mid-submit, which is the
  reason for the explicit save.

## Cross-references

- `app/api/v1/admin/cities/[id]/route.ts` —
  PATCH on the city row is the
  existing intent 001 city API
  (or a new admin-specific route
  if the intent 001 route is
  not gated by WebAuthn — the
  bolt's API decision).
- `app/admin/cities/[id]/taxonomy/page.tsx` —
  the slider lives on this page
  (top of the page, above the
  departments + categories
  tables).
- `lib/platform/dedup.ts` —
  consumer of
  `City.dedupRadiusMeters`
  (inherited from Intent 001
  Unit 003; no change to the
  dedup engine itself).
- `tests/17-admin-cities-light.spec.ts` —
  Playwright spec (dedup-radius
  update + visual baseline at
  1440x900).
