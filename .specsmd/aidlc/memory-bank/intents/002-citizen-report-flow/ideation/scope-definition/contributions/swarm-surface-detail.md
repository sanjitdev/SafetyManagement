> **Provenance.** Originally authored in the AIDLC lane at
> `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.
> Moved here on 2026-11-10 when that stale intent directory was retired;
> the AIDLC method tree (`aidlc/spaces/default/memory/`) remains live.
> Content is unchanged except for self-referential path updates.

**Collaborator:** swarm-surface-detail

## Contribution

### Q5 — Dedup-decline review queue surface in the citizen app
**Selected answer**: B
**Rationale**: Rahim's dominant pain is "shouting into the void"; the "feel heard" trust signal calls for an acknowledgement that his decline landed, not a description of the city-side workflow. A short confirm-toast on the submit success page (1.11) closes the feedback loop the intent statement names ("his voice lands somewhere") without leaking WO-002 review mechanics into the citizen surface. Option C over-explains a process the citizen does not own; option D couples the citizen timeline to a city-side queue whose latency is unknown and out of scope. Option A re-creates the void we are trying to fix.

### Q7 — Photo delete + status trail surface in v1
**Selected answer**: B
**Rationale**: Photo delete is a feasibility Q3 commitment (I-1 in the RAID log flags that the endpoint does not yet exist; WO-001 must add it). Status trail is the primary trust signal and a Must-have per the intent statement. The `declined_match` flag is the city-side review hook (C-8) — surfacing it on the citizen's own reports page would import WO-002 dispatcher semantics into the citizen app before the pilot validates whether the flag is meaningful. Pair photo-delete with status-trail in v1 and defer the flag to a post-pilot decision once we have telemetry on how often the flag fires.

### Q8 — Cross-cutting scope discipline sign-off
**Selected answer**: A
**Rationale**: The intent statement is explicit — the six rules are "pre-decided, not in scope for re-decision in this stage." Any carve-out (Mimir's escape hatch on `Result<T, E>`, Freya's tolerance relaxation on derivative pages) re-opens contracts the team.md Mandated and the intent statement both lock. The scope document should record all six as frozen; any later function-level or page-level concern is raised in Domain Design or Construction as a constraint amendment, not as a scope re-decision.

## Positions
- AGREE: Feasibility Q8 selecting "log + flag for review" for dedup-decline — matches the trust-signal frame and keeps WO-002 review mechanics out of the citizen surface.
- AGREE: The constraint register's C-3 / C-8 pair — indefinite citizen-initiated delete plus a structured `declined_match` event — gives WO-001 a clean separation between citizen agency (delete) and city review (flag) without conflating them.
- OBJECT: Treating the city-review flag as in-scope for the citizen my-reports page (1.12) would import dispatcher semantics into a Rahim-facing surface; the flag belongs to the WO-002 review queue and should not appear on the citizen timeline in v1.