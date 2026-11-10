> **Provenance.** Originally authored in the AIDLC lane at
> `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.
> Moved here on 2026-11-10 when that stale intent directory was retired;
> the AIDLC method tree (`aidlc/spaces/default/memory/`) remains live.
> Content is unchanged except for self-referential path updates.

<!-- scope-document.md — scope definition artifact. -->
<!-- summary_authorization_id: aed304a89f356da9614b71ad6eff3046167f2ca95ef25dec90ae566684af82b1 -->
# Scope Document — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Scope Definition stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope]. Depth: Standard.
> Conversation language: English.
> Synthesized from scope-definition-questions.md (Looks correct confirmed 2026-10-04T13:35:00Z).

## Sources

- Intent statement: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/intent-capture/intent-statement.md`
- Stakeholder map: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/intent-capture/stakeholder-map.md`
- Feasibility assessment: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/feasibility/feasibility-assessment.md`
- Constraint register: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/feasibility/constraint-register.md`
- RAID log: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/feasibility/raid-log.md`
- Questions file: `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/scope-definition/scope-definition-questions.md`

## In-Scope Surface (v1 must-ship)

The 14-page WO-001 surface is split into a v1 must-ship boundary and a post-v1 boundary. The split protects the citizen's trust loop (status trail, persistent own-reports view) while deferring the read-side discovery surfaces and the push delivery surface that carries the highest cross-stack risk.

### v1 must-ship pages (12 of 14)

| Page | Surface | Why in v1 |
|------|---------|-----------|
| 1.1 | Splash | Static; entry point; trivial |
| 1.2 | Welcome | Static; bilingual toggle; trivial |
| 1.3 | Registration | Citizen onboarding; gates the rest of the surface |
| 1.4 | Verification (OTP) | Citizen onboarding; gates the rest of the surface |
| 1.5 | Login | Returning citizens; user input carry |
| 1.7 | Report — Location Confirm | Geofence gate on every submit; citizen agency on first entry |
| 1.8 | Report — Photo Capture | "Feel heard" begins with proof; multi-photo cap |
| 1.9 | Report — Category Pick | PRD-level category list; trivial UX on top of static data |
| 1.10 | Report — Note & Submit | Ticket create + 50m dedup check + dedup-decline flow |
| 1.11 | Report Submitted — Confirmation | Confirmation toast on submit success; closes the immediate trust loop |
| 1.12 | My Reports Detail | **Persistent status trail** (`Submitted → Routed → In progress → Resolved`); photo delete (citizen-initiated per feasibility Q3) |
| 1.14 | Resolution Notification (push) | Closes the trust loop end-to-end via Web Push (VAPID) |

### Post-v1 surfaces (deferred to a later Bolt)

| Page | Surface | Why deferred |
|------|---------|--------------|
| 1.6 | Home / City Activity | Map-heavy surface (R-2 Mapbox 50k free tier); reads the WO-002-routed stream; not needed to prove the submit loop |
| 1.13 | City Activity Feed | Same Mapbox risk + WO-002 dependency; discoverability surface for the cohort post-pilot |

### Out-of-scope (consumed from WO-000; not built in WO-001)

- Auth implementation (four-role model, OTP/session/guards, WebAuthn for admin) — WO-000 platform layer (memory:M5/M7)
- Backend ticket creation, dedup logic, status trail storage, push infrastructure — WO-000 platform layer (memory:M5)
- Photo blob persistence — WO-000 S3-compatible layer (C-3)
- Dispatcher / field crew / admin surfaces — WO-002 / WO-003 / WO-004 (intent statement; memory:M7)
- City-side dedup-decline review queue — WO-002 dispatcher surface (C-8)

## Cross-cutting scope discipline (frozen for v1)

These six rules are pre-decided by the intent statement and not up for re-decision in scope-definition. The scope document records them as frozen; any function-level or page-level concern is raised in Domain Design or Construction as a constraint amendment, never as a scope re-decision.

1. **Four-role auth model** (citizen / dispatcher / crew / admin) is fixed for v1 (project.md Decided, memory:M4)
2. **WebAuthn is mandatory for admin writes** (project.md Decided, memory:M7)
3. **Dedup-prompt-not-auto-merge** — the platform returns a `dedup_match` flag and the citizen decides whether to link (project.md Decided, intent statement)
4. **Four-status trail** (`Submitted → Routed → In progress → Resolved`) is shared across all surfaces and the platform data model (project.md Decided, memory:M4)
5. **Service-layer code style** — every async function in `lib/` returns `Result<T, E>` and never throws (team.md Mandated)
6. **Visual-regression gating** on Rahim's 4 hero mockups at `tolerance: 0.005` on 1440×900 and 1024×768 viewports is an acceptance gate (team.md Mandated, intent statement)

