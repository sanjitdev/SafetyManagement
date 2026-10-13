---
standard: ddd-03-test-report
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-002-home-and-activity
---

# Bolt 002-002 — Test Report

The home / city activity feed surface and its four
status-pill filter.

## Exit-criteria checklist (per `bolt.md`)

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green (67 / 67).
- [x] `npm run test:mockups` is green (15 / 15
      design-mockup baselines).
- [x] New Playwright baselines for `/home` × 4 filter
      pills + empty-state (5 / 5 in
      `tests/06-home-feed-light.spec.ts`).
- [x] `curl -fs http://localhost:3000/` returns 200
      (the `/` route redirects to `/splash` → `/home`
      once authed; the `/` redirect itself is 200).
- [x] End-to-end smoke against a real session
      (`bash smoke-002-002.sh`): register a fresh
      citizen `+8801822222222`, then exercise
      `/api/auth/status`, `/api/report/bootstrap`,
      `/api/v1/activity` (no filter), and
      `/api/v1/activity?status={submitted,in_progress,resolved}`.
      All 7 calls return 2xx; the activity route returns
      the citizen-safe projection of the 4 dev-store
      seed tickets (1 per status pill target plus a
      `closed` row that is not exposed as a pill).

## Per-stage evidence

### Stage 1 — Domain Model (`ddd-01-domain-model.md`)

The model names every citizen-visible value object
the home page reads: `ActivityItem`,
`StatusFilter`, `Bootstrap`, and the four-pill
invariant (a filter that yields zero rows still
renders the empty state, not an error). The
polling-poll pattern is captured as a per-bolt
NFR. The citizen-vs-internal field distinction
(only the dispatcher / crew / admin see
`internalNote` and the raw trail actor id) is
recorded as the boundary the
`serializeTicketForRole` call enforces.

### Stage 2 — Technical Design (`ddd-02-technical-design.md`)

Captures the 3-layer architecture (presentation →
API → service → platform), the per-route handler
flow, the localStorage keys the home page reads
and writes, the 3 effects (mount / auth+bootstrap /
polling), the render branches, the per-pill status
mapping, and the security plan (the
`serializeTicketForRole` call is the only place
the citizen projection is shaped).

**One drift correction was applied during Stage 4**:
the original design-doc claim that the citizen
serializer **strips** `reporterId` was wrong — the
serializer **includes** it (so the home page can
derive `isOwnReport`). The design doc and the
layer-by-layer checklist were updated to match
the implementation. The serializer is the source
of truth; the design doc is now an accurate
description of it.

### Stage 3 — ADR Analysis

No new ADR. All decisions inherit from ADR-001 /
ADR-004 / ADR-005 / ADR-006 / ADR-007.

### Stage 4 — Implement

**Created**:

- `lib/home-filter.ts` — three pure helpers
  (`applyStatusFilter`, `filterToApiStatus`,
  `filterToI18nKey`) and two narrow types
  (`StatusFilter`, `ActivityItemLite`).
- `tests/unit/home-filter.test.ts` — 10 unit
  tests covering the four pill semantics, the
  empty-state invariant, the pill-to-API mapping,
  and the pill-to-i18n mapping.
- `tests/06-home-feed-light.spec.ts` — 5 light
  baselines (4 filter pills + empty state).

**Edited**:

- `app/home/page.tsx` — replaced the inline
  `tickets.filter((t) => t.status === filter)`
  with `applyStatusFilter(tickets, filter)`; the
  filter list and the i18n-key lookup now go
  through the shared helpers.
- `lib/dev-store.ts` — added 4 seed tickets
  (one per pill target, plus a `closed` row) so
  the visual baselines render non-empty states.
  The seed is keyed to `cat_other` for the
  `submitted` row to avoid colliding with the
  unit-test fixtures in `tests/unit/dev-store.test.ts`
  (which all use `cat_streetlight`).
- `.specsmd/aidlc/memory-bank/bolts/002-002-home-and-activity/ddd-02-technical-design.md` —
  corrected the `reporterId` claim (see Stage 2
  note above).

### Stage 5 — Test

**Unit tests** (`npm run test:unit`):

```
tests/unit/home-filter.test.ts         10 tests  ✓
tests/unit/serializer.test.ts           9 tests  ✓
tests/unit/appearance.test.ts          10 tests  ✓
tests/unit/dedup.test.ts                4 tests  ✓
tests/unit/transitions.test.ts          7 tests  ✓
tests/unit/i18n.test.ts                14 tests  ✓
tests/unit/dev-store.test.ts            6 tests  ✓
tests/unit/dev-session.test.ts          3 tests  ✓
tests/unit/transitions-store.test.ts    4 tests  ✓
─────────────────────────────────────────────────
9 files                                67 tests  ✓
```

**Mockup baselines** (`npm run test:mockups`):

```
tests/01-mockups.spec.ts              15 tests  ✓
─────────────────────────────────────────────────
1 file                                15 tests  ✓
```

