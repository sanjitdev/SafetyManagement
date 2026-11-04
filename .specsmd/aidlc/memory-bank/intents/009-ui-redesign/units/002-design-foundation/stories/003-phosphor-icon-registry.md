---
story: 003-phosphor-icon-registry
unit: 002-design-foundation
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:20:00Z
updated: 2026-11-02T19:10:00Z
implemented: true
---

# Story 003 — Phosphor Icon Registry

## User Story

**As a** page author
**I want** icons resolved from one registry
**So that** a category icon is the same shape on the citizen card, the
dispatcher list and the crew ticket.

## Acceptance Criteria

- **Given** any category slug
- **When** I call `categoryIcon(slug)`
- **Then** I get a Phosphor icon component
- **And** `categoryIconColor(slug)` returns its documented colour

- **And** the registry covers the full category set — streetlight,
  pothole, garbage, drainage, sanitation, other
- **And** the registry covers the nav, status and auth icon sets the
  redesign needs

- **And** every icon is imported per-icon (no whole-library import),
  so the bundle stays tree-shaken
- **And** the ad-hoc `categoryIcon()` emoji helpers are gone from
  `app/crew/page.tsx`, `app/crew/tickets/[id]/page.tsx` and
  `app/dispatcher/page.tsx`, replaced by
  `<CategoryIcon slug={ticket.categorySlug} />`

## BDD Scenarios

### Scenario 1: Every category slug resolves

```gherkin
Given the category slug list
When I resolve each one through categoryIcon()
Then every one returns an icon
  And every one returns a colour
```

### Scenario 2: No emoji in the chrome

```gherkin
Given the crew, dispatcher and citizen ticket surfaces
When I search for the old emoji category helper
Then it is absent
```

## Out of Scope

- Icon rendering in the mockups — the mockups inline the SVG markup
  so they stay static and offline-renderable.

## Linked Files

- `lib/ui/icon-map.ts`
- `components/ui/CategoryIcon.tsx`
- `tests/unit/ui/icon-map.test.ts`
- `tests/unit/components/CategoryIcon.test.tsx`

## Status

Shipped — commit `b279228`.
