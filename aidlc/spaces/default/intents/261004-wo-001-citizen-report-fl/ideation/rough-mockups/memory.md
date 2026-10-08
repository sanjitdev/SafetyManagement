<!-- INVARIANT: examples are single-line HTML comments so a fresh template parses to total=0 (MEMORY_EMPTY). Do NOT un-comment or split across lines. t100 guards this. -->
> This file is kept up to date automatically while the stage runs. Add observations at the review step, not by editing here directly.

## Interpretations
- 2026-10-04T14:30:00Z — Rough mockups cover the 12 v1 must-ship pages from scope-document.md (1.1–1.12), keeping the post-v1 surfaces (1.6/1.13) and push (1.14) out of the wireframe set.
- 2026-10-04T14:30:00Z — Rough mockups in this stage stay ASCII / grayscale per the wireframing-guide's low-fidelity rule; visual-regression gating at 0.005 tolerance is reserved for the Refined Mockups stage where pixel baselines matter.
- 2026-10-04T14:30:00Z — Reviewer is aidlc-product-lead-agent with advisory review_class and reviewer_max_iterations=1, so a single review pass lands findings directly at the approval gate; the reviewer does not enter a repair loop.
- 2026-10-07T07:00:00Z — Q1-A (fresh-capture entry) + Q2-A (strict linear 6-step submit) + Q3-B (splash=logo+tagline; welcome=civic hero) lock the wireframe hierarchy. Q4-A persistent top-right toggle is consistent with i18n-keys ownership.
- 2026-10-07T07:00:00Z — Q5-C two-step geofence reject UX closes feasibility R-1 (the explicit "Move pin to supported area" pattern is the R-1 mitigation scope-document.md assigned to Domain Design).
- 2026-10-07T07:00:00Z — Q6-D introduces a new pre-submit summary route (1.10b, /report/summary) as the dedup-prompt surface. The stage flag is forwarded to Refined Mockups + Domain Design to adopt the route in the IA. The dedup-decline toast at 1.11 remains the citizen-facing acknowledgement.
- 2026-10-07T07:00:00Z — Q7-A timeline-as-anchor for 1.12 matches Phase B re-skin's two-column desktop / stacked-mobile pattern. Photo delete is a per-photo action; status trail is the trust-signal core.
- 2026-10-07T07:00:00Z — Q8-A keeps rough-mockups structural (no HTML baselines captured in this stage); pixel baselines stay in Refined Mockups. This honors team.md Mandated without forcing the rough-mockups stage to do pixel work.

## Deviations
- 2026-10-07T07:00:00Z — Introduced /report/summary as a new route to satisfy Q6-D. The route did not appear in the original 14-page WO-001 scope; it is a wireframe-only surface in this stage. Refined Mockups and Domain Design must adopt it as a real route (or surface a question if it conflicts with the strict 1.7–1.10 → 1.11 linear flow).
- 2026-10-07T07:00:00Z — Skipped the home / city activity (1.6) and city activity feed (1.13) wireframes per stage direction (post-v1 surfaces deferred to a later Bolt). The IA still lists them so downstream stages know they exist.

## Tradeoffs
- 2026-10-07T07:00:00Z — Chose ASCII wireframes over minimal-HTML wireframes (Q8-A) to keep the stage focused on IA + flow + the R-1 geofence UX gap. Pixel work is reserved for Refined Mockups where baselines matter.
- 2026-10-07T07:00:00Z — Chose the pre-submit summary route (Q6-D) over a modal (Q6-B) to keep the submit tap free of interruption. The modal pattern was a stronger UX-interrupt signal but it leaks dispatcher semantics into a Rahim-facing surface; the summary route preserves the calm-and-honest brand voice per Project Brief.

## Open questions
- 2026-10-07T07:00:00Z — Refined Mockups needs to decide whether /report/summary is its own route (current draft) or absorbed into 1.10 with a state-driven "summary view". Domain Design can model either; the route is the simpler option and aligns with the linear strict-flow principle.
- 2026-10-07T07:00:00Z — The push notification (1.14) wireframe is referenced but not in the ASCII set. Refined Mockups needs to decide whether the push notification surface gets a visual mockup at all in this WO (it does not have a route — it is a system-native push).
