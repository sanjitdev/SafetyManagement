---
story: 002-render-display-names-on-ticket-surfaces
unit: 002-visible-chrome
intent: 008-ux-polish-from-demo
status: complete
created: 2026-10-14T18:45:00Z
implemented: true
---

# Story 002 — Render Display Names on Ticket Surfaces

## User Story

**As a** non-technical dispatcher / crew member
**I want** to see human-readable names instead of raw
internal ids on the ticket-detail page
**So that** I can read the ticket without spotting
`ward_14` or `cat_streetlight`.

## Acceptance Criteria

- **Given** a ticket has `categoryId = cat_streetlight`,
  `wardId = ward_14`, `cityId = city_dhaka_north`,
  `reporterId = user_citizen_rahim`
- **When** a dispatcher opens
  `/dispatcher/tickets/[id]`
- **Then**:
  - H1 = the category display name
    (`রাস্তার আলো নেই` / `Broken streetlight`)
  - A small id badge below the H1 shows
    `#tkt_dc31c87c` (or the equivalent `data-testid` is
    present)
  - The city field shows the city display name
    (`ঢাকা উত্তর` / `Dhaka North`)
  - The ward field shows the ward display name
    (`ওয়ার্ড ১৪` / `Ward 14`)
  - The category field shows the category display name
    (`রাস্তার আলো নেই` / `Broken streetlight`)
  - The reporter field shows the citizen's display name
    (`Rahim`)

- **And** the trail's `actor` field shows the display
  name (`Rahim` for the citizen, `Habib` for the
  dispatcher, `Rashid` for the crew); the `admin` role
  shows the role label only

- **And** the citizen detail page's `tkt_*` pill stays
  (intentional — citizens need the id to reference in
  support chats)

- **And** `tests/unit/identity/display-name.test.ts`
  passes:
  - `displayNameFor('admin', 'u_admin')` returns
    `'admin'`
  - `displayNameFor('citizen', 'u_rahim')` returns
    `'Rahim'`
  - `displayNameFor('dispatcher', 'u_habib')` returns
    `'Habib'`
  - `displayNameFor('crew', 'u_rashid')` returns
    `'Rashid'`
  - Unknown id returns the id (graceful fallback)

## BDD Scenarios

### Scenario 1: Dispatcher ticket-detail H1 + metadata

```gherkin
Given a ticket with categoryId = cat_streetlight
When the dispatcher opens /dispatcher/tickets/<id>
Then the H1 reads "রাস্তার আলো নেই"
  And a small badge below reads "#tkt_<id>"
  And the metadata table shows the display names, not the ids
```

### Scenario 2: Crew ticket-detail H1 + metadata

```gherkin
Given a ticket with wardId = ward_14
  And categoryId = cat_streetlight
When the crew member opens /crew/tickets/<id>
Then the H1 shows the category display name
  And the metadata table shows the display names
```

### Scenario 3: Trail actor name

```gherkin
Given the trail has an entry with actorId = user_citizen_rahim
When the dispatcher / crew views the trail
Then the entry shows "Rahim" (not "user_citizen_rahim")

Given the trail has an entry with actorId = u_admin
When the dispatcher / crew views the trail
Then the entry shows "admin" (the role label)
```

## Out of Scope

- The admin ticket-detail page (admin has a different
  header; out of scope for this intent).
- Citizen-side display names (the citizen's own name is
  shown on the citizen detail page via the existing
  reporter field; no change).
- Bulk editing of display names (the `User` model's
  display name is the source of truth; no editor in v1).

## Linked Files

- `app/crew/tickets/[id]/page.tsx`
- `app/dispatcher/tickets/[id]/page.tsx`
- `lib/identity/display-name.ts` (new)
- `tests/unit/identity/display-name.test.ts` (new)
