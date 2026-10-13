---
standard: api-conventions
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# API Conventions

## Overview

API design conventions and standards for CityFix. v1 is REST/JSON
over Next.js App Router route handlers; v1.1 may add a real REST
spec (OpenAPI) for client codegen.

## Decisions

### API style

- **REST/JSON** for the citizen + dispatcher + crew + admin surface.
- **Next.js App Router** route handlers (`app/api/**/route.ts`)
  expose `GET`, `POST`, `PUT`, `DELETE` functions.
- **No GraphQL** in v1 (would require a separate server or a
  Next.js plugin; not worth the operational cost for the pilot).

### Versioning

- **`/api/v1/*`** namespace for v1 surface (`/api/v1/activity`,
  `/api/v1/auth/*`, `/api/v1/push/subscribe`).
- **`/api/tickets/*` and `/api/auth/*` are not versioned** —
  they are the citizen-facing entry points that survived WO-000
  and are stable from v1 onwards.
- Future `/api/v2/*` can ship in parallel when the v1 surface
  has to break.

### Response format

- **Success**: `NextResponse.json({ ...body }, { status: 2xx })`.
  - List endpoints: `{ tickets: [...] }`, `{ wards: [...] }`.
  - Single-resource endpoints: `{ ticket: {...} }` (note:
    the ticket wrapper is intentional so the response shape is
    consistent across the surface).
  - **201** for create, **200** for update, **200** for the
    `dedup_match: true` short-circuit.
- **Validation error**: `{ error: 'invalid_input', issues: [...] }`
  with **400** status.
- **Auth error**: `{ error: 'not_authenticated' }` (401) or
  `{ error: 'forbidden' }` (403).
- **Conflict**: `{ error: 'invalid_transition' }` (409) — the
  dispatcher tried to `submitted → resolved`.

### Error response format

- All error responses use the same envelope:
  `{ "error": "machine_readable_code", "issues"?: [...], "message"?: "human readable" }`.
- The **error code is the contract**; the message is for humans
  and may be translated. Client code matches on `error`, not on
  `message`.
- Common codes: `not_authenticated`, `forbidden`, `invalid_input`,
  `invalid_json`, `cross_city_forbidden`, `role_not_supported`,
  `invalid_transition`, `rate_limited`, `post_create_fetch_failed`,
  `dedup_match` (not an error — a 200 short-circuit).

### Pagination

- v1: **no pagination** on the activity feed (`take: 20` hard
  cap). The 1.6 home side panel scrolls inside its region.
- v1.1: cursor-based pagination. v1 does not need it at pilot
  scale.

### Auth headers

- **Session cookie** is HTTP-only and signed. The browser sends
  it on every request; the server reads it through
  `lib/auth/session.ts → getActiveSession()`.
- **CSRF**: v1 relies on SameSite=Lax cookies. v1.1 adds a
  CSRF token for non-idempotent operations.

### Internal vs citizen serializer

- **The serializer is the contract** for what a citizen sees.
  `lib/serializers/ticket.ts → serializeTicketForRole(...)`
  accepts the role and emits the role-appropriate shape.
- **Citizens never see** `assignedCrewId`, `internalNote`, or
  raw actor names (they see "City corporation" / "সিটি
  কর্পোরেশন").
- **Dispatchers / crew** see the full record.

## Examples

```text
# Citizen creates a report
POST /api/tickets
  → 201 { ticket: { id, status: 'submitted', ... } }
  → 200 { dedup_match: true, existing_ticket_id, distance_meters, existing_status }
  → 400 { error: 'invalid_input', issues: [...] }
  → 401 { error: 'not_authenticated' }
  → 403 { error: 'cross_city_forbidden' }

# Citizen lists their own reports
GET /api/tickets
  → 200 { tickets: [...] }

# Citizen reads the activity feed
GET /api/v1/activity?limit=20&status=submitted
  → 200 { tickets: [...] }

# Citizen subscribes to push
POST /api/v1/push/subscribe
  body: { endpoint, p256dh, auth }
  → 204
```
