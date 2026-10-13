---
standard: ddd-02-technical-design
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-003b-submit-and-confirm
---

# Bolt 002-003b — Technical Design

The 3 submit-confirm steps of the report flow:
**1.10 note**, **1.10b dedup prompt**, **1.11
confirmation**, plus the `/api/report/bootstrap`
contract and the `POST /api/tickets` flow with
dedup. The design **anchors to the existing
source** (`app/report/note/page.tsx`,
`app/report/summary/page.tsx`,
`app/report/[id]/submitted/page.tsx`,
`app/api/report/bootstrap/route.ts`,
`app/api/tickets/route.ts`,
`lib/platform/dedup.ts`) — the child's implement
phase is paperwork + dedup unit-test reaffirmation
+ per-step visual baselines.

## Architecture pattern

```text
┌─────────────────────────────────────────────────┐
│  Presentation  (3 'use client' pages)           │
│   - 1.10 note:       finalise draft + POST      │
│   - 1.10b summary:   on {dedup_match: true}     │
│                      render the dedup prompt    │
│                      + 2 CTAs (link / decline)  │
│   - 1.11 submitted:  render citizen projection  │
│                      of the new ticket; clear    │
│                      the draft on mount.        │
│   - The note step is the only one that POSTs;   │
│     the summary step is reached only when the   │
│     POST returned {dedup_match: true}.          │
└────────────────────┬────────────────────────────┘
                     │ fetch (credentials: 'include')
                     ▼
┌─────────────────────────────────────────────────┐
│  API                                            │
│   - POST /api/tickets (the dedup-integrated     │
│     ticket creator)                             │
│   - GET /api/report/bootstrap (the contract     │
│     owner; 3a consumes)                         │
│   - GET /api/tickets/:id (the ticket detail     │
│     used by the summary page to render the      │
│     "existing" card)                            │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Service  (lib/platform/dedup.ts → checkDedup,  │
│            lib/platform/audit.ts → writeAudit,  │
│            lib/platform/push.ts → sendTicketPush)│
│   - checkDedup(cityId, categoryId, lat, lng)    │
│     → DedupMatch | null                         │
│   - writeAudit(action, entityId, actorId, after)│
│   - sendTicketPush(ticketId, toStatus) (stub)   │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Platform  (lib/db-switch.ts → db.*)            │
│   - db.ticket.create / db.trail.create          │
│   - db.ticket.findMany / db.ticket.findUnique   │
│   - getActiveSession, getTicketWithTrail        │
└─────────────────────────────────────────────────┘
```

## Layer structure (per route)

### `POST /api/tickets`

```text
1. getActiveSession() → 401 if anonymous
2. requireRole(session, 'citizen') → 401 if
   the role is not 'citizen'
3. Parse body → Zod validate (CreateTicketInput)
   → 400 invalid_input on failure
4. input.cityId !== session.cityId → 403
   cross_city_forbidden
5. If !input.dedupDeclineTicketId:
   dup = await checkDedup({...input})
6. If dup:
   a. writeAudit(action: 'ticket.dedup_detected',
      entityId: dup.existingTicketId,
      actorId: session.userId,
      afterValue: {candidateLat, candidateLng,
                   distanceMeters})
   b. return 200 {dedup_match: true,
                  existing_ticket_id,
                  distance_meters,
                  existing_status}
7. created = await db.ticket.create({...input,
   reporterId: session.userId,
   status: 'submitted'})
8. await db.trail.create({ticketId: created.id,
   toStatus: 'submitted', actorId: session.userId})
9. await writeAudit(action: 'ticket.create',
   entityId: created.id,
   actorId: session.userId,
   afterValue: {cityId, wardId, categoryId})
10. If input.dedupDeclineTicketId:
    await writeAudit(action: 'ticket.dedup_declined',
       entityId: created.id,
       actorId: session.userId,
       afterValue: {declinedMatchTicketId})
11. await sendTicketPush({ticketId, toStatus})
    (best-effort; .catch → undefined)
12. withTrail = getTicketWithTrail(created.id)
    → 500 post_create_fetch_failed on null
13. return 201 {ticket: serializeTicketForRole(
    withTrail, withTrail.trail, role, 'bn')}
```

### `GET /api/report/bootstrap`

(Contract owner.)

```text
1. getActiveSession() → 401 if anonymous
2. session.role !== 'citizen' → 403 citizen_only
3. db.city.findUnique({id: session.cityId})
   → 404 city_not_found
4. db.category.findMany({cityId: session.cityId})
5. session.wardId
   ? db.ward.findUnique({id: session.wardId})
   : db.ward.findFirst({cityId, orderBy: number asc})
6. return 200 {city, ward, categories}
```

**3b does NOT add `polygonGeoJson` in v1.** The
G1 polygon field is a v1.1 Bolt; 3a falls back
to the `DHAKA_NORTH_BBOX` constant. The
response shape is unchanged from 3a's consumer
contract.

