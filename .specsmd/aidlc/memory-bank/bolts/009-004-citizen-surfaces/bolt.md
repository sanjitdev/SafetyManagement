---
id: 009-004-citizen-surfaces
unit: 004-citizen-surfaces
intent: 009-ui-redesign
type: simple-construction-bolt
status: complete
stories:
  - 009-citizen-mockups
  - 010-citizen-page-implementation
created: '2026-11-12T13:00:00Z'
started: '2026-11-12T13:00:00Z'
updated: '2026-11-12T22:30:00Z'
current_stage: complete
stages_completed:
  - name: plan
    completed: '2026-11-12T13:05:00Z'
    artifact: implementation-plan.md
  - name: implement
    completed: '2026-11-12T22:30:00Z'
    artifact: implementation-walkthrough.md
requires_bolts:
  - 009-003-auth-and-public-surfaces
enables_bolts:
  - 009-005-dispatcher-console
  - 009-006-crew-field-app
requires_units: []
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 1
  testing_scope: 3
  estimated_files: 18
completed: '2026-11-12T17:39:05Z'
---

# Bolt 009-004 — Citizen Surfaces

## Purpose

Redesign the citizen hub and the report flow. These are the surfaces
Rahim (the reporter) touches most, and the report flow is the product's
core conversion path — five steps that must not gain friction.

## Stories

| Story ID | Title | FR | State |
|----------|-------|-----|-------|
| 009-citizen-mockups | Citizen mockups | FR-4 | complete |
| 010-citizen-page-implementation | Citizen page implementation | FR-4 | complete |

Story 009 shipped 2026-11-12: the 4 mockups, the gallery, the visual-design
`README.md`, the `tests/01-mockups.spec.ts` entries and the
`tests-mockups/README.md` baseline table. Two contract corrections were
applied before the implementation began — the ticket reference is the
short `#TIX-NNNN` public code (the `tkt_` prefix is a dev-store
artifact, not product behaviour), and the photo cap indicator renders
`1 / 3 ছবি` in ASCII digits to match the shipped
`t('report.photo.counter', …)` output. The 8 baselines are pending
capture on the CI platform.

Story 010 shipped 2026-11-12: the nine citizen routes re-composed from
the `components/ui/` primitives against those four approved mockups,
presentation-layer changes only. Two foundations travelled with it — the
derived `#TIX-NNNN` public code (`lib/format/ticket-id.ts`) and the
icon-button touch-target rebuild (`components/ui/IconButton.tsx`). The
verification record is in `test-walkthrough.md`; the implementation
history and the design-craft audit are in the unit's `construction-log.md`.

## Verification

| Gate | Command | Result |
|------|---------|--------|
| Types | `npx tsc --noEmit` | clean |
| Unit | `npm run test:unit` | 127 files / **2186 passed** |
| Coverage | vitest coverage | **90.09%** lines on `lib/` (floor 80%) |
| Citizen spec | `playwright test tests/33-ui-redesign-citizen.spec.ts` | **6/6** |
| Auth spec | `playwright test tests/32-ui-redesign-auth.spec.ts` | **18/18** |
| i18n | `npm run check:i18n` | ok (1162 keys) |
| Visual | `npm run test:mockups` | 25 pass / 8 fail — see below |

The 8 failing baselines are **pre-existing and environmental**, not a
regression: they cover mockups `06`, `07`, `10`, `11` and `12`, whose
HTML and committed baselines are untouched by this bolt. The cause is
platform font rasterisation — Noto Sans Bengali rasterises differently
on Windows than on `ubuntu-latest`, moving ~2–3% of pixels, above the
`0.005` tolerance. The remedy is the `regenerate-baselines.yml`
workflow, which captures on the CI platform:

```bash
gh workflow run regenerate-baselines.yml -f update=true -f scope=mockups
```

The same run captures the 8 missing baselines for mockups `13`–`16`.
Those were never committed by hand: Playwright silently writes a missing
baseline on its first run, so a Windows capture would have committed a
platform-specific baseline that fails on CI.


## Unit brief

`intents/009-ui-redesign/units/004-citizen-surfaces/unit-brief.md`

## Scope

### Mockups (approval gate)

| Mockup | Surface | Pattern |
|--------|---------|---------|
| `13-home-city-activity.html` | `/home` | Map + activity panel + KPI strip |
| `14-report-shell.html` | Report flow | 5-step flow shell + one step in detail |
| `15-my-reports.html` | `/reports` | Filterable list of the citizen's reports |
| `16-report-detail-trail.html` | `/reports/[id]` | Vertical `Timeline` status trail + photo groups |

### Implementation

`/home`, `/report/(create)/{category,location,photo,note,summary}`,
`/report/[id]/submitted`, `/reports`, `/reports/[id]`.

## Risk Posture

| Risk | Mitigation |
|------|-----------|
| The mockups drift from the tokens | `tests/unit/ui/mockup-tokens.test.ts` fails on any undefined `var(--token)` reference. |
| The report flow loses its progress / cap indicators | Story 010's acceptance criteria pin both; the route spec asserts them. |
| The citizen detail page leaks an internal id | The serializer strips internal fields; the spec asserts only the `tkt_*` public id is visible. |
