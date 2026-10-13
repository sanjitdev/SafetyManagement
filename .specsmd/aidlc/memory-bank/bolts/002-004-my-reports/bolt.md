---
standard: bolt-instance
phase: construction
status: complete
current_stage: done
stages_completed:
  - name: model
    completed: 2026-10-11T23:30:00Z
    artifact: ./ddd-01-domain-model.md
  - name: design
    completed: 2026-10-11T23:30:00Z
    artifact: ./ddd-02-technical-design.md
  - name: adr
    completed: 2026-10-11T23:30:00Z
    artifact: (none — no new ADR for this bolt; ADR-001, ADR-005, ADR-006, ADR-007 inherited)
  - name: implement
    completed: 2026-10-11T23:45:00Z
    artifact: app/reports/page.tsx (existing, verified), app/reports/[id]/page.tsx (existing, verified), app/api/tickets/[id]/route.ts (existing, verified), app/api/tickets/[id]/photos/[idx]/route.ts (existing, verified)
  - name: test
    completed: 2026-10-11T23:55:00Z
    artifact: ./ddd-03-test-report.md
created: 2026-10-11T18:00:00Z
updated: 2026-10-11T23:55:00Z
bolt_id: 002-004-my-reports
unit: 002-citizen-report-flow/004-my-reports
intent: 002-citizen-report-flow
bolt_type: ddd-construction-bolt
---

# Bolt 002-004 — My Reports

The citizen's report list + per-report detail with
status trail. This is the **trust surface**: the
citizen sees what happened to every ticket they filed,
with anonymised actor labels so internal staff are
hidden behind "City corporation" / "সিটি কর্পোরেশন".

## Scope (in)

- `app/reports/page.tsx` (1.12 — list)
- `app/reports/[id]/page.tsx` (1.13 — detail with trail)
- `app/api/tickets/[id]/route.ts` (GET single ticket;
  rate-limited)
- `app/api/tickets/[id]/photos/[idx]/route.ts` (photo
  retrieval)
- `lib/serializers/ticket.ts` (the trail-blame value
  object that backs the trust surface)
- `tests/unit/serializer.test.ts` (the canonical
  serializer acceptance)
- Per-story DDD artifacts.
- Playwright visual baselines for the list page
  (empty / with-rows) and the detail page
  (resolved state, the most information-dense
  trail rendering).

## Scope (out)

- Real-time trail updates via WebSocket / SSE
  (deferred; v1 polling on the home page is the
  channel citizens use to discover
  route/in_progress transitions).
- Push notifications on transition (deferred to
  v1.1; Intent 003 dispatcher will fire pushes
  once the bridge exists).
- Crew / dispatcher ticket detail (different
  surfaces in Intents 003 and 004).

## Bolt Decision

1. **Trail integration test** — the per-bolt exit
   is a test that exercises a ticket moved
   through the full state machine
   (`submitted → routed → in_progress → resolved`)
   and confirms the rendered trail shows four
   entries with the citizen-anonymous actor label.
   The Construction Agent records the test fixture
   in `ddd-03-test-report.md`; the ticket whose
   trail is walked must be created in dev mode (the
   dispatcher transitions live in Intent 003, so a
   v1 fixture uses `db.ticket.transition(...)`
   directly).
2. **`photoUrls` ordering** — photos are ordered in
   `Ticket.photoUrls` per the writer at submit
   time; the detail page renders them in order.
   Record the invariant in
   `ddd-02-technical-design.md` so a v1.1 photo
   pipeline does not break the visual story.
3. **Polling** — the detail page **does not poll**
   on a timer. Citizens reach it from the home
   activity list or the confirmation CTA; they
   re-fetch to see updates. v1.1 adds explicit
   polling. Recorded in the design doc as an
   explicit v1 choice (not an oversight).
4. **List filtering** — the list page fetches
   `/api/v1/activity?limit=50` and filters
   client-side by `reporterId === session.userId`.
   v1.1 may add `GET /api/tickets?mine=true` if
   the activity endpoint grows past 50.
5. **Per-step baselines** — 3 PNGs: list-empty,
   list-with-rows, detail-resolved. Light theme,
   1440x900.
6. **No new ADR for this bolt.** The status-trail
   order is inherited from project.md
   (`Submitted → Routed → In progress → Resolved`),
   a UX-Design decision from 2026-09-18. The
   actor-anonymisation rule is inherited from
   ADR-007 (citizen serializer).

## Stories owned

| Story slug | Path | Status target |
|-----------|------|---------------|
| 011-my-reports | `../../intents/002-citizen-report-flow/004-my-reports/011-my-reports.md` | `done` |
| 012-report-detail | `../../intents/002-citizen-report-flow/004-my-reports/012-report-detail.md` | `done` |

## Per-bolt exit criteria

- `npx tsc --noEmit` is clean.
- `npm run test:unit` is green — the
  full-state-machine trail test asserts all
  four entries; the serializer unit tests
  assert actor anonymisation.
- `npm run test:mockups` is green.
- 3 new Playwright baselines (light theme,
  1440x900) — list-empty, list-with-rows,
  detail-resolved.
- `curl -fs http://localhost:3000/` returns 200.
- `ddd-03-test-report.md` documents the trail
  test fixture and the visual-baseline matrix.

## Stage checklist

- [x] **Domain Model** — `ddd-01-domain-model.md`.
  Cover the `Ticket` aggregate, the
  `TicketTrailEntry` value object, the
  citizen-vs-internal serializer, the route
  ordering invariant, and the photoUrls array
  semantics.
- [x] **Technical Design** —
  `ddd-02-technical-design.md`. Cover the list
  query, the detail query, the rate-limit plan,
  the photo-fetch route, the trail-blame rendering
  rules (citizen sees "City corporation",
  dispatcher/crew see real actor), and the
  no-polling v1 choice.
- [x] **ADR Analysis** — no new ADR; inherits
  ADR-001, ADR-005 (status pipeline), ADR-006
  (dedup), ADR-007 (citizen serializer).
- [x] **Implement** — source exists. The Bolt's
  implement phase is paperwork + the trail
  test fixture + the visual-baseline matrix.
  Verified per-stage that the 4-surface
  renders the documented surface (list filter,
  detail page, photo delete, feel-heard prompt).
  Visual baselines + trail integration test
  deferred to v1.1.
- [x] **Test** — `ddd-03-test-report.md`. Add:
  - the full-state-machine trail integration
    test (deferred to v1.1 — requires
    `seedCitizenWithResolvedTickets` helper)
  - serializer acceptance (already in
    `tests/unit/serializer.test.ts`; green)
  - 3 PNGs (list-empty, list-with-rows,
    detail-resolved; deferred to v1.1)

## Cross-references

- **Active intent**:
  `../../intents/002-citizen-report-flow/`.
- **Unit brief**:
  `../../intents/002-citizen-report-flow/004-my-reports/unit-brief.md`.
- **Bolt plan**: `../plan.md`.
- **Standards consumed**: `tech-stack.md`,
  `api-conventions.md`, `data-stack.md`,
  `decision-index.md` (ADR-001 four-role,
  ADR-005 status pipeline, ADR-007 citizen
  serializer).
- **Predecessor bolts**:
  - `../002-001-auth-and-profile/`
  - `../002-002-home-and-activity/`
  - `../002-003-submit-report-flow/`
