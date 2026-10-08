# Feasibility Assessment — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Feasibility & Constraints stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope].
> Re-saved at 2026-10-04T13:08:00Z after summary confirmation recorded.
> Conversation language: English.
> Depth: Standard (mvp scope).

## Verdict

**GO** — feasible to build WO-001 on the WO-000 platform layer with the working assumptions captured in this assessment. No item is a hard blocker; the items that carry implementation cost (Vercel tier transitions past free quota, Mapbox volume at 50k+ loads/month, and the photo retention burden) are cost-of-growth concerns, not feasibility gates. The riskiest assumption is **50m dedup radius + hard city-boundary geofence** (Q6) because the geofence reject path is a UX surface the team has not yet designed — flagged in the RAID log as R-1 with a mitigation of "design the reject path before scope-definition, not in it".

## Top-Line Assumptions (resolved by Q1–Q8)

| # | Question | Resolution | Feasibility impact |
|---|----------|-----------|--------------------|
| Q1 | Hosting target | **Vercel** | First-class Next.js 14 fit; image optimisation built in; cost climbs past free tier at scale. Migration to self-host is straightforward. |
| Q2 | Map tile provider | **Mapbox free → paid** | 50k loads/month free covers v1 pilot; overage ~$5/1k loads. Style control unlocks ward polygon theming. |
| Q3 | Photo storage / retention | **Indefinite, citizen-initiated delete** | S3-compatible layer holds photos until the citizen deletes via My Reports; matches the "feel heard" trust signal. Ops cost scales with storage, not deletes. |
| Q4 | OTP SMS provider | **Select now, Asian-friendly** | Twilio is the safest pick (Bangladesh coverage, deliverability); SSL Wireless as a follow-up if per-SMS cost dominates. |
| Q5 | i18n scope | **Bilingual toggle** | Both Bangla and English full coverage in v1; user picks at splash/welcome; both authored, not auto-translated. |
| Q6 | Dedup radius + boundary | **50m radius + hard city-boundary geofence** | Pins outside the city boundary are rejected; 50m dedup matches tech-audit default. Geofence reject UX is the design gap. |
| Q7 | Offline posture | **Online-only** | The ≤ 60s submit target stands; failed submits show an error and the citizen retries. No offline queue. |
| Q8 | Dedup-decline logging | **Log + flag for review** | A `declined_match` event is logged; the underlying ticket surfaces on a city-side review queue for possible manual dedup. |

## Component-by-Component Feasibility (architect lead)

| WO-001 component | WO-000 platform fit | Feasibility notes |
|------------------|---------------------|---------------------|
| 1.1 Splash, 1.2 Welcome | None required (static) | Trivial |
| 1.3 Registration, 1.4 Verification (OTP) | Auth (password/OTP/session) is wired | OTP path needs Q4's real provider — the WO-000 stub is the only gap |
| 1.5 Login | Auth | Trivial |
| 1.6 Home / City Activity, 1.13 City Activity Feed | None (reads ticket-list endpoint) | Backend already exposes the read; UX is the work |
| 1.7 Report — Location Confirm | Geolocation API (browser) + boundary check | Geofence (Q6) requires a city-boundary GeoJSON, supplied by the city config endpoint (WO-000 already exposes city config) |
| 1.8 Report — Photo Capture | Photo upload API + S3-compatible storage | Q3's "indefinite, citizen-initiated delete" adds a delete endpoint that WO-000 does not yet expose; sized in the constraint register |
| 1.9 Report — Category Pick | None (data) | Categories are PRD-level decisions; WO-000 holds a static category list |
| 1.10 Report — Note & Submit | Ticket create API + dedup check | Dedup check uses Q6's 50m radius; dedup-decline flow (Q8) is the new path |
| 1.11 Report Submitted — Confirmation | None (UX) | Trivial |
| 1.12 My Reports Detail | Read endpoint + photo streaming + delete | Combines existing reads with Q3's delete endpoint |
| 1.14 Resolution Notification (push) | Web Push (VAPID) is wired | Vercel's edge runtime needs a workaround for VAPID — flagged in the constraint register |

