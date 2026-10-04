# Feature Impact Analysis — CityFix

> Phase 2 — Trigger Mapping · Workshop 5
> Derived from: 02-persona-rahim-the-reporter.md, 03-persona-habib-the-handler.md, 04-persona-rashid-the-resolver.md, 05-persona-aamir-the-administrator.md
> Status: Final — admin features folded in, ready for handoff to Freya / Mimir

---

## Scoring Method

Features are inferred from the driving forces of all four personas (not invented). Each candidate feature is scored against each driving force on a 0–3 scale:

- **0** — no impact
- **1** — minor indirect impact
- **2** — meaningful impact
- **3** — directly addresses this force

Each score is weighted by the force's FIA total (/15). The weighted sum across all forces and personas produces the feature's total impact score.

Forces ≥ 13 were used as primary design inputs (per the Trigger Map). Forces 9–12 were considered but weighted lower.

---

## Feature Candidates and Scores

| Rank | Feature | Rahim (Citizen) | Habib (Dispatcher) | Rashid (Field) | Aamir (Admin) | Weighted Total | Priority |
|------|---------|----------------:|-------------------:|---------------:|--------------:|---------------:|----------|
| 1 | **One-tap report submission** (photo + GPS + category, ≤60 sec) | 12.0 | 2.0 | 6.0 | 0.0 | **20.0** | High |
| 2 | **Live status trail visible to citizen** (submitted → routed → in-progress → resolved, with timestamps) | 12.0 | 4.0 | 4.0 | 0.0 | **20.0** | High |
| 3 | **Dedup engine** (raw reports collapse to one ticket per physical problem) | 8.0 | 10.0 | 6.0 | 0.0 | **24.0** | High |
| 4 | **Mobile-first, low-bandwidth field-crew app** (works on 3G, offline-tolerant, one-tap status changes) | 0.0 | 0.0 | 14.0 | 0.0 | **14.0** | High |
| 5 | **Dispatcher queue dashboard** (filter by status / age / category / ward, assign to crew in 2 taps) | 0.0 | 13.0 | 6.0 | 0.0 | **19.0** | High |
| 6 | **Public ward-level dashboard** (overdue tickets, resolution rates by ward; "silence is visible") | 6.0 | 8.0 | 2.0 | 0.0 | **16.0** | High |
| 7 | **City activity feed + map** (citizens see other reports and fixes in real time) | 9.0 | 2.0 | 0.0 | 0.0 | **11.0** | High |
| 8 | **Photo + map pin upfront on every ticket** (what Rashid sees first when an assignment arrives) | 0.0 | 0.0 | 12.0 | 0.0 | **12.0** | High |
| 9 | **Push notifications for status changes** on the citizen's own reports | 9.0 | 4.0 | 4.0 | 0.0 | **17.0** | High |
| 10 | **Audit log / searchable ticket history** per ticket and per ward | 0.0 | 9.0 | 4.0 | 0.0 | **13.0** | High |
| 11 | **Per-city configuration** (categories, departments, wards, Bangla/English toggles) | 0.0 | 0.0 | 0.0 | 15.0 | **15.0** | High |
| 12 | **Photo before/after pair on resolved tickets** | 7.0 | 4.0 | 7.0 | 0.0 | **18.0** | High |
| 13 | **Citizen feedback after ticket close** (rating + optional comment) | 6.0 | 4.0 | 0.0 | 0.0 | **10.0** | Medium |
| 14 | **Dispatcher performance dashboard** (queue size, aging, SLA breaches by category) | 0.0 | 9.0 | 0.0 | 0.0 | **9.0** | Medium |
| 15 | **In-app onboarding for first-time citizens** (3-tap tutorial, no signup friction) | 5.0 | 0.0 | 0.0 | 0.0 | **5.0** | Medium |
| 16 | **Multi-language toggle** (Bangla default, English optional) | 4.0 | 4.0 | 4.0 | 4.0 | **16.0** | High |
| 17 | **Voice-to-text for citizen reports** (low-literacy users; officer commentary in field) | 3.0 | 0.0 | 6.0 | 0.0 | **9.0** | Medium |
| 18 | **Authority-influenced routing rules** (Habib can shape category → department mappings over time) | 0.0 | 4.0 | 0.0 | 0.0 | **4.0** | Deprioritized |
| 19 | **Ward-boundary editor** (per-city administrative map; draw/polygon tools for ward polygons and category-to-ward rules) | 0.0 | 0.0 | 0.0 | 13.0 | **13.0** | High |
| 20 | **User provisioning & role assignment** (create dispatcher / crew / admin accounts, role binding, password / WebAuthn policy per role) | 0.0 | 0.0 | 0.0 | 14.0 | **14.0** | High |
| 21 | **Post-launch adoption dashboard** (city-by-city adoption metrics: active dispatchers, active crews, citizen reports/day, time-to-resolution trends) | 0.0 | 0.0 | 0.0 | 13.0 | **13.0** | High |
| 22 | **Configuration audit trail** (every config change recorded with actor, before/after values, reversible from UI) | 0.0 | 0.0 | 0.0 | 12.0 | **12.0** | High |

