> **Provenance.** Originally authored in the AIDLC lane at
> `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/`.
> Moved here on 2026-11-10 when that stale intent directory was retired;
> the AIDLC method tree (`aidlc/spaces/default/memory/`) remains live.
> Content is unchanged except for self-referential path updates.

# Market Research — Clarifying Questions

> WO-001 (citizen report flow) — Ideation phase, Market Research stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature`.
> Conversation language: English.

## Sources

- [desc] Initial description: "WO-001 citizen report flow: 14 pages on web-first viewports; depends on WO-000 platform layer"
- [intent] `.specsmd/aidlc/memory-bank/intents/002-citizen-report-flow/ideation/intent-capture/intent-statement.md` — civic-observability frame, Rahim archetype today, trust-signal metrics primary
- [memory:M1] `aidlc/spaces/default/memory/team.md### Way of Working` — "All design artifacts under `design-artifacts/` are committed alongside code"
- [memory:M2] `aidlc/spaces/default/memory/team.md### Code Style` — Named exports over default, Result<T, E> service layer, typed i18n
- [memory:M3] `aidlc/spaces/default/memory/team.md### Mandated` — `lib/serializers/ticket.ts` for citizen-facing serialization
- [memory:M4] `aidlc/spaces/default/memory/project.md### Decided` — Four-role auth model fixed for v1
- [memory:M5] `aidlc/spaces/default/memory/project.md### Decided` — Web-first responsive; 14 web-first pages pre-decided
- [memory:M6] `aidlc/spaces/default/memory/project.md### Decided` — Status trail `Submitted → Routed → In progress → Resolved` shared across all surfaces
- [memory:M7] `aidlc/spaces/default/memory/project.md### Tech Stack` — MapLibre + OpenStreetMap dev, Web Push VAPID, Postgres+Prisma, Bangla-first i18n
- [memory:M8] `aidlc/spaces/default/memory/project.md### Decided` — WO-000 platform layer complete (auth, dedup, transitions, push, 5 API routes)
- [phase:P1] `aidlc/spaces/default/memory/phases/ideation.md### Scope Discipline` — "No implementation details (architecture, tech stack, code) in ideation artifacts"
- [phase:P2] `aidlc/spaces/default/memory/phases/ideation.md### Evidence Standards` — Market research claims require citations or explicit source attribution

## Q1. What category of competing or adjacent solutions should we map for the citizen reporting surface?

CityFix targets the gap between "no feedback after reporting" and "anyway the city needs to see the problem." There are several adjacent solution families in Bangladesh and globally that solve pieces of the same problem.

A. Local government hotlines and apps only — DSCC/DNCC complaint apps, mayor's office hotlines, ward councillor Facebook pages; the directly substitutable channels in the same geography and audience.
B. Local + global 311-pattern civic apps — also include SeeClickFix-style, FixMyStreet, Open311, and Bangladesh/international analogues that target the same citizen-reporting job.
C. Local + global + adjacent capture tools — also include 311 apps, social-media-as-reporting (Facebook/WhatsApp community reporting), USSD/SMS-based reporting, and the design patterns of trust-signal / observability civic tech.
D. None — for v1 we treat the platform as greenfield and skip competitive mapping; focus only on differentiation and build-vs-buy.
E. Not yet defined.
X. Other (please specify).

## Q2. Which of those solution families pose the highest substitution risk to Rahim's "submit and forget" flow?

Once the competitive set is fixed (Q1), we need to know which substitutes are most likely to displace or pre-empt CityFix. The PRD's "break the silence loop" claim depends on us being the channel of choice; if a hotline already does this well, our value changes.

A. Local hotlines are the dominant substitute — a working hotline + SMS receipt already delivers the "feel heard" signal.
B. Social-media-as-reporting (Facebook groups, WhatsApp ward groups) is the dominant substitute — Rahim already uses these, and the city-corp responds to public posts.
C. 311-pattern apps (SeeClickFix, FixMyStreet, Open311) are the dominant substitute — proven global pattern; if any of them launches in Dhaka, CityFix loses differentiation.
D. Multi-modal — the substitution risk is split across local hotlines, social media, and 311-pattern apps; we need a defense in all three.
E. Not yet defined.
X. Other (please specify).

## Q3. What regulatory or industry shifts are most relevant to the citizen-reporting surface in the next 12 months?

The PRD implies that the city-corp is the principal customer. Regulatory shifts in Bangladesh (e.g., Digital Security Act, Right to Information Act enforcement, smart-city initiatives, Digital Bangladesh 2.0) and global civic-tech trends (open data, AI-assisted triage) shape both compliance and differentiation.

