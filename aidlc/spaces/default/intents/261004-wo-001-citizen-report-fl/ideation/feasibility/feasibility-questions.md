# Feasibility Questions — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Feasibility & Constraints stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope].
> Conversation language: English.
> Depth: Standard (mvp scope) — ~5–8 questions expected.

The intent statement pre-decided several feasibility items (four-role model, status trail, dedup-not-merge, multi-photo caps, WebAuthn for admin, `Result<T,E>` service contract, visual-regression gating). The questions below focus on what is **still open** for feasibility to resolve or pre-narrow before scope-definition and downstream stages.

## Q1 — Hosting target for WO-001

The team-level deployment note in `aidlc/spaces/default/memory/team.md` defers the hosting target to the WO-001 PRD (Cloudflare Pages vs Vercel vs Railway) and treats hosting as `localhost` until that decision lands. WO-001 is a web-first Next.js 14 app with map tiles, push delivery, and image uploads. Which host should the feasibility assessment plan against?

A. **Cloudflare Pages + Workers** — cheapest at low volume; SSR via Workers; VAPID push needs workaround
B. **Vercel** — first-class Next.js 14 fit; costlier at scale; built-in image optimisation
C. **Railway** — simplest Postgres + Next.js in one place; no edge; small ops surface
D. **Stay on localhost for feasibility** — keep the host decision at the WO-001 PRD gate, plan around it
E. Other (please specify)

[Answer]: B (Vercel) — 2026-10-04T12:41:00Z  **Mode:** guide

## Q2 — Map tile provider and cost posture

`design-artifacts/E-Development/000-tech-audit.md` calls for MapLibre GL JS + OpenStreetMap raster tiles in dev, Mapbox tiles in prod "if load justifies". Dhaka is dense (~13,000/km²) and a citizen report flow is map-heavy (pin placement, ward polygons, city activity feed). What cost posture should feasibility plan against?

A. **OSM raster everywhere** — free, but rate-limited and no styling control; suitable for v1 only
B. **Mapbox free tier → paid** — 50k loads/month free, then ~$5/1k loads; style control
C. **MapTiler free tier → paid** — 100k tile requests/month free, then tiered; good for Dhaka
D. **Self-hosted tiles via tileserver-gl** — full control, no per-load cost, ops burden
E. Other (please specify)

[Answer]: B (Mapbox free → paid) — 2026-10-04T12:41:00Z  **Mode:** guide

## Q3 — Photo storage and retention

WO-000 stores photos as blobs in R2/MinIO/S3 (declared in tech-audit). WO-001 needs upload (multi-photo, cap 3 default) and citizen-revisitable display on the My Reports detail page. The intent statement defers photo retention policy and the 50m dedup radius to PRD. For feasibility, what's the storage posture?

A. **S3-compatible + 30-day retention then auto-delete** — conservative GDPR-style; aligns with `data minimization`
B. **S3-compatible + 90-day retention** — gives city staff time to act; risk of accumulating PII
C. **S3-compatible + indefinite, citizen-initiated delete only** — matches "feel heard" promise; ops-heavy
D. **Defer to PRD** — feasibility assumes the tech layer works, retention chosen later
E. Other (please specify)

[Answer]: C (indefinite, citizen-initiated delete) — 2026-10-04T12:41:00Z  **Mode:** guide

## Q4 — OTP SMS provider for citizen registration/login

WO-000 stubs the OTP SMS provider and tech-audit marks real provider selection as a WO-004 concern. But WO-001's registration page (1.3) and verification page (1.4) depend on a working SMS path for the citizen flow to be end-to-end testable. Should feasibility include provider selection now, or hold?

A. **Select now** — pick an Asian-friendly provider (Twilio, MessageBird, SSL Wireless) and bake into feasibility
B. **Hold for WO-004** — feasibility plans around the stub, e2e tests use a mock channel
C. **Select a Bangladesh-local provider now** (SSL Wireless, Banglalink direct) — lowest per-SMS cost
D. Other (please specify)

[Answer]: A (Select now, Asian-friendly) — 2026-10-04T12:41:00Z  **Mode:** guide

## Q5 — Bangla-first copy scope for v1

`team.md` declares i18n via `lib/i18n/keys.ts` and `project.md` says "Bangla-first, English-secondary". For the 14 WO-001 pages, what is the v1 copy coverage?

A. **Bangla-first, English as a complete second locale** — every key has both translations in v1
B. **Bangla-first, English as a machine-translated fallback** — Bangla authored, English auto-translated
C. **Bangla-only in v1** — ship fast; English locale post-pilot
D. **Bilingual toggle on the splash/welcome page** — user picks; both full coverage
E. Other (please specify)

[Answer]: D (Bilingual toggle) — 2026-10-04T12:50:00Z  **Mode:** guide

## Q6 — Dedup radius and city-boundary geofence

The intent statement fixes dedup-prompt-not-auto-merge and notes the 50m default dedup radius is a PRD decision. WO-001's report-submission flow (1.7–1.10) needs a deterministic value to plan the API contract. What does feasibility assume?

A. **50m default, city-wide** — match tech-audit; ward polygons informational only
B. **50m default + ward-aware scaling** (e.g. 30m in dense wards, 100m in industrial) — adaptive
C. **Single 50m radius + hard city-boundary geofence** — pins outside the boundary are rejected
D. **Defer the exact radius; feasibility assumes "configurable per ward"** — radius moved to city config endpoint
E. Other (please specify)

[Answer]: C (50m + city-boundary geofence) — 2026-10-04T12:50:00Z  **Mode:** guide

## Q7 — Offline / poor-network tolerance for the ≤ 60s submit target

The intent statement's success metric is "whole-flow time-to-submit ≤ 60s end-to-end on a mid-range device" in Dhaka, where 3G and patchy 4G are the norm. The submit (1.10) depends on: location confirm (GPS), photo capture (camera), category pick, note entry, then the actual POST. What is the offline/poor-network posture?

A. **Online-only** — no offline queue; failure shows an error and the citizen retries
B. **Optimistic local draft** — store the in-progress report in IndexedDB, retry on reconnect
C. **Submit-only queue** — the final submit is queued and retried; the earlier steps stay online
D. **Service-worker driven** — full offline submit with later sync (high implementation cost)
E. Other (please specify)

[Answer]: A (Online-only) — 2026-10-04T12:50:00Z  **Mode:** guide

## Q8 — Dedup-decline telemetry and city-side data quality

The intent statement fixes dedup-prompt-not-auto-merge: the platform returns a `dedup_match` flag, the citizen decides whether to link. When the citizen **declines** to link, what is logged?

A. **Log the decline as a structured event only** — preserves citizen agency, no surface signal
B. **Log + flag the underlying ticket for city-side review** — surfaces possible duplicates
C. **Log + auto-tag the original ticket** with a `declined_match` marker — auditable trail
D. **Log nothing; the decline is silent** — maximum citizen privacy
E. Other (please specify)

[Answer]: B (Log + flag for review) — 2026-10-04T12:50:00Z  **Mode:** guide

## Consolidated Summary Confirmation

- Looks correct
- Request changes

[Answer]: Looks correct

## Assumption Confirmation

- A. Accept assumptions
- B. Convert to follow-up questions

[Answer]: A
