---
unit: 003-ticket-detail-and-resolve
intent: 004-field-crew-app
phase: construction
status: ready
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T01:30:00Z
---

# Unit Brief: Ticket Detail and Resolve (the crew's per-ticket surface)

## Purpose

The crew's per-ticket work surface. From the
list (Unit 002) the crew member taps a ticket
and lands here. The page shows the full
record (location, photos, citizen's note,
internal note, status trail), and the
action bar with three primary CTAs:

- **Mark in progress** — moves the ticket
  from `routed` → `in_progress`.
- **Mark resolved** — moves the ticket from
  `in_progress` → `resolved`. Requires a
  resolution note (Acceptance 3 of CREW-004).
- **Capture after photo** — adds a URL to
  `Ticket.photoUrls` (CREW-REQ-003). The v1
  upload is a stub: the crew types / pastes
  a URL (the real "pick a file" flow ships
  in v1.1; the v1 surface is a text input
  + submit).

The page also surfaces a **Navigate** CTA
(CREW-005) that opens the device's default
maps app with the ticket's location as the
destination.

## Scope

### In Scope

- `POST /api/v1/crew/tickets/[id]/transition` —
  crew-driven status change. Allowed
  transitions: `['in_progress', 'resolved']`.
  Out-of-scope ticket id → 404. The same
  engine (`lib/platform/transitions.ts`)
  validates the edge; the role-allowed check
  fires first for disallowed targets (403
  `role_cannot_perform_transition`).
- `POST /api/v1/crew/tickets/[id]/photos` —
  append a URL to `Ticket.photoUrls`.
  Zod-validated body: `{ url: string().url()
  }`. The route writes a `TicketTrailEntry`
  with `note: 'after_photo:<url>'` (the
  `after_photo:` prefix is a stable marker
  the audit pipeline can grep on) and an
  `AuditEntry` with action
  `ticket.after_photo_added`. Out-of-scope
  ticket id → 404.
- `app/crew/tickets/[id]/page.tsx` — the
  per-ticket page. Mobile-first (390x844).
  Header: back link + status pill. Main:
  location card + photos grid + citizen
  note + resolution note textarea + the
  action bar. Out-of-scope id → 404 page.
- ~12 new i18n keys under `crew.detail.*`
  and `crew.transition.*` and
  `crew.photo.*` and `crew.navigate.*`.
- 1 new Playwright route spec
  (`tests/15-crew-ticket-light.spec.ts`)
  with 6+ API checks + 2 visual baselines
  (routed + in_progress at 390x844 light
  theme).

### Out of Scope

- The list page (Unit 002). The list row
  links to this page; it does not own the
  link.
- The offline cache (Unit 004). The detail
  page is the second *source* of the cache
  (after the list); Unit 004 reads the
  response and writes the snapshot.
- Real photo upload (camera / file picker).
  v1 accepts a URL the crew pastes; v1.1
  wires the real upload.
- The dispatcher's view of the same ticket
  (already shipped in Intent 003 Unit 003).
- Geofence check on "Mark in progress"
  (the PRD is silent; deferred to v1.1).
