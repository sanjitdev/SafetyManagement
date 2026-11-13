---
stage: plan
bolt: 009-005-dispatcher-console
created: 2026-11-12T23:10:00Z
---

## Implementation Plan: 005-dispatcher-console

### Objective

Deliver Wave 4 of Intent 009 — the dispatcher console — in two
stories: design the five dispatcher mockups as one coherent family,
take them through the human approval gate, then re-compose the six
dispatcher routes from the `components/ui/` primitives and the Wave 1
chart kit.

The wave must land four things that **do not exist today**:

1. the **3-region triage layout** (filter rail / ticket list / detail)
   — `app/dispatcher/page.tsx`'s own header comment still advertises
   it, but the page is now a dashboard with no detail pane;
2. the **SLA countdown chip** — `SlaPolicy` is seeded but consulted on
   no dispatcher surface, and `components/ui/charts/SlaBullet.tsx` has
   **0 call sites**;
3. the **searchable crew-picker combobox** — the crew picker today is
   a raw `<select>`;
4. **charts that do not encode any series by hue alone** — the
   current performance page hand-rolls a line chart and a donut whose
   series are distinguished only by colour.

### Deliverables

**Story 011 — Dispatcher mockups**

1. `design-artifacts/D-Design-System/01-Visual-Design/mockups/17-triage-queue.html` — 3-region triage.
2. `.../mockups/18-dispatcher-ticket-detail.html` — sticky action bar, crew picker, internal notes.
3. `.../mockups/19-dispatcher-map.html` — full-bleed map + floating controls.
4. `.../mockups/20-dispatcher-monitor.html` — dark ops board (`.theme-dark`).
5. `.../mockups/21-dispatcher-performance.html` — trend line + category bars + SLA bullet.
6. `.../mockups/dispatcher-surfaces.css` — the shared dispatcher chrome (NEW).
7. `.../gallery.html` — 5 new cards, the count 16 → 21.
8. `.../README.md` — the file table, the tree, the coverage rationale.
9. `tests/01-mockups.spec.ts` — 5 new entries at `['LARGE','MEDIUM']`.
10. 10 Playwright baselines under `tests-mockups/baselines/01-mockups.spec.ts/`.

**Story 012 — Dispatcher page implementation**

11. `app/dispatcher/page.tsx` — restored to the 3-region triage layout.
12. `app/dispatcher/tickets/[id]/page.tsx` — sticky action bar, crew combobox, internal notes.
13. `app/dispatcher/map/page.tsx` — full-bleed map + floating controls.
14. `app/dispatcher/dedup/page.tsx` — re-composed from the primitives.
15. `app/dispatcher/monitor/page.tsx` — dark ops board.
16. `app/dispatcher/performance/page.tsx` — the Wave 1 chart kit.
17. `components/ui/Combobox.tsx` (NEW) — the searchable crew picker.
18. `components/ui/SlaCountdown.tsx` (NEW) — the SLA countdown chip.
19. `lib/i18n/keys.ts` — every new user-facing string, `bn` + `en`.
20. `tests/34-ui-redesign-dispatcher.spec.ts` — the route spec.

### Dependencies

- **Wave 1 (`009-002-design-foundation`)** — the 37 `components/ui/` primitives, the Phosphor icon registry (`lib/ui/icon-map.ts`), the token system, and the `components/ui/charts/` kit (`TrendLine`, `CategoryBar`, `SlaBullet`, `StatCard`, `ChartFrame`).
- **Wave 2 (`009-003-auth-and-public-surfaces`)** — the app header, the i18n key shape, and the backend-agnostic spec pattern.
- **Wave 3 (`009-004-citizen-surfaces`)** — the `IconButton` touch-target rebuild and the `components/ui/` composition conventions the citizen routes established.
- **`components/ui/charts/`** — the Wave 1 chart kit, currently unused by every dispatcher route. Its `ChartFrame` already codifies the two rules this wave must satisfy: the data table is always reachable, and no series is encoded by hue alone.

