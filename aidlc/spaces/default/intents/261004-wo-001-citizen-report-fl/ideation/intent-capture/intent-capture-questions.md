# Intent Capture & Framing — Clarifying Questions

> WO-001 (citizen report flow) — Ideation phase, Intent Capture stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Conversation language: English.

## Sources

- [desc] Initial description: "WO-001 citizen report flow: 14 pages on web-first viewports; depends on WO-000 platform layer"
- [scope] Workflow-selected scope: `feature`.
- [memory:M1] `aidlc/spaces/default/memory/team.md### Mandated`: "ALWAYS update `_progress/00-design-log.md` when transitioning between AIDLC phases — it is the project's single source of truth for progress outside `aidlc-state.md`."
- [memory:M2] `aidlc/spaces/default/memory/team.md### Code Style`: "**All async functions in the service layer return Result<T, E>** — they never throw (see Forbidden below)."
- [memory:M3] `aidlc/spaces/default/memory/team.md### Forbidden`: "NEVER throw exceptions across service-layer boundaries — return Result types or use the established `ApiError` class from `lib/auth/guards.ts`."
- [memory:M4] `aidlc/spaces/default/memory/project.md### Decided`: "DECIDED: Four-role auth model (citizen / dispatcher / crew / admin) is fixed for v1. (Inception, 2026-09-18)"
- [memory:M5] `aidlc/spaces/default/memory/project.md### Decided`: "DECIDED: WO-000 platform layer is complete as of 2026-10-04 — Prisma schema, auth (password/OTP/session/guards), serializers, rate limit, audit, dedup, transitions, push, and 5 API routes wired. 14/14 unit tests passing."
- [memory:M6] `aidlc/spaces/default/memory/project.md### Decided`: "DECIDED: First AIDLC intent in this space is `261004-wo-001-citizen-report-fl` (2026-10-04), scope `feature`, target: build WO-001 against the live platform layer."
- [memory:M7] `aidlc/spaces/default/memory/project.md### Forbidden`: "NEVER change the four-role model, WebAuthn-mandatory-for-admin, or dedup-not-merge without re-running UX Review + Work Order revision."

## Q1. What is the business problem WO-001 is solving?

The PRD frames the citizen flow as the primary end-user surface — without it, no reports are filed. The persona work shows Rahim (Persona 02, primary citizen) is split between "fix the world" and "be heard" — both must be in v1. What is the dominant framing for this WO?

