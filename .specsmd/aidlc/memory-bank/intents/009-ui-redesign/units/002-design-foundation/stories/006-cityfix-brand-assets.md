---
story: 006-cityfix-brand-assets
unit: 002-design-foundation
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:20:00Z
updated: 2026-11-02T19:10:00Z
implemented: true
---

# Story 006 — CityFix Brand Assets

## User Story

**As a** user landing on CityFix for the first time
**I want** a real mark and wordmark
**So that** the product reads as a civic platform rather than a form.

## Acceptance Criteria

- **Given** the brand asset folder
- **When** I list it
- **Then** it contains `logo/cityfix-mark.svg`,
  `logo/cityfix-wordmark.svg`, `logo/favicon.svg`, `logo/og-image.svg`,
  `NOTICE.md` and `README.md`

- **And** the mark is a map pin whose negative space forms a check —
  "reported → resolved" — in navy `#0F172A`, civic blue `#1E40AF` and
  service green `#16A34A` on a 24×24 grid
- **And** `public/favicon.svg` and `public/og-image.svg` are runtime
  copies
- **And** `components/AppHeader.tsx` renders the mark
- **And** `NOTICE.md` carries the Noto Sans Bengali OFL notice, the
  Phosphor MIT note and the OSM + MapLibre attribution requirement
- **And** **given** a Dhaka North City Corporation seal
- **Then** no seal is drawn — a neutral `Buildings` placeholder ships
  instead, and `02-Assets/README.md` documents the swap slot
- **And** a unit test asserts the assets parse and carry the expected
  notices (`tests/unit/ui/brand-assets.test.ts`)

## BDD Scenarios

### Scenario 1: No fabricated authority mark

```gherkin
Given the brand asset folder
When I inspect every SVG
Then none of them draws a municipal seal
```

### Scenario 2: The header uses the mark

```gherkin
Given the AppHeader
When I render it
Then it contains the CityFix mark
  And it contains the wordmark text
```

## Out of Scope

- A real city seal — documented as a swap slot.
- App-store icons and marketing photography.

## Linked Files

- `design-artifacts/D-Design-System/02-Assets/**`
- `public/favicon.svg`, `public/og-image.svg`
- `components/AppHeader.tsx`
- `tests/unit/ui/brand-assets.test.ts`

## Status

Shipped — commit `b279228`.
