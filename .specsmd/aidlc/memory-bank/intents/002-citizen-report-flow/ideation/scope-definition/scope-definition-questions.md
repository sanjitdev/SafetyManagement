> **Provenance.** Originally authored in the AIDLC lane at
> `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.
> Moved here on 2026-11-10 when that stale intent directory was retired;
> the AIDLC method tree (`aidlc/spaces/default/memory/`) remains live.
> Content is unchanged except for self-referential path updates.

# Scope Definition Questions — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Scope Definition stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope]. Depth: Standard (5-8 questions).
> Conversation language: English.
> Stage direction: define the in/out boundary, the prioritized intent backlog
> (proto-Units), and the value stream that the citizen flow delivers against
> the WO-000 platform layer.
> Answered 2026-10-04T13:35:00Z via Swarm me (3 parallel subagents synthesized
> a single coherent answer set; lead integrated).

## Sources

- Intent statement: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/intent-capture/intent-statement.md`
- Stakeholder map: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/intent-capture/stakeholder-map.md`
- Feasibility assessment: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/feasibility/feasibility-assessment.md`
- Constraint register: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/feasibility/constraint-register.md`
- RAID log: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/feasibility/raid-log.md`
- Team memory: `aidlc/spaces/default/memory/team.md`
- Project memory: `aidlc/spaces/default/memory/project.md`

## Q1 — MVP boundary for v1

The 14 pages of WO-001 cover splash → welcome → registration → verification → login → home/city activity → location confirm → photo capture → category pick → note & submit → submitted confirmation → my reports detail → city activity feed → resolution notification. Which surface is the v1 must-ship boundary that we are committing to deliver before the next post-pilot expansion?

A. **All 14 pages in v1** — ship the entire surface end-to-end at pilot; no further segmentation
B. **Core submit path (1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10, 1.11) in v1; activity feed (1.6, 1.13) and push notification (1.14) and my reports detail (1.12) are post-v1** — cut non-submit surfaces until pilot validates the core
C. **Submit + trust signals (1.1–1.11, 1.12) in v1; activity feed (1.6, 1.13) and push (1.14) are post-v1** — protect the "feel heard" loop even if the read-side surfaces are deferred
D. **Submit + status + push (1.1–1.11, 1.14) in v1; activity feed (1.6, 1.13) and my reports detail (1.12) are post-v1** — protect the report-then-notify path; cut the discovery surface
E. Other (please specify)

[Answer]: C

## Q2 — Must-have vs. could-have split for v1

Of the 14 pages, which capabilities are explicitly "must have" in v1 (the product is unusable for the Rahim archetype without them) versus "could have" (defer to post-pilot if needed)? Pick the most decisive split you want the backlog to enforce.

A. **Must: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.14 — Could: 1.6, 1.13** — submit, view own report, get push; activity feed is post-v1
B. **Must: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 1.8, 1.9, 1.10, 1.11, 1.6, 1.13, 1.14 — Could: 1.12** — full loop except own-reports detail is post-v1
C. **Must: 1.1–1.13 — Could: 1.14** — every page except push notification; push is a v1.1 addition
D. **Must: 1.1–1.14** — every page is must-have; no could-have cut
E. Other (please specify)

[Answer]: A

## Q3 — Sequencing heuristic for the proto-Units

The intent statement names 14 pages; feasibility confirmed that registration, verification, location confirm, photo capture, submit, and my-reports detail touch the platform layer's auth, geofence, dedup, and serializer surfaces. The build lead (Mimir) needs a Bolt-sequence heuristic. Which one anchors the Construction phase?

A. **Walking-skeleton first** — Bolt 1 is the smallest submit-path slice (location confirm → photo capture → submit) on synthetic data; later Bolts add auth, activity feed, push
B. **Risk-first** — Bolt 1 proves the highest-risk assumptions (Twilio OTP deliverability in BD, Mapbox style, geofence reject path, dedup-decline flow) before later Bolts depend on them
C. **Value-first** — Bolt 1 ships a Rahim-usable end-to-end submit; later Bolts add activity feed, my-reports detail, push
D. **Dependency-first** — Bolt 1 builds the shared surfaces (auth, photo upload, i18n) that every page depends on; later Bolts add per-page surfaces
E. Other (please specify)

[Answer]: B

## Q4 — Hard deadlines tied to WO-001 capabilities

The intent statement chose "platform unblock" as the initiative trigger and explicitly disclaimed a partner deadline, funding milestone, or demo date. Are there any hard deadlines now, or should the scope document record the absence as a feature?

A. **No hard deadline — record the absence** — the v1 surface ships when the platform unblocks each page; the build cadence is per-Bolt, not calendar-driven
B. **Soft pilot window only** — there is a target window for the first pilot cohort (e.g., end of Q1 2027) but no contractual deadline; record the window, do not commit to a specific Bolt completion
C. **Hard pilot deadline** — there is a contractual pilot launch date; please state the date so the scope document can work backward from it
D. **Demo milestone** — there is a demo date for stakeholders (Sanjit, Saga, city-corp sponsor) that some capabilities must be ready by
E. Other (please specify)