A. Trust restoration — the platform's job is to break the silence loop and rebuild citizen confidence that reports lead to motion. (Rahim's P3/N2 forces; Product Brief vision "break the silence loop".)
B. Time-to-first-report minimization — the dominant measure is submission friction (≤ 60s end-to-end) and the one-tap report is the headline success criterion. (Feature #1, FIA 20; persona decision criteria.)
C. Civic observability — even unfixed problems become visible (city activity feed, ward map) so silence is no longer maintainable by the city corporation. (Goal 2 / Feature #2; broader public-accountability frame.)
D. Operational kickoff for the dual-audience design — citizens are one half of v1; without this WO the dispatcher/crew/admin side has no signal to act on. (PRD "this is the primary end-user surface".)
E. Not yet defined.
X. Other (please specify).

[Answer]: C. Civic observability

## Q2. Who is the target customer, and what pain are they experiencing?

Rahim (Persona 02) is the named primary citizen — tech-comfortable Dhaka resident, in-the-moment reporter, becomes a 10+ opens/day power user after first success. What segment is in scope for this WO's design and acceptance?

A. Rahim the Reporter only (Persona 02, primary citizen) — narrow segment, all 14 pages optimize for one archetype.
B. All tech-comfortable Dhaka adult residents who notice civic problems — broader than the persona, but still Dhaka-only and still citizen-side.
C. Citizens across all first-city pilots (Dhaka + Chattogram, if Chattogram's city config is ready when WO-001 ships).
D. Citizens + low-end-of-tech users (USSD / SMS-only fallback) — extends the surface beyond the smartphone app.
E. Not yet defined.
X. Other (please specify).

[Answer]: B. All tech-comfortable Dhaka adult residents

## Q3. What does success look like? Which metrics matter most for this WO?

The Product Brief (Saga, 2026-09-18) and Business Goals (Trigger Map Workshop 1) define city-level success measures; WO-001 acceptance criteria in the PRD add product-level ones. Which metric family should this intent statement treat as primary?

A. Adoption — first-time report rate, repeat-report rate within 30 days, daily active reporters (Rahim's "10+ opens/day power-user" pattern; Goal 1.3 share).
B. Submission speed & completion — end-to-end ≤ 60s on a mid-range device; drop-off between splash → submitted (Feature #1 success criterion).
C. Trust signals — status-trail visibility, push-notification reach, "feel heard" feedback score (Goal 2.3; FIA Features #2 / #9).
D. Volume of reports feeding the dispatcher/crew pipeline — count of accepted tickets per week that the authority side can route (operational kickoff for WO-002/003).
E. Not yet defined.
X. Other (please specify).

[Answer]: C. Trust signals

## Q4. What is the trigger for this initiative — why now?

The PRD and design log show WO-000 platform layer shipped complete (14/14 unit tests, 5 API routes) on 2026-10-04 and is now the gating dependency removed. What is the immediate trigger kicking off this WO?

A. Platform unblock — WO-000 is now code-complete, so the citizen flow is the next unblock to start. (Per project.md Decided 2026-10-04.)
B. Pilot deadline — there is a hard date from a city-corp partner (DNCC / DSCC / Chattogram) that this flow must be live by.
C. Funding or grant milestone — a specific milestone gates spending on the citizen surface.
D. Internal demo or stakeholder review — a scheduled event requires the citizen flow to be walkable.
E. Not yet defined.
X. Other (please specify).

[Answer]: A. Platform unblock

## Q5. Who are the key stakeholders for WO-001, and what does each care about?

The design log lists four personas across the platform (Rahim citizen, Habib dispatcher, Rashid field crew, Aamir admin). For this WO the citizen-side stakeholders are most directly affected. Which stakeholder roster is the right basis for the stakeholder map?

A. Rahim (primary citizen) only — narrow, since this WO is the citizen surface.
B. Rahim + Habib (dispatcher) — Habib is the next consumer of the data Rahim produces; his interest in ticket quality matters.
C. Rahim + Habib + Aamir (admin) — admin configures the categories and wards Rahim will see; without Aamir's setup Rahim's report-submit flow has no city config to read.
D. All four personas + city-corp sponsor (authority buyer) — full dual-audience frame; the sponsor's adoption decision gates Goal 3.
E. Not yet defined.
X. Other (please specify).

[Answer]: A. Rahim (primary citizen) only

## Q6. Who decides scope or priority for this WO, and who influences them?

This stage's stakeholder map must distinguish decision-makers from influencers. Per the PRD the WO has Critical priority and is gated on WO-000. Who holds the decision?

A. Sanjit (product owner) — single decision-maker, no committee.
B. Sanjit + Saga (product lead) — joint; Saga gates user-facing copy and persona alignment.
C. Freya (design lead) — design authority on the 14 web-first pages; she is the spec-as-contract owner.
D. Mimir (build lead) — implementation constraints drive scope trade-offs; Mimir proposes, Sanjit approves.
E. Not yet defined.
X. Other (please specify).

[Answer]: B. Sanjit + Saga (product lead)

## Q7. Are there communication or reporting-cadence requirements during this WO?

This stage's stakeholder map must list communication requirements. Per project.md Mandated, `_progress/00-design-log.md` is the single source of truth for progress outside `aidlc-state.md`. What cadence (if any) is expected for this WO?

A. Daily design-log entry — one `_progress/00-design-log.md` update per working day while WO-001 is active.
B. Weekly design-log entry + a checkpoint at each AIDLC phase transition (Inception → Construction → Operation).
C. Phase-transition updates only — design log written at the gate of each phase, not per day.
D. Per-Bolt updates — entry written when each Bolt is merged, no other cadence.
E. None.
X. Other (please specify).

[Answer]: D. Per-Bolt updates

## Q8. The workflow was started with scope `feature`. Does that scope match the intended product boundary for this WO?

The workflow was started with scope `feature` (per project.md Decided 2026-10-04). The PRD calls this a "feature" build on top of a complete platform. Does the scope match the intended product boundary?

A. Yes — `feature` matches. WO-001 adds the citizen flow as a feature onto the WO-000 platform; ideation → inception → construction is the right shape.
B. No — this should be `mvp` instead. The 14-page web-first citizen flow is the v1 pilot deliverable, not an additive feature.
C. No — this should be `refactor` instead. The WO-000 platform layer needs a clean-up pass before the citizen flow is built.
D. No — this should be `bugfix` instead. The intent is to fix gaps in the existing platform surface, not add a new flow.
E. Not yet defined.
X. Other (please specify).

[Answer]: A. Yes — `feature` matches

## Q9. (Follow-up) Should Q2's "broader Dhaka adults" framing be narrowed to "Rahim today, broader post-pilot"?

Q2 = B. The Trigger Map's only-of-record citizen is Rahim; broader Dhaka adults is a future-state stretch. The artifacts should not over-claim.

A. Frame as "Rahim archetype today; broader Dhaka adult residents post-pilot" — avoids over-claim; honest about the Trigger Map.
B. Frame as "all tech-comfortable Dhaka adult residents" — takes Q2 literally.
C. Frame as Rahim only; effectively narrow Q2 to Q5's range.
D. None.
X. Other (please specify).

[Answer]: A. Rahim now; broader Dhaka adults post-pilot

## Assumption Confirmation

The artifacts `intent-statement.md` and `stakeholder-map.md` both contain `## Assumptions & Open Questions` sections with the following assumptions tagged `[assumption]`:

**From intent-statement.md:**
1. The first AIDLC intent in this space is WO-001 (per `aidlc-state.md`).
2. WO-000 is the only platform-layer dependency for WO-001 (other 3 WOs are downstream).
3. The Rahim-archetype-today / broader-Dhaka-adults-post-pilot distinction is a real product boundary.
4. Communication cadence for this WO is per-Bolt only.
5. The 4-status trail is unchanged across all WOs and the platform data model.

**From stakeholder-map.md:**
1. Sanjit + Saga are the joint decision-makers for WO-001; Mimir and Freya are constrained influencers.
2. The 14 web-first pages and visual-regression gating are pre-decided.
3. Communication cadence is per-Bolt only (with the team-level phase-transition update in addition).
4. Rahim is the only-of-record citizen in the Trigger Map; broader Dhaka adults are a post-pilot expansion.

A. Accept assumptions
B. Convert to follow-up questions

[Answer]: B. Convert to follow-up questions (resolved via Q10–Q12; all assumptions confirmed)

## Q10. Is WO-001 the only AIDLC intent in flight, with WO-000 the sole platform dependency?

(intent-1, intent-2) Confirm that no other intent is in flight in this space and that the only platform-layer dependency for WO-001 is WO-000.

A. Yes — only WO-001 is in flight; only WO-000 is a dependency.
B. Partially — there is another intent also in flight that does not block WO-001.
C. No — there is another intent that also blocks WO-001's platform dependency.
D. None.
X. Other (please specify).

[Answer]: A. Yes

## Q11. Are Sanjit + Saga the joint decision-makers for WO-001, with Mimir and Freya as constrained influencers?

(stakeholder-1) Confirm the decision-maker roster for this WO.

A. Yes — Sanjit + Saga joint, Mimir + Freya as constrained influencers.
B. No — Sanjit is sole decision-maker; Mimir + Freya are constrained influencers.
C. No — Sanjit + Saga + Mimir are joint decision-makers.
D. None.
X. Other (please specify).

[Answer]: A. Sanjit + Saga joint, Mimir + Freya as constrained influencers

## Q12. Are the 14 web-first pages, the 4-status trail, and the visual-regression gating (tolerance 0.005) all pre-decided and out of scope for this stage?

(stakeholder-2, intent-5) Confirm that the WO-001 surface and its acceptance criteria are pre-decided by the PRD and design log and not in scope for re-decision in this stage.

A. Yes — all pre-decided, no re-decision in this stage.
B. Partially — 14 pages and 4-status trail are pre-decided; visual-regression tolerance is in scope.
C. Partially — 14 pages and visual-regression gating are pre-decided; 4-status trail is in scope.
D. None.
X. Other (please specify).

[Answer]: A. All pre-decided
