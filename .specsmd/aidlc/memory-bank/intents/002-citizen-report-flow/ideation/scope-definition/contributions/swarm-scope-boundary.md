> **Provenance.** Originally authored in the AIDLC lane at
> `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.
> Moved here on 2026-11-10 when that stale intent directory was retired;
> the AIDLC method tree (`aidlc/spaces/default/memory/`) remains live.
> Content is unchanged except for self-referential path updates.

**Collaborator:** swarm-scope-boundary

## Contribution

### Q1 — MVP boundary for v1
**Selected answer**: C
**Rationale**: The intent statement's primary success metric is trust signals (status trail, push, feel-heard feedback), and the framing is "civic observability — make silence unmaintainable" [intent-statement, Problem Statement]. Option C keeps the entire submit path (1.1–1.11) plus the citizen's persistent view of their own report (1.12, which carries the status trail — the literal "submitted → routed → in progress → resolved" trust signal that project.md declares frozen [memory:M4]), and defers the discovery/read-side surfaces (1.6 Home, 1.13 Feed) and push (1.14). 1.12 is what makes Rahim's report feel heard even before WO-002 begins routing; without it the submit is a black box again. R-5 (VAPID+Vercel edge) and R-3 (Twilio BD deliverability) make push the riskiest must-ship surface, so deferring 1.14 protects the trust loop while the build lead (Mimir) de-risks those in parallel.

### Q2 — Must-have vs. could-have split for v1
**Selected answer**: A
**Rationale**: A matches the same Q1 boundary but at finer grain: 1.1–1.5 (auth + onboarding), 1.7–1.11 (submit), 1.12 (own-reports detail with status trail + photo delete per feasibility Q3), and 1.14 (resolution push) are must-have. 1.6 and 1.13 are must-have for civic-observability-as-discovery only after the submit loop is proven; cutting them to "could" lets the build lead sequence Bolts without the map-heavy map spend (R-2: Mapbox 50k free tier) gating pilot launch. Option B drops 1.12, which breaks the persistent status trail the citizen needs to feel heard (intent statement, Trust signals). Option D forbids any cut, which violates team.md Mandated visual-regression gating at tolerance 0.005 on hero mockups — we need at least one could-have slot to absorb hero-vs-derivative split decisions cleanly later.

### Q6 — Walking-skeleton scope for the first Bolt
**Selected answer**: B
**Rationale**: team.md Mandates "smallest working integrated slice" and the intent's success criterion is the full submit → persistent status trail loop, not just submission. Option A leaves the skeleton with no read surface, so the trust signal reduces to a toast — exactly the "shouting into the void" pain the intent names as the thing to fix [intent-statement, N2]. Option B (1.1–1.12) closes the loop end-to-end on day one: Rahim can submit AND revisit his own report AND see the status trail change. Push (1.14) belongs in a later Bolt because R-5 (VAPID+Vercel edge runtime) and the Twilio dependency (D-3, R-3) carry setup cost that a skeleton shouldn't absorb; push is a closing-the-loop nicety, not a skeleton requirement. Activity feed (1.6, 1.13) is the heaviest Mapbox surface (R-2) and reads from the WO-002-routed stream — defer it.

## Positions
- AGREE: Feasibility Q3 indefinite-clearing + citizen-initiated delete on 1.12 — directly supports the "feel heard" trust signal and matches project.md's PRD-level decision. — One-line rationale: this is the cheapest way to put proof of progress in the citizen's hand without dispatcher read access.
- AGREE: Pre-decided cross-cutting scope (four-role auth, WebAuthn-mandatory-for-admin, dedup-not-merge, status trail, Result<T,E>, visual-regression gating 0.005) is frozen for v1 per intent statement and project.md — must not be re-opened in scope-definition.
- OBJECT: The intent statement and feasibility mark photo retention + dedup radius as PRD-level decisions, but the geofence reject UX (R-1) is still undesigned and tagged as a Scope Definition input — without that path, the 1.7 boundary check is incomplete. Scope Definition must flag this as a blocker for downstream Domain Design, not let it slip into Construction.
- OBJECT: Option B for Q1 and Option A for Q2 leave push (1.14) in the v1 must-ship set, but R-5 + D-3 (VAPID+Vercel edge, Twilio BD) make 1.14 the highest-risk must-have surface in the cut. The scope document should record 1.14 as "must-have, but the first Bolt that touches it follows the risk-first de-risking in Q3-B" so the build lead is not surprised.