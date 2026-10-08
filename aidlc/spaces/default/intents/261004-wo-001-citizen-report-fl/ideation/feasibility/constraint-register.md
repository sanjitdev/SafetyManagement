# Constraint Register — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Feasibility & Constraints stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope].
> Re-saved at 2026-10-04T13:08:00Z after summary confirmation recorded.
> Conversation language: English.

## Sources

- Intent statement: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/intent-statement.md`
- Stakeholder map: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/stakeholder-map.md`
- Tech audit: `design-artifacts/E-Development/000-tech-audit.md`
- Team memory: `aidlc/spaces/default/memory/team.md`
- Project memory: `aidlc/spaces/default/memory/project.md`

## Constraints

### C-1 — Hosting target is Vercel, not localhost (Q1)

- **Type**: Technical / Operational
- **Source**: team.md defers hosting to WO-001 PRD; feasibility plans against Vercel
- **Implication**: deployment cadence, env-var management, and image-optimisation strategy are Vercel-shaped; CI must be Vercel-aware (preview deploys per Bolt)
- **Mitigation**: keep the Next.js build Vercel-portable so a self-host fallback exists if cost crosses the team threshold

### C-2 — Mapbox is the map tile provider; usage above 50k/month is paid (Q2)

- **Type**: Technical / Cost
- **Source**: feasibility Q2
- **Implication**: at pilot scale (≤ 5k MAU) the free tier is sufficient; past 50k map loads/month the cost line is ~$5 per 1k loads; the city activity feed and the location-confirm pin are the heaviest map surfaces
- **Mitigation**: cache tiles client-side where the map is static; add a Mapbox usage alert at 80% of free tier

### C-3 — Photo storage is indefinite, citizen-initiated delete only (Q3)

- **Type**: Technical / Compliance
- **Source**: feasibility Q3
- **Implication**: WO-000 does not yet expose a photo-delete endpoint; WO-001 must add it. Storage cost scales with photos stored, not with deletes; the S3-compatible layer is already in place
- **Mitigation**: lifecycle policy at 365 days for unread, never-deleted photos (PII minimisation); tombstones in the database, hard-delete in S3

### C-4 — OTP SMS provider is Twilio (Q4, Asian-friendly)

- **Type**: Technical / Vendor
- **Source**: feasibility Q4; tech-audit marks WO-004 as the original owner
- **Implication**: WO-000 stubs SMS; WO-001 needs a real provider to be end-to-end testable. Twilio's Asia deliverability is the deciding factor
- **Mitigation**: keep the SMS provider behind an interface in `lib/`, so WO-004 can swap the implementation

### C-5 — Bangla + English full bilingual coverage; authored, not auto-translated (Q5)

- **Type**: Operational / Localization
- **Source**: feasibility Q5; team.md Mandated (`lib/i18n/keys.ts`)
- **Implication**: every key in `lib/i18n/keys.ts` has both `bn` and `en` translations at v1; a bilingual toggle is exposed on splash/welcome
- **Mitigation**: Saga gates user-facing copy; the i18n key registry is the single source of truth

### C-6 — Dedup radius is 50m; pins outside the city boundary are rejected (Q6)

- **Type**: Technical / UX
- **Source**: feasibility Q6; intent statement fixes dedup-not-auto-merge
- **Implication**: the report flow needs a city-boundary GeoJSON, supplied by the WO-000 city config endpoint, and a reject UX path that is not yet designed
- **Mitigation**: design the reject path during Scope Definition (parked as a domain-design input); the geofence check is a pre-submit guard

### C-7 — Online-only submit; the ≤ 60s target assumes an active network (Q7)

- **Type**: Operational
- **Source**: feasibility Q7; intent statement's "time-to-submit ≤ 60s" success metric
- **Implication**: a submit failure shows an error and the citizen retries; no offline queue, no service-worker path
- **Mitigation**: explicit network-state UI on pages 1.7–1.10; clear error message on submit failure with a retry button

### C-8 — Dedup-decline flags the underlying ticket for city-side review (Q8)

- **Type**: Operational
- **Source**: feasibility Q8
- **Implication**: when the citizen declines to link, a `declined_match` event is logged and the underlying ticket surfaces on a city-side review queue (the WO-002 dispatcher surface)
- **Mitigation**: the event is structured; the city-side review is a back-office concern, not in this WO's surface

### C-9 — Service-layer code style: `Result<T, E>` never throws (inherits team.md Mandated)

- **Type**: Technical
- **Source**: `aidlc/spaces/default/memory/team.md` ## Mandated
- **Implication**: every new service function in `lib/` for WO-001 returns `Result<T, E>`; Zod-validated inputs at every API boundary
- **Mitigation**: tests assert no throws across the service boundary; PR review check

### C-10 — Visual-regression gating on Rahim's 4 hero mockups at tolerance 0.005 (inherits team.md)

- **Type**: Operational
- **Source**: `aidlc/spaces/default/memory/team.md` ## Testing Posture; intent statement
- **Implication**: any UI work creates a Playwright baseline; tolerance is 0.005 on 1440×900 and 1024×768 viewports
- **Mitigation**: Playwright is wired; CI runs `npm run test:mockups` before merge

### C-11 — Vercel edge runtime does not support VAPID push out of the box

- **Type**: Technical
- **Source**: feasibility Q1 implication
- **Implication**: Web Push (VAPID) is wired in WO-000, but Vercel's edge runtime needs a workaround for the VAPID signature step (Node crypto API)
- **Mitigation**: scope push delivery to a Vercel Node.js function (not edge); document the runtime pinning in the Vercel config

### C-12 — Trunk is `prd-development`, not `main` (inherits team.md)

- **Type**: Operational
- **Source**: `aidlc/spaces/default/memory/team.md` ## Way of Working
- **Implication**: WO-001 Bolts branch from `prd-development` and merge back to `prd-development`
- **Mitigation**: CI matrix targets `prd-development` as the trunk; PRs enforce

### C-13 — Conversation language: English (orchestrator-resolved per turn)

- **Type**: Process
- **Source**: `aidlc/spaces/default/memory/project.md` ## Header
- **Implication**: every human-facing artifact this stage produces is in English; user-facing product copy in `lib/i18n/keys.ts` is Bangla-first, English-secondary
- **Mitigation**: not applicable — this is a process constraint, not a build risk

## Assumptions & Open Questions

None.
