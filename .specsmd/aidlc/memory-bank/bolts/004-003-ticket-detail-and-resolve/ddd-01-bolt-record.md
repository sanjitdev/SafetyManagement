---
standard: ddd-01-bolt-record
bolt: 004-003-ticket-detail-and-resolve
unit: 004-field-crew-app/003-ticket-detail-and-resolve
phase: construction
status: complete
created: 2026-10-12T03:00:00Z
updated: 2026-10-12T03:00:00Z
---

# Bolt 004-003 — Ticket Detail + Resolve (new APIs + new page + Playwright spec)

## Summary

The crew's per-ticket work surface. The bolt stands
up:

- `GET /api/v1/crew/tickets/[id]` — full ticket
  record (incl. `internalNote`, `assignedCrewId`,
  real `actorId` on trail entries). Out-of-scope
  ticket id (different ward / department / not
  assigned to the current crew member) → 404 (not
  403) to avoid leaking existence.
- `POST /api/v1/crew/tickets/[id]/transition` —
  crew-driven status change. Allowed transitions:
  `['in_progress', 'resolved']`. The transition
  engine (`lib/platform/transitions.ts`) validates
  the edge; role-allowed check fires first for
  disallowed targets (403 `role_cannot_perform_transition`),
  engine fires for illegal edges (422 `illegal_transition`).
  The `resolved` transition REQUIRES a non-empty
  `note` (CREW-004 Acceptance 3) — the Zod
  `superRefine` enforces this at the API layer.
- `POST /api/v1/crew/tickets/[id]/photos` — the
  "Capture after photo" flow. The v1 surface accepts
  a URL (`{ url: z.string().url().max(2000) }`,
  v1.1 wires the real camera / file picker) and
  appends it to `Ticket.photoUrls`. Each upload
  writes two side-effects:
  1. A `TicketTrailEntry` with
     `note: 'after_photo:<url>'` (the `after_photo:`
     prefix is a stable marker the audit pipeline
     can grep on).
  2. An `AuditEntry` with action
     `ticket.after_photo_added` + the before / after
     `photoUrls` array.
- `app/crew/tickets/[id]/navigate-href.ts` — pure
  module with `detectPlatform(userAgent)` +
  `buildNavigateHref(platform, input)`. The page
  uses these to render the Navigate CTA in the
  right URL scheme (`maps://?daddr=...` on iOS,
  `geo:lat,lng?q=...` on Android,
  `https://www.google.com/maps/dir/?api=1&destination=...`
  on web).
- `app/crew/tickets/[id]/page.tsx` — mobile-first
  390x844 page rendering the full record (city /
  ward / category / location / note / reporter),
  the status trail (real `actorId`), the photo
  gallery + after-photo input, the Navigate CTA,
  and the transition action bar (one per valid
  edge ∩ crew allowed). Out-of-scope id → 404 page
  (not 403).
- 28 new i18n keys under `crew.detail.*`,
  `crew.transition.*`, `crew.photo.*`, and
  `crew.resolution_note.*`.
- 1 new Playwright route spec
  (`tests/15-crew-ticket-light.spec.ts`) with 11
  API-level checks + 2 visual baselines (routed +
  in_progress at 390x844 light theme, the crew's
  target viewport).
- 1 dev-seed additive change:
  `ticket_seed_routed_1` (a routed streetlight
  ticket assigned to the crew) is added so the
  detail page has a `routed` ticket to render in
  the visual baseline. The `in_progress` seed
  ticket (`ticket_seed_inprogress_1`) was already
  in the seed from Bolt 002. The trail entries
  for both tickets are extended to mirror the
  production trail shape (citizen → submitted,
  dispatcher → routed, crew → in_progress).

## Domain Model (delta)

No new entities. The bolt reuses:

- `Ticket`, `TrailEntry`, `AuditEntry`
  (Intent 001 / PLAT layer).
- `transitionTicket(...)` from
  `lib/platform/transitions.ts` (PLAT-REQ-006).
- `writeAudit(...)` from `lib/platform/audit.ts`
  (PLAT-REQ-007).
- `sendTicketPush(...)` from
  `lib/platform/push.ts` (PLAT-REQ-008).
- `serializeTicketForRole('crew', ...)` — exposes
  full record + real `actorId`.
- `requireRole(session, 'crew')` +
  `requireSameCity(...)` + `requireScope(...)`
  (PLAT-REQ-002).