\* Feature #11 (per-city configuration) addresses Goal 3 (operate leanly across cities) structurally. Its score now reflects direct impact on Aamir's positive forces, not just the structural argument.

### Scoring rationale (top 8 features)

**#1 — One-tap report submission** directly addresses Rahim's P5 (Reclaim his own time, FIA 13), N4 (Avoid the time-sink of official reporting, FIA 13), and partially P1 (Restore normal life, FIA 14). Indirectly supports Habib's N6 (Stop the WhatsApp-and-phone chaos, FIA 14) by reducing the volume of phone-WhatsApp-channel reports. Lower impact on Rashid (he receives, not submits). No direct Aamir impact.

**#2 — Live status trail** directly addresses Rahim's P3 (Feel heard enough to keep hoping, FIA 14) and N2 (Escape the helplessness of shouting into the void, FIA 14). Partially addresses Habib's +5 (Build a record, FIA 12) and N5 (No answer when citizens call back, FIA 13).

**#3 — Dedup engine** directly addresses Habib's N2 (Stop drowning in duplicate paper tickets, FIA 13), N5 (No answer when citizens call back, FIA 13), and P5 (Build a record that survives paper, FIA 12). Indirectly supports Rahim's N2 (escape the void — proves he wasn't ignored because his report collapsed into a known tracked ticket) and Rashid's N2 (Stop being sent to the wrong place — duplicates of the same problem route as one job).

**#4 — Mobile-first, low-bandwidth field-crew app** directly addresses Rashid's +5 (Tools that survive the field, FIA 15) and +1 (Get the next job with all the right info, FIA 15). Without this, the entire field-crew side collapses. It is a *gating* feature, not a nice-to-have.

**#5 — Dispatcher queue dashboard** directly addresses Habib's +3 (Make daily chaos manageable, FIA 14), N3 (Stop losing track of who's doing what, FIA 14), N1 (Stop being the dead end, FIA 14), and N6 (Stop the WhatsApp-and-phone chaos, FIA 14). The highest-leverage feature inside the city corporation.

**#6 — Public ward-level dashboard** addresses Rahim's +3 (Feel heard enough, FIA 14) and +4 (Protect family, FIA 13) by making silence visible. Habib's N4 (Stop looking passive to supervisor, FIA 12) is also indirectly served, because overdue tickets become a supervisor concern, not a Habib concern.

**#7 — City activity feed + map** addresses Rahim's +1 (Restore normal, FIA 14) by showing visible motion; his engagement pattern (10+ opens/day, power-user behavior) depends on this existing.

**#8 — Photo + map pin upfront on ticket assignment** addresses Rashid's +1 (Get next job with all right info, FIA 15) and N2 (Stop being sent to wrong place, FIA 14) — direct gating feature.

### Scoring rationale (admin features — added 2026-09-18)

**#11 — Per-city configuration** directly addresses Aamir's +1 (Land the platform cleanly in his city, FIA 15), +4 (Configuration discoverable and reversible, FIA 13), +5 (Habib and Rashid see what he configured, FIA 14), and negatively addresses N6 (Stop per-city rebuild, FIA 13). Re-scored from structural-only to direct-FIA-anchored because Aamir's persona makes the impact concrete.

**#19 — Ward-boundary editor** addresses Aamir's +1 (Land cleanly, FIA 15), +4 (Discoverable config, FIA 13), and negatively addresses N2 (Stop hidden complexity, FIA 13) and N3 (Stop misalignment between config and downstream UX, FIA 13). A drawing tool that produces the polygons every other surface reads from.

