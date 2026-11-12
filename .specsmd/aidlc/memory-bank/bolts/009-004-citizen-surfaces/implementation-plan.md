---
stage: plan
bolt: 009-004-citizen-surfaces
created: 2026-11-12T13:00:00Z
---

## Implementation Plan: 004-citizen-surfaces

### Objective

Deliver Wave 3 of Intent 009 — the citizen surfaces — in two stories:
design the four citizen mockups as one coherent family, take them
through the human approval gate, then re-compose the nine citizen
routes from the `components/ui/` primitives shipped in Wave 1.

The wave must preserve the shipped v1 invariants: the five-step report
flow's progress indicator, the photo cap indicator, the dedup prompt,
the vertical `Timeline` trail, the labelled before/after photo groups,
the `tkt_*` public-id pill, and citizen-facing PII stripping.

### Deliverables

**Story 009 — Citizen mockups**

1. `design-artifacts/D-Design-System/01-Visual-Design/mockups/13-home-city-activity.html` — the hub: map card + activity panel + KPI strip.
2. `.../mockups/14-report-shell.html` — the 5-step flow shell with the photo step rendered in detail.
3. `.../mockups/15-my-reports.html` — the filterable list of the citizen's own reports, with the `tkt_*` pill.
4. `.../mockups/16-report-detail-trail.html` — the vertical status trail + labelled before/after photo groups.
5. `.../gallery.html` — 4 new cards, the count updated to 16, the coverage matrix updated.
6. `.../README.md` — the file table, the tree, the coverage rationale.
7. `tests/01-mockups.spec.ts` — 4 new entries at `['LARGE', 'MEDIUM']`.
8. 8 committed Playwright baselines under `tests-mockups/baselines/01-mockups.spec.ts/`.

**Story 010 — Citizen page implementation**

9. `app/home/page.tsx` — re-composed to the `13-` mockup: KPI strip, map + activity panel, primitive-based cards.
10. `app/report/(create)/layout.tsx` + the 5 step pages — re-composed to the `14-` mockup; the `ReportShell` primitive already ships the sticky bars and the `StepIndicator`.
11. `app/report/[id]/submitted/page.tsx` — the confirmation surface.
12. `app/reports/page.tsx` — the filterable list, with the `tkt_*` pill.
13. `app/reports/[id]/page.tsx` — the detail trail with the vertical `Timeline` and the before/after photo groups.
14. `lib/i18n/keys.ts` — every new user-facing string, `bn` + `en`.
15. `tests/33-ui-redesign-citizen.spec.ts` — the route spec.

### Dependencies