### `1.10 note/page.tsx` — flow

```text
1. mount → fetch /api/report/bootstrap
2. restore note from draft (or empty string)
3. user types → setNote (max 280 chars; the UI
   counter reflects this)
4. user taps Submit:
   a. POST /api/tickets with the draft
   b. on 201:
      - persist {ticketId, ...} to sessionStorage
        (the confirmation page reads it)
      - router.push(`/report/${ticketId}/submitted`)
   c. on 200 with {dedup_match: true}:
      - persist the dedup context to sessionStorage
        (key: cityfix.reportDedup.v1)
      - router.push('/report/summary')
   d. on 4xx/5xx:
      - show an error toast / inline message
      - do NOT advance
```

### `1.10b summary/page.tsx` — flow

```text
1. mount:
   a. read cityfix.reportDedup.v1 from
      sessionStorage; if absent, router.replace
      ('/report/location') — the user should
      not be here
   b. fetch /api/report/bootstrap (auth)
   c. fetch /api/tickets/{existingTicketId} —
      render the "existing ticket" card
2. user taps "Link to this report":
   a. sessionStorage.removeItem('cityfix.reportDedup.v1')
   b. clearDraft()
   c. router.push(`/reports/${existingTicketId}`)
3. user taps "Submit as new report":
   a. setSubmitting(true)
   b. POST /api/tickets with the draft PLUS
      {dedupDeclineTicketId: existingTicketId}
   c. on 201: clearDraft(); clear dedup key;
      router.push(`/report/${ticketId}/submitted`)
   d. on 4xx/5xx: error toast; setSubmitting(false)
```

### `1.11 [id]/submitted/page.tsx` — flow

```text
1. mount → clearDraft() (idempotent; runs even
   if the draft is already empty)
2. fetch /api/tickets/{id} (auth-required;
   renders 404 if the ticket is not visible to
   this citizen)
3. render the citizen projection:
   - status badge (e.g. "Submitted" / "জমা দেওয়া হয়েছে")
   - category name (localised)
   - ward name
   - location label
   - note (if present)
   - photo thumbnails (if any)
4. CTA: "Back to home" → /home
```

## Data persistence

No new models. The `Ticket`, `TicketTrailEntry`,
`AuditEntry` are existing.

**Indexes used** (from `prisma/schema.prisma`):

- `Ticket @@index([cityId, categoryId])` —
  dedup query.
- `Ticket @@index([cityId, createdAt])` —
  ordered by createdAt.
- `AuditEntry @@index([entityType, entityId])` —
  dedup-decline log reads.
- `Category @@unique([cityId, slug])` —
  bootstrap lookup.

## Security

### Session

- All 3 steps are auth-gated.
- The POST `/api/tickets` enforces
  `session.role === 'citizen'` and rejects
  cross-city input with 403.
- The confirmation page is gated by the ticket
  visibility: a citizen can only see their own
  ticket (and the tickets in their city for the
  home feed).

### Dedup privacy

- The dedup match returns `existing_ticket_id`
  (a server-issued id, not a PII). The summary
  page calls `GET /api/tickets/{id}` to render
  the "existing" card; the citizen-facing
  serializer strips `internalNote` and
  `assignedCrewId` so the citizen sees only the
  public projection.
