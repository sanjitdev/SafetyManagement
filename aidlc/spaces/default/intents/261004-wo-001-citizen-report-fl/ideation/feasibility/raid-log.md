# RAID Log — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Feasibility & Constraints stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope].
> Re-saved at 2026-10-04T13:08:00Z after summary confirmation recorded.
> Conversation language: English.

## Scoring Rubric

- **Likelihood**: Low / Medium / High
- **Impact**: Low / Medium / High / Critical
- **Treatment**: Mitigate / Transfer / Accept / Avoid

## Risks

### R-1 — Geofence reject UX path is not designed (Q6)

- **Likelihood**: High
- **Impact**: Medium
- **Treatment**: Mitigate
- **Detail**: Q6 commits to a hard city-boundary geofence, but the UX path for a rejected pin is not designed. If the city boundary is mis-drawn or the reject message is unclear, citizen submission success drops.
- **Owner**: design lead (Freya), build lead (Mimir)
- **Mitigation**: design the geofence reject path in Scope Definition or Domain Design; expose the city boundary on a debug overlay for the dispatcher (WO-002) to inspect
- **Status**: Open

### R-2 — Mapbox free-tier exhaustion at pilot scale (Q2)

- **Likelihood**: Medium
- **Impact**: Medium
- **Treatment**: Mitigate
- **Detail**: 50k map loads/month is comfortable for the first cohort, but the city activity feed (1.6, 1.13) is map-heavy and could push past the free tier faster than expected.
- **Owner**: platform engineer
- **Mitigation**: client-side tile caching; a Mapbox usage alert at 80% of free tier; a fallback to OSM raster in a brownout
- **Status**: Open

### R-3 — Twilio SMS deliverability in Bangladesh (Q4)

- **Likelihood**: Medium
- **Impact**: High
- **Treatment**: Mitigate
- **Detail**: Twilio's Asia deliverability varies by carrier; the citizen registration flow (1.3) and verification (1.4) depend on a working SMS path.
- **Owner**: platform engineer
- **Mitigation**: a secondary Asian-friendly provider (MessageBird) in the SMS-provider interface; carrier-specific fallbacks; an OTP retry path with backoff
- **Status**: Open

### R-4 — Photo storage cost grows unbounded under indefinite retention (Q3)

- **Likelihood**: Medium
- **Impact**: Medium
- **Treatment**: Accept with guardrails
- **Detail**: indefinite retention with citizen-initiated delete means storage cost is a function of citizen satisfaction; if citizens never delete, storage grows.
- **Owner**: operations (post-launch)
- **Mitigation**: 365-day lifecycle policy for unread photos; a usage alert at $X/month storage cost
- **Status**: Open

### R-5 — Vercel edge runtime + VAPID push incompatibility (C-11)

- **Likelihood**: Low
- **Impact**: Medium
- **Treatment**: Mitigate
- **Detail**: VAPID push signature uses Node crypto; Vercel edge runtime does not include it.
- **Owner**: build lead
- **Mitigation**: scope push delivery to a Vercel Node.js function (not edge); document the runtime pinning
- **Status**: Open

### R-6 — Rahim archetype optimization narrows the v1 audience (inherits intent)

- **Likelihood**: Low
- **Impact**: Medium
- **Treatment**: Accept
- **Detail**: the design optimization target is Rahim (Persona 02); post-pilot expansion to the broader Dhaka-tech-comfortable cohort is out of scope for v1
- **Owner**: product lead (Saga)
- **Mitigation**: Trigger Map follow-up for the post-pilot cohort
- **Status**: Accepted

## Assumptions

### A-1 — Vercel is a working hosting target (Q1)

- **Source**: feasibility Q1
- **Validate by**: Scope Definition confirms the deployment shape
- **Status**: Assumed

### A-2 — Mapbox free tier covers the v1 pilot volume (Q2)

- **Source**: feasibility Q2
- **Validate by**: weekly cost review during pilot
- **Status**: Assumed

### A-3 — Photos can be stored indefinitely at acceptable cost (Q3)

- **Source**: feasibility Q3
- **Validate by**: monthly S3 cost report
- **Status**: Assumed

### A-4 — Twilio delivers OTP in Bangladesh at >95% rate (Q4)

- **Source**: feasibility Q4
- **Validate by**: end-to-end test of registration on a real Bangladesh SIM
- **Status**: Assumed

### A-5 — 50m dedup radius + city-boundary geofence are acceptable UX (Q6)

- **Source**: feasibility Q6
- **Validate by**: design review + Rahim user-test in pilot
- **Status**: Assumed

### A-6 — Online-only submit is acceptable for the Rahim archetype (Q7)

- **Source**: feasibility Q7
- **Validate by**: pilot observation; offline/poor-network failure mode telemetry
- **Status**: Assumed

## Issues

### I-1 — Photo-delete endpoint does not exist in WO-000 (Q3)

- **Detail**: WO-001 needs a citizen-initiated photo delete path; the platform layer (WO-000) does not yet expose it.
- **Resolution**: add the delete endpoint in the WO-001 Construction phase, behind a feature flag if the WO-002 dispatcher (WO-002) needs to soft-launch first.
- **Status**: Open

### I-2 — City-boundary GeoJSON is not yet published (Q6)

- **Detail**: the geofence check needs a city boundary; the WO-000 city config endpoint is the planned source, but the boundary data is not yet published.
- **Resolution**: confirm with the city-corp sponsor during Scope Definition; the geofence check is best-effort until the boundary is published.
- **Status**: Open

## Dependencies

### D-1 — WO-000 platform layer (complete)

- **Status**: Complete (2026-10-04)
- **Detail**: Prisma schema, auth, serializers, rate limit, audit, dedup, transitions, push, 5 API routes — all green; 14/14 unit tests pass

### D-2 — Mapbox token (Q2)

- **Status**: Pending
- **Detail**: provisioned in AWS Secrets Manager; rotation cadence quarterly

### D-3 — Twilio account (Q4)

- **Status**: Pending
- **Detail**: Asian-friendly SMS provider; account creation and Bangladesh-number procurement

### D-4 — City-boundary GeoJSON (Q6)

- **Status**: Pending
- **Detail**: published by the city-corp sponsor; published via the WO-000 city config endpoint

### D-5 — Vercel project and env vars (Q1)

- **Status**: Pending
- **Detail**: project, env vars, and preview-deploy hooks for the Next.js 14 app

## Sources

- Feasibility assessment: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/feasibility-assessment.md`
- Constraint register: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/constraint-register.md`
- Intent statement: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/intent-statement.md`
- Stakeholder map: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/stakeholder-map.md`

## Assumptions & Open Questions

None.