- Real-time updates via WebSocket / SSE.

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| CREW-REQ-003 | Resolve in the field (single ticket page with map / navigate / Mark in progress / Mark resolved / Capture after photo) | Must |
| CREW-REQ-004 | Resolution note (the note is stored in `TicketTrailEntry.note`, optional but encouraged) | Must |
| CREW-REQ-005 | Map + navigate ("Navigate" CTA opens the OS maps app via URL scheme) | Should |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| `Ticket` | (inherited) | `id`, `status`, `assignedCrewId`, `categoryId`, `wardId`, `cityId`, `locationLat`, `locationLng`, `photoUrls` (string[]), `resolvedAt` |
| `TicketTrailEntry` | (inherited) | `ticketId`, `toStatus`, `actorId`, `timestamp`, `note` |
| `AuditEntry` | (inherited) | `entityType`, `entityId`, `action`, `actorId`, `beforeValue`, `afterValue`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `POST /api/v1/crew/tickets/[id]/transition` | Crew-driven status change. Allowed: `in_progress`, `resolved`. | session, id, body `{ toStatus, note? }` | `{ ticket: SerializedTicket }` |
| `POST /api/v1/crew/tickets/[id]/photos` | Append a URL to `Ticket.photoUrls` (the "after" photo). | session, id, body `{ url }` | `{ ticket: SerializedTicket }` |
| `transitionTicket(...)` | (inherited) Engine that validates the edge. | ticketId, toStatus, actorId, note? | void |
| `writeAudit(...)` | (inherited) Write an `AuditEntry`. | entityType, entityId, action, actorId, beforeValue?, afterValue? | void |
| `serializeTicketForRole('crew', ...)` | (inherited) Exposes full record + real `actorId` on trail. | ticket, trail, role, language | `SerializedTicket` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 3 |
| Must Have | 2 |
| Should Have | 1 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| CREW-003-resolve | Mark in progress / Mark resolved | Must | in-progress |
| CREW-004-resolution-note | Resolution note textarea + required for `resolved` | Must | in-progress |
| CREW-005-navigate | Navigate CTA (opens device maps app via URL scheme) | Should | in-progress |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| 001-auth-and-scope | The transition + photos endpoints enforce `requireRole(session, 'crew')` + `requireScope(...)` |
| 002-todays-assignments | The list row links to this page; the link URL is the convention this page implements |
| Intent 001 (Unit 003) | `transitionTicket` engine + `writeAudit` |
| Intent 003 (Unit 003) | The dispatcher's transition route is the pattern this unit generalises (Bolt 003-003's `POST /api/v1/dispatcher/tickets/[id]/transition` is the model; the crew route has `requireRole('crew')` + `ALLOWED_CREW_TRANSITIONS`) |

### Depended By

| Unit | Reason |
|------|--------|
| 004-offline-read | The detail page response is the second *source* of the cache |

## Technical Context

### Suggested Technology

- New API routes:
  - `app/api/v1/crew/tickets/[id]/transition/route.ts`
    (POST). Zod body: `{ toStatus:
    z.enum(['in_progress', 'resolved',
    'cancelled']), note?: z.string().max(1000)
    }`. `requireRole(session, 'crew')`. Role
    check: `ALLOWED_CREW_TRANSITIONS =
    ['in_progress', 'resolved']`; reject
    `'cancelled'` with 403
    `role_cannot_perform_transition` (the
    dispatcher owns cancellation; a crew
    member cannot cancel a ticket — they
    escalate to the dispatcher).
  - `app/api/v1/crew/tickets/[id]/photos/route.ts`
    (POST). Zod body: `{ url: z.string().url()
    }`. Appends to `Ticket.photoUrls`. Writes
    a trail entry with note `'after_photo:<url>'`
    + an `AuditEntry` with action
    `ticket.after_photo_added`.
- Out-of-scope id → 404: same
  `loadInScope(session, id)` helper pattern
  as the dispatcher Unit 003.
- New page
  `app/crew/tickets/[id]/page.tsx`. Mobile-
  first (390x844). Single column. Header:
  back link to `/crew` + status pill. Main:
  location card (label + coords + "Navigate"
  CTA) + photos grid (existing + after
  photos inline) + citizen note + status
  trail (real `actorId`) + the action bar
  (transition buttons + after-photo
  input + resolution note textarea).
- The transition buttons are one per valid
  edge ∩ `CREW_ALLOWED`. Hidden if the
  intersection is empty (e.g. `resolved`
  ticket).
- The "Mark resolved" button is disabled
  when the resolution note is empty (CREW-004
  Acceptance 3). The button enables live as
  the user types.
