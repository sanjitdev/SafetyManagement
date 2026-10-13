---
standard: ddd-02-technical-design
phase: construction
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T18:00:00Z
bolt_id: 002-002-home-and-activity
---

# Bolt 002-002 — Technical Design

The technical shape of the home / city activity feed.
The design **anchors to the existing source**
(`app/home/page.tsx`, `app/api/v1/activity/route.ts`,
`app/api/report/bootstrap/route.ts`) — the Bolt's
implement phase is paperwork + per-pill test
coverage + visual baselines.

## Architecture pattern

The home page is a `'use client'` React component
that composes three fetch effects: auth status,
bootstrap, and the polling activity feed. The
backend is the standard `app/api/v1/activity/route.ts`
handler that goes through the `db.*` facade and the
citizen serializer.

```text
┌─────────────────────────────────────────────────┐
│  Presentation  (app/home/page.tsx — 'use client')│
│   - Auth gate (redirects to /login if not authed)│
│   - Top bar (brand, Report CTA, My reports,     │
│     language toggle, ThemeToggle, avatar)       │
│   - Two-region layout (map + side panel)        │
│   - 15s polling effect                          │
│   - Status filter pills (4)                    │
│   - Empty / error / skeleton states             │
└────────────────────┬────────────────────────────┘
                     │ fetch (credentials: 'include')
                     ▼
┌─────────────────────────────────────────────────┐
│  API  (app/api/v1/activity/route.ts,            │
│        app/api/report/bootstrap/route.ts,        │
│        app/api/auth/status/route.ts)            │
│   - Zod parse at route boundary                 │
│   - getActiveSession → 401 if anonymous         │
│   - Returns citizen-facing projection           │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Service  (lib/serializers/ticket.ts,           │
│            lib/auth/session.ts,                  │
│            lib/i18n/keys.ts)                    │
│   - serializeTicketForRole(role='citizen',     │
│     lang='bn') → ActivityItem                  │
│   - t(key, vars, lang) for every user string    │
└────────────────────┬────────────────────────────┘
                     │ uses
                     ▼
┌─────────────────────────────────────────────────┐
│  Platform  (lib/db-switch.ts)                   │
│   - db.ticket.findMany({ cityId, status?,      │
│     orderBy: createdAt desc, take: limit })     │
│   - getTicketWithTrail(id) → TicketWithTrail   │
└─────────────────────────────────────────────────┘
```

The Reporter bounded context (Bolt 002-003) owns
the **API + Service + Platform** layers; the home
page is the **first read-only consumer** of the
`Ticket` aggregate.

## Layer structure (per route)

### `GET /api/v1/activity`

```text
1. getActiveSession() (lib/auth/session)
   - if null → 401 not_authenticated
2. session.role !== 'citizen' → 403 role_not_supported
3. Zod parse query string
   - status: 'submitted' | 'routed' | 'in_progress'
     | 'resolved' | 'closed' | 'cancelled' | undefined
   - limit: 1..50, default 20
4. db.ticket.findMany({
     where: { cityId: session.cityId,
       ...(status ? { status: { in: [status] } } : {}) },
     orderBy: { createdAt: 'desc' },
     take: limit,
   })
5. For each row: getTicketWithTrail(id) →
   serializeTicketForRole(row, row.trail,
   session.role, 'bn')
6. Respond 200 { tickets: ActivityItem[] }
```

### `GET /api/report/bootstrap`

(Owned by Bolt 002-003; this Bolt consumes the
contract.)

```text
1. getActiveSession() → 401 if anonymous
2. Resolve citizen's city + ward
3. db.category.findMany({ where: { cityId } })
4. Respond 200 { city, ward, categories }
```

### `GET /api/auth/status`

(Re-used from Bolt 002-001.)

```text
1. getActiveSession()
2. Respond 200 { authenticated, session? }
```

## Data persistence

No new models. The `Ticket`, `TicketTrailEntry`,
`Category`, `City`, `Ward` models are in
`prisma/schema.prisma:1-300`. No schema change is
required for this Bolt.

**Indexes used**:

- `Ticket @@index([cityId])` — feed query.
- `Ticket @@index([cityId, createdAt])` — ordered
  feed (the implicit composite; the v1 query plan
  sorts in memory at pilot scale).
- `Category @@unique([cityId, slug])` — bootstrap
  lookup.