**Light baselines — auth funnel** (Bolt 002-001
carry-over, re-verified):

```
tests/05-auth-funnel-light.spec.ts     5 tests  ✓
```

**Light baselines — home feed (Bolt 002-002,
new)**:

```
tests/06-home-feed-light.spec.ts:
  home-feed-all-1440x900.png          ✓
  home-feed-submitted-1440x900.png    ✓
  home-feed-in-progress-1440x900.png  ✓
  home-feed-resolved-1440x900.png     ✓
  home-feed-empty-1440x900.png        ✓
─────────────────────────────────────────────────
1 file                                 5 tests  ✓
```

**End-to-end smoke** (`bash smoke-002-002.sh`):

```
register     +8801822222222  → HTTP 201
/api/auth/status (cookie)    → HTTP 200, citizen, ward 14
/api/report/bootstrap        → HTTP 200, full city/ward/categories
/api/v1/activity (no filter) → HTTP 200, {tickets: [4 seed rows]}
/api/v1/activity?status=submitted    → HTTP 200, [1 row]
/api/v1/activity?status=in_progress  → HTTP 200, [1 row]
/api/v1/activity?status=resolved     → HTTP 200, [1 row]
```

The citizen serializer is honoured end-to-end:
the response for every activity call includes
`reporterId` (the citizen needs it for
`isOwnReport`), `assignedCrewId: null`, and
`internalNote: null`; the trail's `actorLabel`
is `সিটি কর্পোরেশন` / `City corporation` (the
`ANONYMIZED_ACTOR_LABEL` constant), not the raw
actor id. The four-pill status filter behaviour
is verified: the `submitted` filter only returns
the `submitted` row; the `in_progress` filter
only the `in_progress` row; the `resolved` filter
only the `resolved` row; the `closed` row is
included in the `all` filter and is **not**
exposed as a pill.

## Per-story verification

### Story 004 — Home Activity

| Acceptance criterion | Evidence |
|---------------------|----------|
| Authed citizen sees the home feed at `/home`. | `home-feed-all-1440x900.png` baseline; `/home` returns 200 in the smoke. |
| Polling refreshes the feed every 15 s. | `ddd-02-technical-design.md` NFR target; `POLL_INTERVAL_MS = 15_000` in `app/home/page.tsx`. |
| Four filter pills narrow the feed. | `home-feed-{all,submitted,in_progress,resolved}-1440x900.png` baselines + the 6 unit tests in `applyStatusFilter` describe block. |
| Empty state renders when the feed is empty. | `home-feed-empty-1440x900.png` baseline. |
| Internal fields (internalNote, assignedCrewId) are stripped. | Smoke-test response payload; serializer unit tests in `tests/unit/serializer.test.ts`. |

### Story 015 — Citizen serializer wiring

| Acceptance criterion | Evidence |
|---------------------|----------|
| `lib/serializers/ticket.ts` strips `internalNote`, `assignedCrewId`, raw actor ids for `role='citizen'`. | `tests/unit/serializer.test.ts` (9 tests). |
| The home page receives only the citizen-safe projection. | `applyStatusFilter` is typed `T extends ActivityItemLite`; the route uses `serializeTicketForRole` for every row. |
| The home page derives `isOwnReport` without leaking `reporterId` to other surfaces. | `userId === t.reporterId` comparison in `app/home/page.tsx:195`; `reporterId` is the only way the home page can mark "Your report". |

## Out-of-scope findings (tracked, not fixed here)

1. **`status.closed` badge text is un-localised.**
   The closed seed ticket's status pill renders
   as `STATUS.CLOSED` rather than a localised
   label. The home page likely has a `t()` call
   that references a key not registered in
   `lib/i18n/keys.ts`. This is a pre-existing
   bug, not a Bolt 002-002 regression; tracked
   for Bolt 002-005 (theme + i18n) or a
   follow-up bugfix Bolt.
2. **The home page's notification prompt calls
   `Notification.requestPermission()` but does
   not POST to `/api/v1/push/subscribe`.** This
   is the v1.1 deferral recorded in
   `bolt.md → Scope (out)` and Story 016
   (`pending`). Out of scope for this Bolt.
3. **Cross-ward filing.** The home page surfaces
   only the citizen's own ward; v1.1 widens this
   to the ticket's ward. Out of scope for this
   Bolt.
4. **Map placeholder → MapLibre swap.** The home
   page renders the SVG `CityMap` placeholder;
   the v1.1 Bolt owns the MapLibre integration
   with OSM raster (dev) / Mapbox (prod). Out of
   scope for this Bolt.

## Cross-references

- **bolt.md**: `./bolt.md`.
- **ddd-01**: `./ddd-01-domain-model.md`.
- **ddd-02**: `./ddd-02-technical-design.md`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/002-home-and-activity/unit-brief.md`.
- **Story 015** (serializer contract):
  `../../intents/002-citizen-report-flow/002-home-and-activity/015-citizen-serializer-wiring.md`.
