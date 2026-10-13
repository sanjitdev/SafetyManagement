---
standard: intents-index
phase: standards
status: complete
created: 2026-10-11T18:00:00Z
updated: 2026-10-12T20:00:00Z
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
| [003-dispatcher-queue](003-dispatcher-queue/requirements.md) | Dispatcher Queue (WO-002) | **complete** | 5 | 7 |
| [004-field-crew-app](004-field-crew-app/requirements.md) | Field Crew App (WO-003) | **complete** | 4 | 6 |
| [005-admin-city-setup](005-admin-city-setup/requirements.md) | Admin City Setup (WO-004) | **complete** | 4 | 7 |

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
City Setup) enters active build on 2026-10-12
with 4 units + 7 stories; the `units.md` is
promoted from `draft` to `in-progress` and
the per-unit briefs + story specs are filed.

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

For CityFix, Intents 001-004 are now substantially
built (5/5, 4/4, 4/4, and the platform layer
respectively). Intent 005 is the last persona WO
and is currently in active build as of 2026-10-12.

## Cross-references

- **Standards**: `../standards/index.md`.
- **Story index**: `../story-index.md`.
- **Bolt plan**: `../bolts/` (Construction-Agent-managed).
