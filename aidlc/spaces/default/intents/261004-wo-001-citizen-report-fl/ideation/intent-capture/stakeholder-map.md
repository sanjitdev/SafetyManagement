# Stakeholder Map — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Intent Capture stage.
> Brownfield build on the now-complete WO-000 platform layer [memory:M5][memory:M6].
> Workflow-selected scope: `feature` [scope].
> Conversation language: English.

## Stakeholder Roster

| Stakeholder | Role | Class | What they care about | Source |
|---|---|---|---|---|
| **Rahim the Reporter** (Persona 02, primary citizen) | End-user of the WO-001 surface; tech-comfortable Dhaka resident; in-the-moment reporter; 10+ opens/day power user after first success | Decision-influencing (the user the product serves) | Speed of submission (≤ 60s), visible status trail, "feel heard" feedback, city activity feed, ward-level map view [Q5][desc] | [Q5] |
| **Sanjit** (product owner) | Holds product-scope decisions for CityFix | Decision-maker (joint) | Whether the citizen flow is delivered within the v1 surface and matches the PRD [Q6][Q11] | [Q6][Q11] |
| **Saga** (product lead) | Gates user-facing copy and persona alignment | Decision-maker (joint with Sanjit) | Persona fidelity (Rahim archetype), content-language adherence (Bangla-first, English-secondary), acceptance-criterion clarity [Q6][Q11] | [Q6][Q11] |
| **Mimir** (build lead) | Implements the 14 pages against the WO-000 platform layer | Constrained influencer (proposes scope trade-offs) | Implementation feasibility, Bolt sequencing, service-layer compliance with the `Result<T, E>` contract [Q11][memory:M2][memory:M3] | [Q11] |
| **Freya** (design lead) | Owns the 14 spec-as-contract page specs and the visual mockups | Constrained influencer (design authority) | Spec fidelity (web-first viewports 1440×900 + 1024×768), visual-regression gating at `tolerance: 0.005` [Q11][Q12] | [Q11][Q12] |

## Decision-Makers vs. Influencers

| Class | Stakeholder | Authority on this WO | Source |
|---|---|---|---|
| Decision-maker (joint) | Sanjit (product owner) | Final call on scope, priority, and acceptance for WO-001 [Q6][Q11] | [Q6][Q11] |
| Decision-maker (joint) | Saga (product lead) | Joint with Sanjit; gates user-facing copy and persona alignment [Q6][Q11] | [Q6][Q11] |
| Constrained influencer | Mimir (build lead) | Proposes scope trade-offs driven by implementation constraints; no approval authority on persona/scope [Q11] | [Q11] |
| Constrained influencer | Freya (design lead) | Design authority on the 14 web-first pages; spec-as-contract owner; no approval authority on persona/scope [Q11] | [Q11] |
| Decision-influencing (the user) | Rahim (Persona 02) | His acceptance is measured via Trust-signal metrics: status-trail visibility, push reach, "feel heard" feedback score [Q3][Q5] | [Q3][Q5] |

> Out of scope for this WO's stakeholder map: Habib (dispatcher, WO-002), Rashid (field crew, WO-003), Aamir (admin, WO-004), and the city-corp sponsor (Goal 3) [Q5]. They are stakeholders of the platform but not of this WO.

## Communication Requirements

| Cadence | Channel | Audience | Source |
|---|---|---|---|
| Per-Bolt entry | `_progress/00-design-log.md` [memory:M1] | Sanjit, Saga, Mimir, Freya, internal team | [Q7] |
| AIDLC phase-transition entry | `_progress/00-design-log.md` (per team.md Mandated) [memory:M1] | Sanjit, Saga, internal team | [memory:M1] |

The selected cadence is **per-Bolt only** [Q7] — entries are written when each Bolt is merged, with the design log also updated at each AIDLC phase transition as required by `team.md` Mandated [memory:M1][Q7]. No daily or weekly cadence is in scope for this WO.

## Assumptions & Open Questions

None.
