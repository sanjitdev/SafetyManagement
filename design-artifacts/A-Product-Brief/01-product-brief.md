# Product Brief — CityFix

2026-09-18

## Vision

CityFix exists to break the silence loop that frustrates urban citizens.

In large cities, residents encounter the same broken infrastructure every day — potholes, streetlights, open drains, overflowing garbage, waterlogged roads — but have no clear place to report, no clarity on who is responsible, and no feedback that anything is moving. The result is not just inconvenience; it is the slow erosion of trust between citizen and city.

CityFix gives citizens a single, trustworthy place to report civic infrastructure problems and see real motion toward resolution. The psychological relief of being heard carries users through the wait; the visible status chain (report → routed authority → tracked work → confirmed fix) is what rebuilds confidence that the city can be maintained. The ultimate measure of success is the fix itself, but the product experience is engineered around the trust that makes citizens submit the next report.

## Positioning

**Target user:** Tech-comfortable adult residents of large cities — starting with Dhaka. The unifying behavior is *not* their route (daily commuter) but the act of noticing a civic problem not being addressed. It could be on the way to work, on a walk through the neighborhood, in a park, or on a one-off drive.

**Why they choose CityFix over today's alternatives:**

Today, reporting a city problem requires the citizen to know who's responsible, find the right phone number or office, fill out a clunky form, or post on social media hoping for attention. After all that effort, they typically never hear what happened to the complaint. CityFix is the obvious next action: open the app, drop a pin, take a photo, pick a category, submit. No need to know the responsible department. A visible status chain replaces the black box.

**What makes CityFix different:**

- **Zero routing friction** — the citizen doesn't need to know who's responsible; the system routes by category and ward.
- **Visible motion** — every report has a status trail the citizen can revisit.
- **Trust through dedup** — five people reporting the same pothole produce one tracked ticket; the citizen sees they weren't shouting into the void.
- **Replaces paper** for the authority side, which is the durable moat once ward offices adopt the platform.

## Business Model

**Model:** Government-operated civic service. Fully publicly funded. No pricing to citizens.

**First deployment:** Dhaka (single-city pilot).

**Expansion path:** Other major Bangladeshi cities — Chattogram, Sylhet, and beyond — onboarded with their own internal authority workflows configured per city.

**Authority as operator:** City corporations, ward offices, and utility departments dispatch field teams to resolve reported issues. They adopt CityFix to replace fragmented paper registers, phone calls, and informal WhatsApp-based complaint handling.

**Implications for product design:**

- v1 must support per-city configuration (issue categories, responsible departments, jurisdictional boundaries, Bangla-first localization) so that the platform can be redeployed per city without rebuild.
- Authority onboarding is a core commercial and product surface — without departments using the platform, citizens see no motion and the trust loop collapses.

## Business Customers

CityFix serves three distinct user populations, all in scope from day one for v1.

**Authority sponsors (buyers):**

Senior officials in city corporations, ward offices, and utility departments who decide "we run CityFix" and allocate staff and budget to operate it. Their evaluation criteria: does this platform actually replace our existing paper-and-WhatsApp workflows and improve accountability?

**Authority day-to-day users (operators):**

- **Dispatcher / queue runner.** Desk officer at a ward or department office. Receives incoming tickets already routed by category. Manages the queue, assigns tickets to field crews, marks status updates, and confirms resolution. Mostly desktop / tablet.
- **Field crew (mobile).** Road-repair team, lighting crew, sanitation crew. Receives a ticket with photo and map location, drives to it, fixes it, then in-app marks resolved with an "after" photo. Mobile-first, sometimes low-bandwidth.
- **Admin (configuration).** Thin role responsible for setting up categories, departments, ward boundaries, and user accounts for the city.

**Citizens (end-users):**

Tech-comfortable urban residents who report problems and track status. Mobile-first. Not the buyer; they are the beneficiary of the publicly funded service.

**Implication:** Because the platform serves dual audiences with different devices, roles, and success criteria, the product surface is fundamentally two-sided from v1 — not a one-way intake form. A citizen-only v1 would break the trust loop (no visible motion) and fail.

## Target Users

### Citizen — "the daily observer"

