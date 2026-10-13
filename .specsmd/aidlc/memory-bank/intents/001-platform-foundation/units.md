---
intent: 001-platform-foundation
phase: inception
status: complete
updated: 2026-10-11T18:00:00Z
---

# Platform Foundation - Unit Decomposition

## Units Overview

This intent decomposes into 3 units of work, all shipped
in WO-000 (the project walking skeleton) and now
historical:

### Unit 001: data-and-dev-store

**Description**: The 12 Prisma models + 2 enums, the
backend-agnostic facade in `lib/db-switch.ts`, and the
in-memory dev store that lets every later surface run
without a managed Postgres.

**Stories**:
- 001-city-config-models
- 010-backend-facade

**Deliverables**:
- `prisma/schema.prisma` (12 models, 2 enums, all
  `@unique` / `@map` rules per the data-stack standard).
- `lib/db.ts` (Prisma singleton, HMR-safe).
- `lib/db-switch.ts` (backend-agnostic facade).
- `lib/dev-store.ts` (in-memory store, Dhaka-North
  seed).
- `lib/dev-session.ts` (in-memory session helper for
  dev mode).
- 14 unit tests passing.

**Dependencies**:
- Depends on: nothing (first unit in the system).
- Depended by: 002, 003 (and every later WO).

**Estimated Complexity**: L (12-model schema +
backend-agnostic facade + seed).

### Unit 002: auth-and-serializers

**Description**: The four-role auth model
(phone+NID+password+OTP for citizens, WebAuthn for
admins), per-role + per-scope guards, and the
role-aware citizen serializer.

**Stories**:
- 002-user-otp-session
- 003-per-role-guards
- 004-citizen-serializer

**Deliverables**:
- `lib/auth/password.ts` (argon2id, OWASP 2024).
- `lib/auth/otp.ts` (request, verify, 5 attempts, 5-min
  TTL, hashed).
- `lib/auth/session.ts` (HMAC-SHA256 signed
  HTTP-only cookie, 14-day TTL).
- `lib/auth/guards.ts` (`requireRole`,
  `requireSameCity`, `requireScope`, `requireSameWard`,
  `requireSameDepartment`).
- `lib/serializers/ticket.ts`
  (`serializeTicketForRole`).
- 14 unit tests passing.

**Dependencies**:
- Depends on: 001 (data + facade).
- Depended by: 003 (and every later WO).

**Estimated Complexity**: L (4-role model + serializer
is the v1 contract).

### Unit 003: platform-cross-cutting-and-first-endpoints

**Description**: The cross-cutting platform layer (dedup,
transitions, audit, rate limit, push) and the first five
HTTP endpoints every later surface depends on.

**Stories**:
- 005-audit-log
- 006-rate-limit
- 007-dedup-prefilter
- 008-status-transitions
- 009-push-scaffold
- 011-first-five-endpoints

**Deliverables**:
- `lib/platform/audit.ts` (`writeAudit`).
- `lib/platform/rate-limit.ts` (`checkRateLimit`).
- `lib/platform/dedup.ts` (`findCandidateTickets`).
- `lib/platform/transitions.ts` (`assertTransition`).
- `lib/platform/push.ts` (helpers + stubbed wire call).
- `app/api/tickets/route.ts` (POST + GET).
- `app/api/tickets/[id]/route.ts` (GET).
- `app/api/auth/otp/request/route.ts`.
- `app/api/auth/otp/verify/route.ts`.
- `app/api/v1/activity/route.ts`.
- 14 unit tests passing (5/5 endpoints
  integration-tested via Vitest).

**Dependencies**:
- Depends on: 001, 002.
- Depended by: every later WO.

**Estimated Complexity**: XL (cross-cutting + 5
endpoints).

## Unit Dependency Graph

```text
[Unit 001 data-and-dev-store] ──> [Unit 002 auth-and-serializers] ──> [Unit 003 platform-and-endpoints]
                                              │
                                              └────> [Unit 003]
```

## Execution Order

WO-000 was the walking skeleton. The original execution
order, all complete as of 2026-10-04:

1. Day 1-2: Unit 001 (schema + facade + dev store seed)
2. Day 2-4: Unit 002 (auth + guards + serializer)
3. Day 4-7: Unit 003 (platform helpers + 5 endpoints +
   audit + rate limit + dedup + transitions)
4. Day 7: Walking-skeleton verification — the
   Construction Verification Command
   `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/`
   returns green.

## Status

This intent is **complete**. All 9 functional
requirements, 14 unit tests, and 5 endpoints ship in
WO-000. The Construction Verification Command is green.
The persona WOs (WO-001+) gate on this; the next intent
to start is **Intent 002 — Citizen Report Flow** which
builds the citizen surface on top of this platform.
