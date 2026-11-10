---
standard: intents-index
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-11-09T00:00:00Z
---

# Intents Index

The CityFix memory-bank's intent layer. Every intent
is one persona WO or one platform layer; each lives
in its own folder and ships a `requirements.md`,
`units.md`, plus one folder per unit containing a
`unit-brief.md` and the unit's stories.

## Intents

| Slug | Title | Status | Units | Stories |
|------|-------|--------|-------|---------|
| [001-platform-foundation](001-platform-foundation/requirements.md) | Platform Foundation (WO-000) | complete | 3 | 11 |
| [002-citizen-report-flow](002-citizen-report-flow/requirements.md) | Citizen Report Flow (WO-001) | **complete** | 5 | 17 |
| [003-dispatcher-queue](003-dispatcher-queue/requirements.md) | Dispatcher Queue (WO-002) | **complete** | 7 | 9 |
| [004-field-crew-app](004-field-crew-app/requirements.md) | Field Crew App (WO-003) | **complete** | 4 | 6 |
| [005-admin-city-setup](005-admin-city-setup/requirements.md) | Admin City Setup (WO-004) | **complete** | 6 | 9 |
| [006-citizen-home-and-report-redesign](006-citizen-home-and-report-redesign/requirements.md) | Citizen Home + Report Redesign (v1.1) | **complete** | 3 | 5 |
| [007-citizen-resolution-visibility](007-citizen-resolution-visibility/requirements.md) | Citizen Resolution Visibility (Bolt 007) | **complete** | 3 | 5 |
| [008-ux-polish-from-demo](008-ux-polish-from-demo/requirements.md) | UX Polish from Slow-motion Demo | **complete** | 3 | 5 |
| [009-ui-redesign](009-ui-redesign/requirements.md) | UI Redesign (31 routes, Swiss/Minimal civic) | **in-progress** | 8 | 18 |

Intent 002 closed on 2026-10-11: all 5 bolts
(002-001 through 002-005) shipped to `done`;
story `016-push-subscribe` is explicitly
`pending` (v1.1) and recorded in the bolt
decision + the intent's `units.md`. Intent 003
closed on 2026-10-12: bolts 003-001 through
003-005 all shipped to `done` (the map view,
originally v1.1 deferred, was promoted to v1
at the start of Bolt 003-005 per the design
log's bolt-progress note). Intent 004 closed
on 2026-10-12: bolts 004-001 through 004-004
all shipped to `done`. Intent 005 (Admin
City Setup) closed on 2026-10-12. Intent 006
(Citizen Home + Report Redesign, v1.1) closed
on 2026-10-13. Intent 007 (Citizen Resolution
Visibility) closed on 2026-10-13 with bolts
007-001 + 007-002. Intent 008 (UX Polish from
Slow-motion Demo) opened 2026-10-14 with 3
units + 5 stories; the audit catalog is grounded
in the 21 frames captured by
`tests/22-slow-motion-e2e-demo.spec.ts`. Its
first three bolts (008-001 i18n copy fixup,
008-002 visible chrome, 008-003 crew after-photo
file upload) all shipped and the intent closed;
a metadata reconciliation on 2026-10-27
confirmed the bolts had landed and brought the
memory-bank status fields up to date.

Four more deferred surfaces shipped in a
2026-10-27 batch build, adding two units to
Intent 003 and two to Intent 005:

- **Bolt 008-013** — dispatcher live monitor
  (Intent 003 Unit 006, story DISP-008).
- **Bolt 008-014** — dispatcher performance
  reporting (Intent 003 Unit 007, story
  DISP-009).
- **Bolt 008-015** — admin user management
  (Intent 005 Unit 005, story ADM-008).
- **Bolt 008-016** — admin adoption dashboard
  (Intent 005 Unit 006, story ADM-009).

The same build landed the platform-layer gaps
(blob storage, the crew offline write queue, and the `Crew` / `SlaPolicy`
schema) and the CI + coverage tooling the team policy required. The
Prisma migration `20261027140000_platform_gaps`
is authored but **not applied** — the configured
Neon instance was unreachable (`P1001`); apply
with `npx prisma migrate deploy`.

## Intent 009 — UI Redesign

Intent 009 opened 2026-11-02 as a brown-field
frontend feature: a full-surface redesign of all 31 routes in the
locked Accessible + Swiss/Minimal civic direction. The 8-unit
decomposition is one unit per wave — CI unblock, design foundation,
auth + public, citizen, dispatcher, crew, admin, verification. Waves
0 and 1 have shipped (commits `45062d1` and `b279228`); the Wave 2
mockups (`08`–`12`) are authored and baselined, and the Wave 2 page
implementation awaits human mockup approval.

Unit status as of 2026-11-09: 001 and 002 shipped,
003 mockups shipped with page implementation pending,
004–008 not started.

- **Bolt 008-013** — dispatcher live monitor
  (Intent 003 Unit 006, story DISP-008).
- **Bolt 008-014** — dispatcher performance
  reporting (Intent 003 Unit 007, story
  DISP-009).
- **Bolt 008-015** — admin user management
  (Intent 005 Unit 005, story ADM-008).
- **Bolt 008-016** — admin adoption dashboard
  (Intent 005 Unit 006, story ADM-009).

The same build landed the platform-layer gaps
(blob storage, the crew offline write queue, and
the `Crew` / `SlaPolicy` schema) and the CI +
coverage tooling the team policy required. The
Prisma migration `20261027140000_platform_gaps`
is authored but **not applied** — the configured
Neon instance was unreachable (`P1001`); apply
with `npx prisma migrate deploy`.

## Status legend

| Status | Meaning |
|--------|---------|
| `draft` | Requirements captured; units and stories proposed; not yet decomposed |
| `in-progress` | Active build; the Construction Agent is shipping bolts |
| `complete` | All units shipped; Construction Verification Command green |

## Order of authorship (if rebuilding from scratch)

1. **Intent 001** (Platform Foundation) — always first;
   the walking skeleton.
2. **Intent 002** (Citizen Report Flow) — first
   persona WO; gates on Intent 001.
3. **Intent 003** (Dispatcher Queue) — second persona
   WO; gates on Intent 002.
4. **Intent 004** (Field Crew App) — third persona WO;
   gates on Intent 003.
5. **Intent 005** (Admin City Setup) — fourth persona
   WO; gates on Intent 004.

For CityFix, Intents 001-008 are closed. Intent 009
(UI Redesign) is the active build as of 2026-11-09.

## Cross-references

- **Standards**: `../standards/index.md`.
- **Story index**: `../story-index.md`.
- **Bolt plan**: `../bolts/` (Construction-Agent-managed).
- **Ideation trail — Intent 002**: `002-citizen-report-flow/ideation/` —
  the Ideation-phase artifacts (intent capture, feasibility, scope
  definition, rough mockups) for WO-001, moved in from the AIDLC lane
  on 2026-11-10 when that stale intent directory was retired. These
  record *why* v1 looks the way it does; `requirements.md` and
  `units.md` one level up record *what* was built. See that folder's
  `README.md`.

## Design system

One design system lives in `design-artifacts/D-Design-System/`.
Intent 009's `ui-ux-pro-max` runs deliberately did **not** use the
skill's `--persist` output, so there is exactly one source of truth
rather than two competing systems. The `design-system/<slug>/MASTER.md`
file was not written.