### Technical Approach

**Presentation-layer only.** The API surface, the role model, the transports, the data model, the database schema and the seed data are unchanged. Every fetch, query parameter, cursor, limit, validation rule and role gate stays byte-identical to the pre-existing implementation.

**The triage layout is a restoration, not an invention.** `05-daily-queue-dashboard.html` is the retired desktop reference for the 3-region layout; `17-triage-queue` supersedes it. The page's own header comment already describes filter rail / queue list / detail — that comment describes the intent, and this wave makes the page match it. The detail pane updates **in place** (client-side selection against the already-fetched page of tickets) so the filter state survives; navigating away and back loses the filters, which is the defect Story 012's first acceptance criterion names.

**Filters are applied server-side and echoed back.** Today the queue reads `?q=` and never writes it back, and there is no ward or status filter at all. The wave adds ward + status filters that are sent as query parameters to the existing list endpoint, and the selected values are read back from the URL so a shared link reproduces the same filtered queue. `?q=` keeps working — the existing search box is not removed, it is finally wired.

> **CORRECTION — this paragraph was wrong when written, and the Stage 2
> reconnaissance proved it.** `app/api/v1/dispatcher/queue/route.ts` does
> **not** accept a `ward` query parameter. Its `QuerySchema`
> (route.ts:42-50) carries `status`, `limit` and `cityId` only, and
> Zod's default object parsing **strips unknown keys**, so a `ward=`
> sent today is silently discarded rather than rejected. Ward scoping
> is hard-bound to the session at route.ts:128
> (`if (session!.wardId && t.wardId !== session!.wardId) return false`).
>
> The plan's claim that "the wave adds ward + status filters that are
> sent as query parameters to the existing list endpoint" is therefore
> **not implementable as written**. Two options, and the choice is the
> human's:
>
> - **(a) Add `ward` to the existing endpoint's `QuerySchema` plus a
>   filter clause**, still intersected with the session's ward so the
>   authorisation boundary is untouched. The plan's "presentation-layer
>   only / API surface unchanged" constraint is broken by one additive,
>   optional query parameter.
> - **(b) Filter ward client-side** against the already-fetched page
>   of tickets. No API change at all, but the ward list is derived from
>   the fetched page, so a ward with no ticket *in the fetched page*
>   cannot appear in the filter rail.
>
> `status` needs no such decision — the endpoint already accepts
> `status` as a single-value `submitted | routed` enum, and omitting
> it returns both.
>
> Note also that the queue's `status` enum is `submitted | routed`
> only — it does **not** include `in_progress`. The mockups' status
> filter rail lists four states. The extra states must come from a
> second source, not from this endpoint.

> **SECOND CORRECTION — the `ward` gap and the `status` gap are
> different in kind, and the difference was verified rather than
> assumed.** Zod's two failure modes were checked directly against the
> repo's own `zod`:
>
> ```
> status=in_progress -> REJECTED (400 invalid_query)
> ward=ward_14       -> {"limit":50}   (unknown key silently stripped)
> ```
>
> An **unknown key** is stripped, so `ward=` today is ignored in
> silence. An **enum violation** is rejected, so `status=in_progress`
> today is a hard `400 invalid_query`, not a silent no-op. A client that
> put four states in the filter rail and sent them to this endpoint would
> get a 400 for the two it does not accept — so the mockup's four-state
> rail cannot be driven from this endpoint as it stands.
>
> The `status` filter is applied at the **database** level
> (route.ts:90-96, `status: { in: wantedStatuses }`), and
> `wantedStatuses` defaults to `['submitted','routed']`
> (route.ts:85). So `in_progress` tickets are never fetched at all —
> **client-side filtering cannot recover them**, which rules out the
> option that works for `ward`.
>
> The two decisions therefore have different option sets:
>
> | Gap | Option A | Option B |
> |---|---|---|
> | `ward` | (a) add `ward` to `QuerySchema` + a filter clause, intersected with the session's ward so the authorisation boundary is untouched | (b) filter client-side against the fetched page — works, because ward scoping happens in code at route.ts:128 and every fetched ticket already carries its ward |
> | `status` | (a) widen the enum to the four states the mockup shows and drop the `status: { in: … }` DB filter for the extra states | (b) keep the endpoint as-is and source the other states from a second endpoint |
>
> **Recommendation: option (a) for both.** `ward` is one additive
> optional query parameter on an endpoint that already filters ward in
> code; `status` is one enum widened from two members to four, plus
> moving the status filter from the DB `where` into the existing
> code-level filter so the extra states are reachable. Both are additive
> and neither touches the authorisation boundary: the session's ward
> still wins, because the session filter is applied **after** the
> requested-ward filter.

