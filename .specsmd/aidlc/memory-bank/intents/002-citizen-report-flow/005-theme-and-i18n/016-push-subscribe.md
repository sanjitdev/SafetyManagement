---
id: 016-push-subscribe
unit: 005-theme-and-i18n
intent: 002-citizen-report-flow
status: pending
priority: should
created: 2026-10-04T00:00:00Z
updated: 2026-10-11T18:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 016-push-subscribe

## User Story

**As a** citizen
**I want** (in v1.1) to receive a push notification
when my report's status changes
**So that** I don't have to keep checking the home
page.

**As a** service worker
**I want** a `POST /api/v1/push/subscribe` endpoint
that takes my subscription and saves it
**So that** the v1.1 push fan-out can find me.

## Acceptance Criteria

- [x] **Given** the route handler, **When** the service
  worker calls `POST /api/v1/push/subscribe` with
  `{ endpoint, p256dh, auth }`, **Then** the response
  is 204.
- [x] **Given** the request body, **When** it's
  validated, **Then** Zod rejects invalid shapes with
  400.
- [x] **Given** the session, **When** it's missing,
  **Then** the endpoint returns 401.
- [x] **Given** the existing subscription, **When** the
  same `endpoint` subscribes again, **Then** the row
  is upserted (not duplicated).

## Technical Notes

- The actual `web-push.sendNotification(...)` wire
  call is **v1.1** (deferred). This story ships the
  endpoint + the schema upsert only.
- `PushSubscription.endpoint` is `@unique` (already
  in Intent 001).

## Dependencies

### Requires
- Intent 001 (Unit 003 — `PushSubscription` model)

### Enables
- v1.1 push fan-out (when the wire call ships)
- v1.1 status-change notifications

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Subscription from a different user | Upsert under the current session's userId |
| `endpoint` is malformed | Zod rejects |
| Push permission denied by user | The browser doesn't call the endpoint; nothing to do |

## Out of Scope

- Real VAPID wire call (deferred to v1.1).
- FCM / APNs (deferred until native wrappers ship).
- Push dashboard for admins (deferred to v1.1).

## Status

Pending. Endpoint not yet created. v1 ships the schema
+ helpers; v1.1 wires the call.