A. Bangladesh smart-city / Digital Bangladesh 2.0 / DSCC-DNCC digitization programs — these are the structural drivers; alignment with them is a non-negotiable.
B. Open-data / open-311 mandates — global trend toward public-by-default complaint data; opportunity to lead in Bangladesh.
C. AI-assisted triage and routing — emerging trend; could be a v2 differentiator but out of v1 scope.
D. All three — smart-city, open-data, and AI-triage trends are relevant; we should map each with a different priority.
E. Not yet defined.
X. Other (please specify).

## Q4. Which capabilities are "table-stakes" (expected by Rahim) vs. "differentiators" (above his expectation)?

A useful competitor map separates "if we lack this, Rahim won't use us" from "if we have this, he will prefer us over alternatives." The PRD hints at table-stakes (location pin, photo, status trail) and differentiators (city activity feed, push on resolution, feel-heard prompt).

A. Table-stakes = location pin + photo + category + status trail; Differentiators = city activity feed + ward map + push on resolution + feel-heard feedback prompt. (Matches PRD Feature #1–#9 reading.)
B. Table-stakes = full report flow (location + photo + category + note + status); Differentiators = civic observability layer (activity feed, ward map, push) only — everything inside the report flow is now expected.
C. Table-stakes = citizen identity (phone+OTP) + report flow; Differentiators = everything that builds trust signals.
D. The PRD is wrong on this — differentiators and table-stakes are the same thing for v1; we should ship the simplest report flow first.
E. Not yet defined.
X. Other (please specify).

## Q5. For the platform layer (auth, dedup, push, audit, rate-limit), which alternative is the right comparison for the build-vs-buy-vs-partner calculus?

WO-000 shipped a self-built platform layer on Postgres+Prisma [memory:M8]. Was that the right call vs. the alternatives?

A. Self-build was correct — civic-tech stacks are lean and a custom build matches the four-role model and dedup-prompt-not-merge patterns exactly.
B. Self-build was correct but a SaaS partner (e.g., Supabase + Auth0) would have shipped faster — accept the trade-off we made; flag for WO-004 (admin) review.
C. Self-build was wrong — we should be on Supabase/Postgres+Auth0 now; flag as a candidate refactor before the dispatcher/crew/admin WOs land.
D. Mixed — auth and push were the right self-build; rate-limit and audit are commodity; we should consider OSS replacements later.
E. Not yet defined.
X. Other (please specify).

## Q6. For the citizen-facing 14-page surface itself, what is the build-vs-buy-vs-partner calculus?

Mimir will implement 14 pages against the platform. The question is whether any of that surface (registration, OTP, photo capture, map, push opt-in, city activity feed) should be replaced or augmented by a partner/OSS.

A. Self-build all 14 pages — the citizen flow is core differentiation; no partner/OSS replacement makes sense.
B. Self-build 14 pages but use OSS for the map (MapLibre + OpenStreetMap is already OSS per memory:M7); consider OSS replacements for photo capture, geocoding, OTP.
C. Hybrid — self-build the report flow (page 1.7–1.12) and trust-signal layer; consider partner/OSS for registration/OTP/login and for the city activity feed (could use a civic-tech OSS).
D. Out of scope for this WO — defer the build-vs-buy question to the design/UX stages; for market research, we just note that the surface is in scope for self-build.
E. Not yet defined.
X. Other (please specify).

## Q7. What is the addressable audience and target market size for the v1 surface?

The Trigger Map's only-of-record citizen is Rahim. The broader Dhaka-tech-comfortable cohort is the post-pilot acceptance population. What sizing is in scope for this stage?

A. Rahim archetype only — single-persona sizing; defer broader Dhaka population to post-pilot planning.
B. Tech-comfortable Dhaka adult residents (18–55, smartphone owner, urban ward resident) — 2–3M people; top-down sizing from BBS or BTRC data with citations.
C. Tech-comfortable Dhaka adult residents + DSCC/DNCC ward population (all roles) — 5–8M people; includes the eventual authority-side users.
D. All of Bangladesh adult smartphone owners — 60M+; conservative top-down sizing from BTRC mobile-broadband subscription data.
E. Not yet defined.
X. Other (please specify).

## Q8. What is the realistic capture (SOM) in 2–3 years for the citizen surface specifically?

TAM/SAM are theoretical; SOM is the realistic share. Given a single pilot city (Dhaka) and limited marketing budget, the SOM framing is what matters for product/board framing.

A. 1% of tech-comfortable Dhaka adults (~20k–30k active reporters) — pessimistic but defensible.
B. 5% of tech-comfortable Dhaka adults (~100k–150k active reporters) — base case, aligned with goal-setting norms for civic-tech pilots.
C. 10% of tech-comfortable Dhaka adults (~200k–300k active reporters) — optimistic; only justifiable if viral/ward-network effects materialize.
D. Not yet defined — the WO-001 surface is too early for SOM; the success metrics (trust signals) carry the v1 signal and SOM is a post-pilot calculation.
E. Not yet defined.
X. Other (please specify).

## Q9. (Follow-up) Are the "table-stakes" and "differentiators" from Q4 already decided in the PRD, or in scope for re-decision here?

The intent-capture stage established that the 14 pages, 4-status trail, and visual-regression gating are pre-decided [memory:M5][memory:M6]. Q4's "table-stakes vs differentiators" question can either be treated as describing the existing PRD or as re-opening the decision.

A. Treat Q4 as descriptive — the PRD's Feature #1–#9 list is the source of truth; market research describes it, not re-decides it.
B. Treat Q4 as re-decision — market research can flag any Feature as mis-classified (e.g., "photo retention" might be a differentiator we should over-invest in) and propose changes.
C. Treat Q4 as descriptive, but ask the PRD author (Saga) to confirm the table-stakes list before market research claims it.
D. None.
X. Other (please specify).

## Q10. (Follow-up) Should the market-research artifacts include a SWOT analysis or only a competitive matrix?

The stage file lists competitive analysis, market trends, and build-vs-buy as required outputs. A SWOT is optional. Which is the right output shape for v1 market research?

A. Competitive matrix + market trends + build-vs-buy (the three required); no SWOT — keep artifacts lean.
B. Competitive matrix + market trends + build-vs-buy + brief SWOT summary — one paragraph on S/W/O/T, not a full quadrant table.
C. Full SWOT quadrant table — surface the S/W/O/T explicitly so the team can use it in pitch material.
D. None.
X. Other (please specify).

## Assumption Confirmation

The artifacts `competitive-analysis.md`, `market-trends.md`, and `build-vs-buy.md` will contain `## Assumptions & Open Questions` sections with the following assumptions tagged `[assumption]`:

**From competitive-analysis.md:**
1. The competitive set (Q1) is local + global + adjacent capture tools — wide enough to defend the positioning; narrow enough to fit one artifact.
2. The dominant substitute (Q2) is multi-modal — local hotlines + social media + 311-pattern apps.
3. Table-stakes vs differentiators (Q4) is descriptive of the PRD, not a re-decision.

**From market-trends.md:**
1. Three trend families (Q3) are in scope: smart-city Bangladesh programs, open-data, AI-triage.
2. Q9 — table-stakes/differentiators are descriptive; no re-decision in market research.

**From build-vs-buy.md:**
1. The WO-000 platform layer (Q5) was the right self-build call; flag the WO-004 admin-side for partner review.
2. The 14-page surface (Q6) is self-build; OSS allowed for map and possibly geocoding/OTP.
3. Q10 — outputs are competitive matrix + trends + build-vs-buy (no full SWOT) — keep artifacts lean.

A. Accept assumptions
B. Convert to follow-up questions

## Q11. Confirm the dominant-substitute framing (Q2) and the trend families (Q3) as the market-research artifact inputs.

(intent-1, intent-2) Confirm that the competitive and trend inputs to the artifacts are fixed by Q1, Q2, Q3 and that Q9/Q10 are already resolved.

A. Confirmed — Q1=C, Q2=D, Q3=D are the inputs; Q9=A, Q10=A are the resolution rules.
B. Partial — confirm Q1/Q2/Q3; revisit Q9/Q10.
C. None.
X. Other (please specify).

## Q12. Confirm the sizing posture (Q7, Q8) and the build-vs-buy posture (Q5, Q6) for the artifacts.

(intent-3, build-buy-1, build-buy-2) Confirm that the audience/sizing and the self-build call carry forward to the artifacts.

A. Confirmed — Q7=B (tech-comfortable Dhaka adults, top-down), Q8=B (5% base case), Q5=A (platform self-build was right), Q6=B (14-page surface self-build + OSS for map/geocoding/OTP).
B. Partial — sizing and build-vs-buy differ from the proposed reading.
C. None.
X. Other (please specify).