> **THIRD CORRECTION — the mockup's ward rail is not reachable, and
> that changes which option is correct.** The mockup
> `17-triage-queue.html` lists **four** wards in its ward rail:
> ওয়ার্ড ১৪ · মিরপুর, ওয়ার্ড ১৩ · কাজীপুর, ওয়ার্ড ১৫ · উত্তরা, ওয়ার্ড ১৬ ·
> ভর্তিপাড়া. But the dispatcher's session is bound to **one** ward:
> `lib/dev-store.ts:563` sets the dispatcher persona's `wardId` to
> `ward_14` (`lib/dev-store.ts:355`), and the queue route hard-filters
> `if (session!.wardId && t.wardId !== session!.wardId) return false`
> (route.ts:128). A ward-bound dispatcher therefore **only ever sees
> ward 14** — three of the mockup's four rail entries would select zero
> rows, no matter what the API accepts.
>
> A `ward` query parameter cannot fix this. It can only narrow *within*
> the session's ward; it cannot widen it, because widening a ward-bound
> dispatcher's view is precisely the authorisation boundary. So option
> (a) for `ward` is **not** the right shape either: it would add a
> parameter that can only ever return the one ward the caller already
> has.
>
> The **ward rail in the mockup is wrong**, not the API. The three
> defensible shapes are:
>
> - **(a) The rail lists only the session's ward.** One entry, no filter
>   needed, no API change. But the mockup's rail is a design element —
>   a single-entry filter is not a filter, and it loses the "scope by
>   ward" affordance the mockup is demonstrating.
> - **(b) The rail lists the wards the dispatcher's city actually
>   contains, and selecting one *narrows* rather than *widens*.** The
>   selected ward must be intersected with the session's ward, so a
>   ward-bound dispatcher can select only their own ward; a city-wide
>   admin sees all of them. This needs the `ward` param (option (a)
>   above) AND the mockup redrawn with the rail showing what the
>   signed-in dispatcher can actually reach.
> - **(c) The rail is a *scope* control, not a filter** — it changes
>   which dispatcher's queue you are looking at, and it is disabled
>   (with a visible "your ward only" note) when the session is
>   ward-bound. No API change; the rail becomes honest about the
>   boundary.
>
> **Recommendation: (b)** — it keeps the design intent (a ward rail is
> a real affordance the mockup demonstrates), it keeps the
> authorisation boundary exactly where it is, and it makes the mockup
> truthful rather than aspirational. It needs the mockup redrawn, and
> the ward list needs a source: the **dev store seeds only 2 wards**
> (`ward_14`, `ward_15` — `lib/dev-store.ts:433-458`) while
> **real Postgres seeds 50** (`prisma/seed.ts:355-377`, `for (let n =
> 1; n <= 50; n += 1)`). The route spec must therefore read the ward
> list off the API and assert against **that**, never against a
> hard-coded ward constant — the same rule the dev-store/Postgres
> divergence imposes everywhere else in this wave.

