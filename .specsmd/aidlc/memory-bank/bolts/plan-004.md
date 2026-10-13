---
standard: bolt-plan
intent: 004-field-crew-app
phase: construction
status: ready
created: 2026-10-12T01:30:00Z
updated: 2026-10-12T01:30:00Z
---

# Bolt Plan — Intent 004 (Field Crew App)

The Inception → Construction bridge for Intent
004. The Construction Agent reads this plan
first; it describes how the 4 units of Intent
004 decompose into construction bolts, the
suggested bolt type, the stage-by-stage scope,
and the per-bolt exit criteria.

## Bolt summary

| # | Bolt ID | Unit | Bolt Type | Stories | Objective |
|---|---------|------|-----------|---------|-----------|
| 1 | `004-001-auth-and-scope` | 001-auth-and-scope | `ddd-construction-bolt` | CREW-001-auth-scope | Crew auth + scope (paperwork + Vitest unit test + Playwright route spec) |
| 2 | `004-002-todays-assignments` | 002-todays-assignments | `ddd-construction-bolt` | CREW-002-todays-assignments | New `GET /api/v1/crew/tickets` + new `app/crew/page.tsx` + dev login redirect map delta + Playwright spec + 2 visual baselines |
| 3 | `004-003-ticket-detail-and-resolve` | 003-ticket-detail-and-resolve | `ddd-construction-bolt` | CREW-003-resolve, CREW-004-resolution-note, CREW-005-navigate | New `POST .../transition` + new `POST .../photos` + new `app/crew/tickets/[id]/page.tsx` + Playwright spec + 2 visual baselines |
| 4 | `004-004-offline-read` | 004-offline-read | `ddd-construction-bolt` | CREW-006-offline-read | New `lib/crew/cache.ts` (pure-JS `localStorage` cache) + Vitest unit test + small edits to the list and detail pages |

The bolt sequence is fixed:

1. **Bolt 004-001** (Unit 001): paperwork +
   Vitest unit test (`tests/unit/crew-scope.test.ts`)
   + Playwright route spec
   (`tests/13-crew-auth.spec.ts`). The
   platform layer already implements
   `User.role = 'crew'` + `requireScope(...)`;
   no new code in `lib/`. The bolt may
   touch only `tests/`.
2. **Bolt 004-002** (Unit 002): new
   `app/api/v1/crew/tickets/route.ts` (GET)
   + new `app/crew/page.tsx` +
   `tests/14-crew-assignments-light.spec.ts`
   + 2 visual baselines. Tweaks
   `app/api/dev/login/route.ts` to point
   `crew` at `/crew` (was `/home`).
3. **Bolt 004-003** (Unit 003): new
   `app/api/v1/crew/tickets/[id]/transition/route.ts`
   (POST, with `ALLOWED_CREW_TRANSITIONS =
   ['in_progress', 'resolved']`) + new
   `app/api/v1/crew/tickets/[id]/photos/route.ts`
   (POST) + new
   `app/crew/tickets/[id]/page.tsx` +
   `tests/15-crew-ticket-light.spec.ts` +
   2 visual baselines (routed + in_progress
   at 390x844 light theme — the crew's
   target viewport).
4. **Bolt 004-004** (Unit 004): new
   `lib/crew/cache.ts` (pure-JS
   `localStorage` cache) +
   `tests/unit/crew-cache.test.ts` +
   small edits to `app/crew/page.tsx` and
   `app/crew/tickets/[id]/page.tsx` (the
   cache read on mount + cache write on
   successful fetch). No new Playwright
   spec; the cache behaviour is verified
   via Vitest (the cache is pure-JS).

Each bolt is a `ddd-construction-bolt`
(no separate Construction-KB bolts; per
aidlc.md, the framework composes the
minimum viable workflow — Units 001-004
are scope `feature` and lean on Code
Generation + Build and Test + the
inherited `transitionTicket` engine +
the inherited `serializeTicketForRole`).

## Code-reality starting state

The platform layer (Intent 001) is
substantially built:

- `User.role` enum (`citizen / dispatcher / crew
  / admin`).
- `Session.wardId?` + `Session.departmentId?`
  bound at login time.
- `requireRole(session, ...allowed)` and
  `requireScope(session, wardId,
  departmentId)` guards in
  `lib/auth/guards.ts`.
- `transitionTicket(...)` engine in
  `lib/platform/transitions.ts`.
- `writeAudit(...)` in `lib/platform/audit.ts`.
- `serializeTicketForRole(role, ...)` in
  `lib/serializers/ticket.ts`.
- `sendTicketPush(...)` in
  `lib/platform/push.ts`.

