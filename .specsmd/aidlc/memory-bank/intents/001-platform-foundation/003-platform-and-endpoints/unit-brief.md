---
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
phase: inception
status: complete
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
---

# Unit Brief: Platform Cross-Cutting and First Endpoints

## Purpose

Stand up the cross-cutting platform helpers (audit,
rate limit, dedup, transitions, push) and the **first
five HTTP endpoints** every later surface (WO-001+)
depends on. This is the third and final unit of the
WO-000 walking skeleton; the Construction Verification
Command must return green when this unit is done.

## Scope

### In Scope

- `lib/platform/audit.ts` (`writeAudit`).
- `lib/platform/rate-limit.ts` (`checkRateLimit`).
- `lib/platform/dedup.ts` (`findCandidateTickets`).
- `lib/platform/transitions.ts` (`assertTransition`).
- `lib/platform/push.ts` (helpers + stubbed wire call).
- The five route handlers:
  - `app/api/tickets/route.ts` (POST + GET)
  - `app/api/tickets/[id]/route.ts` (GET)
  - `app/api/auth/otp/request/route.ts`
  - `app/api/auth/otp/verify/route.ts`
  - `app/api/v1/activity/route.ts`
- Unit tests for the helpers and integration tests
  for the routes.

### Out of Scope

- The data layer (Unit 001).
- The auth + serializer (Unit 002).
- WebAuthn route handlers (deferred to WO-005).
- Real OTP SMS provider (deferred to WO-004).
- The citizen report flow UI (Intent 002 / WO-001).
- The dispatcher / crew / admin surfaces (Intents
  003 / 004 / 005).

## Assigned Requirements

| FR | Requirement | Priority |
|----|-------------|----------|
| PLAT-REQ-006 | Audit log (AuditEntry, writeAudit) | Must |
| PLAT-REQ-007 | Rate limit (in-process token bucket) | Must |
| PLAT-REQ-008 | Dedup pre-filter (50m Haversine) | Must |
| PLAT-REQ-009 | Status transitions engine | Must |
| PLAT-REQ-010 | Push subscription scaffold (no wire call yet) | Must |
| PLAT-REQ-012 | First five endpoints | Must |

## Domain Concepts

### Key Entities

| Entity | Description | Attributes |
|--------|-------------|------------|
| AuditEntry | Append-only audit log | `id`, `entityType`, `entityId`, `actorId`, `action`, `payload`, `timestamp` |
| PushSubscription | Web Push subscription | `id`, `userId`, `endpoint`, `p256dh`, `auth` |
| Ticket | The citizen's reportable record | (see Unit 001) |
| TicketTrailEntry | A status / note event on a ticket | `id`, `ticketId`, `actorId?`, `fromStatus?`, `toStatus?`, `note?`, `timestamp` |

### Key Operations

| Operation | Description | Inputs | Outputs |
|-----------|-------------|--------|---------|
| `writeAudit({ entityType, entityId, actorId, action, payload })` | Append an audit entry | object | `void` |
| `checkRateLimit({ key, limit })` | Token-bucket check | `{ key, limit }` | `{ ok, retryAfterMs? }` |
| `findCandidateTickets({ cityId, lat, lng, radiusMeters, status? })` | Haversine pre-filter | object | `Ticket[]` |
| `assertTransition(from, to)` | Throw `ApiError` on invalid pair | `TicketStatus`, `TicketStatus` | `void` (throws on invalid) |
| `subscribePush({ userId, endpoint, p256dh, auth })` | Save a subscription | object | `void` |
| `POST /api/tickets` | Citizen creates a report | `CreateTicketInput` | `201 Ticket \| 200 dedup_match \| 400/401/403` |
| `GET /api/tickets` | Citizen lists own reports | (cookie) | `200 { tickets: [...] }` |
| `GET /api/tickets/:id` | Citizen reads a single ticket | `:id` | `200 { ticket }` |
| `POST /api/auth/otp/request` | Issue OTP | `{ phone }` | `200 \| 400 \| 429` |
| `POST /api/auth/otp/verify` | Verify OTP, issue session | `{ phone, code }` | `200 + Set-Cookie \| 400 \| 429` |
| `GET /api/v1/activity` | City activity feed (citizen + dispatcher) | `?limit=20&status=` | `200 { tickets: [...] }` |

## Story Summary

