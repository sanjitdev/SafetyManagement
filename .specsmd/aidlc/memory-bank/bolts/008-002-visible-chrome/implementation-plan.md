---
stage: plan
bolt: 008-002-visible-chrome
created: 2026-10-14T18:20:00Z
---

## Implementation Plan: 002-visible-chrome — Bolt 008-002

### Objective

Land the visible-chrome half of Intent 008: remove the duplicated
header row on the crew and dispatcher ticket-detail pages, replace
the raw internal ids on those surfaces with human-readable display
names, and polish the status pill, the empty-assignment
placeholder, and the photo-card labels.

### Deliverables

- One header landmark per ticket-detail page - the global
  `HeaderBar` becomes the only chrome.
- Display names for the ticket category, the reporter, the trail
  actor, and the assigned crew member.
- A shared, always-labelled status pill used by the dispatcher
  detail page (the crew and citizen surfaces already used one).
- A localized "not assigned" placeholder in place of the raw dash.
- Labelled "Before" and "After" photo-card groups with localized
  alt text.
- A unit test for the display-name resolution helper.

### Dependencies

- `lib/identity/display-name.ts` - new helper that maps a
  `(role, userId)` pair to a human-readable name and a category id
  to a localized label.
- `lib/identity/actor-role-map.ts` - new helper that resolves the
  role of each trail actor so the client can pick the right
  display name.
- `lib/i18n/keys.ts` - the FR-6 chrome keys registered by Bolt
  008-001 are consumed here, not created here.
- `components/ui/StatusPill.tsx` - the shared status pill
  component the dispatcher page is switched onto.
- `lib/dev-store.ts` and `lib/db-switch.ts` - the ticket-with-trail
  shape is extended so the wire format exposes `cityName`,
  `cityNameBn`, and `reporterName`.

### Technical Approach

The display-name resolution is a pure, client-side lookup: the wire
shape already carries the actor ids, so the page resolves them to
names locally rather than denormalising names into the response
payload. The helper falls back to the raw id for an unknown user,
so no surface can regress to a blank label. The admin role resolves
to the role label rather than a name, because admin identities are
not surfaced on the dispatcher and crew pages.

The duplicated header row on each ticket-detail page is deleted
rather than hidden, so the page keeps a single header landmark and
the global `HeaderBar` remains the single source of truth for the
back link, the language toggle, and the theme toggle.

### Acceptance Criteria

- [x] The crew and dispatcher ticket-detail pages render exactly one
      header landmark.
- [x] The ticket category, reporter, trail actor, and assigned crew
      member render as display names rather than raw ids.
- [x] The dispatcher ticket-detail page uses the shared status pill.
- [x] An empty `assignedCrewId` renders the localized "not assigned"
      placeholder.
- [x] The photo gallery renders labelled "Before" and "After" groups
      with localized alt text.
- [x] The display-name helper's behaviour is pinned by a unit test.
