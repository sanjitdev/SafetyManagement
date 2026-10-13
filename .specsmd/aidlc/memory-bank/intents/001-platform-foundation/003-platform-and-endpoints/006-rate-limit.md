---
id: 006-rate-limit
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 006-rate-limit

## User Story

**As a** platform engineer
**I want** a per-key rate limit on auth and ticket
submit paths
**So that** an attacker cannot brute-force OTP codes or
flood the activity feed.

**As a** citizen
**I want** to be told when I've hit the rate limit
**So that** I know to wait and try again rather than
seeing a generic error.

## Acceptance Criteria

- [x] **Given** `checkRateLimit({ key, limit })`, **When**
  called within the limit, **Then** it returns `{ ok:
  true }`.
- [x] **Given** the limit is exceeded, **When**
  `checkRateLimit` is called, **Then** it returns
  `{ ok: false, retryAfterMs }`.
- [x] **Given** a route handler, **When** it returns
  a 429, **Then** the response body is `{ error:
  'rate_limited' }`.
- [x] **Given** the in-process token bucket, **When** I
  read the source, **Then** it's an in-memory map keyed
  by the limit key.
- [x] **Given** a unit test, **When** I run it, **Then**
  allow + deny + recovery paths all pass.

## Technical Notes

- Default limit: 5 / sec on auth paths; 1 / sec on
  ticket submit.
- v1: in-process token bucket (single-process app).
- v1.1: Redis-backed (cross-process).

## Dependencies

### Requires
- 010-backend-facade (no DB read for the bucket itself)

### Enables
- 011-first-five-endpoints (every endpoint that hits
  the rate limit)
- Every state-changing endpoint in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Two requests in the same millisecond | Bucket rejects the second |
| App restart | Bucket resets (in-process) — acceptable for v1 |
| Different keys | Each key has its own bucket |
| Missing key | `checkRateLimit` returns `{ ok: true }` (defensive) |

## Out of Scope

- Redis-backed cross-process bucket (deferred to v1.1).
- Per-IP rate limit on the citizen submit (deferred to
  v1.1 if abuse emerges).

## Status

Done. Shipped in WO-000 (2026-10-04).