- The dedup engine does **not** log who the
  reporter is on the matched ticket; it only
  logs `{candidateLat, candidateLng,
  distanceMeters}` (the candidate is the
  in-flight submission, not a PII link to the
  citizen's earlier report).
- The decline path logs
  `{declinedMatchTicketId}` only — the citizen
  is not identified in the decline log beyond
  `actorId` (the standard audit field).

### Audit log

- `ticket.create`, `ticket.dedup_detected`,
  `ticket.dedup_declined` are the three actions
  the report flow emits. The audit log is the
  privacy-respecting dedup signal the WO-002
  dispatcher surfaces for manual review.
- The `dedup_declined` event does **not**
  include the citizen's note or photos; it is
  a structured event for the city-side review
  queue, not a manual dedup override.

## NFRs (per-bolt targets)

| NFR | Target | Rationale |
|-----|--------|-----------|
| Submit latency (p95) | ≤ 600 ms | One POST + one trail.create + one audit + one push (best-effort). |
| Dedup query (p95) | ≤ 50 ms | Bounding-box pre-filter + Haversine on ≤ 20 candidates. |
| Confirmation fetch (p95) | ≤ 200 ms | One GET /api/tickets/{id} + trail. |
| Note max length (UI) | 280 chars | Per spec; the server allows up to 2000 in the schema. |
| Visual baseline fidelity | 0.005 tolerance | Per `aidlc/spaces/default/memory/team.md` Mandated. |

## API contracts

| Endpoint | Method | Auth | Body | 2xx Response | Error codes |
|----------|--------|------|------|--------------|-------------|
| `/api/tickets` | POST | citizen | `CreateTicketInput` | 201 `{ticket}` or 200 `{dedup_match, ...}` | 400, 401, 403 |
| `/api/tickets/:id` | GET | citizen (own) | — | `{ticket}` | 401, 403, 404 |
| `/api/report/bootstrap` | GET | citizen | — | `CityBootstrap` | 401, 403, 404 |

## Frontend contracts

### sessionStorage

| Key | Storage | Read | Write |
|-----|---------|------|-------|
| `cityfix.reportDraft.v1` | sessionStorage | on mount, on every transition | on every state change |
| `cityfix.reportDedup.v1` | sessionStorage | on summary mount | on POST 200 dedup_match (note step writes; summary step reads) |

The dedup key is the only sessionStorage value
that crosses step boundaries; the draft is
written by every step.

### Effects

1. **Note step mount** (deps: `[]`):
   - Fetch bootstrap.
   - Restore note from draft.
2. **Note submit** (deps: `[note]`):
   - `POST /api/tickets`.
   - On 201 → write the new ticket id to
     `cityfix.reportDraft.v1` so the
     confirmation page can pick it up; push.
   - On 200 dedup → write the dedup context to
     `cityfix.reportDedup.v1`; push.
3. **Summary mount** (deps: `[]`):
   - Read the dedup context; redirect to
     `/report/location` if absent.
   - Fetch bootstrap (auth).
   - Fetch `/api/tickets/{id}` for the
     "existing" card.
4. **Confirmation mount** (deps: `[]`):
   - `clearDraft()` (idempotent).
   - Fetch `/api/tickets/{id}`.

### Render branches

- `1.10 note`: a single textarea + a 280-char
  counter + a Submit button. The button is
  disabled when the note is empty (or > 280).
- `1.10b summary`:
  - `ctx === null` → redirect to location.
  - `existing === null` (the detail fetch
    failed) → render the prompt without the
    "existing" card; the citizen can still
    link / decline.
  - Else → render the prompt + the existing
    card + 2 CTAs.
- `1.11 submitted`:
  - Loading → `ReportStepSkeleton`.
  - 404 → "We couldn't find that report" card.
  - 401/403 → "Sign in to see this report"
    card.
  - Else → the citizen projection of the
    ticket.

## Layer-by-layer checklist (for the Construction Agent)

- [ ] The note step's `handleSubmit` writes
  `dedupDeclineTicketId` from sessionStorage
  when present (the user is re-submitting after
  a dedup decline).
- [ ] The summary step's `handleLink` clears
  BOTH the dedup key AND the draft (the citizen
  is abandoning the in-flight report).
- [ ] The confirmation page calls `clearDraft()`
  on mount; the dedup key is cleared by the
  summary step's link/decline paths and is
  not relevant to the confirmation page.
- [ ] The dedup unit tests in
  `tests/unit/dedup.test.ts` still pass
  unchanged (the engine is the contract;
  3b only consumes it).
- [ ] The 4 PNGs are committed under
  `tests-mockups/baselines/07-*.spec.ts/` with
  the names
  `report-note-1440x900.png`,
  `report-summary-empty-1440x900.png`,
  `report-summary-dedup-1440x900.png`, and
  `report-submitted-1440x900.png`.

## Bolt Decision (technical addenda)

In addition to the Bolt Decision recorded in
`./bolt.md`:

- **Decline path privacy**: the decline log
  does not include the citizen's note or
  photos; the audit entry is a structured
  event with `{declinedMatchTicketId}` only.
  The dispatcher surfaces the event for manual
  review; the citizen's text is never
  cross-referenced.
- **Confirmation page caching**: the
  confirmation page always re-fetches
  `/api/tickets/:id` on mount. v1 does **not**
  cache the response in the draft; the page is
  the only place the citizen sees the new
  ticket id in the first place.
- **3a / 3b contract boundary**: 3b's bootstrap
  response is the contract; 3a consumes it.
  The 3a "draft restore on the photo step"
  re-derives the photo cap from the draft's
  categoryId, not from the bootstrap response
  (the bootstrap response's `narrowCategoryPhotoCap`
  is the source of truth for the category step's
  display, but the photo step's cap is the
  draft's categoryId's `narrowCategoryPhotoCap`
  joined against the bootstrap's category
  list).

## Cross-references

- **bolt.md**: `./bolt.md`.
- **ddd-01 (parent)**:
  `../002-003-submit-report-flow/ddd-01-domain-model.md`.
- **Sibling 3a**: `../002-003a-see-and-pick/`.
- **Standards**:
  - `../../standards/tech-stack.md`
  - `../../standards/coding-standards.md`
  - `../../standards/api-conventions.md`
  - `../../standards/decision-index.md`