A tech-comfortable adult resident of Dhaka who notices civic infrastructure problems in their community — on a daily route, in their neighborhood, at a park, while running errands. They use a smartphone, expect app-first experiences, and have low patience for bureaucratic friction.

**Current behavior:**

- Ignores most problems out of learned helplessness.
- Occasionally posts to Facebook, hoping someone notices or the page is monitored.
- Rarely calls the city corporation hotline (often unsure of the number, often unanswered).
- Has no expectation of feedback.

**Pain points:**

- Doesn't know who is responsible for what they're seeing.
- Doesn't know whether action is even possible.
- Wastes time trying to figure out where to report.
- Reports something and never hears back.
- Sees the same problem for months running.

**Behavior with CityFix:**

Opens app, drops a pin where the problem is, takes a photo, picks a category ("pothole", "streetlight", "garbage", "drain"), adds a short note, submits. Saves a minute or two of figuring out where to report. Expects to come back later and check status. Most reports will be one-off; a meaningful fraction will be repeat users.

### Authority dispatcher — "the queue runner"

A desk officer at a ward or department office inside a city corporation. Replaces what today is a paper register and a WhatsApp group. Their workday begins with reviewing the ticket queue, not with phone calls.

**Current behavior:**

- Receives citizen complaints via phone calls, walk-ins, and forwarded WhatsApp messages.
- Writes down details in registers; files by date and ward.
- Forwards by hand or phone to relevant departments.
- Has no consolidated view of open work, aging tickets, or duplicates.
- Citizens call back asking "what happened?" and has no good answer.

**Pain points:**

- Information is fragmented across channels.
- Duplicate reports of the same problem arrive independently.
- Hard to track open / aging / closed work in one place.
- Manual follow-up burden on every report.

**Behavior with CityFix:**

Opens the dashboard at the start of shift. Sees the queue of tickets routed to their ward / department. Triage: assigns to a field crew, marks "in progress" when notified, marks "resolved" with an "after" photo when confirmed by the crew. Uses filters and aging indicators to prioritize overdue work.

### Field crew — "the mobile responder"

Road-repair team, lighting crew, or sanitation crew working in the field. Receives a ticket in the mobile app with photo and map pin, drives to the location, fixes the issue, and confirms resolution in-app with an after-photo.

**Current behavior:**

- Receives instructions by phone call from the dispatcher.
- Drives to the described location, often with incomplete details.
- Completes the fix.
- Sometimes writes back, often doesn't.
- No record of what was fixed where, and when.

**Pain points:**

- Vague location descriptions, no photo.
- No checklist or context for what was reported.
- Confirmation step (if any) is informal and undocumented.

**Behavior with CityFix:**

Receives push notification for a new assignment. Opens the ticket to see citizen photo, description, and map location. Drives to the site. Marks "on site" and "in progress" as the work proceeds. After completion, takes an "after" photo and marks "resolved" with a brief note. Operates primarily from a phone, often in low-signal areas.

## Product Concept

**CityFix is a city-wide wellness maintaining system.**

Not an issue tracker, not a complaint portal, not a CRM with citizens as tickets. The product's subject is the city itself — the system's job is to keep the city's physical condition healthy, and citizens are the sensory network that detects when something is wrong.

This framing puts the product in a category of its own:

- **The city's wellness is the product.** Citizens and authorities are participants in maintaining that wellness. "Tickets" become "city health signals."
- **Authority staff are caretakers of the city,** not support agents handling complaints. Their UI should feel like maintenance work, not complaint-triage work.
- **The system is reactive in v1 but framed for proactive.** Today, an action is triggered by a citizen report. The product is structured to allow future ingestion of passive signals (IoT sensors, sanitation routes, etc.), but v1 is citizen-triggered and remains focused on physical infrastructure (roads, lights, drains, garbage, water) — not environmental data (air, noise, encroachment).

## Success Criteria

**Headline target (12 months post-launch):**

~25% of Dhaka's adult urban residents aware of CityFix.

This is the only hard number the team has committed to. It is the leading indicator of volume and throughput — without awareness, neither follows. The 25% figure applies to Dhaka; expansion-city awareness will be set per-launch.

**Directional targets (to be measured, not invented):**