## Security

### Session

- The home page re-uses the `cityfix_session`
  cookie from Bolt 002-001. The page only mounts
  the polling effect after `/api/auth/status`
  returns `authenticated: true`.
- The 401 path renders the `home.signin_required`
  copy with a "Sign in" CTA that links to `/login`.

### Citizen serializer

- `serializeTicketForRole(role='citizen', lang='bn')`
  strips `internalNote`, `assignedCrewId`, and the
  full trail actor labels. The home page receives
  only the citizen-safe fields.
- `reporterId` **is** included in the citizen
  projection; it is the only way the home page can
  derive `isOwnReport` (a citizen needs to know
  which cards are theirs). The serializer includes
  it as the bare user id (no name, no phone, no
  PII); the home page compares it against the
  session's `userId` to render the "Your report"
  badge. This is the same field every other surface
  uses for the same purpose.
- The trail's `actorLabel` is the
  `ANONYMIZED_ACTOR_LABEL` constant
  (`সিটি কর্পোরেশন` / `City corporation`) for
  citizens; the raw `actorId` is shown only to
  dispatcher / crew / admin.

### Cross-city denial

- The query is scoped by `session.cityId`; a
  cross-city session cannot list another city's
  tickets because the read filter is the session's
  own city.

### Rate limit

- `GET /api/v1/activity` has **no** per-route
  throttle in v1. The 15-s polling cadence means
  ~4 req/min/tab; a citizen opening 10 tabs
  produces ~40 req/min, well under the platform
  primitive's defaults. v1.1 may add a
  per-actor limit if a UI bug or script causes a
  spike.
- The home page does **not** poll while the
  citizen is signed out (the auth-gate is the
  first render; the polling effect's
  `useEffect` dependency is `[signedIn, bootstrap,
  userId]` and short-circuits when `!signedIn`).

## NFRs (per-bolt targets)

| NFR | Target | Rationale |
|-----|--------|-----------|
| Home-page first paint (p95) | ≤ 1500 ms | One `/api/auth/status` + one `/api/report/bootstrap` + one `/api/v1/activity`; each ≈ 100 ms. |
| Polling latency (p95) | ≤ 200 ms | One `/api/v1/activity?limit=20`; the dev store's in-memory scan is < 50 ms. |
| Empty-state render | ≤ 100 ms (after fetch) | Single state branch, no fetch. |
| Polling cadence | 15 s | NFR-per-bolt; v1 polling is honest about the absence of WebSockets. |
| Visual baseline fidelity | 0.005 tolerance | Per `aidlc/spaces/default/memory/team.md` Mandated. |

## API contracts

| Endpoint | Method | Auth | Query | 2xx Response | Error codes |
|----------|--------|------|-------|--------------|-------------|
| `/api/auth/status` | GET | none | — | `{ authenticated, session? }` | — |
| `/api/report/bootstrap` | GET | citizen | — | `{ city, ward, categories }` | 401, 404 |
| `/api/v1/activity` | GET | citizen | `status?`, `limit=1..50 (default 20)` | `{ tickets: ActivityItem[] }` | 400, 401, 403 |

All responses are JSON. The `/api/v1/activity`
query string is Zod-validated; the validation
error returns `{ error: 'invalid_input', issues:
[...] }`.

## Frontend contracts (`app/home/page.tsx`)

### localStorage

| Key | Read | Write |
|-----|------|-------|
| `cityfix.preferred_language.v1` | on mount | on language toggle (`bn` / `en`) |
| `cityfix.preferred_appearance.v1` | on mount (via `ThemeProvider`) | on theme toggle |
| `cityfix.notification_prompt_seen.v1` | on mount | `'true'` on accept; `'dismissed'` on dismiss |

### Effects

1. **Mount effect** (deps: `[]`):
   - Read the language key.
   - If `Notification.permission === 'default'`
     and the prompt hasn't been seen, show it.
2. **Auth + bootstrap effect** (deps: `[]`):
   - `GET /api/auth/status` → if unauthenticated,
     set `signedIn = false` and return.
   - Else `GET /api/report/bootstrap` → set
     `bootstrap`. On any failure, set
     `error = 'home.feed.error'`.
