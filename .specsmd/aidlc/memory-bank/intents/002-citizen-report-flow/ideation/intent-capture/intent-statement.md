> **Provenance.** Originally authored in the AIDLC lane at
> `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.
> Moved here on 2026-11-10 when that stale intent directory was retired;
> the AIDLC method tree (`aidlc/spaces/default/memory/`) remains live.
> Content is unchanged except for self-referential path updates.

# Intent Statement — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Intent Capture stage.
> Brownfield build on the now-complete WO-000 platform layer [memory:M5][memory:M6].
> Workflow-selected scope: `feature` [scope].
> Conversation language: English.

## Problem Statement

CityFix's make-or-break constraint is that the platform has visibility but no enforcement power. Citizens encounter broken infrastructure daily — potholes, streetlights, drains, garbage — and the official channels they would use to report it offer no feedback that anything is moving. The result is a slow erosion of trust between citizen and city [desc].

WO-001 is the **citizen-facing** surface of CityFix: the 14 pages Rahim the Reporter sees and does, from app open through submitting a report, tracking its status, and receiving the resolution notification [desc]. Without it, no reports are filed and the platform has no data to route [desc].

The dominant framing for this WO is **civic observability**: the citizen surface exists to make unfixed problems visible (city activity feed, ward map) so silence is no longer maintainable by the city corporation [Q1]. This is the Goal 2 / Feature #2 reading from the business goals.

## Target Customer

Today: **Rahim the Reporter** (Persona 02, primary citizen) — a tech-comfortable adult resident of Dhaka in his late 20s or 30s, who notices civic infrastructure problems in his daily routine and reports them in-the-moment [Q5][Q9].

Tomorrow (post-pilot): the broader cohort of tech-comfortable Dhaka adult residents who notice civic problems [Q2 → Q9 refinement]. The Rahim archetype is the design optimization target and the proxy for the broader cohort; the post-pilot expansion is a Trigger Map follow-up, not a v1 surface [Q9].

Rahim's pain: "shouting into the void" [N2, FIA 14] — reports disappear with no feedback; he doesn't trust that anyone is listening. His hope: "feel heard enough to keep hoping" [P3, FIA 14] — proof that his voice lands somewhere [desc].

## Success Metrics

Primary: **Trust signals** [Q3].

- 100% of submitted reports produce a citizen-revisitable status trail (`submitted → routed → in progress → resolved`) [memory:M4 — four-role model + status trail fixed for v1][Q12].
- Push notifications reach the citizen on the resolved transition (Feature #9 / PLAT-REQ-006) [desc].
- Post-resolution "feel heard" feedback prompt is the qualitative signal (Goal 2.3) [Q3].
- Whole-flow time-to-submit ≤ 60s end-to-end on a mid-range device (Feature #1 success criterion) [desc].

Secondary (operational kickoff for WO-002/003): volume of accepted tickets per week that the authority side can route.

## Initiative Trigger

**Platform unblock** [Q4]. The WO-000 platform layer is now code-complete as of 2026-10-04 — Prisma schema, auth (password/OTP/session/guards), serializers, rate limit, audit, dedup, transitions, push, and 5 API routes wired, 14/14 unit tests passing [memory:M5]. The first AIDLC intent in this space is WO-001 against the live platform [memory:M6][Q10]. The trigger is not a partner deadline, funding milestone, or demo date — it is the platform dependency being satisfied and the next unblock being the citizen surface [Q4][Q10].

## Initial Scope Signal

**Workflow-selected scope:** `feature` [scope].

**User-confirmed product boundary:** `feature` matches the intended product boundary [Q8]. WO-001 adds the citizen flow as a feature onto the WO-000 platform; the ideation → inception → construction shape is right.

**In-scope surface (14 pages, web-first, pre-decided):** 1.1 Splash · 1.2 Welcome · 1.3 Registration · 1.4 Verification (OTP) · 1.5 Login · 1.6 Home / City Activity · 1.7 Report — Location Confirm · 1.8 Report — Photo Capture · 1.9 Report — Category Pick · 1.10 Report — Note & Submit · 1.11 Report Submitted — Confirmation · 1.12 My Reports Detail · 1.13 City Activity Feed · 1.14 Resolution Notification (push) [desc][Q12].

**Out-of-scope (consumed, not built):** Auth implementation, backend ticket creation, dedup logic, status trail storage, push notification infrastructure (all in WO-000) [desc]; dispatcher / field crew / admin UI (WO-002, WO-003, WO-004) [desc][Q10].

**Cross-cutting scope discipline (pre-decided, not in scope for re-decision in this stage):**

- The four-role auth model (citizen / dispatcher / crew / admin) is fixed for v1 [memory:M4][memory:M7][Q12].
- WebAuthn is mandatory for admin writes [memory:M7][Q12].
- Dedup-prompt-not-auto-merge is the citizen agency pattern; the platform layer returns a `dedup_match` flag and the citizen decides whether to link [desc][memory:M7][Q12].
- The 4-status trail is unchanged across all WOs and the platform data model [memory:M4][Q12].
- Service-layer code style: all async service functions return `Result<T, E>` and never throw; this WO must not break the contract [memory:M2][memory:M3].
- Visual regression gating on Rahim's 4 hero mockups at `tolerance: 0.005` on 1440×900 and 1024×768 viewports is in scope as an acceptance gate [Q12][desc].

## Assumptions & Open Questions

None.
