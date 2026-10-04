# Aamir the Administrator — Persona 05

> Priority: Secondary (administrative)
> Business goals served: G3 (primary), G1 (enabler), G2 (enabler)

---

## Who Aamir Is

Aamir is a senior officer at a city corporation — likely an IT or systems lead at DNCC / DSCC, or the equivalent role at Chattogram or Sylhet when the platform expands. He is in his 30s or 40s, technically capable, and is the person the city corp designates to set up and operate the platform for his city. He works with Habib (dispatcher) and Rashid (field crew) downstream, but he himself never sees a citizen report — he sees the system.

## Psychological Profile

Aamir is **a builder and a custodian**. He takes pride in setting up a system that works for his city, and he takes ownership when it doesn't. He has done system rollouts before — he knows what works and what fails — and he is wary of platforms that look polished in pilot and collapse under real load.

He is **pragmatically cautious about change**. He wants CityFix to land cleanly in his city: configured correctly, with users onboarded, with the right categories and departments mapped. He is not in love with the product — he is responsible for it working.

He **values being seen as the person who made it work**. When the platform launches successfully in his city, he gets the credit inside the city corp. When it fails, he gets the blame. That motivates him.

He is **allergic to hidden complexity**. Every configuration choice in CityFix should be discoverable, documented, and reversible. He does not trust magic.

## Internal State

When Aamir thinks about CityFix, he feels **task-focused with measured responsibility**. He has a checklist: configure, onboard, monitor, support. He wants the platform to land clean so he can move on to other work. He is **quietly anxious about the first month** — once Habib and Rashid and citizens are using it, every glitch reflects on him. He has **steady confidence** in his own ability to set it up, paired with **calibrated skepticism** that the platform will be as easy to operate as the product brief promises.

---

## Usage Context

**How he finds the product:**
Aamir is designated by the city corp leadership to be the administrator. He is onboarded by the CityFix implementation team, not by choice. He receives credentials, a kickoff meeting, and a setup checklist.

**Emotional state on arrival:**
**Practical, slightly skeptical, ready to work.** He has done this before for other systems. He is watching to see if the admin UX is as clean as the citizen UX claims to be.

**Behavior pattern:**
**Checklist-driven, configuration-first, then monitoring.** He opens the admin console, sets up categories, departments, wards, user accounts, language defaults. Then he watches the dashboard for adoption metrics, error rates, and user feedback.

**Decision criteria:**
- **Configuration is discoverable** — no hidden knobs
- **Reversibility** — he can change a decision without breaking what already works
- **Visibility into adoption** — dashboards show him what is and isn't working
- **Audit trail for his changes** — he can defend his setup decisions
- **No surprises for Habib and Rashid** — the dispatcher and field-crew surfaces match what he configured

**Success outcome:**
He completes setup. Habib and Rashid use the platform without confusion. Citizens report in growing numbers. His dashboards show adoption metrics climbing. He can hand a working system to operations and move on.

---

## Driving Forces

### Positive Forces

| # | Force | WHAT | WHY | WHEN | F | I | Fit | Total |
|---|-------|------|-----|------|---|---|-----|-------|
| +1 | **Land the platform cleanly in his city** | Set up categories, departments, wards, language, user accounts without breakage | A failed rollout reflects on him professionally | Initial setup and every per-city onboarding | 5 | 5 | 5 | **15** |
| +2 | **Be seen as the person who made it work** | Get credit inside the city corp for a successful launch | His professional standing depends on outcomes | Quarterly reviews, post-launch recognition | 4 | 4 | 4 | **12** |
| +3 | **See adoption metrics climbing** | Watch active dispatchers, field crews, citizen reports grow | Proof the system is being used, not just installed | Every dashboard view post-launch | 4 | 4 | 5 | **13** |
| +4 | **Have configuration be discoverable and reversible** | No hidden knobs, no irreversible changes | He is allergic to magic and surprise | Whenever he makes a setup decision | 4 | 5 | 4 | **13** |
| +5 | **Have Habib and Rashid use the system without confusion** | The downstream surfaces match what he configured | Misalignment reflects on his setup | First week of operation, every training | 4 | 5 | 5 | **14** |
| +6 | **Defend his setup decisions with an audit trail** | Have a record of every config change | When something goes wrong he needs to know why | When questions arise, when incidents occur | 3 | 4 | 5 | **12** |
| +7 | **Move on to other work after launch** | Hand off a working system to operations | He has other responsibilities besides CityFix | Post-handoff | 3 | 4 | 4 | **11** |

### Negative Forces

| # | Force | WHAT | WHY | WHEN | F | I | Fit | Total |
|---|-------|------|-----|------|---|---|-----|-------|
| −1 | **Stop failed rollouts** | Not repeat the pattern of platforms that work in pilot and break in production | His reputation cannot afford another failed launch | Initial setup, pilot phase | 4 | 5 | 4 | **13** |
| −2 | **Stop hidden complexity in admin UX** | Not encounter configurations that aren't discoverable or documented | He can't defend what he didn't understand | Whenever he makes a setup decision | 4 | 5 | 4 | **13** |
| −3 | **Stop misalignment between config and downstream UX** | Not have Habib and Rashid see something different from what he set up | Misalignment creates support burden | First week of operation | 4 | 5 | 4 | **13** |
| −4 | **Stop being the person on the hook for every glitch** | Not have every minor issue escalate to him | He has other responsibilities | Post-launch | 4 | 4 | 4 | **12** |
| −5 | **Stop the first month of chaos** | Not have a launch period that overwhelms him with questions and bugs | First-month chaos is what kills platform adoption | First 30 days post-launch | 4 | 5 | 4 | **13** |
| −6 | **Stop the per-city rebuild pattern** | Not have to rebuild configuration for each new city | If each city requires rebuilding, Goal 3 fails | When Chattogram or Sylhet comes up | 3 | 5 | 5 | **13** |
| −7 | **Stop magic that breaks at scale** | Not trust the platform to behave differently under load than in pilot | He has been burned before | Pilot → production transition | 3 | 5 | 4 | **12** |

---

## Relationship to Business Goals

- ✅ **Goal 1 — Get things fixed in Dhaka:** Aamir is the **silent enabler** — without his setup, the platform doesn't exist for that city's dispatchers and field crews. Every ticket Habib routes and Rashid fixes depends on Aamir having configured categories and departments correctly.
- ✅ **Goal 2 — Make the city hear citizens:** Aamir ensures the citizen-facing surface (categories, language, jurisdictional routing) actually reflects how the city works. If he misconfigures, citizen reports go to the wrong department and the "being heard" loop fails.
- ✅ **Goal 3 — Operate leanly across cities:** Aamir is the **direct operational expression of Goal 3**. Every new city (Chattogram, Sylhet) becomes his next setup project. The whole "configuration only, not rebuild" thesis is tested against his admin experience. Goal 3 is *literally* his day job.

---

_Produced by Saga — 2026-09-18_
_Source: Trigger Map update — admin role added in response to v1 scope confirmation_
