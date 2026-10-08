<!-- intent-backlog.md — prioritized proto-Units backlog artifact. -->
<!-- summary_authorization_id: aed304a89f356da9614b71ad6eff3046167f2ca95ef25dec90ae566684af82b1 -->
# Intent Backlog — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Scope Definition stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope]. Depth: Standard.
> Conversation language: English.
> Synthesized from scope-definition-questions.md (Looks correct confirmed 2026-10-04T13:35:00Z).
> Prioritization framework: MoSCoW (per scope-document.md boundary split) plus
> WSJF-derived ordering within Must-haves (per scope-definition Q3 risk-first).
> The 14 pages are decomposed into proto-Units — independently deliverable,
> dependency-typed, sized for the per-Bolt Construction cadence.

## Sources

- Scope document: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/scope-definition/scope-document.md`
- Intent statement: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/intent-statement.md`
- Feasibility assessment: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/feasibility-assessment.md`
- Constraint register: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/constraint-register.md`
- RAID log: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/raid-log.md`
- Questions file: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/scope-definition/scope-definition-questions.md`

## Prioritization legend

- **M** = Must Have (v1, non-negotiable)
- **S** = Should Have (v1 if scope allows, otherwise v1.1)
- **C** = Could Have (post-pilot, v1.1+)
- **W** = Won't Have (this WO; out of scope)

## Proto-Units (backlog)

### Bolt 1 — Walking-skeleton slice (1.1–1.12, submit + my-reports)

| ID | Proto-Unit | Pages | Must/Should/Could | WSJF rationale | Dependencies |
|----|------------|-------|-------------------|----------------|--------------|
| U-001 | Splash + Welcome (bilingual toggle) | 1.1, 1.2 | M | Trivial; entry point; required for every other page | i18n keys (WO-000) |
| U-002 | Registration form + NID validation | 1.3 | M | Citizen onboarding; gates the rest of the surface | WO-000 auth (D-1) |
| U-003 | OTP verification (Twilio) | 1.4 | M | Citizen onboarding; R-3 BD deliverability must be proven on the live platform | Twilio account (D-3), WO-000 OTP stub |
| U-004 | Login (returning citizens) | 1.5 | M | User input carry; the path Rahim takes on opens 2-N | WO-000 session |
| U-005 | Location confirm + geofence check | 1.7 | M | Geofence gate on every submit; R-1 reject path must be designed here | City-boundary GeoJSON (D-4) |
| U-006 | Photo capture + multi-photo cap | 1.8 | M | "Feel heard" begins with proof; multi-photo caps (cap 3 / cap 2 narrow / min 1) are project.md Decided | WO-000 photo upload (D-1), R-4 storage cost guardrail |
| U-007 | Category pick (static list) | 1.9 | M | Trivial UX on top of PRD-level category list | WO-000 categories endpoint (D-1) |
| U-008 | Note entry + dedup check + submit | 1.10 | M | The citizen submit path; 50m dedup + dedup-decline flow | U-005 (location), U-006 (photo), U-007 (category) |
| U-009 | Submitted confirmation + dedup-decline confirm-toast | 1.11 | M | Closes the immediate trust loop on the submit success page | U-008 (submit) |
| U-010 | My Reports Detail (status trail + photo delete) | 1.12 | M | **Persistent status trail** (the trust-signal core); photo delete adds the missing WO-000 endpoint (I-1) | U-008 (submit) |

**Bolt 1 confidence hypothesis**: at end of Bolt 1, Rahim can register, verify, locate himself, photograph a problem, pick a category, submit, see the success page, revisit his own report, and see the status trail change. The 60s time-to-submit target is testable. The R-1 geofence reject UX is exercised in dev. The R-3 Twilio OTP path is exercised against a real BD SIM.

### Bolt 2 — Resolution notification (1.14)

| ID | Proto-Unit | Pages | Must/Should/Could | WSJF rationale | Dependencies |
|----|------------|-------|-------------------|----------------|--------------|
| U-011 | Resolution Notification (Web Push / VAPID) | 1.14 | M | Closes the trust loop end-to-end via push; R-5 (VAPID+Vercel edge) must be proven here with the Node.js function runtime pinning (C-11) | WO-000 push infra (D-1), R-5 mitigation |

**Bolt 2 confidence hypothesis**: at end of Bolt 2, Rahim receives a push notification on the resolved transition; the VAPID signing path works in a Vercel Node.js function (not edge); the audit log carries the push event.

