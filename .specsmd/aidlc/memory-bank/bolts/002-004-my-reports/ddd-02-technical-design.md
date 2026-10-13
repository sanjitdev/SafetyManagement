---
standard: ddd-02-technical-design
phase: construction
status: complete
created: 2026-10-11T23:30:00Z
updated: 2026-10-11T23:30:00Z
bolt_id: 002-004-my-reports
---

# Bolt 002-004 — Technical Design

The MyReports read-side + the per-report detail
view + the photo-delete handler. Anchors to the
existing source:

- `app/reports/page.tsx` (1.12 list)
- `app/reports/[id]/page.tsx` (1.13 detail)
- `app/api/tickets/[id]/route.ts` (GET single)
- `app/api/tickets/[id]/photos/[idx]/route.ts`
  (DELETE photo)
- `app/api/v1/activity/route.ts` (list page's
  data source; reused)

The Bolt's implement phase is paperwork + the
trail-test fixture + the visual-baseline matrix,
not a from-scratch build.

## Architecture pattern

```text
┌─────────────────────────────────────────────────┐
│  Presentation  (3 'use client' pages)           │
│   - 1.12 reports/page.tsx: list (filtered to    │
│     citizen's own; client-side filter)          │
│   - 1.13 reports/[id]/page.tsx: detail with    │
│     status trail + photo gallery + feel-heard   │
│     prompt                                      │
│   - Both pages set lang from                    │
│     localStorage('cityfix.preferred_language.*')│
│     via the theme-toggle pair                   │
└────────────────────┬────────────────────────────┘
                     │ fetch (credentials: 'include')
                     ▼
┌─────────────────────────────────────────────────┐
│  API                                            │
│   - GET /api/v1/activity?limit=50 (city         │
│     activity; the list filters client-side)     │
│   - GET /api/tickets/:id (single ticket;        │
│     rate-limited 1/sec per (actor, ticket))     │
│   - DELETE /api/tickets/:id/photos/:idx        │
│     (citizen-only photo delete; audit-logged)   │
│   - GET /api/auth/status (for the userId on     │
│     the list filter; could move to a citizen-   │
│     serializer'd /api/me v1.1)                  │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Service  (lib/serializers/ticket.ts →           │
│            serializeTicketForRole)               │
│   - Citizen projection: strips internalNote,   │
│     assignedCrewId; substitutes "City corp"    │
│     for actorLabel                              │
│   - Internal projection: full actor labels +   │
│     internal fields (for dispatcher / crew)    │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Platform  (lib/db-switch.ts → db.*)            │
│   - db.ticket.findMany / findUnique              │
│   - db.trail.findMany (returns the trail)       │
│   - rateLimit('userId:ticketId')                 │
│   - requireSameCity, requireScope (guards)       │
└─────────────────────────────────────────────────┘
```

## Layer structure (per route)

### `GET /api/v1/activity?limit=50`

The list page's data source. Already in WO-000
(Intent 001). Returns the city's full activity
stream in `createdAt DESC` order. The list page
filters client-side to the citizen's own reports.

**Limitation**: the endpoint is capped at 50
rows. If the citizen has more than 50 reports,
the oldest are dropped. v1.1 adds
`GET /api/tickets?mine=true` with pagination
for citizens who hit the cap.

### `GET /api/tickets/:id`

The detail page's data source. The route is
already in WO-000 (Intent 001).

```text
1. getActiveSession() → 401 if anonymous
2. PLAT-REQ-008 rate limit per (actor, ticket):
   limit = rateLimit('userId:id')
   if !limit.allowed → 429 retry_after_ms
3. db.ticket.findUnique({id}) → 404 not_found
4. requireSameCity(session, ticket.cityId)
   → 403 cross_city_forbidden
5. role-specific scope check:
   - dispatcher / crew → requireScope(wardId)
   - citizen → reporterId === session.userId
6. getTicketWithTrail(id) → 404 if missing
7. return 200 {ticket: serializeTicketForRole(
   withTrail, withTrail.trail, role, 'bn')}
```

The serialize call is the citizen-vs-internal
switch; citizens get the anonymised projection.

### `DELETE /api/tickets/:id/photos/:idx`

The detail page's photo delete handler. Already
in WO-000.

```text
1. getActiveSession() → 401 if anonymous
2. requireRole(session, 'citizen') → 401 if not
3. PLAT-REQ-008 rate limit (same as GET)
4. db.ticket.findUnique({id}) → 404
5. requireSameCity + reporterId === session.userId
6. db.ticket.update to remove photoUrls[idx]
7. writeAudit({action: 'photo.delete',
   entityId: id, actorId, afterValue: {photoIdx}})
8. return 204 No Content (the detail page
   re-renders with the photo gone)
```

