# Work Order — WO-004 Admin City Setup

**Created:** 2026-10-04
**Author:** Freya (from approved Phase 2/3/4 artifacts)
**Status:** Ready for PRD
**Priority:** Critical
**Depends on:** WO-000 Platform Foundation

---

## Objective

Build the **admin-facing** surface — what Aamir the Administrator uses to set up a new city (Chattogram is the worked example), provision users, draw ward boundaries, and monitor post-launch adoption. 7 pages, desktop-first (1440 × 900), Bangla-first.

Without this surface, the platform cannot scale beyond Dhaka. Goal 3 (operate leanly across cities) and the admin coverage from Feature Impact Analysis all depend on it.

---

## Why This Matters

From the Feature Impact Analysis:

- **#11 Per-city configuration** (FIA 15) — directly addresses Aamir's +1 (Land the platform cleanly in his city, FIA 15), +4 (Discoverable and reversible config, FIA 13), +5 (Habib and Rashid see what he configured, FIA 14), and negatively addresses N6 (Stop per-city rebuild, FIA 13). **Gating for v1.1 multi-city.**
- **#19 Ward-boundary editor** (FIA 13) — directly addresses Aamir's +1 (FIA 15), +4 (FIA 13), N2 (Stop hidden complexity, FIA 13), N3 (Stop misalignment between config and downstream UX, FIA 13). The polygons produced here are the same polygons every dispatcher and citizen map reads from.
- **#20 User provisioning & role assignment** (FIA 14) — directly addresses Aamir's +1 (FIA 15), +5 (FIA 14), +6 (FIA 12). WebAuthn mandatory for any admin write action.
- **#21 Post-launch adoption dashboard** (FIA 13) — directly addresses Aamir's +3 (See adoption metrics climbing, FIA 13) and negatively addresses N4 (Stop being on the hook for every glitch, FIA 12).
- **#22 Configuration audit trail** (FIA 12) — directly addresses Aamir's +6 (Defend setup decisions with audit trail, FIA 12) and +4 (Discoverable and reversible config, FIA 13).

**Headline from Persona 05:** Aamir is the silent enabler — every ticket Habib routes and Rashid fixes depends on his configuration working. His top force ("land the platform cleanly in his city") scored FIA 15, matching Rashid's operational forces. Six of his negative forces cluster at FIA 13 — admin UX is a higher-friction surface than it looks.

---

## Scope

### In scope (7 pages — `04-aamir-the-administrator/`)

| Page | Route | Purpose |
|---|---|---|
| 4.1 Admin Console Login | `/admin/login` | WebAuthn-gated auth; role = admin |
| 4.2 Cities Overview Dashboard | `/admin/cities` | List of cities with adoption snapshot |
| 4.3 City Setup — Basic Info | `/admin/cities/:id/setup` | Name, language default, Dhaka template pre-population trigger |
| 4.4 Departments & Categories | `/admin/cities/:id/taxonomy` | CRUD on categories and departments; dedup radius; photo caps per category |
| 4.5 Wards & Boundaries | `/admin/cities/:id/wards` | Map editor with polygon-draw tools; preview before publish |
| 4.6 User Provisioning | `/admin/cities/:id/users` | Create / disable dispatcher, crew, admin accounts; role binding; WebAuthn policy |
| 4.7 Post-launch Adoption Dashboard | `/admin/cities/:id/adoption` | Active dispatchers, active crews, citizen reports/day, time-to-resolution trend |

### Out of scope