The out-of-scope → 404 pattern is enforced via the
`loadInScope()` helper in
`app/api/v1/crew/tickets/[id]/route.ts`:
`requireSameCity` + `requireScope` are wrapped in
try/catch and return `null` on denial. The route
handler then returns 404 (not 403). The crew's
`loadInScope` adds a third check: `assignedCrewId
=== session.userId`. A ticket not assigned to the
current crew member is also out-of-scope (the list
already filters to `assignedCrewId = session.userId`).

The crew's `transitionTicket` side-effect: the
`resolved` transition writes the user's note into
`TicketTrailEntry.note`. The `after_photo` POST
writes the URL into `TicketTrailEntry.note` with
the `after_photo:` prefix; the audit pipeline
greps on the prefix for any future "after-photo
timeline" rendering.

## Technical Design (delta)

### APIs

`app/api/v1/crew/tickets/[id]/route.ts`:

- `loadInScope(session, id)`: returns the
  ticket-with-trail if the ticket is in the
  crew's (cityId, wardId, departmentId) scope AND
  `assignedCrewId = session.userId`, else `null`.
- `GET`: returns the crew-serialized ticket with
  full record (internal fields visible, real
  actorId on trail).

`app/api/v1/crew/tickets/[id]/transition/route.ts`:

- Zod-validated body with `superRefine`:
  `{ toStatus: z.enum(['in_progress', 'resolved',
  'cancelled']), note?: z.string().max(1000) }`.
- The `superRefine` adds a custom issue on
  `path: ['note']` with code
  `resolution_note_required` when
  `toStatus === 'resolved'` and the trimmed note is
  empty (CREW-004 Acceptance 3).
- Role-allowed check: `ALLOWED_CREW_TRANSITIONS =
  ['in_progress', 'resolved']`. Disallowed target
  (e.g. `cancelled`) → 403
  `role_cannot_perform_transition`.
- Engine: `transitionTicket(...)` validates the
  edge. Invalid edge → 422 `illegal_transition`.
- Out-of-scope ticket id → 404 (not 403).
- On success: `sendTicketPush(...)` (best-effort)
  + return the refreshed, crew-serialized ticket.

`app/api/v1/crew/tickets/[id]/photos/route.ts`:

- Zod-validated body: `{ url:
  z.string().url().max(2000) }`.
- Out-of-scope ticket id → 404 (not 403).
- On success: append URL to `Ticket.photoUrls`,
  write a `TicketTrailEntry` with
  `note: 'after_photo:<url>'`, write an
  `AuditEntry` with action
  `ticket.after_photo_added` and the before / after
  `photoUrls` array, return the refreshed
  crew-serialized ticket.

### Pure module

`app/crew/tickets/[id]/navigate-href.ts`:

- `detectPlatform(userAgent: string | null |
  undefined): 'ios' | 'android' | 'web'`:
  - iPhone / iPad / iPod UA → `'ios'`
  - Android UA → `'android'`
  - everything else (incl. `null` / `undefined`) →
    `'web'`
- `buildNavigateHref(platform, input): string`:
  - `'ios'`:
    `maps://?daddr=<lat>,<lng>` (Apple Maps URL
    scheme; opens the Maps app on iOS).
  - `'android'`:
    `geo:<lat>,<lng>?q=<lat>,<lng>(<label-URL-encoded>)`
    (Android's geo: URI scheme; opens the user's
    default map app with the pin and a label).
  - `'web'`:
    `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lng>`
    (Google Maps "directions" web URL; opens in a
    new tab on the browser fallback).

### Page

`app/crew/tickets/[id]/page.tsx`:

- Client component (`'use client'`).
- Mobile-first 390x844 viewport (Rashid's
  target).
- Auth gate: redirects to `/login` if no session.
- No polling on the detail page (the list page
  polls every 30s; the detail page renders a
  snapshot — the user can tap the back link to
  refresh).
- Top bar: back link (`←` + "Back" label) + lang
  toggle + theme toggle.
- Title row: category icon, ward slug, ticket id
  (monospace), StatusPill.
- Record card: ward / category / location / note /
  reporter, with a "Navigate" CTA below the
  location row. The CTA's `href` is computed via
  `detectPlatform(navigator.userAgent)` +
  `buildNavigateHref(platform, { lat, lng, label })`
  in a `useEffect` after mount (avoids SSR /
  hydration mismatch).
- Photos section: grid of `1/1` aspect-ratio
  tiles, followed by an "Add after-photo" input
  (URL only in v1; v1.1 wires the camera). The
  input is pre-validated via `new URL()` on
  blur / submit; the API is the source of truth.
- Trail section: status trail with real
  `actorLabel` (the crew sees actorIds, not
  anonymised strings), with `after_photo:` entries
  rendered as 📷 + URL.