The trail is **not** updated for photo deletes;
only the photo gallery view is. This keeps the
trail focused on the status story.

### `1.12 reports/page.tsx` — flow

```text
1. mount:
   a. read lang from localStorage (
      'cityfix.preferred_language.v1')
   b. fetch /api/auth/status → userId
      (for the per-citizen filter)
   c. fetch /api/report/bootstrap → city,
      categories, ward (for category name +
      ward name lookup)
   d. fetch /api/v1/activity?limit=50
   e. filter tickets to reporterId === userId
   f. join each ticket with Category by id and
      Ward (single ward per city for v1) for
      display labels
2. render:
   - If signedIn === false → centred sign-in CTA
   - Else → top bar (CityFix brand · breadcrumb ·
     home link · lang toggle · theme toggle ·
     avatar) + h1 + list of `MyReportsListItem`
     rows
   - Each row links to /reports/[id]
   - Empty state ("You haven't filed any reports
     yet") with a "File a report" CTA to
     /report/location
   - Loading: "Loading…"
   - Error: "We couldn't load your reports"
```

### `1.13 reports/[id]/page.tsx` — flow

```text
1. mount:
   a. fetch /api/report/bootstrap → auth check
   b. fetch /api/tickets/[id] → ticket
   c. on 429: retry once with 600ms backoff
   d. on 404 → "We couldn't find that report"
   e. on 403 → "Forbidden"
   f. on 200 → render the detail
2. derive display labels (ward, age, resolution
   days) from the ticket payload
3. render:
   - top bar (CityFix brand · section label ·
     home link · avatar)
   - LEFT: status pill + ticket id + Bangla title
     + ward label + photo gallery with per-photo
     delete + status trail
   - RIGHT: metadata card (category, ward, SLA,
     resolution time) + feel-heard feedback
     prompt when status === 'resolved'
4. photo delete:
   a. tap × on photo → setPendingDeleteIdx(idx)
      → modal opens (i18n-keyed confirm)
   b. tap Delete in modal → DELETE
      /api/tickets/[id]/photos/[idx]
   c. on success → remove the photo from local
      state (re-index is implicit)
   d. on failure → surface deleteError inline
5. feel-heard feedback:
   a. tap "Satisfied" → setFeedbackSent(true)
      (v1 local-only; v1.1 persists as audit)
   b. tap "Dispute" → router.push to not-yet-
      built /reports/[id]/dispute (v1.1 territory)
```

## Data persistence

No new models. The `Ticket`, `TicketTrailEntry`,
and `AuditEntry` are existing.

## Security

### Session

- Both pages are auth-gated via
  `getActiveSession()` in the API and
  `/api/report/bootstrap` (the dev store's auth
  check) in the page.
- The detail page enforces same-city +
  reporter-owns-ticket for citizens (the GET
  handler returns 403 if the ticket belongs to
  another citizen).

### Rate limiting

The detail page faces PLAT-REQ-008
(`1 req/sec per (actor, ticket)`). The page
retries on 429 with a 600ms backoff
(`app/reports/[id]/page.tsx:165-175`); this
mitigates React strict mode double-mount races
in dev. Production keeps the retry.

### Anonymisation

The serializer strips `internalNote` and
`assignedCrewId` for citizens, and substitutes
"সিটি কর্পোরেশন" / "City corporation" for
`actorLabel`. The dispatcher / crew surface
gets the real names. The serializer is the
single source of truth for the projection; the
detail page does **not** re-implement the
filter.

### Photo delete auditing

Every photo delete writes a `photo.delete`
audit event with `actorId` + `photoIdx`. The
audit log is the dispatcher-side visibility for
citizen-initiated content edits; v1 reads the
log via the WO-002 dashboard (deferred).

## NFRs (per-bolt targets)

| NFR | Target | Rationale |
|-----|--------|-----------|
| List first paint (p95) | ≤ 500 ms | One auth + one bootstrap + one activity call; client-side filter is fast. |
| Detail first paint (p95) | ≤ 300 ms | One bootstrap + one ticket GET (rate-limited). |
| Rate limit (detail GET) | 1 req/sec per (actor, ticket) | PLAT-REQ-008; prevents tight-loop polling. |
| Visual baseline fidelity | 0.005 tolerance | Per team.md Mandated. |
| Photo-delete round-trip | ≤ 500 ms | One DELETE call + one audit write. |

## API contracts