- Custom role builder (Feature #18 deprioritized per `06-feature-impact.md`)
- Public adoption dashboard (Deprioritized per `06-feature-impact.md` — internal Aamir surface only)
- Authority-influenced routing rules (Feature #18 deprioritized)
- Public ward dashboard (Feature #6 — public version deferred; internal dispatcher view in WO-002)

---

## Specs & Scenarios Affected

**Scenario:** `04-aamir-the-administrator-sets-up-chattogram.md`

**All 7 page specs:**
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.1-admin-console-login/4.1-admin-console-login.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.2-cities-overview-dashboard/4.2-cities-overview-dashboard.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.3-city-setup-basic-info/4.3-city-setup-basic-info.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.4-departments-categories/4.4-departments-categories.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.5-wards-boundaries/4.5-wards-boundaries.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.6-user-provisioning/4.6-user-provisioning.md`
- `design-artifacts/C-UX-Scenarios/04-aamir-the-administrator/4.7-post-launch-adoption-dashboard/4.7-post-launch-adoption-dashboard.md`

**Visual mockups:** none (admin pages are not in the 5 hero mockups).

**Strategy inputs:**
- `design-artifacts/A-Product-Brief/01-product-brief.md` — admin role, Goal 3 (operate leanly across cities)
- `design-artifacts/B-Trigger-Map/05-persona-aamir-the-administrator.md` — full persona + FIA forces
- `design-artifacts/B-Trigger-Map/06-feature-impact.md` — Features #11, #19, #20, #21, #22

---

## Dependencies

- **WO-000 Platform Foundation** — must complete first. This WO consumes: admin auth with WebAuthn, `CRUD /cities`, `CRUD /cities/:id/categories`, `CRUD /cities/:id/departments`, `CRUD /cities/:id/wards` (with GeoJSON polygon), `CRUD /cities/:id/users`, `GET /cities/:id/metrics`, audit log query.

---

## Acceptance Criteria

### Admin Console Login (4.1)

- [ ] **WebAuthn mandatory** for any admin write action (UX Review confirmation #5 — no change). UX Review confirmation #10: WebAuthn heavier than rest of platform — confirmed.
- [ ] Hardware-key (YubiKey-class) primary; platform authenticator (Touch ID / Windows Hello) fallback
- [ ] Wrong-role / no-WebAuthn-capable-device login attempts rejected with clear BN/EN guidance

### Cities Overview Dashboard (4.2)

- [ ] List of cities Aamir administers; each row: name, status, active dispatchers count, active crews count, citizen reports/day
- [ ] Quick actions: "Set up new city", "View adoption"
- [ ] Filter by status (live, setup-in-progress, paused)

### City Setup — Basic Info (4.3)

- [ ] Form: city name, default language (Bangla default), timezone, contact email
- [ ] **"Apply Dhaka template"** button pre-populates categories, departments, ward template, language defaults (Feature #11 + design log cross-cutting decision)
- [ ] Preview before commit; one-way enable
- [ ] On commit, all data persisted; subsequent edits recorded in audit log

### Departments & Categories (4.4)

- [ ] CRUD on categories (name, icon, photo caps [default 3, narrow 2], SLA thresholds)
- [ ] CRUD on departments (name, ward assignment, contact info)
- [ ] Category-to-department mapping (which department receives which category)
- [ ] **Dedup radius** configurable per city (Feature #3 — Aamir's lever)
- [ ] All changes recorded in audit log with actor + before/after values

### Wards & Boundaries (4.5)

- [ ] Map editor with polygon-draw tools (Feature #19)
- [ ] Ward naming, default category-to-ward routing rules
- [ ] **Preview before publish** — Aamir sees the same polygons dispatcher and citizen maps will read from
- [ ] Polygons stored as GeoJSON; consumable by all map surfaces (WO-001 home, WO-002 detail, WO-003 assignment)
- [ ] All changes recorded in audit log

### User Provisioning (4.6)

- [ ] Create dispatcher / crew / admin accounts (Feature #20)
- [ ] Bind each to (city, ward, department); ward binding enforced by WO-000
- [ ] WebAuthn policy per role: mandatory for admin writes, optional for dispatcher/crew in v1
- [ ] Role list is **fixed** (admin / dispatcher / crew / citizen) — **no custom role builder** (Feature #18 deprioritized)
- [ ] Disable account (soft-delete) with audit trail
- [ ] All changes recorded in audit log

### Post-launch Adoption Dashboard (4.7)

- [ ] City-scoped view (Feature #21)
- [ ] Metrics: active dispatchers, active field crews, citizen reports/day, time-to-resolution trend, dedup effectiveness
- [ ] Date range selector
- [ ] Exportable as CSV
- [ ] **Internal Aamir surface only** — public version explicitly out of scope per `06-feature-impact.md`

### Cross-cutting

- [ ] Bangla default; English toggle available
- [ ] Every config change flows to the audit log (Feature #22)
- [ ] Reversible: every change has a "revert to previous" action in the same UI
- [ ] Browser-verified on Chromium desktop viewport (1440 × 900)

---

## Do Not Change

- **WebAuthn-mandatory-for-admin-writes** policy (UX Review confirmation #5).
- **Custom role builder is out of scope** (Feature #18 deprioritized). The role list is fixed.
- **Public adoption dashboard is out of scope** (Deprioritized in `06-feature-impact.md`).
- **Dhaka template pre-population pattern** (cross-cutting decision; Goal 3 depends on it).
- **Preview-before-publish** for ward boundary changes (non-negotiable — the polygons produced are read by every map surface).
- **Audit trail for every config change** (Feature #22 — non-negotiable for Aamir's +6 and +4).

---

## Reference Files

**Page specs (7):** see Specs section above.

**Design system:** `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`.

**Strategy:** `design-artifacts/A-Product-Brief/01-product-brief.md`, `design-artifacts/B-Trigger-Map/{05-persona-aamir-the-administrator,06-feature-impact}.md`.

**Tests:** no hero mockup baseline for admin pages — visual regression on built pages against spec mocks must be added during build per `tests-mockups/README.md`.

**Prior WO:** `design-artifacts/E-Development/WO-000-platform-foundation.md`

---

## Open Questions for Mimir

1. **Map editor library.** Leaflet.draw vs. Mapbox GL Draw vs. custom. Recommendation: Leaflet.draw for v1 (no API key; matches lean-ops Goal 3; polygon GeoJSON round-trips cleanly).
2. **WebAuthn library.** Recommendation: `@simplewebauthn/server` on backend + `@simplewebauthn/browser` on frontend.
3. **CSV export scope.** Adoption metrics only, or full ticket breakdown by ward? Recommendation: metrics only for v1; per-ward breakdown deferred.
4. **Dhaka template versioning.** When Aamir "applies Dhaka template", does he get the current Dhaka config snapshot or the latest one? Recommendation: latest (templates evolve); audit log records the snapshot used.