| Metric | Count |
|--------|-------|
| Total Stories | 6 |
| Must Have | 6 |
| Should Have | 0 |
| Could Have | 0 |

### Stories

| Story ID | Title | Priority | Status |
|----------|-------|----------|--------|
| 005-audit-log | Audit log + writeAudit | Must | Done |
| 006-rate-limit | In-process token bucket | Must | Done |
| 007-dedup-prefilter | 50m Haversine pre-filter | Must | Done |
| 008-status-transitions | Status pipeline | Must | Done |
| 009-push-scaffold | Push subscription schema + helpers | Must | Done |
| 011-first-five-endpoints | First five HTTP endpoints | Must | Done |

## Dependencies

### Depends On

| Unit | Reason |
|------|--------|
| 001-data-and-dev-store | Needs every model + facade |
| 002-auth-and-serializers | Needs auth + guards + serializer |

### Depended By

| Unit | Reason |
|------|--------|
| 002 (Intent 002 — Citizen Report Flow) | All citizen endpoints read through these helpers + the five endpoints |
| 003 / 004 / 005 (Intents 003-005 — Dispatcher, Field Crew, Admin) | Same — every persona endpoint depends on this unit |

### External Dependencies

| System | Purpose | Risk |
|--------|---------|------|
| MapLibre GL JS + OSM | (deferred to Intent 002) | Low |
| web-push | (stubbed; v1.1 wire call) | Low |
| Argon2 / otpauth | (inherited from Unit 002) | None |

## Technical Context

### Suggested Technology

- In-process token bucket for rate limit.
- JS-side Haversine for dedup pre-filter (v1; v1.1 may
  add BRIN index).
- Append-only service contract for audit log.
- `web-push` library pinned in `package.json`; the
  wire call is stubbed.

### Integration Points

| Integration | Type | Protocol |
|-------------|------|----------|
| `lib/platform/*` ↔ `lib/db-switch.ts` | DB | facade |
| Route handlers ↔ `lib/platform/*` | service | direct function call |
| Route handlers ↔ `lib/auth/*` | auth | `getActiveSession()` |
| Route handlers ↔ `lib/serializers/ticket.ts` | serializer | `serializeTicketForRole` |

### Data Storage

| Data | Type | Volume | Retention |
|------|------|--------|-----------|
| `AuditEntry` | SQL | high | append-only |
| `PushSubscription` | SQL | medium | per user |
| `Ticket` / `TicketTrailEntry` | SQL | high | permanent |

## Constraints

- Audit log is append-only at the service layer
  (v1.1 adds a Postgres rule).
- Rate limit is in-process (v1.1 swaps to Redis).
- Dedup is a prompt (not an auto-merge) per
  `decision-index.md` ADR-006.
- Push wire call is stubbed; v1.1 implements
  `web-push.sendNotification(...)`.

## Success Criteria

### Functional

- [x] `writeAudit` writes from service functions.
- [x] `checkRateLimit` covers allow + deny + recovery.
- [x] `findCandidateTickets` returns the 50m pre-filter.
- [x] `assertTransition` covers each valid + each
  invalid pair.
- [x] `subscribePush` saves a subscription.
- [x] All five endpoints return Zod-validated JSON
  with the right status codes.
- [x] All five use the role-aware serializer where
  they return tickets.

### Non-Functional

- [x] `npx tsc --noEmit` is clean.
- [x] Line coverage on `lib/` ≥ 80%.
- [x] Walking-skeleton Construction Verification
  Command returns green.

### Quality

- [x] 14/14 unit tests passing.
- [x] 5/5 endpoints integration-tested.
- [x] Code reviewed (PR-merge to `prd-development`).

## Bolt Suggestions

This intent predates the specsmd bolt convention; the
implementation is in the repo. A modern equivalent would
be one `ddd-construction-bolt` per cross-cutting helper
+ one for the five endpoints (so six Bolts, or a single
bolt that takes the whole unit because the helpers are
small and the endpoints all read through the same
service layer).

## Notes

This unit's ship **completes the WO-000 walking
skeleton**. The Construction Verification Command at
the time of ship:

```bash
npx tsc --noEmit && \
  npm run test:unit && \
  npm run test:mockups && \
  curl -fs http://localhost:3000/
```

returns green, and every later persona WO (WO-001
through WO-005) is unblocked.