| Endpoint | Method | Auth | Body | Response | Error codes |
|----------|--------|------|------|----------|-------------|
| `/api/v1/activity` | GET | auth | — | `{tickets[]}` (max 50) | 401 |
| `/api/tickets/:id` | GET | auth | — | `{ticket, last_poll_cursor}` | 401, 403, 404, 429 |
| `/api/tickets/:id/photos/:idx` | DELETE | citizen (owner) | — | 204 No Content | 401, 403, 404, 429 |
| `/api/auth/status` | GET | — | — | `{authenticated, session?}` | 200 always |
| `/api/report/bootstrap` | GET | citizen | — | `CityBootstrap` | 401, 403, 404 |

## Frontend contracts

### sessionStorage / localStorage

| Key | Storage | Read | Write |
|-----|---------|------|-------|
| `cityfix.preferred_language.v1` | localStorage | on mount (list + detail) | on toggle (list only; detail does not toggle) |
| `cityfix.preferred_appearance.v1` | localStorage | on mount (via ThemeProvider) | on toggle |

The detail page does **not** toggle language —
the language toggle lives in the list page's top
bar (and the home / report pages). The detail
page reads the lang on mount and uses it for
display; if no lang is set, it falls back to
the Bangla default.

### Effects

1. **List mount** (deps: `[]`):
   - Auth + bootstrap + activity fetch in
     sequence.
   - Set tickets, userId, bootstrap, error.
2. **List lang toggle** (deps: `[lang]`):
   - Re-render the row labels.
3. **Detail mount** (deps: `[id]`):
   - Auth + ticket GET (with 429 retry).
4. **Detail feedback** (deps: `[ticket]`):
   - Toggle the `feedbackSent` local state.
5. **Detail photo delete** (deps: `[]`):
   - Tap × → modal opens.
   - Tap Delete → DELETE call + state update.

### Render branches

- **List**:
  - `signedIn === false` → centred sign-in CTA.
  - `loading` → "Loading…".
  - `error` → "Couldn't load your reports".
  - `tickets.length === 0` → empty state with
    "File a report" CTA.
  - Else → list of rows.
- **Detail**:
  - `authed === false` → sign-in prompt.
  - `loading` → "Loading…".
  - `error` (with sub-codes not_found, forbidden,
    rate_limited) → appropriate error card.
  - Else → status pill + trail + photos + meta +
    feel-heard when resolved.

## Layer-by-layer checklist (for the Construction Agent)

- [ ] The list's `mine` filter matches
  `tickets.filter(t => t.reporterId === userId)`.
- [ ] The detail's photo-delete handler appends
  a `photo.delete` audit event with `actorId`
  + `photoIdx` (the route already does this in
  WO-000; verify by reading the route, not by
  re-asserting it).
- [ ] The detail's feel-heard prompt only
  renders when `ticket.status === 'resolved'`.
- [ ] The list + detail surfaces set `lang`
  from localStorage on mount; the detail
  surfaces fall back to `'bn'` when the value
  is missing.
- [ ] The 3 PNGs are committed under
  `tests-mockups/baselines/09-*.spec.ts/` with
  the names `reports-list-empty-1440x900.png`,
  `reports-list-with-rows-1440x900.png`,
  and `reports-detail-resolved-1440x900.png`.

## Bolt Decision (technical addenda)

In addition to the Bolt Decision recorded in
`./bolt.md`:

- **Trail rendering rule**: the trail renders
  top-to-bottom (oldest first). Each step has
  a circular icon (filled green if done, filled
  primary if current, outline if pending); the
  connector line is green if done, border-grey
  if pending. The actor label is always
  "সিটি কর্পোরেশন" for citizens (the
  serializer substitutes this; the page does
  not substitute again).
- **Photo-delete ordering**: the detail page
  filters by index, so deleting index 2 of
  `[A, B, C, D]` gives `[A, B, D]`. The
  `photoUrls` order is preserved by the
  filter; the indices naturally re-index
  (0, 1, 2 for the new 3-tuple).
- **No-poll-on-timer rationale**: the detail
  page does not poll because the v1 home page
  is the polling channel (15s cadence on
  `/api/v1/activity`). Citizens reach the
  detail page from the home activity feed or
  the confirmation CTA; they re-mount to see
  updates. v1.1 may add explicit polling for
  power users.
- **Photo retention policy**: 365-day unread
  photos are eligible for deletion by the
  city; v1 documents this in `ddd-01` but
  does not enforce it. v1.1 adds the
  dispatcher-side surface for the lifecycle
  sweep.

## Cross-references

- `bolt.md`: `./bolt.md`.
- `ddd-01`: `./ddd-01-domain-model.md`.
- Standards:
  `../../standards/tech-stack.md`,
  `../../standards/api-conventions.md`,
  `../../standards/data-stack.md`,
  `../../standards/decision-index.md`.
- Predecessor bolts:
  `../002-001-auth-and-profile/`,
  `../002-002-home-and-activity/`,
  `../002-003-submit-report-flow/`.