**#20 — User provisioning & role assignment** addresses Aamir's +1 (Land cleanly, FIA 15), +5 (Habib and Rashid see what he configured, FIA 14), and +6 (Audit trail, FIA 12). WebAuthn policy per role is the gating decision (mandatory for admin writes; optional for dispatcher/crew). Without this, Habib and Rashid cannot log in to the city he set up.

**#21 — Post-launch adoption dashboard** addresses Aamir's +3 (See adoption metrics climbing, FIA 13) and negatively addresses N4 (Stop being on the hook for every glitch, FIA 12). It is the surface that converts "is it working?" from gut feel to evidence — and gives him material to defend the rollout in city-corp reviews.

**#22 — Configuration audit trail** addresses Aamir's +6 (Defend setup decisions with audit trail, FIA 12) and +4 (Discoverable and reversible config, FIA 13). Every config change is recorded with actor, timestamp, and before/after values; reversibility is one click in the same UI. Without this, Aamir cannot defend setup decisions when incidents happen.

---

## High Priority

Features addressing top-scored driving forces. Must be in the core product for v1.

**1. One-tap report submission (≤ 60 sec, mobile)**
- Forces addressed: Rahim P5 (FIA 13), N4 (FIA 13), P1 (FIA 14); partially Habib N6 (FIA 14)
- Design implication: photo + GPS pin + category picker + submit, no forms, no signup before first report. Default open → camera view. The single most-used flow in the app.

**2. Live status trail visible to citizen (with timestamps and current state)**
- Forces addressed: Rahim P3 (FIA 14), N2 (FIA 14); partially Habib P5 (FIA 12), N5 (FIA 13)
- Design implication: each ticket has a public timeline (submitted → routed to [Department] → in progress → resolved). Citizen gets a push notification on each transition.

**3. Dedup engine (raw reports collapse to one tracked ticket per physical problem)**
- Forces addressed: Habib N2 (FIA 13), N5 (FIA 13), P5 (FIA 12); partially Rahim N2 (FIA 14) and Rashid N2 (FIA 14)
- Design implication: when a citizen submits near an existing open ticket within a tight radius and same category, prompt "Looks similar to an existing report — link to it instead?" rather than auto-merge. Citizen agency preserved.

**4. Mobile-first, low-bandwidth field-crew app**
- Forces addressed: Rashid +5 (FIA 15), +1 (FIA 15); partially Rashid +4 (FIA 13), N6 (FIA 13)
- Design implication: works on 3G, tolerates offline queueing with sync on reconnect, photo + map first screen, one-tap status changes (in progress / resolved / blocked), no free-text forms. *Gating feature for the entire field-crew side.*

**5. Dispatcher queue dashboard**
- Forces addressed: Habib +3 (FIA 14), N3 (FIA 14), N1 (FIA 14), N6 (FIA 14); partially Rashid N2 (FIA 14)
- Design implication: filterable queue (status / age / category / ward), assignment in 2 taps, visible status trail per ticket, overdue highlighting.

**6. Public ward-level dashboard (overdue tickets, resolution rates)**
- Forces addressed: Rahim +3 (FIA 14), +4 (FIA 13); partially Habib N4 (FIA 12)
- Design implication: surface silence — wards with the most overdue tickets are visible. Without this, authority silence is invisible to the public and Goal 2 fails.

**7. City activity feed + map**
- Forces addressed: Rahim +1 (FIA 14)
- Design implication: civic engagement loop. Rahim's power-user behavior (10+ opens/day) depends on this being rich, real-time, and honest about what is and isn't moving.

**8. Photo + map pin upfront on every ticket (visible to dispatchers and field crews)**
- Forces addressed: Rashid +1 (FIA 15), N2 (FIA 14); partially Rashid +2 (FIA 14)
- Design implication: the first screen for any ticket view shows citizen photo + map pin + category. Photo is the truth source.

**9. Push notifications for status changes on the citizen's own reports**
- Forces addressed: Rahim P3 (FIA 14), N2 (FIA 14)
- Design implication: every transition pings the citizen. Cheap and high-impact — the "feel heard" loop has to reach the citizen where he is.