- The "Navigate" CTA is an anchor (`<a>`)
  with `href` set to the device's maps
  URL scheme based on the platform:
  - iOS: `maps://?daddr=<lat>,<lng>`
  - Android: `geo:<lat>,<lng>?q=<lat>,<lng>(label)`
  - Web fallback (desktop): a Google Maps
    `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
    link. The page detects `navigator.userAgent`
    and picks the right href. The CTA opens
    in a new tab on web; on mobile the OS
    maps app opens.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `POST /api/v1/crew/tickets/[id]/transition` | HTTP | JSON |
| `POST /api/v1/crew/tickets/[id]/photos` | HTTP | JSON |
| `serializeTicketForRole('crew', ...)` | in-process | function call |
| `requireRole(session, 'crew')` + `requireScope(...)` | in-process | function call |
| `transitionTicket(...)` + `writeAudit(...)` | in-process | function call |

### Data Storage

- `Ticket.photoUrls` is a `string[]` — the
  route appends the new URL. No migration
  needed (the field already exists; the
  citizen submit flow populates it).
- `TicketTrailEntry` gains a new
  semantic: `note: 'after_photo:<url>'`. The
  prefix is a stable marker; the citizen
  serializer renders these as "After photo
  added" entries (the citizen view may
  need a small update to recognise the
  prefix; tracked as a v1.1 polish).

## Constraints

- The transition button for `'resolved'`
  is disabled when the resolution note
  is empty (CREW-004 Acceptance 3). The
  textarea + button live in the same
  component so the live-enable is
  straightforward.
- The "Navigate" CTA MUST be tappable
  on mobile: hit area ≥ 44px tall. The
  href MUST work on iOS, Android, and
  desktop web.
- The "Capture after photo" input is a
  text field + Submit button. The v1
  URL paste is acceptable; v1.1 wires
  the real camera / file picker. The
  Submit button validates the URL via
  the same Zod schema as the API.
- The "Mark resolved" write to the API
  includes the resolution note in the
  body; the API writes it to the trail
  entry.

## Success Criteria

### Functional

- [ ] `POST /api/v1/crew/tickets/[id]/transition`
      with `toStatus: 'in_progress'` from a
      `routed` ticket → 200, ticket now in
      `in_progress` with a new trail entry.
- [ ] `POST .../transition` with
      `toStatus: 'cancelled'` → 403
      `role_cannot_perform_transition` (the
      crew cannot cancel).
- [ ] `POST .../transition` with
      `toStatus: 'resolved'` but empty note
      → 400 `invalid_input` (the API
      enforces; the page also disables the
      button but the API is the source of
      truth).
- [ ] `POST .../transition` with
      `toStatus: 'resolved'` and a valid
      note → 200, ticket now in `resolved`
      with `resolvedAt` set + a new trail
      entry carrying the note.
- [ ] `POST .../photos` with a valid URL
      → 200, `photoUrls` appended, trail
      entry + audit row written.
- [ ] Cross-role denial: dispatcher /
      citizen / anonymous all return 401
      or 403.
- [ ] Out-of-scope id (not assigned to
      this crew) → 404.
- [ ] The "Navigate" CTA href is correct
      for iOS / Android / desktop.

### Non-Functional

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run test:unit` is green.
- [ ] `npm run test:mockups` is green.

### Quality

- [ ] Playwright route spec committed.
- [ ] 2 visual baselines committed
      (routed + in_progress at 390x844
      light theme).

## Bolt Suggestions

A single `ddd-construction-bolt` for this
unit. The bolt is two new API routes + one
new page + a small test suite.

## Notes

The crew's transition set is narrower than
the dispatcher's: `['in_progress', 'resolved']`.
The dispatcher owns the start of the chain
(`submitted → routed`) and the cancellation.
The crew owns the in-the-field work
(`routed → in_progress` and
`in_progress → resolved`).

The "Capture after photo" v1 surface (URL
paste) is intentionally simple. A v1.1 bolt
will wire the real camera / file picker.
The trail-entry prefix `'after_photo:<url>'`
is a stable marker the audit pipeline
recognises; the citizen view may render
these as a "See the after photo" entry.
The exact citizen-view polish is tracked in
the v1.1 backlog.
