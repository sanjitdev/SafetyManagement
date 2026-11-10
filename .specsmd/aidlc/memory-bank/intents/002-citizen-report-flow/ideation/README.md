# Ideation Trail — WO-001 Citizen Report Flow

These are the **Ideation phase** artifacts for WO-001, preserved from the
AIDLC lane when that intent directory was retired on 2026-11-10.

They answer *why* v1 looks the way it does — the feasibility call, the
scope boundary, the intent statement, the stakeholder map and the
rough mockups — as distinct from the `requirements.md` and `units.md`
one level up, which record *what* was built.

## What is here

| Path | Stage | What it records |
|---|---|---|
| `intent-capture/` | Intent Capture | The intent statement, the stakeholder map (Rahim / Habib / Rashid / Aamir), the Q&A asked of the human, and the review pass over it |
| `feasibility/` | Feasibility & Constraints | The GO verdict, the 8 resolved assumptions (Q1–Q8), the constraint register, and the RAID log — including **R-1**, the geofence-reject UX gap |
| `market-research/` | Market Research | Questions only. This stage was **skipped** in the scope (`1.2`), so it holds the questions that were prepared but never answered |
| `scope-definition/` | Scope Definition | The scope document, the intent backlog, the swarm contributions (scope boundary, sequencing, surface detail), and the questions asked |
| `rough-mockups/` | Rough Mockups | The 12 wireframes covering pages 1.1–1.12, the end-to-end flow diagram, and the information-architecture outline |

## Provenance

Authored in the AIDLC lane at
`aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.

That intent's `aidlc-state.md` was last written **2026-10-06** and was
still showing the Ideation phase while the project had in fact shipped
through specsmd Intent 009 — the file was about two months behind
reality. Rather than carry a stale state file forward, the ideation
artifacts were moved here and the stale intent directory was retired.

**Content is unchanged** except for two mechanical edits applied during
the move:

1. **Self-referential paths** were rewritten from the old
   `aidlc/spaces/default/intents/261004-.../ideation/...` prefix to the
   new `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/...`
   prefix. Nine files were affected.
2. **A provenance header** was prepended to each markdown file, marking
   where the artifact came from.

The AIDLC **method tree** (`aidlc/spaces/default/memory/` — `org.md`,
`team.md`, `project.md`, the four phase rule files) was **not** moved and
**not** retired. It remains live and is still what `.puku-cli/rules/aidlc.md`
imports into every session's ambient context.

## A note on the decision trail

Several durable decisions in `project.md` and `_progress/00-design-log.md`
trace back to files in this folder — the 50 m dedup radius, the
city-boundary geofence, indefinite photo retention with citizen-initiated
delete, the bilingual toggle at splash, and the Mapbox-free-to-paid choice
over OSM-everywhere. The feasibility Q&A and the RAID log are where the
*reasoning* behind those sits, as opposed to the decision itself. That
reasoning is not reproducible from the decision records alone, which is
why this folder was preserved rather than deleted.
