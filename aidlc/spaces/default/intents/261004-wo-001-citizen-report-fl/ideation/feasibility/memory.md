<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
2026-10-04T12:55:00Z — Q1 (Vercel) read together with team.md's deferred-hosting note: feasibility pre-narrows to Vercel because the WO-001 PRD gate is the right place to ratify a host, not later. The PRD gate still owns the final word; feasibility just plans against a working assumption.
2026-10-04T12:55:00Z — Q3 (indefinite, citizen-initiated delete) is the citizen-agency reading of the "feel heard" trust signal: photos are kept until the citizen chooses otherwise. PII cost is bounded by 365-day unread-photo lifecycle policy in C-3, not by forced deletion.
2026-10-04T12:55:00Z — Q6 (50m + city-boundary geofence) reads with the dedup-prompt-not-auto-merge intent: the geofence is a pre-submit guard, not a dedup policy. The two are orthogonal; the geofence reject path is the design gap flagged in R-1.

## Deviations
2026-10-04T12:55:00Z — Q5 (Bilingual toggle) deviates from the default Bangla-only read of project.md ("Bangla-first, English-secondary") by making the user-facing toggle explicit. The deviation is in the *surface*, not the content: both locales are fully authored, the toggle just lets the citizen pick at splash/welcome.
2026-10-04T12:55:00Z — Q4 (Select now, Asian-friendly) deviates from tech-audit's "real provider chosen in WO-004" by pulling provider selection into feasibility. The driver is the end-to-end testability of the citizen registration flow (1.3, 1.4), not a tech-audit override; the provider interface in `lib/` keeps WO-004 free to swap implementations.

## Tradeoffs
2026-10-04T12:55:00Z — Q2 (Mapbox free → paid) trades the cheapest option (OSM raster everywhere) for a paid-but-styled tile provider. The cost ceiling at 50k loads/month free is comfortable for the pilot; the overage path is documented in R-2 with a Mapbox usage alert and a brownout fallback to OSM.
2026-10-04T12:55:00Z — Q7 (Online-only) trades the more robust optimistic local draft / service-worker patterns for a simpler architecture. The ≤ 60s target assumes an active network; the cost of offline support (IndexedDB queue, sync conflict resolution) is high for a v1 surface and can be added post-pilot if Dhaka network conditions warrant it.
2026-10-04T12:55:00Z — Q8 (Log + flag for review) trades maximum citizen privacy (D: log nothing) for a data-quality signal on the city-side. The structured event is privacy-respecting; the flag surfaces a possible duplicate to the WO-002 dispatcher, who can then take a manual dedup decision.

## Open questions
2026-10-04T12:55:00Z — confirm with Saga that bilingual toggle on splash/welcome (Q5) does not conflict with the WO-001 PRD's i18n chapter; if the PRD mandates a single default locale, feasibility's Q5 answer needs to be revised.
2026-10-04T12:55:00Z — confirm with the city-corp sponsor that the city boundary GeoJSON (D-4) is publishable through the WO-000 city config endpoint. The geofence is best-effort until the boundary is published; the reject path is the design work that must happen in Scope Definition regardless.
2026-10-04T12:55:00Z — confirm the legal basis for indefinite photo retention (Q3, A-3) with the city-corp sponsor. The intent is "citizen consent at upload", but a written retention policy on the registration page is the strongest pattern; not a feasibility blocker but worth pinning before Scope Definition.