> **A fourth, separate gap: the ward list has no read path.** There is
> no dispatcher-facing endpoint that returns the wards a dispatcher may
> filter by. `GET /api/v1/admin/cities/<id>/wards` exists but is
> **admin**-gated, so a dispatcher cannot call it. Option (b) therefore
> needs a small read path — a dispatcher-scoped ward list, or the ward
> list folded into the queue response's metadata (the queue already
> returns `pendingDedupCount` alongside `tickets`, so there is a
> precedent for a counts/meta block on this response).

**The SLA countdown chip is new.** It reads the ticket's submitted timestamp and the seeded `SlaPolicy` target for its category, and shows the **remaining** time against that target — not the elapsed time, not a static "48h" label. It turns tone-coded (success / warning / danger) as the remaining time crosses the policy thresholds. The chip is a `components/ui/` primitive because the same chip appears in the triage list row, the ticket detail header and the monitor board.

> **CORRECTION — the SLA target has no read path today.** The
> `SlaPolicy` model exists in `prisma/schema.prisma` (lines 139-158)
> with `resolveHours` per category, and `prisma/seed.ts` (lines
> 162-168) upserts five policies for Dhaka — but **no application code
> reads them**, and the seed's own comment says so. There is no
> existing field on the serialized ticket carrying the target, and no
> endpoint that returns it. The chip therefore cannot be built purely
> from data the API already returns; the wave must add a read path
> (a field on the dispatcher-serialized ticket, or a lookup endpoint).
> This is the same class of change as the `ward` decision above, and
> it is the one place where the wave is **not** presentation-layer
> only. The alternative — hard-coding the five target hours in the
> component — would duplicate the seed and break the moment the seed
> changes, which is why it is not an option.

**The crew picker is a new searchable combobox.** A raw `<select>` cannot be searched, and a dispatcher's crew list is long enough that scrolling a native select is the wrong interaction. The combobox is an ARIA `combobox` with `aria-expanded`, `aria-controls`, `aria-activedescendant`, keyboard navigation (arrow keys, Enter, Escape), and a filtered list of crews. It replaces the `<select>` on the ticket detail page.

**The chart kit replaces the hand-rolled SVG.** The performance page's line chart and donut are replaced with `TrendLine` and `CategoryBar` from `components/ui/charts/`, and the SLA summary with `SlaBullet`. Every one of them ships a **visible, sortable** data table (`ChartFrame` renders it behind a real `aria-expanded` button), and `TrendLine` gives each series a distinct **dash pattern** alongside its colour, so no series is encoded by hue alone. The `SlaBullet` distinguishes its value bar from its target tick by **shape**.

**The monitor board is the first `.theme-dark` surface.** `20-dispatcher-monitor.html` and `/dispatcher/monitor` render in the dark theme, which is the product default. This is also the first place the redesign touches `tests/29-admin-dark-theme.spec.ts`'s subject matter, so that spec must stay green.

**No hand-rolled `<button>`.** Every interactive element comes from `components/ui/Button`, `IconButton`, `FilterChipGroup`, `Tabs`, `Toolbar`, `Select`, `Input` or the new `Combobox`. The six dispatcher pages currently carry 18 raw `<button>` elements; they go to zero.

**Token purity is enforced by a test, not by discipline.** `tests/unit/ui/mockup-tokens.test.ts` asserts every `var(--token)` in every mockup names a token `tokens.css` declares. The new `dispatcher-surfaces.css` is covered by the same glob.

**Mockup chrome is one shared stylesheet.** `citizen-surfaces.css` carries citizen topbar/nav/`.ticket-id` semantics — the `.ticket-id` pill is the **citizen-facing** `tkt_*` code and must not be reused for the dispatcher's internal ids. `dispatcher-surfaces.css` is therefore new, not an extension.

**Backend-agnostic route spec.** `tests/34-ui-redesign-dispatcher.spec.ts` must pass in BOTH the in-memory dev store (`CITYFIX_DEV_STORE=1`) and the real local Postgres: discover ids off the API's own responses rather than hard-coding dev-store constants, and assert counts against the API's `total` rather than the rendered row count.

