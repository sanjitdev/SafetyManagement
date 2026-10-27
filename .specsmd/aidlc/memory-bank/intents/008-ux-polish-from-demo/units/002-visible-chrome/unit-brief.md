---
unit: 002-visible-chrome
intent: 008-ux-polish-from-demo
status: complete
created: 2026-10-14T18:35:00Z
updated: 2026-10-27T00:00:00Z
---

# Unit 002 — Visible Chrome (unit-brief)

## Goal

Land Bolt 008-002. The bolt.md is the canonical plan; this
brief is the unit-level context the bolt inherits.

## Files (canonical list — confirmed against the bolt.md)

- `app/crew/tickets/[id]/page.tsx` — drop the local
  sub-header row; render display names; relabel photo
  cards.
- `app/dispatcher/tickets/[id]/page.tsx` — same.
- `lib/identity/display-name.ts` — new helper (or extend
  the existing `lib/identity/`).
- `lib/identity/index.ts` — re-export.
- `components/StatusPill.tsx` — add `submitted` case.
- `tests/unit/identity/display-name.test.ts` — new unit
  test.
- `tests-mockups/baselines/01-mockups.spec.ts/` — new
  baselines.

## Stories

### 001-dedupe-header-chrome-on-ticket-detail-pages

**As a** crew member / dispatcher reviewing a ticket
**I want** a single, clean header on the ticket-detail
page
**So that** I don't see two stacked back links or two
language / theme toggle rows.

**Given** the page currently renders a local sub-header
row *and* the global `HeaderBar`
**When** I open the page
**Then** I see exactly one back link, one language
toggle, and one theme toggle.

### 002-render-display-names-on-ticket-surfaces

**As a** non-technical dispatcher / crew member
**I want** to see human-readable names instead of raw
internal ids on the ticket-detail page
**So that** I can read the ticket without spotting
`ward_14` or `cat_streetlight`.

**Given** the ticket has `categoryId = cat_streetlight`
**When** I open the page
**Then** the H1 shows the category display name
(`রাস্তার আলো নেই` / `Broken streetlight`) and the
`tkt_*` id is visible only as a small badge below the
title.

### 003-chrome-polish-status-pill-assignedcrew-icon-buttonlabel

**As a** dispatcher / crew member
**I want** every chrome element to be properly labelled
**So that** I can rely on the page as the canonical
view of the ticket.

Includes:

- Status pill always labelled (the `submitted` state
  was missing a label).
- Empty `assignedCrewId` shows `Not assigned` (not `—`).
- Category icon rendered (not a generic `?`).
- "Change ward / department" button renamed for clarity.
- Photo cards labelled `Before` / `After` with
  localized alt (not `photo 2`).

## Acceptance

See `bolt.md` for the canonical acceptance criteria.

## Notes

The `displayNameFor(role, userId)` helper is created at
`lib/identity/display-name.ts`. If `lib/identity/`
already exists, it follows the existing module shape.

The visual baselines for the chrome change are captured
under `tests-mockups/baselines/01-mockups.spec.ts/` at
1280×800 (light theme, Bangla locale).
