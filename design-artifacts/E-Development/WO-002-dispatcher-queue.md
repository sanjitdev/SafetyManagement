# Work Order — WO-002 Dispatcher Queue

**Created:** 2026-10-04
**Author:** Freya (from approved Phase 2/3/4 artifacts)
**Status:** Ready for PRD
**Priority:** Critical
**Depends on:** WO-000 Platform Foundation

---

## Objective

Build the **dispatcher-facing** work surface — what Habib the Handler sees and does at his desk to run his ward's morning queue. 7 pages, desktop-first (1440 × 900 design canvas), Bangla-first.

Without this surface, tickets accumulate and nothing gets assigned. The trust loop fails because citizens never see "routed" status changes turn into "in progress".

---

## Why This Matters

From the Feature Impact Analysis:

- **#5 Dispatcher queue dashboard** (FIA 19) — addresses Habib's +3 (Make daily chaos manageable, FIA 14), N3 (Stop losing track of who's doing what, FIA 14), N1 (Stop being the dead end, FIA 14), N6 (Stop the WhatsApp-and-phone chaos, FIA 14). **The highest-leverage feature inside the city corporation.**
- **#10 Audit log / searchable ticket history** (FIA 13) — addresses Habib's P5 (Build a record that survives paper, FIA 12) and N5 (No answer when citizens call back, FIA 13). The platform cannot answer "what happened to this?" without it.
- **#6 Public ward-level dashboard** (FIA 16) — addresses Habib's N4 (Stop looking passive to supervisor, FIA 12) by making overdue tickets a supervisor concern, not a Habib concern. *(In v1 this is the internal ward performance snapshot — public version is out of scope.)*
- **#14 Dispatcher performance dashboard** (FIA 9, Medium) — gives Habib upward evidence for his own reviews.

**Headline from Persona 03:** Habib's negative forces cluster at FIA 14 — being the dead end, losing track, channel chaos. The cost of friction inside city corp is as much a barrier as any citizen-side feature. The dispatcher queue dashboard is the *single most important surface* for whether Habib adopts the platform.

---

## Scope

### In scope (7 pages — `02-habib-the-handler/`)

| Page | Route | Purpose |
|---|---|---|
| 2.1 Login (web/desktop) | `/dispatch/login` | Authenticated web entry; role = dispatcher |
| 2.2 Daily Queue Dashboard | `/dispatch/queue` | 3-region layout: filter rail + ticket list + detail |
| 2.3 Ticket Detail | `/dispatch/tickets/:id` | Full ticket view: photos, map, status trail, internal notes, assign action |
| 2.4 Assign to Crew (modal) | (modal on 2.3) | Pick crew by ward + department; 2-tap assignment |
| 2.5 Monitor Updates (live feed) | `/dispatch/monitor` | Real-time view of in-progress tickets; polling-based |
| 2.6 Resolve Confirmation (modal) | (modal on 2.3) | Confirm resolution with notification preview to citizen |
| 2.7 Ward Performance Snapshot | `/dispatch/performance` | Internal dashboard: queue size, aging, SLA breaches by category |

### Out of scope