### Acceptance Criteria

**Story 011 — Dispatcher mockups**

- [ ] The 5 mockups exist and are wired into `gallery.html` (which shows 21 mockups) and `tests/01-mockups.spec.ts`.
- [ ] Every `var(--token)` in every mockup — and in `dispatcher-surfaces.css` — is declared in `tokens.css`.
- [ ] Every mockup uses inline SVG icons — zero emoji.
- [ ] Every mockup's copy is Bangla-first.
- [ ] `20-dispatcher-monitor.html` renders in `.theme-dark`.
- [ ] The 5 mockups are captured at 1440×900 and 1024×768; 10 committed baselines exist.
- [ ] `npm run test:mockups` is green.
- [ ] **A human has approved the mockups**, recorded in `_progress/00-design-log.md`.

**Story 012 — Dispatcher page implementation**

- [ ] The 6 dispatcher routes are composed from `components/ui/` primitives; zero hand-rolled `<button>` elements.
- [ ] `/dispatcher` renders the 3-region layout: a filter rail, a ticket list, and a detail pane.
- [ ] Selecting a ticket updates the detail pane **in place** — no full navigation — and the ward/status filters still hold afterwards.
- [ ] The SLA countdown chip shows the **remaining** time against the target, and it appears on the triage row, the ticket detail and the monitor board.
- [ ] The crew picker is a **searchable combobox** (ARIA `combobox`, keyboard-navigable, filterable), not a `<select>`.
- [ ] The sticky action bar on the ticket detail survives scrolling.
- [ ] The trend + category charts are labelled directly and paired with a **visible, sortable** data table.
- [ ] No series is encoded by hue alone (dash pattern or direct label in addition to colour).
- [ ] Every new user-facing string is in `lib/i18n/keys.ts` with both `bn` and `en`.
- [ ] `tests/34-ui-redesign-dispatcher.spec.ts` is green, and passes in BOTH the dev store and real Postgres.
- [ ] `tests/29-admin-dark-theme.spec.ts` is green.
- [ ] `npx tsc --noEmit` is clean; `npm run test:unit` is green; `npm run check:i18n` is ok.

**Wave exit gate** — the Unit 003 exit gate, plus `tests/34-ui-redesign-dispatcher.spec.ts` green AND `tests/29-admin-dark-theme.spec.ts` green.

### Notes and known hazards

- **Baselines are captured on the CI platform**, never by hand on Windows. Noto Sans Bengali rasterises differently per platform, moving ~2–3% of pixels — above the `0.005` tolerance. This applies to the 10 new baselines for mockups 17–21 AND to the 8 still-missing baselines for mockups 13–16, which are captured in the same workflow run.
- **Playwright silently writes a missing baseline on its first run.** A local Windows run of `npm run test:mockups` will therefore create Windows-captured PNGs for mockups 17–21. They must be deleted before committing; the real baselines come from CI.
- **One dev server per `.next`.** Two `next dev` processes against the same `.next` corrupt each other's route manifest — routes 404 while still existing on disk. Stop every server, `rm -rf .next`, start ONE, warm the routes with a `curl` loop, then run.
- **`route.continue({ headers })` hangs** if the original `content-length` is replayed against a rewritten header set. Delete `content-length` before the override.
- **The pinned clock.** Local Playwright runs need `CITYFIX_SEED_NOW` set in the test process; without it, time-window assertions fail as if the product were broken. The SLA countdown chip is a time-window assertion, so it is directly exposed to this.
- **81 Playwright tests already exist across 7 dispatcher spec files** (`09`, `10`, `11`, `12`, `13`, `21`, `26`). The redesign must not break them; they are the regression net for the six routes.
- **`formatAge` / `formatDuration` / `TRANSITIONS_BY_FROM` are triplicated** across the dispatcher pages. Consolidating them into `lib/` is in scope, because the wave re-composes every page that defines them.
