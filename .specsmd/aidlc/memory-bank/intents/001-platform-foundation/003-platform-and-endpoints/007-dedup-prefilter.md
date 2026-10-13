---
id: 007-dedup-prefilter
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 007-dedup-prefilter

## User Story

**As a** citizen
**I want** to be told if a report I'm about to submit
is very close to an existing one
**So that** I can choose to link to the existing
ticket rather than create a duplicate — and I keep
control either way.

**As a** dispatcher
**I want** dedup-declines to be flagged for city-side
review
**So that** I can spot a possible duplicate even when
the citizen chose to submit anyway.

## Acceptance Criteria

- [x] **Given** `findCandidateTickets({ cityId, lat,
  lng, radiusMeters, status? })`, **When** called,
  **Then** it returns open tickets within the radius
  using the Haversine formula.
- [x] **Given** a candidate match, **When** `POST
  /api/tickets` is called, **Then** the response is
  200 with `{ dedup_match: true, existing_ticket_id,
  distance_meters, existing_status }`.
- [x] **Given** no match, **When** `POST /api/tickets`
  is called, **Then** the response is 201 with the
  new ticket.
- [x] **Given** a cross-city match (city A record vs
  city B pin), **When** the pre-filter runs, **Then**
  the match is not returned (city-scoped).
- [x] **Given** a unit test, **When** I run it, **Then**
  near-miss + match + cross-city edge cases all pass.

## Technical Notes

- Default radius: `City.dedupRadiusMeters = 50`. Per-city
  override permitted in the admin UI (WO-005).
- Dedup is a **prompt**, not an auto-merge (see
  `decision-index.md` ADR-006). The citizen chooses.
- v1 filters post-query in JS; v1.1 may add a BRIN
  index on `(cityId, locationLat, locationLng)`.
- Dedup-decline is logged as a structured event AND
  flagged for city-side review; the WO-002 dispatcher
  can decide manually.

## Dependencies

### Requires
- 001-city-config-models (City, Ticket)
- 002-user-otp-session (the session for the actor)
- 008-status-transitions (the `status` filter)
- 010-backend-facade (the `db.ticket.*` shape)

### Enables
- 011-first-five-endpoints (`POST /api/tickets`)
- The 1.10b dedup prompt page in WO-001

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Two tickets at the exact same pin | First match wins |
| Existing ticket is `resolved` or `closed` | Excluded from the pre-filter |
| Existing ticket is in another ward of the same city | Still returned if within radius (ward is informational) |
| Existing ticket is in another city | Not returned |
| Citizen picks "Submit a new ticket anyway" | New ticket is created; dedup-decline event is logged |
| `City.dedupRadiusMeters` is 0 | Pre-filter is disabled (no matches) |

## Out of Scope

- Hard auto-merge (rejected per ADR-006).
- Hard reject (rejected per ADR-006 — the citizen has
  no recourse if the dedup is wrong).
- BRIN index (deferred to v1.1).

## Status

Done. Shipped in WO-000 (2026-10-04).