3. **Polling effect** (deps: `[signedIn, bootstrap,
   userId]`):
   - Short-circuits when `!signedIn`.
   - On mount: `fetch('/api/v1/activity?limit=20')`.
   - On each fetch success: update `tickets`;
     compute `newIds` (items not in the previous
     set); clear the badge after 5 s.
   - On any failure: set `showOffline = true` (the
     banner is non-fatal; polling continues).
   - Re-runs every 15 s (`POLL_INTERVAL_MS`).

### Render branches

- `signedIn === false` → "Sign in required" card
  with a CTA to `/login`.
- `loading` → `FeedSkeleton` (4 placeholder rows).
- `error` → "Could not load reports" error
  (`home.feed.error`).
- `filteredTickets.length === 0` → `EmptyState`
  (icon + "No reports yet" + Report CTA).
- Else → the list of `ActivityCard`s.

### Filter pill mapping

| Pill key | API `status` | i18n key | Notes |
|----------|-------------|----------|-------|
| `all` | omitted | `home.filter.all` | Default; shows all rows. |
| `submitted` | `submitted` | `home.filter.new` | UI label is "New" / "নতুন" but the API filter is `submitted`. |
| `in_progress` | `in_progress` | `home.filter.in_progress` | — |
| `resolved` | `resolved` | `home.filter.resolved` | — |

The `closed` and `cancelled` statuses are **not**
exposed as pills (the citizen cannot filter to
them; the API filter enum still accepts them for
future expansion).

## Layer-by-layer checklist (for the Construction Agent)

The implement phase must confirm each of these in
`bolt-decisions.md`:

- [ ] `getActiveSession()` is the only auth check
  for the activity route; the `lib/auth/guards.ts →
  requireRole('citizen')` chain is the canonical
  pattern for write paths but is **not** used here
  (the activity route is a read; the inline
  `session.role !== 'citizen' → 403` check is the
  v1 simplification).
- [ ] The home page only reads the citizen
  serializer; the dispatcher/crew/admin views are
  not in this Bolt.
- [ ] `isOwnReport` is a client-side comparison
  after a per-card `reporterId` join. The citizen
  serializer **does** include `reporterId` (it is
  the only way the home page can mark "Your
  report"); the field carries no PII beyond the
  bare user id. **Verify**: the
  `serializeTicketForRole` call includes
  `reporterId`; the home page's `ActivityItem`
  type declares it; the only other citizen-visible
  fields are the bare coordinates, the localised
  labels, the status, and the anonymised trail
  actor label.
- [ ] Polling is 15 s and stops on unmount; the
  effect's cleanup clears the timer.
- [ ] The notification prompt is shown at most
  once per browser; the localStorage key is the
  single source of truth.

## Bolt Decision (technical addenda)

In addition to the Bolt Decision recorded in
`./bolt.md`:

- **Notification subscribe deferral**: the
  `acceptNotifications` handler calls
  `Notification.requestPermission()` but does
  **not** POST to `/api/v1/push/subscribe`. The
  subscribe endpoint is built (per Bolt
  `002-005-theme-and-i18n` records) but the
  home-page wiring is intentionally not in v1.
  The deferral is captured in the unit-brief's
  Story 016 (`pending`). The Construction Agent
  must **not** add the subscribe POST to this
  Bolt — it is the same scope as Bolt 002-005's
  push-deferral record.
- **Cross-ward filing**: the home page surfaces
  the citizen's own `ward` for every ticket's row
  label. The `ticket.wardId` is preserved in the
  serializer output but the row's display label is
  the citizen's own ward. v1.1 widens this to the
  ticket's ward.
- **Map placeholder → MapLibre swap**: deferred to
  v1.1. v1 ships the SVG projection at
  `app/home/page.tsx → CityMap` so the visual
  story is consistent across the demo. The v1.1
  Bolt owns the MapLibre integration with OSM
  raster tiles (dev) / Mapbox (prod).

## Cross-references

- **bolt.md**: `./bolt.md`.
- **ddd-01**: `./ddd-01-domain-model.md`.
- **Standards**:
  - `../../standards/tech-stack.md`
  - `../../standards/coding-standards.md`
  - `../../standards/api-conventions.md`
  - `../../standards/decision-index.md`
- **Bolt plan**: `../plan.md`.
- **Story 015** is the **serializer contract** Bolt;
  the `lib/serializers/ticket.ts` test in
  `tests/unit/serializer.test.ts` is the canonical
  acceptance evidence.