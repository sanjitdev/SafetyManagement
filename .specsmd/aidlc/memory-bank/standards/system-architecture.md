---
standard: system-architecture
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
---

# System Architecture

## Overview

High-level architectural decisions and patterns for CityFix. The
"lane" is a single Next.js 14 App Router repo (frontend + backend in
one process), with the dev-store as a backend-agnostic abstraction
for the first iteration. This standard captures the patterns that
every Construction Bolt must respect.

## Decisions

### Architecture style

- **Modular monolith** (Next.js 14 App Router, single repo). The
  `lib/` tree is the service layer; routes consume it through
  `db-switch.ts` and the role guards.
- **Service layer + route handlers** is the v1 pattern. The
  service layer functions live in `lib/` and are the **only** code
  that touches Prisma. API routes (`app/api/**/route.ts`) call
  services, not Prisma directly.
- **Page-level server components by default**; opt into `'use client'`
  only when the page needs state, effects, or browser APIs. The
  report flow is client-rendered because the draft is in
  sessionStorage and the bootstrap is async.
- **Backend-agnostic facade** in `lib/db-switch.ts`: the same route
  handler that calls `db.ticket.findUnique({...})` runs against
  Prisma in production or the in-memory `devDb` in dev mode
  (`CITYFIX_DEV_STORE=1`).

### API design

- **Next.js App Router route handlers** for HTTP endpoints
  (`app/api/**/route.ts`).
- **REST-style JSON** for the citizen + dispatcher + crew
  surface (`/api/tickets`, `/api/tickets/:id`, `/api/v1/activity`).
- **v1 namespaces**: `/api/tickets/*` (cross-role), `/api/v1/*`
  (v1 surface), `/api/auth/*` (auth), `/api/dev/*` (dev only,
  no-op in production).
- **Zod** schemas at every API boundary. The handler validates,
  then types the result.

### State management

- **Server is the source of truth** for tickets, users, sessions.
- **Client state is UI state** (filters, modal visibility,
  language toggle, draft report). The draft is in
  `sessionStorage` (`lib/report-draft.ts`); the dedup context
  passes through `sessionStorage` so the `/report/summary` page
  can render.
- **TanStack Query / SWR** deferred to v1.1 — v1 uses raw
  `fetch` + `useState` + `useEffect`. The polling cadence on the
  home page is 15s; the city activity feed polls every 10–30s.

### Caching strategy

- v1: **no application cache** (no Redis, no in-memory cache).
  Every request hits the DB. Acceptable at pilot scale (50k loads
  / month).
- v1.1: introduce Redis for cross-process rate limit and push
  fan-out.

### Security patterns

- **HTTP-only signed session cookies** for session management.
  14-day TTL, HMAC-SHA256, `SESSION_SECRET` env var.
- **Per-role guards**: `lib/auth/guards.ts → requireRole(role)`,
  `requireSameCity(session)`, `requireScope(session)`.
- **Cross-city denial**: the API layer denies any operation
  whose `cityId` does not match `session.cityId`. Citizen
  serializer hides internal fields.
- **Audit log** for every state-changing operation
  (`lib/platform/audit.ts → writeAudit(...)`).
- **Rate limit** at the API layer
  (`lib/platform/rate-limit.ts → checkRateLimit({ key, limit })`).
  v1: in-process token bucket. v1.1: Redis-backed.

## Layer structure

```text
┌─────────────────────────────────────────┐
│         Presentation (app/, components/) │  Pages, layouts, route handlers
├─────────────────────────────────────────┤
│         Application (lib/services/*)     │  Use cases (dedup, transition,
│                                          │  audit, rate limit, push)
├─────────────────────────────────────────┤
│           Domain (lib/auth/,             │  Business rules (auth, ticket
│           lib/serializers/,             │  lifecycle, role-scoped data)
│           lib/i18n/)                    │
├─────────────────────────────────────────┤
│         Infrastructure                   │  Prisma (lib/db.ts) +
│         (lib/db.ts, lib/db-switch.ts,    │  dev-store (lib/dev-store.ts)
│          lib/dev-store.ts)              │  + S3 (v1.1)
└─────────────────────────────────────────┘
```

## Cross-References

- **Tech stack**: `standards/tech-stack.md`.
- **Data stack**: `standards/data-stack.md`.
- **API conventions**: `standards/api-conventions.md`.
- **Domain model**: per-intent `unit-brief.md` and the platform
  layer's `ddd-01-domain-model.md` in
  `intents/001-platform-foundation/units/001-platform-foundation/`.
