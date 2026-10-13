---
id: 009-push-scaffold
unit: 003-platform-and-endpoints
intent: 001-platform-foundation
status: done
priority: must
created: 2026-10-04T00:00:00Z
updated: 2026-10-04T00:00:00Z
assigned_bolt: null
implemented: true
---

# Story: 009-push-scaffold

## User Story

**As a** platform engineer
**I want** the `PushSubscription` model + helpers in
place now
**So that** the v1.1 wire call (FCM/APNs) is a thin
addition rather than a schema migration + helpers +
front-end update.

**As a** citizen
**I want** a future option to receive a push when my
report's status changes
**So that** I don't have to keep checking the home page.

## Acceptance Criteria

- [x] **Given** the schema, **When** I review
  `PushSubscription`, **Then** `endpoint` is `@unique`.
- [x] **Given** `subscribePush({ userId, endpoint,
  p256dh, auth })`, **When** called, **Then** it
  upserts a `PushSubscription` row.
- [x] **Given** the actual `web-push.sendNotification(...)`
  wire call, **When** I search the code, **Then** it's
  stubbed (not wired to VAPID yet).
- [x] **Given** a unit test, **When** I run it, **Then**
  the upsert path passes.

## Technical Notes

- v1.1: real wire call with `web-push` library +
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` env vars.
- v1.1: at-least-once delivery with idempotency token.
- FCM / APNs deferred until native wrappers ship.
- `.env.example` documents `VAPID_*` for v1.1.

## Dependencies

### Requires
- 001-city-config-models (the PushSubscription model)
- 010-backend-facade (the `db.pushSubscription.*`
  shape)

### Enables
- v1.1 push fan-out
- The "Subscribe to push" UI in WO-001+
- The status-change push notification in WO-001+

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Same `endpoint` re-subscribed | Upsert overwrites the existing row |
| `endpoint` returns 410 Gone | v1.1: mark as inactive + drop |
| Push permission denied by user | The browser returns; the helper does not throw |

## Out of Scope

- Real VAPID wire call (deferred to v1.1).
- FCM / APNs (deferred until native wrappers ship).
- Push dashboard for admins (deferred to v1.1).

## Status

Done. Schema + helpers ship in WO-000 (2026-10-04);
the actual wire call is v1.1.