### Post-v1 backlog (deferred to v1.1 / post-pilot Trigger Map)

| ID | Proto-Unit | Pages | Must/Should/Could | Why deferred |
|----|------------|-------|-------------------|--------------|
| U-012 | Home / City Activity (map surface) | 1.6 | C | Map-heavy; R-2 Mapbox 50k free-tier exposure; reads the WO-002-routed stream |
| U-013 | City Activity Feed (read-side, social surface) | 1.13 | C | Same Mapbox risk + WO-002 dependency; discoverability surface for the broader Dhaka cohort |
| U-014 | City-review flag on My Reports Detail (1.12 surface extension) | 1.12 (extension) | C | Surface deferred per Q7 until pilot telemetry shows the `declined_match` flag fires often enough to be meaningful |
| U-015 | Post-pilot Trigger Map: broader Dhaka cohort (Rahim-archetype expansion) | n/a | C | R-6 / Trigger Map follow-up; not v1 surface |

## Proto-Unit dependency graph (DAG)

```
U-001  (splash + welcome)
  |
  v
U-002  (registration) -- U-003  (OTP) -- U-004  (login)
                                       |
                                       v
                              U-005  (location + geofence)
                                       |
                                       v
                              U-006  (photo capture)
                                       |
                                       v
                              U-007  (category pick)
                                       |
                                       v
                              U-008  (note + dedup + submit)
                                       |
                              +--------+--------+
                              |                 |
                              v                 v
                       U-009 (submit    U-010 (my-reports detail
                       confirmation +  with status trail + photo
                       dedup-decline   delete)
                       confirm-toast)
                              |                 |
                              +--------+--------+
                                       |
                                       v
                              U-011 (push / VAPID)

Post-v1 (independent of v1 DAG):
  U-012  (home / city activity)         — depends on WO-002 dispatcher
  U-013  (city activity feed)           — depends on U-012 + WO-002
  U-014  (city-review flag on 1.12)     — depends on U-010 + post-pilot telemetry
  U-015  (post-pilot Trigger Map)       — independent; R-6 follow-up
```

## Bolt 1 inclusion rationale (per Q6)

Bolt 1 covers the pages in the **walking-skeleton scope** (Q6=B: 1.1–1.12, submit + my-reports). It is the smallest working integrated slice that closes the trust loop end-to-end: submit + persistent view of the status trail. Push (U-011, page 1.14) is excluded from the skeleton because it carries VAPID+Vercel edge runtime risk (R-5) and Twilio BD deliverability dependency (D-3, R-3) that a skeleton should not absorb; it ships in Bolt 2.

## MoSCoW split per question (Q2)

- **Must Have (10 proto-Units, U-001–U-011)**: 1.1–1.5 (auth + onboarding), 1.7–1.12 (submit + my-reports + status trail), 1.14 (push)
- **Could Have (3 proto-Units, U-012–U-014)**: 1.6 (home), 1.13 (city activity feed), city-review flag on 1.12
- **Won't Have (1 proto-Unit, U-015)**: post-pilot Trigger Map (broader Dhaka cohort)
- **Should Have**: none — the split is decisive enough that no item sits in the middle

## Bolt 1 Definition of Done

- All 10 proto-Units (U-001–U-010) implemented and merged to `prd-development`
- `npx tsc --noEmit` clean
- `npm run test:unit` green (covers every service-layer function returning `Result<T, E>`)
- `npm run test:mockups` green (4 hero mockups at `tolerance: 0.005`)
- Construction Verification Command green: `npx tsc --noEmit && npm run test:unit && npm run test:mockups && curl -fs http://localhost:3000/` (project.md Walking Skeleton)
- R-1 geofence reject UX designed and tested in a Rahim user-test in dev
- R-3 Twilio OTP path exercised against a real Bangladesh SIM in staging
- The 60s time-to-submit target measured end-to-end on a mid-range device in dev
- Per-Bolt design-log entry written to `_progress/00-design-log.md` (stakeholder-map cadence; team.md Mandated)

## Bolt 2 Definition of Done

- U-011 implemented and merged to `prd-development`
- VAPID signing path works in a Vercel Node.js function (C-11); runtime pinning documented in Vercel config
- Push delivery reaches a real registered citizen in staging
- Audit log carries the push event
- R-5 mitigation verified
- Per-Bolt design-log entry written

## Assumptions & Open Questions

None.