The dispatcher surface (Intent 003) is
substantially built. The crew surface
mirrors the dispatcher's shape, with two
differences:

- The crew's allowed transitions are
  `['in_progress', 'resolved']` (the
  dispatcher's are `['routed', 'cancelled']`).
- The crew's list is filtered by
  `assignedCrewId = session.userId` (the
  dispatcher's is filtered by `status ∈
  [submitted, routed]`).

The Construction Agent's job is to: (a)
write the source code per the design, (b)
capture Playwright visual baselines for the
new routes, (c) write Vitest unit tests
for the `lib/` changes, and (d) close the
bolt's paperwork (this folder's
`ddd-01-bolt-record.md`).

## Per-bolt source pointers (planned)

These are the files the Construction Agent
opens first for each Bolt. Some are
already-built (Intent 001 / 003); the rest
are written by the bolt.

| Bolt | Source files (already-built) | Source files (new) |
|------|-------------------------------|--------------------|
| 004-001 | `lib/auth/guards.ts`, `lib/auth/session.ts`, `lib/dev-session.ts` | `tests/unit/crew-scope.test.ts`, `tests/13-crew-auth.spec.ts` |
| 004-002 | `lib/serializers/ticket.ts`, `app/dispatcher/page.tsx` (header pattern), `app/api/dev/login/route.ts` (delta: redirect `crew` to `/crew`) | `app/api/v1/crew/tickets/route.ts`, `app/crew/page.tsx`, `tests/14-crew-assignments-light.spec.ts`, `lib/i18n/keys.ts` (delta: `crew.list.*` keys) |
| 004-003 | `app/api/v1/dispatcher/tickets/[id]/transition/route.ts` (pattern), `lib/platform/transitions.ts` (engine), `lib/serializers/ticket.ts` | `app/api/v1/crew/tickets/[id]/transition/route.ts`, `app/api/v1/crew/tickets/[id]/photos/route.ts`, `app/crew/tickets/[id]/page.tsx`, `app/crew/tickets/[id]/navigate-href.ts`, `tests/15-crew-ticket-light.spec.ts`, `lib/i18n/keys.ts` (delta: `crew.detail.*` + `crew.transition.*` + `crew.photo.*` + `crew.navigate.*` keys) |
| 004-004 | `app/crew/page.tsx` (Bolt 004-002), `app/crew/tickets/[id]/page.tsx` (Bolt 004-003) | `lib/crew/cache.ts`, `tests/unit/crew-cache.test.ts`, `lib/i18n/keys.ts` (delta: `crew.cache.*` keys), small edits to the list and detail pages |

## Per-bolt stage guidance

Each bolt runs through the 5-stage DDD
process (the bolt record
`ddd-01-bolt-record.md` captures the
per-bolt output):

1. **Domain Model** — entities, value
   objects, aggregates, events, services,
   repository interfaces, ubiquitous
   language. (Most bolts inherit the
   domain model from Intent 001; the delta
   is small.)
2. **Technical Design** — architecture
   pattern, layer structure, API
   contracts, data persistence, security,
   NFRs, integrations.
3. **ADR Analysis** (optional) — only when
   an ADR-worthy decision is identified.
   Most bolts inherit decisions from the
   `decision-index.md` and do not need
   new ADRs.
4. **Implement** — write the source code
   per the design.
5. **Test** — Vitest unit tests + Playwright
   route specs + visual regression
   baselines.

The 5 stages are gated by human
checkpoints per
`.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.
The user has chosen continuous,
autonomous execution (Auto Mode), so
the per-bolt stage checkpoints are
auto-approved per the Construction
Agent's standing instruction.

## Per-bolt exit criteria

A bolt is "done" when:

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green (new tests
  for any `lib/` change).
- `npm run test:mockups` is green (new
  visual baselines for any new route).
- `curl -fs http://localhost:3000/`
  returns 200 for any new top-level route.
- The bolt's `ddd-01-bolt-record.md` is
  committed.
- The intent's `units.md` Unit status
  is updated to `done`.
- The intent's story spec files are
  flipped to `phase: construction`,
  `status: done`.

## Verification command

Per `team.md` Mandated + `project.md`
Walking Skeleton:

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

## Cross-references

- **Active intent**:
  `../intents/004-field-crew-app/`.
- **Bolt folder layout**: `./README.md`.
- **Per-bolt template**:
  `.specsmd/aidlc/templates/construction/bolt-types/ddd-construction-bolt.md`.
- **Construction Agent**:
  `.specsmd/aidlc/agents/construction-agent.md`.
- **Sister intent (Intent 003)**: the
  dispatcher's auth-scope + transition +
  ticket-detail bolts are the pattern
  this plan mirrors.
