# Aamir the Administrator — Sets up Chattogram

**Archetype:** Aamir the Administrator (priority 05 — secondary, administrative)
**Entry:** Aamir logs into CityFix Admin Console from his DNCC workstation on the day he's been assigned to bring Chattogram online. The Dhaka deployment is live; this is city #2.
**Emotional state on arrival:** Practical, ready to work. He has Chattogram's organization chart, a list of 11 wards, and a colleague at Chattogram city corporation on call to confirm details.
**Goal:** Land Chattogram cleanly — categories, departments, wards, language defaults, user accounts — without breakage, ready for Habib-equivalents and Rashid-equivalents to start using it tomorrow. (Primary positive driving force: *Land the platform cleanly in his city.*)

---

## Screens

1. **Admin Console Login**
   Same employee credentials pattern as Habib, with elevated privileges flagged (banner: "Admin access"). Once signed in, the landing page is the Admin Console home (not the dispatcher dashboard).

2. **Cities Overview / Dashboard**
   Top-of-page summary cards (one per live city): Dhaka — Dispatchers 12 / Field crews 28 / Citizen reports (7-day) 4,231. Chattogram card is empty / "ready to configure." Aamir clicks **"Configure new city"** on Chattogram.

3. **City Setup — Basic Info**
   Form: city name (Bangla + English labels), default language (Bangla), secondary language (English), timezone (Asia/Dhaka), primary contact at the city corp (name + email + phone). "Save and continue."

4. **Departments & Categories**
   Two-panel editor. Left: Departments (Electrical, Roads, Sanitation, Drainage / Waterlogging, Other) — add / rename / disable. Right: Categories — tile list with one category per row, each row showing which department owns it. **Pre-populated from Dhaka's template** so Aamir starts with sensible defaults and overrides per city. Each category → department mapping is one dropdown — visible, easy to change, reversible. "Save and continue."

5. **Wards & Boundaries**
   Map view. Left rail: list of wards (Chattogram has 11). Each ward has a name field, a polygon-drawing tool, and a dropdown to assign primary departments (multi-select). **Bulk-import option:** upload a GeoJSON file of ward boundaries to skip manual drawing. Preview shows the full city, all wards colored, with hover-to-inspect. Aamir imports the GeoJSON his Chattogram colleague sent, confirms the assignments, and saves.

6. **User Provisioning**
   Two tabs: **Invite individually** (phone + role + assigned ward/department) and **Bulk invite via CSV** (template download, upload, review-and-confirm). Aamir starts with bulk upload because Chattogram has 14 dispatchers and 32 field crew to onboard. After upload, a review table shows each pending invite with role + ward assignment; Aamir can edit before sending. "Send invites" — each user gets an SMS with a one-time link to set their password. **Confirmation summary screen:** "Chattogram is ready to launch — 14 dispatchers invited, 32 field crew invited, 11 wards configured, 5 departments active, 6 categories mapped. Confirm launch?" Two-button: "Confirm launch" / "Save as draft and return later."

7. **Post-Launch Adoption Dashboard**
   Aamir returns to the Cities Overview daily for the first 30 days. Per-city tabs: active dispatchers (count + name list), active field crews, citizen reports (daily + cumulative), tickets resolved, average time-to-resolution, overdue count, top categories, top wards. This is the view Aamir uses to know whether the launch is healthy, and what to escalate.

✓ **Success state:** Chattogram is live with full configuration, all dispatchers and field crew invited and able to log in, citizen reports starting to come in. The Dhaka template carried over cleanly; Aamir's per-city overrides are auditable. The next city (Sylhet) will be faster because this one worked.

---

### Cross-scenario dependency

The "Dhaka template" referenced in screen 4 (Departments & Categories) is a feature in its own right: each new city's setup starts from the most recent successful city's configuration, with per-city overrides. This is the *concrete expression of Goal 3* (operate leanly across cities) in the admin UX.

---

_Produced by Freya — 2026-09-18_
_Source: 05-persona-aamir-the-administrator.md, product-brief.md, 00-trigger-map.md_