- Auth implementation → WO-000
- Ticket schema, audit log, status trail storage → WO-000
- Citizen UI, field crew UI, admin UI → WO-001, WO-003, WO-004
- Public ward dashboard (Feature #6 public version) → deferred per `06-feature-impact.md` Deprioritized section

---

## Specs & Scenarios Affected

**Scenario:** `02-habib-the-handler-runs-his-wards-morning-queue.md`

**All 7 page specs:**
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.1-login-web-desktop/2.1-login-web-desktop.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.2-daily-queue-dashboard/2.2-daily-queue-dashboard.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.3-ticket-detail/2.3-ticket-detail.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.4-assign-to-crew/2.4-assign-to-crew.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.5-monitor-updates/2.5-monitor-updates.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.6-resolve-confirmation/2.6-resolve-confirmation.md`
- `design-artifacts/C-UX-Scenarios/02-habib-the-handler/2.7-ward-performance-snapshot/2.7-ward-performance-snapshot.md`

**Visual mockup:**
- `design-artifacts/D-Design-System/01-Visual-Design/mockups/05-daily-queue-dashboard.html` → page 2.2

**Strategy inputs:**
- `design-artifacts/A-Product-Brief/01-product-brief.md` — dispatcher section
- `design-artifacts/B-Trigger-Map/03-persona-habib-the-handler.md` — full persona + FIA forces
- `design-artifacts/B-Trigger-Map/06-feature-impact.md` — Features #5, #6, #10, #14

---

## Dependencies

- **WO-000 Platform Foundation** — must complete first. This WO consumes: dispatcher auth (bound to city + ward + department), `GET /tickets?scope=ward&status=...`, `POST /tickets/:id/assign`, `POST /tickets/:id/resolve`, `GET /cities/:id/crews`, audit log query, status trail.

---

## Acceptance Criteria

### Login (2.1)

- [ ] Web/desktop layout; 1440 × 900 design canvas
- [ ] Dispatcher credentials validated against role `dispatcher` and city scope
- [ ] Wrong-role / wrong-city login attempts rejected with clear BN/EN error
- [ ] Session persists across page reloads; logout clears

### Daily Queue Dashboard (2.2)

- [ ] 3-region layout: filter rail (left) + ticket list (center) + detail (right) — per UX Review confirmation #3 (no change); collapsible filter rail on smaller laptops noted as responsive fallback
- [ ] Filters: status, age (overdue highlighted), category, ward — multi-select
- [ ] List shows ticket cards: thumbnail, ID, category, ward, age, status pill, assignee (if any)
- [ ] Sortable by age, status, priority (computed: age × category-SLA)
- [ ] Polling refreshes list every 10–30s; visual indicator when new tickets arrive
- [ ] Visual must match `mockups/05-daily-queue-dashboard.html` to within `tolerance: 0.005`

### Ticket Detail (2.3)

- [ ] Full ticket view: citizen photo(s), map pin, category, ward, reporter (anonymized phone per privacy), note, status trail with actor identities visible (internal-only fields)
- [ ] Internal notes section (not visible to citizen)
- [ ] Audit log access: who has touched it and when
- [ ] "Assign to crew" button opens modal 2.4
- [ ] "Mark resolved" button opens modal 2.6

### Assign to Crew (2.4)

- [ ] Crew list filtered by ward + department match (Feature #5: assign in 2 taps)
- [ ] Search/filter for crew member
- [ ] Confirm button writes `POST /tickets/:id/assign`; ticket transitions to `in_progress` per Feature #2
- [ ] Dispatcher's name recorded in status trail as the assigning actor
- [ ] Success: ticket list updates; toast confirms assignment

### Monitor Updates (2.5)

- [ ] Real-time feed of in-progress tickets (Rashid's active jobs in this ward)
- [ ] Each item: ticket ID, category, assignee crew member, last update timestamp, status pill
- [ ] Polling-based (10–30s); WebSocket deferred to v1.1
- [ ] Clicking a ticket deep-links to 2.3 with that ticket selected

### Resolve Confirmation (2.6)

- [ ] Modal confirms resolution with notification preview to citizen (UX Review confirmation #7 — no change)
- [ ] "Resolve" button writes `POST /tickets/:id/resolve`; status transitions to `resolved`
- [ ] Rashid's "after" photo URL is associated with the resolved ticket
- [ ] Notification trigger fires to citizen (consumed via WO-000 PLAT-REQ-006)

### Ward Performance Snapshot (2.7)

- [ ] Internal dashboard: open ticket count, aging distribution, category breakdown, SLA breaches (configurable per category)
- [ ] Date range selector (today, this week, this month, custom)
- [ ] Exportable as CSV (Feature #14 — gives Habib upward evidence)
- [ ] Internal Aamir surface in v1 (public version deferred)

### Cross-cutting

- [ ] Bangla default; English toggle available
- [ ] No dark-mode override (Habib's optional dark theme documented in tokens.css but not required for v1)
- [ ] All internal fields visible to dispatcher (status trail actors, internal notes, assigned crew IDs)
- [ ] Browser-verified on Chromium desktop viewport (1440 × 900)

---

## Do Not Change

- The **3-region dashboard layout** (UX Review confirmation #3). Filter rail collapses on smaller laptops but does not move.
- The **assign-in-2-taps** interaction (Feature #5 success criterion).
- The **dispatcher scope** (city + ward + department binding). Cross-scope ticket visibility is a privacy violation.
- The **resolve notification preview** in modal (UX Review confirmation #7).
- The **internal-only fields** boundary — dispatchers see internal notes and actor names; citizens do not.
- The **Feature #14 deferred-to-internal** decision. Public ward dashboard is out of scope for v1.

---

## Reference Files

**Page specs (7):** see Specs section above.

**Visual mockup:** `design-artifacts/D-Design-System/01-Visual-Design/mockups/05-daily-queue-dashboard.html` (page 2.2).

**Design system:** `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`.

**Strategy:** `design-artifacts/A-Product-Brief/01-product-brief.md`, `design-artifacts/B-Trigger-Map/{03-persona-habib-the-handler,06-feature-impact}.md`.

**Tests:**
- `tests/01-mockups.spec.ts` — visual regression on the 1 desktop mockup
- `tests-mockups/baselines/01-mockups.spec.ts/05-daily-queue-dashboard.png`

**Prior WO:** `design-artifacts/E-Development/WO-000-platform-foundation.md`

---

## Open Questions for Mimir

1. **Filter rail collapse breakpoint.** Spec says "collapsible filter rail on smaller laptops noted as responsive fallback." What pixel width triggers collapse? Recommendation: ≤ 1280px viewport.
2. **SLA breach thresholds per category.** Aamir sets these in WO-004, but default values for v1 need committing. Recommendation: defaults documented in `000-tech-audit.md` or `000-PRD.md` (cross-WO); Aamir overrides per-city.
3. **CSV export scope.** Ward performance snapshot only, or full ticket list? Recommendation: snapshot metrics only (open count, aging, breaches); full ticket export is a v1.1 feature.