**10. Audit log / searchable ticket history per ticket and per ward**
- Forces addressed: Habib P5 (FIA 12), N5 (FIA 13)
- Design implication: when supervisor asks "what happened to this?" Habib has an answer. When citizen asks the same, Habib can point to the public trail.

**11. Per-city configuration (categories, departments, wards, language toggles)**
- Forces addressed: Aamir +1 (FIA 15), +4 (FIA 13), +5 (FIA 14), N6 (FIA 13)
- Design implication: a new city sets up by configuring, not by code. Dhaka template pre-populates categories, departments, ward template, and language defaults — Aamir tunes, not builds. Goal 3 depends on this.

**12. Photo before/after pair on resolved tickets**
- Forces addressed: Rahim P3 (FIA 14); Habib P5 (FIA 12); Rashid +3 (FIA 12)
- Design implication: proof of fix. Visible to citizens and supervisors. Closes the loop visibly.

**16. Multi-language toggle (Bangla default, English optional)**
- Forces addressed: all four personas (cross-cutting; matches the Product Brief language strategy); Aamir gets +5 (Habib and Rashid see what he configured, FIA 14) via per-city language default.
- Design implication: not a feature addition — it is the default-mode decision throughout the app.

**19. Ward-boundary editor (per-city administrative map)**
- Forces addressed: Aamir +1 (FIA 15), +4 (FIA 13), N2 (FIA 13), N3 (FIA 13)
- Design implication: a map editor inside the admin console with polygon-draw tools, ward naming, default category-to-ward routing rules. The polygons produced here are the same polygons every dispatcher and citizen map reads from. Aamir must see a preview before publish.

**20. User provisioning & role assignment**
- Forces addressed: Aamir +1 (FIA 15), +5 (FIA 14), +6 (FIA 12)
- Design implication: create / disable dispatcher, crew, and admin accounts. Bind each to a ward and a role. WebAuthn mandatory for any admin write action; optional for dispatcher and crew in v1. Role list is fixed (admin / dispatcher / crew / citizen) — no custom-role builder in v1.

**21. Post-launch adoption dashboard**
- Forces addressed: Aamir +3 (FIA 13), N4 (FIA 12)
- Design implication: city-scoped view showing active dispatchers, active field crews, citizen reports/day, time-to-resolution trend, dedup effectiveness. Public version of the same data is out of scope — this is an internal Aamir surface.

**22. Configuration audit trail**
- Forces addressed: Aamir +6 (FIA 12), +4 (FIA 13)
- Design implication: every config change is recorded with actor, timestamp, before/after values. Reversal is one click for the most recent change; rollback to any prior point is auditable. Lives inside the admin console, not as a separate system.

---

## Medium Priority

Address if feasible; enhance without blocking core value.

**13. Citizen feedback after ticket close** — addresses Rahim +2 (FIA 13), +3 (FIA 14) for measurement; supports Goal 2.3 (citizen satisfaction tracking).
**14. Dispatcher performance dashboard** — addresses Habib P2 (FIA 13); gives Habib upward evidence.
**15. In-app onboarding tutorial for first-time citizens** — addresses Rahim N4 (FIA 13) by reducing first-time friction; small implementation effort.
**17. Voice-to-text for citizen reports** — addresses accessibility and low-literacy edge cases; could expand reach to a broader citizen base.

---

## Deprioritized

Low impact on current driving forces or weak fit. Consider in future iterations.

- **18. Authority-influenced routing rules** (Habib P7, FIA 9) — Habib would like this but it adds complexity and configurability risk for v1; defer to post-pilot.
- **Citizen profile pages** — not implied by any force; citizens don't need profiles for v1.
- **Social / community discussion threads** — explicitly excluded in product brief; phone / SMS / WhatsApp / email status updates cover the same need more simply.
- **Public voting / upvoting on reports** — explicitly excluded by product concept (civic prioritization is an authority function, not a citizen vote).
- **In-app payment / fines / fees** — explicitly out of scope (no commerce per product brief).
- **Custom role builder** — Aamir gets a fixed role list (admin / dispatcher / crew / citizen). Per-city custom roles add configurability risk and aren't implied by any Aamir force in v1.
- **Public version of adoption dashboard** — internal Aamir surface only; exposing per-city adoption publicly conflates authority accountability with civic theatre and isn't implied by any force.

---

## Gap Analysis

