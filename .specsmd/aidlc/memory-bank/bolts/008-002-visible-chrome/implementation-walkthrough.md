---
stage: implement
bolt: 008-002-visible-chrome
created: 2026-10-14T19:15:00Z
---

## Implementation Walkthrough: 002-visible-chrome — Bolt 008-002

### Summary

Removed the duplicated header row from the crew and dispatcher
ticket-detail pages so the global header is the only chrome on each
page, and replaced every raw internal id on those surfaces with a
human-readable display name. Added two small identity helpers that
resolve a user id to a name and a trail actor id to a role, switched
the dispatcher page onto the shared status pill, replaced the raw
dash for an unassigned crew member with a localized placeholder,
and split the photo gallery into labelled "Before" and "After"
groups.

### Structure Overview

- **Identity helpers** - `lib/identity/display-name.ts` is a pure
  client-side lookup: it maps a `(role, userId)` pair to a display
  name and a category id to a localized label, falling back to the
  raw id for anything it does not know. `lib/identity/actor-role-map.ts`
  is a thin server-side wrapper that resolves a flat list of actor
  ids to their roles via the active backend, so the client can pick
  the right display name without a second round-trip.
- **Pages** - `app/crew/tickets/[id]/page.tsx` and
  `app/dispatcher/tickets/[id]/page.tsx` were both updated. The
  duplicated header row is deleted from each; the global header
  component is the only chrome.
- **Status pill** - the dispatcher page previously hand-rolled its
  own pill; it now uses the shared `components/ui/StatusPill.tsx`
  that the citizen surfaces already use, which is what makes every
  status label consistently localized. The crew page keeps its own
  local pill component, which already labels every status.
- **Wire shape** - the ticket-with-trail payload was extended in
  both the in-memory dev store and the Prisma path so the chrome
  can render the city and reporter names without a second fetch.

### Completed Work

- [x] `lib/identity/display-name.ts` - New pure helper that resolves
  a `(role, userId)` pair to a display name, resolves a category id
  to a localized label through the i18n registry, and falls back to
  the raw id for unknown values.
- [x] `lib/identity/actor-role-map.ts` - New helper that builds an
  actor-id to role map from a flat id list, de-duplicating ids and
  issuing the backend lookups in parallel.
- [x] `app/crew/tickets/[id]/page.tsx` - Deleted the local
  sub-header row so only the global header renders; the ticket
  heading, metadata, reporter, trail actors, and assigned crew
  member now render display names; the photo gallery renders
  labelled "Before" and "After" groups. The page keeps its own
  local status-pill component, which already labels every status.
- [x] `app/dispatcher/tickets/[id]/page.tsx` - Same header dedup and
  display-name treatment; the hand-rolled status pill was replaced
  with the shared component; an empty assignment renders the
  localized "not assigned" placeholder; the photo gallery renders
  labelled "Before" and "After" groups.
- [x] `lib/dev-store.ts` - Extended the ticket-with-trail shape with
  the city and reporter fields the chrome renders.
- [x] `lib/db-switch.ts` - The same wire-shape extension on the
  Prisma path, so both backends agree.
- [x] `tests/unit/identity/display-name.test.ts` - New unit test
  pinning the display-name and category-label resolution, including
  the unknown-value fallbacks.

### Key Decisions

- **Resolve names on the client, not in the response**: the wire
  shape already carries the actor ids, so the bolt keeps the API
  contract stable and resolves names in the page. This avoids
  denormalising names into every ticket payload.
- **Fall back to the raw id**: an unknown user id renders the id
  itself rather than an empty label. The old behaviour showed the
  raw id, so the fallback can never be a regression, and the unit
  test pins it.
- **Resolve the admin role to the role label**: admin identities are
  not surfaced on the dispatcher and crew pages, so the helper
  returns the role label instead of a name.
- **Delete the duplicated header rather than hide it**: a hidden
  element would still leave two header landmarks in the accessibility
  tree. Removing the row makes the global header the single source
  of truth for the back link, language toggle, and theme toggle.
- **Switch the dispatcher page onto the shared status pill**: the
  hand-rolled pill was the reason the dispatcher page's status
  labels were inconsistent with the citizen surfaces. The shared
  component already carries every status, including `submitted`, so
  no new status case was needed. The crew page already labelled
  every status in its own local pill, so it was left alone.

### Deviations from Plan

- **The shared status pill was not modified.** The plan anticipated
  adding a missing `submitted` case to the status pill component.
  The component already carried every status including `submitted`
  before this bolt; what was missing was the dispatcher page's use
  of it. The bolt switched the page onto the component instead.
- **No new icon helper was created.** The plan allowed for a small
  `lib/icons/category.ts` if one did not exist. The category icon
  set the citizen picker already uses was sufficient, so no new
  module was needed.
- **The display-name source is a fixture map, not the `User`
  table.** The plan left the source of the display name open. The
  shipped helper resolves the three demo personas from a local map
  and falls back to the raw id. Resolving against the `User` table
  in production is recorded as a v1.1 follow-up.

### Dependencies Added

None. The bolt uses only the already-installed `next`, `zod`, and
`vitest` dependencies plus the project's existing platform helpers.

### Developer Notes

- The display-name helper is deliberately language-agnostic for user
  names; localizing the role label is the caller's job. The category
  label, by contrast, goes through the i18n registry because the
  citizen category picker uses the same keys and the strings must
  stay in sync.
- The fallback map only covers the demo personas. Any new seeded user
  needs a map entry, or the surface will show the raw id.
- The trail actor role map is built server-side because only the
  server knows the user's role; the client then calls the pure
  display-name helper with that role.
- The wire-shape extension touches both the in-memory dev store and
  the Prisma path. A change to one without the other silently
  regresses one of the two backends.
