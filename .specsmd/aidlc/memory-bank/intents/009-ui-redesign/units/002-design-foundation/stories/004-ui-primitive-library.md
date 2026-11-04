---
story: 004-ui-primitive-library
unit: 002-design-foundation
intent: 009-ui-redesign
status: complete
created: 2026-11-02T18:20:00Z
updated: 2026-11-02T19:10:00Z
implemented: true
---

# Story 004 — UI Primitive Library

## User Story

**As a** page author
**I want** a primitive for every recurring UI element
**So that** I compose pages instead of hand-rolling `<button>`s.

## Acceptance Criteria

- **Given** the primitive list below
- **When** I import from `components/ui/index.ts`
- **Then** every primitive is exported

  Actions: `Button`, `IconButton`
  Metadata: `Badge`, `Avatar`, `StatusPill`
  Forms: `Field`, `Input`, `Select`, `Textarea`
  Layout: `Card`, `Panel`, `Toolbar`, `FilterBar`, `DataTable`
  States: `EmptyState`, `ErrorState`, `LoadingState`
  Navigation: `Breadcrumb`, `SideNav`, `Tabs`
  Overlays: `Modal`, `Toast`
  Data display: `KpiRow`, `Timeline`
  Icons: `CategoryIcon`

- **And** each primitive has a unit test under
  `tests/unit/components/` covering its accessibility contract
- **And** `StatusPill` renders an icon **and** a label alongside its
  colour — never colour alone
- **And** `Field` wires `aria-describedby` to its hint and error text
- **And** `DataTable` marks the first sortable column as ascending
- **And** `Modal` opens the native `<dialog>` element
- **And** `EmptyState` renders an action when one is supplied
- **And** `IconButton` exposes its label as the accessible name
- **And** every primitive uses only `var(--color-*)` tokens — no
  hard-coded hex

## BDD Scenarios

### Scenario 1: Status is never colour alone

```gherkin
Given a ticket in the "in progress" state
When I render a StatusPill
Then the pill contains an icon
  And the pill contains the status word
  And the pill carries the status colour
```

### Scenario 2: A field's error is announced

```gherkin
Given a Field with a hint and an error
When I render it
Then the input's aria-describedby points at both the hint and the error
```

## Out of Scope

- The chart primitives — Story 005.
- Page-level composition — Units 003–007.

## Linked Files

- `components/ui/**`
- `components/ui/index.ts`
- `tests/unit/components/*.test.tsx`

## Status

Shipped — commit `b279228`.