High-scored driving forces with no strong product response. Flagged for Freya's UX Scenarios to address at scenario level (not feature level).

| Force | Persona | FIA Score | Gap |
|-------|---------|-----------|-----|
| **Restore normal, low-friction daily life** | Rahim | 14 | The platform cannot make the road actually un-broken by morning; it can only make the report visible and tracked. Rahim's ultimate goal (a normal day) is only achievable if Habib + Rashid close the loop in reality. **The product's job is to surface the chain and make silence visible — the actual fix depends on the city corp acting.** |
| **Avoid the moment his family gets hurt by a known problem** | Rahim | 12 | CityFix does not prevent injury; it can speed the report-to-fix cycle but cannot eliminate the window of risk. **The product must be honest about its limits in copy and never over-promise.** |
| **Help shape how the city responds** | Habib | 9 | Habib would like authority-side configurability (routing rules, category mappings). Deferred from v1 for simplicity but flagged as a post-pilot addition. |
| **Stop being the invisible end of the chain** | Rashid | 11 | Field crews want their work visible beyond the ticket closure. Recognized-but-not-fixed in v1; could be addressed via a public-facing "our crews" feed in v2. |
| **Avoid deepening cynicism of a city that doesn't respond** | Rahim | 12 | This is fundamentally outside the product. The public ward dashboard (Feature #6) is the only direct lever; the rest is up to Habib and Rashid and the city corp they work for. |
| **Stop being the person on the hook for every glitch** | Aamir | 12 | Adoption dashboard (Feature #21) and configuration audit trail (Feature #22) are the partial levers. The structural lever — Aamir having operational staff between him and Habib / Rashid — is outside the product. v1 reduces but does not eliminate this force. |
| **Stop magic that breaks at scale** | Aamir | 12 | Addressed in part by discoverable-and-reversible configuration (Feature #11) and audit trail (Feature #22). Full resolution requires operational maturity (runbooks, on-call) that lives outside the product. |

---

## Admin-feature coverage summary

| Aamir driving force (FIA) | Addressed by feature(s) | Coverage |
|---|---|---|
| +1 Land cleanly (15) | #11 per-city config, #19 ward editor, #20 user provisioning | Direct |
| +2 Be seen as person who made it work (12) | #21 adoption dashboard (visibility surface for his reviews) | Indirect |
| +3 See adoption metrics climbing (13) | #21 adoption dashboard | Direct |
| +4 Discoverable and reversible config (13) | #11 per-city config, #19 ward editor, #22 audit trail | Direct |
| +5 Habib and Rashid see what he configured (14) | #11 per-city config, #20 user provisioning | Direct |
| +6 Audit trail (12) | #22 config audit trail, #10 ticket audit log (already in scope) | Direct |
| +7 Move on to other work (11) | #22 audit trail (operational handover defensible) | Indirect |
| −1 Stop failed rollouts (13) | #11 per-city config (Dhaka template), #20 user provisioning | Direct |
| −2 Stop hidden complexity (13) | #11 per-city config, #19 ward editor | Direct |
| −3 Stop config/downstream misalignment (13) | #11 per-city config, #19 ward editor, #20 user provisioning | Direct |
| −4 Stop being on the hook for every glitch (12) | #21 adoption dashboard, #22 audit trail | Partial |
| −5 Stop first-month chaos (13) | #11 Dhaka template, #20 user provisioning | Partial |
| −6 Stop per-city rebuild (13) | #11 per-city config, #19 ward editor (reused across cities) | Direct |
| −7 Stop magic that breaks at scale (12) | #22 audit trail, #11 per-city config | Partial |

**Headline:** all of Aamir's seven positive forces have direct or near-direct coverage in v1. Three of his seven negative forces (N1, N2, N3, N6) are directly addressed by per-city configuration and the ward-boundary editor; the remaining three (N4, N5, N7) are partially addressed and remain partially structural — they require operational maturity outside the product.

---

_Produced by Saga — 2026-09-18_
_Originally derived from: 02-persona-rahim-the-reporter.md, 03-persona-habib-the-handler.md, 04-persona-rashid-the-resolver.md_
_Updated 2026-09-18 — admin persona (05) folded in: features #19, #20, #21, #22 added with FIA scoring; admin coverage summary appended; gap analysis extended with Aamir's structural forces._