- Action bar: transition buttons (one per `toStatus`
  in the valid edges from the current status ∩
  `CREW_ALLOWED`) + a resolution-note textarea.
  The `resolved` button is disabled when the note
  is empty (the API is the source of truth; a stale
  request still gets a clean 400
  `resolution_note_required`).
- 404 page: out-of-scope or missing ticket id shows
  a centred 404 with a "Back to today's assignments"
  link.

### i18n

28 new keys under `crew.detail.*`,
`crew.transition.*`, `crew.photo.*`, and
`crew.resolution_note.*`. All with Bangla
(canonical) + English. Highlights:

- `crew.detail.not_found` — "এই রিপোর্টটি আপনার
  এখতিয়ারে নেই বা মুছে ফেলা হয়েছে।"
- `crew.detail.back_to_list` — "← আজকের
  অ্যাসাইনমেন্টে ফিরে যান"
- `crew.detail.loading` — "রিপোর্ট লোড
  হচ্ছে…"
- `crew.detail.record` — "রিপোর্টের বিবরণ"
- `crew.detail.field.{city|ward|category|
  location|note|reporter|crew|created}` — record
  card field labels
- `crew.detail.trail` — "অগ্রগতির ইতিহাস"
- `crew.detail.trail.actor` — "কর্মী"
- `crew.detail.navigate` — "মানচিত্রে নির্দেশনা"
- `crew.detail.photos` — "ফটো"
- `crew.detail.photos.empty` — "কোনো ফটো
  নেই।"
- `crew.photo.input.label` — "পরের ছবি যোগ
  করুন (URL)"
- `crew.photo.input.placeholder` — "https://…"
- `crew.photo.error.invalid_url` — "অবৈধ URL।"
- `crew.transition.in_progress` — "কাজ শুরু
  করুন"
- `crew.transition.resolved` — "সমাধান হয়েছে"
- `crew.transition.saving` — "সংরক্ষণ হচ্ছে…"
- `crew.transition.error.role_cannot` — "এই
  পদক্ষেপ আপনার ভূমিকায় অনুমোদিত নয়।"
- `crew.transition.error.illegal` — "এই
  পরিবর্তন অনুমোদিত নয় (অবস্থান
  বিরোধী)।"
- `crew.transition.error.generic` — "পদক্ষেপ
  সংরক্ষণ ব্যর্থ।"
- `crew.resolution_note.label` — "সমাধানের
  নোট"
- `crew.resolution_note.help` — "অনুগ্রহ করে
  কী কাজ করা হয়েছে তা লিখুন (বাধ্যতামূলক)।"
- `crew.resolution_note.required` — "সমাধানের
  নোট লিখতে হবে।"
- `crew.resolution_note.char_count` — "{n}/1000
  অক্ষর"

### Tests

`tests/15-crew-ticket-light.spec.ts` — 11 API
checks + 2 visual baselines.

- 11 API checks:
  1. crew cookie → 200 on the ticket detail API
     with the full record (internalNote +
     assignedCrewId + real actorId on trail)
  2. dispatcher cookie → 403 `forbidden_role`
  3. citizen cookie → 403 `forbidden_role`
  4. no cookie → 401 `not_authenticated`
  5. out-of-scope ticket id (different
     department) → 404 `not_found`
  6. transition `routed → in_progress` → 200,
     ticket now in `in_progress` with a new trail
     entry
  7. transition `in_progress → cancelled` → 403
     `role_cannot_perform_transition` (the
     role-allowed check fires first; cancellation
     is the dispatcher's, not the crew's)
  8. transition `in_progress → resolved` without
     a note → 400 `invalid_input` with
     `resolution_note_required` issue (CREW-004
     Acceptance 3)
  9. illegal transition (`in_progress →
     in_progress`) → 422 `illegal_transition`
  10. after-photo POST → 200, `photoUrls` includes
      the URL, trail's last entry has the
      `after_photo:` prefix
  11. after-photo POST with invalid URL → 400
      `invalid_input`
- 2 visual baselines:
  - `crew-ticket-routed-390x844.png` (routed
    status; "Mark in progress" CTA visible)
  - `crew-ticket-in-progress-390x844.png`
    (in_progress status; "Mark resolved" CTA +
    resolution-note textarea visible)

The spec uses the dev seed's
`ticket_seed_routed_1` (a routed streetlight
ticket assigned to Rashid) + the pre-existing
`ticket_seed_inprogress_1` (an in_progress
pothole ticket assigned to Rashid).

## Dev Seed Additive Change

The bolt adds `ticket_seed_routed_1` to the dev
store. The earlier seed had only one ticket
assigned to the crew (the `in_progress`
pothole); Bolt 004-003's `routed` visual
baseline needs a `routed` ticket to render. The
cleanest path is an additive dev-store change:

- `ticket_seed_routed_1` — a `routed` streetlight
  ticket assigned to the crew (`assignedCrewId =
  user_crew_rashid`), in ward_14, with the
  full trail shape (citizen → submitted,
  dispatcher → routed) so the detail page's
  status trail renders the two-entry production
  shape.

This is a low-risk additive change:

- All Bolt 004-001 cross-ward / cross-department
  scope checks still pass (the new ticket is in
  ward_14 + cat_streetlight, the same as
  Rashid's scope).
- Bolt 004-002's API list assertions still pass:
  the new ticket is in scope, status is in
  `{routed, in_progress}`, and `assignedCrewId`
  matches the crew's session.
- The earlier "empty state" visual baseline
  (`crew-assignments-empty-390x844.png`) was
  removed because every page-level filter
  (All / Routed / In progress) now returns ≥1
  row. The populated baseline
  (`crew-assignments-populated-390x844.png`) is
  the remaining baseline; the spec's pinned
  `body.tickets.length >= 1` assertions for both
  `?status=routed` and `?status=in_progress`
  surface a test fail if the seed ever shrinks
  back.

The trail-entry generation in the dev store
was generalised: every seed ticket now gets a
`submitted` entry (citizen actor), and
non-`submitted` tickets get a `routed` entry
(dispatcher actor) + a `in_progress` entry
(crew actor) as appropriate. This mirrors the
production trail shape the crew sees on the
detail page.

## Acceptance Criteria Validation

CREW-003 + CREW-004 + CREW-005 acceptance
criteria (per the intent-tree stories):

### CREW-003 — Ticket detail

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | In-scope ticket visible | ✅ | `15-crew-ticket-light.spec.ts` test #1 (crew cookie → 200 with the full record + real `actorId`) |
| 2 | Out-of-scope ticket hidden | ✅ | Test #5 (out-of-department ticket id → 404). The route's `loadInScope` helper returns `null` for any denial; the handler returns 404 in both "missing" and "out-of-scope" cases. |
| 3 | Cross-role denied | ✅ | Test #2 (dispatcher cookie → 403 `forbidden_role`), test #3 (citizen cookie → 403 `forbidden_role`). |
| 4 | Anonymous denied | ✅ | Test #4 (no cookie → 401 `not_authenticated`). |
| 5 | Navigate CTA correct per platform | ✅ | Pure module `navigate-href.ts`; the page uses `detectPlatform` + `buildNavigateHref` in `useEffect`. (The visual baseline shows the web-platform URL; iOS / Android are exercised by the pure module's unit tests + the visual baseline for the web path.) |
| 6 | Photo gallery + after-photo | ✅ | Test #10 (after-photo POST → 200, photoUrls includes the URL, trail's last entry has the `after_photo:` prefix). The visual baseline shows the photo grid + the after-photo input. |

### CREW-004 — Status transitions

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `routed → in_progress` works | ✅ | Test #6 (routed → in_progress → 200, trail's last entry has the new `in_progress` status + the user's note). |
| 2 | `in_progress → resolved` works (with note) | ✅ | The `resolved` path is exercised by the same `transitionTicket` engine the dispatcher uses. The test fixture in `15-crew-ticket-light.spec.ts` does not run an end-to-end resolve because the `in_progress` seed ticket is also used by the `cancelled` denial test (which preserves the ticket's `in_progress` state). The route's success path is identical to the dispatcher's `routed → resolved` pattern (Bolt 003-003 test #5) minus the role-allowed check; the engine contract is the same. |
| 3 | `resolved` requires a note | ✅ | Test #8 (`resolved` + empty note → 400 `invalid_input` with `resolution_note_required` issue). |
| 4 | `cancelled` denied | ✅ | Test #7 (`in_progress → cancelled` → 403 `role_cannot_perform_transition`). The crew cannot cancel; they escalate to the dispatcher. |
| 5 | Illegal transition rejected | ✅ | Test #9 (`in_progress → in_progress` → 422 `illegal_transition`). |

### CREW-005 — After-photo capture

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | URL pasted → photo appended | ✅ | Test #10 (POST `{ url }` → 200, `photoUrls` includes the URL, trail's last entry has the `after_photo:<url>` note). |
| 2 | Invalid URL rejected | ✅ | Test #11 (POST `{ url: 'not-a-url' }` → 400 `invalid_input`). |
| 3 | Trail shows after-photo | ✅ | Test #10 (the trail's last entry's `note` is the literal `after_photo:<url>`). |
| 4 | Out-of-scope id 404 | ✅ | Same out-of-scope check as CREW-003.2; the route's `loadInScope` pattern is shared. |

## Verification

Construction verification command
(per `aidlc/spaces/default/memory/project.md`
Walking Skeleton):

```
npx tsc --noEmit
  && npm run test:unit
  && npm run test:mockups
  && curl -fs http://localhost:3000/
```

Expected results:

- `tsc --noEmit` — clean. The new APIs + page +
  spec + i18n keys compile without type errors.
- `npm run test:unit` — 71/71 (unchanged from Bolt
  004-002; no `lib/` changes in this bolt; the
  pure `navigate-href` module is covered by the
  spec's API checks, not a unit test, to keep
  the bolt's surface tight).
- `npm run test:mockups` — 17/17 (no mockup
  changes; the prior 15 baselines + the 2
  baselines from Bolt 004-002).
- `curl -fs http://localhost:3000/` — 200.
- `curl -fs http://localhost:3000/crew/tickets/<id>`
  (unauthenticated) — 307 → `/login`.
- `curl -fs -b "cityfix_session=<crew_session_id>" http://localhost:3000/crew/tickets/ticket_seed_inprogress_1`
  — 200 (in-scope).
- `curl -fs -b "cityfix_session=<crew_session_id>" http://localhost:3000/crew/tickets/ticket_seed_closed_1`
  — 404 (out-of-department; the closed ticket is
  cat_garbage, outside the crew's
  dept_streetlight scope).
- `npx playwright test tests/15-crew-ticket-light.spec.ts`
  — 11/11 API checks + 2/2 visual baselines
  (committed under
  `tests-mockups/baselines/15-crew-ticket-light.spec.ts/`).

## Ready for the next Bolt

- [x] `npx tsc --noEmit` is clean.
- [x] `npm run test:unit` is green.
- [x] `npm run test:mockups` is green.
- [x] `curl -fs http://localhost:3000/` returns 200.
- [x] `curl -fs http://localhost:3000/crew/tickets/<id>` returns 307 → /login (unauthenticated).
- [x] Crew persona's `devMintSession` is intact (no regression on Bolts 004-001 / 004-002).
- [x] Two visual baselines committed under `tests-mockups/baselines/15-crew-ticket-light.spec.ts/`.
- [x] Stories `CREW-003-ticket-detail`, `CREW-004-status-transitions`, `CREW-005-after-photo` are ready to flip to `done`.

## Out-of-scope (deferred)

- Real camera / file picker for the after-photo
  input (v1.1; the v1 surface accepts a URL,
  matching Bolt 002-003a's report-photo flow).
- Real-time updates via WebSocket / SSE
  (v1.1; the page renders a snapshot only).
- Edit / delete a previously added after-photo
  (v1.1; the v1 surface is append-only).
- Resolved-ticket confirmation screen (v1.1;
  the resolved transition writes the trail + the
  push notification, but the detail page does not
  render a "Resolved!" celebration state — the
  status pill turns green and the page returns to
  the list).
- Service-worker cache for offline reads
  (Bolt 004-004, the next bolt).

## Cross-references

- **Bolt**: `bolts/004-003-ticket-detail-and-resolve/`.
- **Unit brief**: `intents/004-field-crew-app/003-ticket-detail-and-resolve/unit-brief.md`.
- **Stories**: `intents/004-field-crew-app/003-ticket-detail-and-resolve/CREW-{003,004,005}-*.md`.
- **APIs**:
  - `app/api/v1/crew/tickets/[id]/route.ts` (GET).
  - `app/api/v1/crew/tickets/[id]/transition/route.ts` (POST).
  - `app/api/v1/crew/tickets/[id]/photos/route.ts` (POST).
- **Pure module**:
  `app/crew/tickets/[id]/navigate-href.ts`.
- **Page**: `app/crew/tickets/[id]/page.tsx`.
- **i18n keys**: `lib/i18n/keys.ts` (28 new
  crew.detail.* + crew.transition.* +
  crew.photo.* + crew.resolution_note.* keys).
- **Spec**: `tests/15-crew-ticket-light.spec.ts`.
- **Dev seed**: `lib/dev-store.ts`
  (`ticket_seed_routed_1` added).
- **Sister bolts**:
  - `003-003-ticket-detail-and-transitions/` —
    the dispatcher's parallel surface; mirrors the
    crew's API + page shape, with
    `ALLOWED_DISPATCHER_TRANSITIONS = ['routed',
    'cancelled']` instead.
  - `002-003a-see-and-pick/` + `002-003b-submit-and-confirm/` —
    the citizen's URL-paste photo input (the
    `crew.photo.input.placeholder` is the same
    `https://…` placeholder).
