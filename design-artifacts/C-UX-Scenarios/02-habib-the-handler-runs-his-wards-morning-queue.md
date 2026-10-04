# Habib the Handler — Runs his ward's morning queue

**Archetype:** Habib the Handler (priority 03 — secondary, authority dispatcher)
**Entry:** Habib opens CityFix on his desktop / tablet at the start of his shift at the ward office. He's been trained on the system once; this is his second week using it.
**Emotional state on arrival:** Civic-minded but pragmatic. Watching for the first week to see if it actually works under real load. Slight anxiety about yesterday's unfinished tickets.
**Goal:** Clear his queue today, see fixes happen, leave work on time, look competent to his supervisor. (Primary positive driving force: *See citizen issues actually resolved.*)

---

## Screens

1. **Login (Web / Desktop)**
   Employee credentials (employee ID + password), with OTP step to a registered phone. Bangla or English per city config. Single sign-on to CityFix Admin Console.

2. **Daily Queue Dashboard**
   Default landing screen. Top-of-page counts: open / overdue / in progress / resolved today. Filter bar: status, age, category, ward, assigned-crew. Sortable ticket list below. Each row shows: ticket ID, category icon, citizen photo thumbnail, age in hours/days, status pill, assigned crew. Aging tickets highlighted with a color cue (yellow at 3 days, red at 7). Bangla. Habib scans, identifies a 4-day-old streetlight ticket that needs reassignment.

3. **Ticket Detail**
   Full ticket view. Header: category icon + citizen's submitted photo (large) + map pin + category + submitted-at timestamp. Below: full timeline (Submitted → Routed → In progress → Resolved). Citizen note (if any). "Internal notes" thread (Habib's team-only comments). Right rail: ticket metadata — ward, age, current assignee, related duplicates (auto-detected). Actions panel: Reassign, Add internal note, Mark in progress, Mark resolved (only enabled if an after-photo is attached).

4. **Assign to Crew**
   Modal/popover from Ticket Detail. Field-crew picker filtered by category (electrical crew for streetlight, road crew for pothole, etc.). Shows crew's current open-ticket count. Habib picks "Crew A — Electrical (3 open)" and confirms. Two taps to assign.

5. **Monitor / Updates (refreshed dashboard)**
   Habib returns to dashboard. Filter set to "My ward — assigned to Crew A." Sees the reassigned ticket's status pill flip to "In progress" after Rashid marks it. Another citizen's duplicate report of the same streetlight collapses to the existing ticket via the dedup engine — visible in the timeline as "1 duplicate merged."

6. **Resolve Confirmation**
   Habib gets a notification (in-app + on his phone) that Rashid has marked the ticket resolved with an after-photo. He opens the ticket. Timeline now shows: Submitted → Routed → In progress (Crew A, time on site: 2h 14m) → Resolved. Before/after photo pair side by side. Habib reviews, then clicks "Confirm resolution." Ticket closes; citizen is auto-notified.

7. **Ward Performance Snapshot (end of shift)**
   Habib opens his own dashboard tab: tickets handled today, average time-to-resolution (his ward, this week), overdue count (down from yesterday), top categories. This view is visible to his supervisor by default — Habib knows it, and the day's numbers support him. He closes his shift.

✓ **Success state:** Habib's queue is smaller at end of shift than at the start. Rashid's fixes are visible. The supervisor sees his numbers. Tomorrow he expects the same flow. The paper register is no longer where the truth lives.

---

_Produced by Freya — 2026-09-18_
_Source: 03-persona-habib-the-handler.md, product-brief.md, 00-trigger-map.md_
