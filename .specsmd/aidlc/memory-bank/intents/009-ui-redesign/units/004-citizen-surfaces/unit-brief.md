---
unit: 004-citizen-surfaces
intent: 009-ui-redesign
status: complete
created: '2026-11-02T18:30:00Z'
updated: '2026-11-02T18:30:00Z'
---

# Unit 004 — Citizen Surfaces (unit-brief)

## Goal

Redesign the citizen hub and the report flow. These are the surfaces
Rahim (the reporter) touches most, and the report flow is the product's
core conversion path — five steps that must not gain friction.

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

## Files

- `design-artifacts/D-Design-System/01-Visual-Design/mockups/13-home-city-activity.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/14-report-shell.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/15-my-reports.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/16-report-detail-trail.html` (new)
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html`
- `tests/01-mockups.spec.ts` + 8 new baselines (4 mockups × 2 viewports)
- `app/home/page.tsx`, `app/report/(create)/*/page.tsx`,
  `app/report/[id]/submitted/page.tsx`, `app/reports/page.tsx`,
  `app/reports/[id]/page.tsx`
- `tests/33-ui-redesign-citizen.spec.ts`

## Stories

### 009-citizen-mockups

**As a** reviewer
**I want** four mockups for the citizen surfaces
**So that** the hub, the flow shell, the list and the detail trail
are approved as one coherent family.

### 010-citizen-page-implementation

> Visual contract: **`citizen-surface-craft-brief.md`** (this directory).
> Read it before implementing — it carries the approved visual world and
> the checks the pages must pass.

**As a** citizen reporting a pothole
**I want** each step of the report flow to show where I am, what is
still missing, and how many photos I may still add
**So that** I never abandon the flow half-finished.

**Given** I am on the photo step
**When** I have added 1 of 3 allowed photos
**Then** the cap indicator reads `1 / 3 ছবি`
**And** the progress indicator shows step 3 of 5.

**Given** a report exists that matches my location and category
**When** I reach the summary step
**Then** the dedup prompt appears with both options explained.

## Acceptance

- The four mockups are approved, token-pure and wired into the gallery
  + baseline spec; 8 new committed baselines.
- The report flow keeps its progress indicator, the photo cap
  indicator, the dedup prompt, and the vertical `Timeline` trail with
  per-step icons + timestamps.
- The citizen detail page keeps the labelled before/after photo groups
  (Intent 007) and the `tkt_*` pill (Intent 008).
- No raw internal id is visible on any citizen surface.
- Route spec + baselines committed.

### Exit gate

The Unit 003 exit gate, plus `tests/33-ui-redesign-citizen.spec.ts`
green.

## Status

Not started. The Wave 2 mockups (`08`–`12`) must be approved first.

## Notes

The existing `01-welcome` and `02-home-city-activity` mockups already
cover the hub territory at a lower fidelity. `13` supersedes `02`; `02`
is retired rather than kept in parallel, so the gallery must not show
two competing hub designs after this wave.