## Citizen-side surface details

### Dedup-decline acknowledgement (Q5)

The citizen sees a brief confirm-toast on the submit success page (1.11) when the citizen declines a dedup match. The toast says "your decline was noted" — closes the immediate feedback loop without leaking WO-002 dispatcher semantics into the citizen surface. The city-side review queue is on WO-002 (out of scope here, per C-8).

### Photo delete + status trail on 1.12 (Q7)

The My Reports Detail page in v1 exposes:
- the **status trail** (four states, the trust-signal core)
- the **photo delete** action (citizen-initiated; required by feasibility Q3 / I-1; the WO-000 endpoint does not yet exist and WO-001 adds it)

The `declined_match` flag is **not** surfaced on the citizen's My Reports Detail page in v1. Surfacing it would import WO-002 review semantics into a Rahim-facing surface before the pilot validates whether the flag is meaningful. The flag stays in the audit log and on the WO-002 dispatcher queue.

## Walking-skeleton scope (first Bolt, Q6)

The first Bolt is the smallest working integrated slice. For WO-001, that slice is **pages 1.1–1.12** (splash through my-reports detail). Push (1.14), the home/activity surfaces (1.6, 1.13), and any post-pilot expansion come in later Bolts.

Why submit alone (1.1–1.11) is too small: the "feel heard" trust signal reduces to a transient toast — exactly the "shouting into the void" pain the intent names as the thing to fix.

Why the full MVP (1.1–1.14) is too big for a skeleton: 1.14 carries VAPID+Vercel-edge runtime risk (R-5) and Twilio BD deliverability dependency (D-3, R-3); a skeleton should not absorb that setup cost.

## Sequencing heuristic (Q3)

**Risk-first** sequencing anchors the Construction phase. The feasibility RAID log flags R-1 (geofence reject UX), R-3 (Twilio BD deliverability), and R-5 (VAPID+Vercel edge runtime) as the load-bearing risks; each maps 1:1 to a citizen submit path or trust-signal close. Walking-skeleton-on (team.md Mandated) is preserved per Bolt — every Bolt is still a working integrated slice — but the first Bolt proves the highest-risk assumptions against the live platform before later Bolts depend on them.

Why not value-first: would build Bolts on top of unproven risks. Why not dependency-first: WO-000 already supplied auth, photo upload, and i18n (D-1 complete) so dependency-first sequencing has no meaningful anchor surface in this WO. Why not walking-skeleton-on-synthetic-data: would defer the geofence UX and Twilio provider exactly when they need to be proven against the live platform.

## Deadlines (Q4)

**No hard deadline.** The intent statement fixes the initiative trigger as "platform unblock" and explicitly disclaims partner deadlines, funding milestones, and demo dates. The feasibility assessment and stakeholder map carry no pilot window. The scope document records the absence as a feature: the v1 surface ships when the platform unblocks each page, and the build cadence is per-Bolt, not calendar-driven (stakeholder map Q7 + team.md Mandated).

## Risks carried from feasibility (RAID log)

The scope document surfaces these risks as Scope Definition inputs to Domain Design and Construction — not scope decisions, but pre-identified risk register for downstream stages:

| ID | Risk | Mitigation in scope |
|----|------|---------------------|
| R-1 | Geofence reject UX path not designed | Design the reject path in Domain Design; expose the city boundary on a debug overlay for the WO-002 dispatcher |
| R-2 | Mapbox free-tier exhaustion at pilot scale | Client-side tile caching; usage alert at 80%; OSM raster fallback in brownout |
| R-3 | Twilio SMS deliverability in Bangladesh | Secondary Asian-friendly provider (MessageBird) in the SMS-provider interface; carrier-specific fallbacks; OTP retry with backoff |
| R-4 | Photo storage cost grows unbounded | 365-day lifecycle policy for unread, never-deleted photos; usage alert at $X/month storage cost |
| R-5 | Vercel edge runtime + VAPID push incompatibility | Scope push delivery to a Vercel Node.js function (not edge); document the runtime pinning |
| R-6 | Rahim archetype optimization narrows the v1 audience | Accepted; broader Dhaka cohort is post-pilot Trigger Map follow-up |

## Assumptions & Open Questions

None.