[Answer]: A

## Q5 — Dedup-decline review queue surface in the citizen app

Feasibility Q8 selected "log + flag for review" for the dedup-decline event. The actual review queue is on the WO-002 dispatcher surface (out of scope here). Should WO-001 expose anything to the citizen about the flag (e.g., a "your decline was logged" toast), or keep the citizen surface silent on city-side review?

A. **Silent to citizen** — log the event for city-side review; do not surface the flag on the citizen app
B. **Confirm-toast only** — show a brief "your decline was noted" toast on the submit success page; no further citizen-side surface
C. **Inline reassurance** — show a small "a city reviewer may look at nearby reports" message on the submit success page; explicitly set expectations
D. **Status-trail entry** — surface the `declined_match` flag on the citizen's my-reports detail so they can see the city reviewed it
E. Other (please specify)

[Answer]: B

## Q6 — Walking-skeleton scope for the first Bolt

Walking-skeleton-on in team.md: the first Bolt is the smallest working integrated slice. For WO-001, the smallest working slice that proves the submit path and the trust signals end-to-end is roughly pages 1.1 (splash) → 1.2 (welcome) → 1.3/1.4 (registration + OTP) → 1.7 (location confirm) → 1.8 (photo capture) → 1.9 (category pick) → 1.10 (note + submit) → 1.11 (confirmation). Should the walking-skeleton Bolt include any of the read-side surfaces (1.6, 1.12, 1.13) or the push surface (1.14)?

A. **Submit path only (1.1–1.11)** — pure vertical slice; no read-side, no push; the trust signal is the submit success page
B. **Submit + my-reports (1.1–1.12)** — first Bolt includes the citizen's "can I see my report?" view so the trust signal is also persistent
C. **Submit + push (1.1–1.11, 1.14)** — first Bolt includes the resolution notification; trust signal closes the loop
D. **Full MVP (1.1–1.14)** — first Bolt ships every page; the skeleton IS the MVP
E. Other (please specify)

[Answer]: B

## Q7 — Photo delete + status trail surface in v1

Feasibility Q3 selected "indefinite, citizen-initiated delete" for photo storage. Feasibility Q8 selected "log + flag for review" for dedup-decline. The status trail is shared across all surfaces (intent statement). Should the v1 my-reports detail page (1.12) expose all three: photo delete, status trail, and any city-review flag, or limit the v1 surface to a subset?

A. **All three in v1** — photo delete, status trail, and city-review flag are all on the my-reports detail page
B. **Status trail + photo delete only** — city-review flag is post-v1; the citizen sees their own data and the trail
C. **Status trail only** — photo delete and city-review flag are post-v1; the v1 my-reports page is a read-only status trail
D. **Status trail + city-review flag only** — photo delete is post-v1; the citizen can see status and the review outcome but cannot delete from the v1 surface
E. Other (please specify)

[Answer]: B

## Q8 — Cross-cutting scope discipline sign-off

The intent statement pre-decided: four-role auth, WebAuthn-mandatory-for-admin, dedup-prompt-not-auto-merge, four-status trail, `Result<T, E>` service contract, and visual-regression gating at `tolerance: 0.005`. None of these is up for re-decision in this stage. Confirm the scope document records these as "frozen for v1" and surfaces no trade-offs against them.

A. **Confirm — all six are frozen for v1** — the scope document records them as pre-decided and unchangeable in this WO
B. **Confirm — but list `Result<T, E>` as "frozen" with a note that the WO-001 build lead (Mimir) reserves the right to surface a specific function-level concern** — keeps the contract, leaves a narrow escape hatch
C. **Confirm — but list visual-regression gating as "frozen at 0.005 for hero mockups, may relax to 0.01 for derivative pages"** — splits the gate between hero and non-hero
D. **Reconsider** — there is at least one of the six I want to revisit
E. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

Synthesized from 3 parallel subagent contributions:
- Q1 → C (Submit + trust signals 1.1–1.12; activity feed 1.6/1.13 and push 1.14 are post-v1)
- Q2 → A (Must: 1.1–1.5, 1.7–1.12, 1.14; Could: 1.6, 1.13)
- Q3 → B (Risk-first sequencing; walking-skeleton mandate preserved per Bolt)
- Q4 → A (No hard deadline — record the absence)
- Q5 → B (Confirm-toast only on submit success page)
- Q6 → B (Walking skeleton: 1.1–1.12, submit + my-reports)
- Q7 → B (Status trail + photo delete; city-review flag deferred)
- Q8 → A (All six cross-cutting rules frozen for v1)

- Looks correct
- Request changes

[Answer]: Looks correct

## Assumption Confirmation

- A. Accept assumptions
- B. Convert to follow-up questions

[Answer]: A