- **Volume → Reports submitted.** Sufficient month-on-month growth to demonstrate adoption. Specific targets to be set post-pilot based on Dhaka-specific data.
- **Throughput → Resolution rate.** The majority of submitted reports eventually reach a closed status. What fraction, and within what window, will be calibrated per-category after the pilot (e.g., streetlight resolution is fast; road work is longer).
- **Speed → Time-to-resolution.** Faster than today's "no feedback" baseline. Specific SLAs will be set per category with the operating authority post-onboarding.
- **Trust → Dedup effectiveness.** A high share of raw reports about the same physical problem collapse to one tracked ticket. This is the proof to the citizen that the system absorbed their voice without making them repeat themselves.
- **Stickiness → Repeat usage.** A meaningful fraction of users submit more than one report in year 1 — the strongest signal that the platform earned follow-through.

**Out of scope as success metrics (for v1):**

- Resolution quality / citizen satisfaction scoring per ticket (deferred to post-pilot).
- Authority-staff performance ratings.
- Predictive / proactive maintenance metrics (deferred to v2+).

## Competitive Landscape

### What citizens use today

- **Phone calls** to city corporation hotlines (when the number is known, when anyone answers).
- **In-person visits** to ward or city corporation offices (high effort, low success rate).
- **Online government complaint portals** — clunky, slow, no follow-up, often indistinguishable from a dead form.
- **Social media posts** — Facebook pages, X / Twitter mentions, hoping a reporter or official account notices and amplifies.
- **WhatsApp messages to ward commissioners** — works occasionally, depends on personal relationships.
- **Do nothing** — by far the most common response, born of learned helplessness.

CityFix wins on the citizen side by being the lowest-friction path to action that *also* produces visible status feedback — a property no current alternative offers.

### What authorities use today

- **Paper registers** in ward offices, filed by date and ward.
- **Phone calls and informal WhatsApp groups** forwarding citizen complaints between departments.
- **Spreadsheets,** if any tracking exists at all.
- **Phone calls to dispatch crews** with verbal job descriptions.
- **Social media DMs and mentions** picked up ad-hoc by PR or communications teams.
- No consolidated record of "open," "in progress," or "closed." No close-out loop with the citizen.

CityFix wins on the authority side by replacing paper registers with a structured digital queue, auto-routing by category / ward / department, closing the loop with citizen notifications, and producing the first real audit trail.

### Unfair advantage

Citizens have no working alternative; their loudest signal is silence breaking. But the durable moat is that **CityFix replaces paper**. Once authority workflows are inside the platform — once ward supervisors, dispatchers, and field crews are all routing through it — switching cost makes the platform sticky. No app competitor today has "the local ward commissioner's paper register" as their competitor; that is a real wedge, not an aspirational one.

## Constraints

**CityFix can make issues known but cannot fix them.** This is the make-or-break constraint of the product.

If the authority does not dispatch a crew, the city does not change. The platform's only leverage is visibility — citizens seeing status, dispatchers seeing queues, possibly public visibility so that wards cannot quietly ignore backlogs. The product cannot force fixes; it can make failures to fix visible.

Three implications are baked into v1 by design:

1. **Authority onboarding is the product.** The first "user" of CityFix is the ward supervisor, not the citizen. Without departments operating the platform, citizen submissions land in a queue nobody serves. The product is sold to authority first.
2. **Visibility has to feel different from "Status: open" with no movement.** Overdue warnings, ward-level public dashboards, escalation cues, age-based highlighting — these are core features, not polish. The product must make silence visible.
3. **Honest copy from day one.** CityFix says "routed to X department" — it does not say "will be fixed in N days." Citizen-facing copy never promises what the authority has not agreed to deliver. The difference is enforced in UI text and notifications, not just in a disclaimer.

**Other constraints to be addressed in implementation (not blocking brief-level decisions):**

- **Bangla-first, English-secondary** UI and content. All copy drafted accordingly.
- **Government data sensitivity.** Citizen phone numbers, locations, photos are sensitive. Data residency, hosting, and access controls will be set with the operating authority.
- **Low-bandwidth tolerance.** Field crews operate in low-signal areas. Mobile UX must work on slow connections and over minimal data.
- **Low-budget tolerance.** Public-sector deployments have conservative budgets; the product is designed to be operable by lean city-corp teams without specialized IT.