- **Wave 1 (`009-002-design-foundation`)** — the 37 `components/ui/` primitives, the Phosphor icon registry (`lib/ui/icon-map.ts`), and the token system. Every page composes from these; no new primitive may be invented inside a page.
- **Wave 2 (`009-003-auth-and-public-surfaces`)** — the app header, the report-flow chrome conventions, the i18n key shape, and the `tests/32-ui-redesign-auth.spec.ts` backend-agnostic spec pattern (discovered id triple, ticket id read from the response body, chip counts asserted against the API's own `total`).
- **`lib/serializers/ticket.ts`** — the citizen-facing serializer. Every citizen route renders through it; internal fields (`assignedCrewId`, `internalNote`) must never reach the DOM.
- **`lib/i18n/keys.ts`** — the typed key registry. `t(key, vars)` is the only way to surface user copy; the registry is typed so a missing key fails the build.

### Technical Approach

**Presentation-layer only.** The API surface, the role model, the transports and the data model are unchanged. Every fetch, query parameter, cursor, limit, validation rule, role gate and PII-stripping path stays byte-identical to the pre-existing implementation. This is the same constraint Wave 2 held to, and it is why the wave can be re-composed without a data migration.

**Mockups first, then the gate, then the pages.** The mockups are static HTML built on `tokens.css` only, wired into the gallery and the baseline spec. They are the human approval gate — recorded in `_progress/00-design-log.md` — and no page in this wave is implemented before that sign-off.

**Token purity is enforced by a test, not by discipline.** `tests/unit/ui/mockup-tokens.test.ts` asserts every `var(--token)` in every mockup names a token `tokens.css` declares. An undefined `var()` resolves to nothing and silently drops the declaration it belongs to — that is how the Wave 1.1 `--color-primary-on` → `--color-on-primary` rename broke seven mockups without a single console error. The test is the guarantee.

**Icons are inline SVG in the mockups and Phosphor in the pages.** The mockups must render offline and statically, so they cannot import a React icon component; they need real icon geometry, not emoji. The pages use `ICONS` from `lib/ui/icon-map.ts`.

**The `tkt_*` public id, never a raw internal id.** Intent 008 introduced the `tkt_*` pill. Wave 3 carries it on both the list and the detail, and the spec asserts that no raw internal id is visible anywhere on a citizen surface.

**Backend-agnostic route spec.** The spec must pass in BOTH the in-memory dev store (`CITYFIX_DEV_STORE=1`) and the real local Postgres. That means: discover the `(cityId, categoryId, wardId)` triple off the first row of `GET /api/v1/activity/public` rather than hard-coding dev-store constants (a foreign city id is rejected with 403 `cross_city_forbidden` before the route looks at the ward), read the ticket id from the response body (the dev store mints `tkt_*`, Postgres mints cuids), and assert filter-chip counts against the API's own `total` rather than the rendered row count (the feed paginates the list, the chips count over every ticket).

**No hand-rolled `<button>`.** Wave 2 had to sweep eleven of them out of six surfaces. Every interactive element in this wave comes from `components/ui/Button`, `IconButton`, `FilterChipGroup`, `Tabs` or `Toolbar`.

### Acceptance Criteria

**Story 009 — Citizen mockups**

- [ ] The 4 mockups exist and are wired into `gallery.html` (which shows 16 mockups) and `tests/01-mockups.spec.ts`.
- [ ] Every `var(--token)` in every mockup is declared in `tokens.css`.
- [ ] Every mockup uses inline SVG icons — zero emoji.
- [ ] Every mockup's copy is Bangla-first.
- [ ] The 4 mockups are captured at 1440×900 and 1024×768; 8 committed baselines exist.
- [ ] `npm run test:mockups` is green.
- [ ] **A human has approved the mockups**, recorded in `_progress/00-design-log.md`.

**Story 010 — Citizen page implementation**

- [ ] The 9 citizen routes are composed from `components/ui/` primitives; zero hand-rolled `<button>` elements.
- [ ] The report flow keeps its progress indicator, the photo cap indicator (`1 / 3 ছবি`), and the dedup prompt with both options explained.
- [ ] The citizen detail page keeps the vertical `Timeline` trail with per-step icons + timestamps, the labelled before/after photo groups, and the `tkt_*` pill.
- [ ] No raw internal id is visible on any citizen surface.
- [ ] Every new user-facing string is in `lib/i18n/keys.ts` with both `bn` and `en`.
- [ ] `tests/33-ui-redesign-citizen.spec.ts` is green, and passes in BOTH the dev store and real Postgres.
- [ ] `npx tsc --noEmit` is clean; `npm run test:unit` is green; `npm run check:i18n` is ok.

**Wave exit gate** — the Unit 003 exit gate, plus `tests/33-ui-redesign-citizen.spec.ts` green.

### Notes and known hazards

- **One dev server per `.next`.** Two `next dev` processes against the same `.next` directory corrupt each other's route manifest — routes 404 while still existing on disk, and the webpack cache logs `ENOENT` on paths it has already written. It looks exactly like a code defect. Sequence: stop every server, `rm -rf .next`, start ONE server, warm the routes with a `curl` loop, then run. A first compile takes ~20s, which exceeds a 30s test timeout if the spec navigates to a route as it compiles.
- **`route.continue({ headers })` hangs** if you replay the original `content-length` against a rewritten header set. Delete `content-length` before the override and the transport recomputes it.
- **The pinned clock.** Local Playwright runs need `CITYFIX_SEED_NOW` set in the test process; without it, time-window assertions fail as if the product were broken.
- **Baselines are captured on the CI platform**, never by hand on Windows. A Google Fonts metric difference between runs silently moves a page height and breaks a baseline; the open fix is to self-host Noto Sans Bengali before the Wave 7 regeneration.
