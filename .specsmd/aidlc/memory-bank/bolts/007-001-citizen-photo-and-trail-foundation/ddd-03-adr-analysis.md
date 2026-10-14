---
bolt: 007-001-citizen-photo-and-trail-foundation
stage: design
stage_step: 3-adr-analysis
status: complete
created: 2026-10-13T20:55:00Z
---

# ADR Analysis — Bolt 007-001

## Decision

**No ADR created for this bolt.**

## Rationale

The two open implementation choices finalized in Stage 2 are
**local** decisions, not project-wide policy. They do not meet the
ADR-worthy bar documented in the DDD bolt type definition:

1 - **Migration shape (Option A — additive `TicketPhoto` row)** — This
   is a data-modelling decision for one feature. ADR-003 already
   covers the broader "Prisma 5.22 + Postgres 16 + dev-store mirror"
   policy. The specific choice between additive rows vs split
   columns is captured in the unit-brief and the technical design;
   it does not constrain future bolts.

2 - **Filter strategy (Replace vs Omit)** — This is a UX-rendering
   decision for one feature. It is captured in the unit-brief, the
   technical design, and the regression-guard unit test (which
   documents the marker rewrite shape). Future bolts that need
   similar filtering will read the existing code, not need an ADR.

**Alternatives considered**:

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Create one ADR for the migration shape | Documents the choice for future photo-schema work | The decision is one feature's data-model; no future bolt will re-derive it from a project-wide ADR | Rejected — too local |
| Create one ADR for the filter strategy | Documents the citizen-side marker policy | The marker format is already stable (Bolt 004-003 line 113-117); only the citizen view changes here | Rejected — too local |
| Skip ADR entirely | Keeps the decision-index focused on project-wide policy | Loses one place to read "why" if a future engineer wonders | **Selected** — the rationale is in the technical design + the regression-guard test |

## Potential ADR Opportunities Considered

The bolt type definition lists six ADR-worthy patterns; this bolt
hits none of them in a project-wide way:

1 - **New architectural pattern not in standards** — No new pattern.
2 - **Technology choice not covered by tech-stack** — No new technology.
3 - **Trade-off decision** — The two local trade-offs (additive row vs split columns; Replace vs Omit) are too feature-local to merit an ADR.
4 - **Security/compliance approach** — The bolt tightens the citizen serializer's marker filter (a defense-in-depth improvement), but it does not introduce a new security pattern. ADR-005 (four-role auth model) and ADR-007 (WebAuthn mandatory for admin writes) already cover the project's security posture.
5 - **Integration pattern** — No new integration.
6 - **Intentional deviation from standards** — No deviation.

## Decision-Index Update

None. The decision-index is unchanged.

## Stage Outcome

Stage 3 complete: **No ADR created**, **decision-index unchanged**, **rationale documented in this file + the technical design**. The bolt advances to Stage 4 (Implement) with the two open choices already finalized.