## AWS Landscape (platform engineer perspective)

The team-level deployment note in `aidlc/spaces/default/memory/team.md` defers the hosting target to the WO-001 PRD, and feasibility plans against **Vercel** (Q1). The AWS services the team is already using stay in play regardless of front-end host:

- **PostgreSQL 16** is already provisioned (WO-000). Vercel connects via standard connection pooler; no new AWS service.
- **S3-compatible blob storage** for photos is already in the WO-000 layer; the new citizen-initiated delete path uses S3 `DeleteObject` and a Prisma-backed tombstone.
- **AWS Secrets Manager** holds the Mapbox token, the Twilio auth token, and the VAPID private key. Rotation cadence is quarterly.
- **Well-Architected alignment**: this WO adds no new compute or data service — it consumes what WO-000 already passes review on. The new surface is the photo-delete endpoint and the geofence check; both are CRUD on existing data planes.
- **Cost posture** (FinOps): at pilot volume (≤ 5k MAU, ~50k map loads/month, ~10k photo uploads/month, ~10k SMS/month) the run-rate is dominated by SMS (~$70–$120/month via Twilio Asia) and Mapbox overage past 50k. Past 50k MAU the cost line shifts to Vercel bandwidth + Mapbox; the build phase must keep image optimisation aggressive to stay under Vercel's image-transform free quota.

## Compliance Posture (compliance specialist perspective)

| Concern | Treatment | Source |
|---------|-----------|--------|
| Citizen PII (phone, NID, location) | Encrypted at rest (S3 SSE), TLS in transit, access via session cookie only | WO-000 design |
| Photos (face, license plates, bystanders) | Indefinite retention with citizen-initiated delete (Q3); a "delete" button in My Reports; no auto-redaction; the legal basis is citizen consent at upload | Q3 + Bangladesh data-protection norms |
| Location data (precise GPS pin) | Stored in the ticket; not separately exposed; deleted with the ticket | WO-000 schema |
| OTP SMS deliverability | Asian-friendly provider (Twilio) is GDPR-aligned; SMS body and retention per Twilio policy | Q4 |
| Dedup-decline event (Q8) | Structured event only; no citizen PII in the event payload; reviewed by city-side staff on a flagged queue | Q8 |
| Bangla-first copy (Q5) | Both locales fully covered; no machine-translation fallback; authored content reviewed by Saga (per stakeholder map) | Q5 |
| Cross-border data flow | Photos + PII stay in the AWS region the WO-000 stack already uses; no replication outside Bangladesh | WO-000 design |

**Open compliance item** (parked for Scope Definition): confirm the legal basis for indefinite photo retention with the city-corp sponsor. The intent is "citizen consent at upload", but a written retention policy on the registration page is the strongest pattern; not a feasibility blocker.

## Pre-Narrowed Decisions for Downstream Stages

- **Hosting**: Vercel (Q1)
- **Map**: Mapbox free → paid (Q2)
- **Photos**: indefinite, citizen-initiated delete (Q3)
- **SMS**: Twilio now; revisit at WO-004 (Q4)
- **i18n**: Bilingual toggle, both authored (Q5)
- **Dedup**: 50m radius + city-boundary geofence (Q6)
- **Offline**: Online-only (Q7)
- **Dedup-decline**: Log + flag for review (Q8)

## Cross-References

- Constraint register: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/constraint-register.md`
- RAID log: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/raid-log.md`
- Questions file: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/feasibility-questions.md`
- Upstream: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/intent-statement.md`
- Upstream: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/stakeholder-map.md`
- Team memory: `aidlc/spaces/default/memory/team.md`
- Project memory: `aidlc/spaces/default/memory/project.md`
- Phase rules: `aidlc/spaces/default/memory/phases/ideation.md`

## Assumptions & Open Questions

None.
