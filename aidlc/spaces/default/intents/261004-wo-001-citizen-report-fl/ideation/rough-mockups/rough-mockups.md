<!-- rough-mockups.md — Rough Mockups stage artifact. -->
<!-- summary_authorization_id: pending (rough-mockups stage) -->
# Rough Mockups — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Rough Mockups stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope]. Depth: Standard.
> Conversation language: English.
> Fidelity: LOW (ASCII / grayscale per wireframing-guide.md).
> Stage direction: produce wireframes for the 12 v1 must-ship pages
> (1.1–1.12 per scope-document.md), the end-to-end user flow diagram,
> and the information architecture outline.
> Reviewer: aidlc-product-lead-agent (advisory).

## Sources

- Intent statement: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/intent-statement.md`
- Scope document: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/scope-definition/scope-document.md`
- Intent backlog: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/scope-definition/intent-backlog.md`
- Feasibility assessment: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/feasibility-assessment.md`
- Constraint register: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/constraint-register.md`
- RAID log: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/feasibility/raid-log.md`
- Page specs: `design-artifacts/C-UX-Scenarios/01-rahim-the-reporter/<N.M-page>/<N.M-page>.md`
- Visual mockups: `design-artifacts/D-Design-System/01-Visual-Design/mockups/01..04-*.html` (hero pages, web-first)
- Visual direction: `design-artifacts/A-Product-Brief/03-visual-direction.md`
- Content language: `design-artifacts/A-Product-Brief/02-content-language.md`
- WO document: `design-artifacts/E-Development/WO-001-citizen-report-flow.md`
- Team memory: `aidlc/spaces/default/memory/team.md`
- Project memory: `aidlc/spaces/default/memory/project.md`

## Stage decisions (from rough-mockups-questions.md)

- Q1 Primary entry: **A — Fresh capture.** Splash routes to "Submit a report" as primary CTA; returning citizens reach My Reports via a top-right link.
- Q2 Submit flow ordering: **A — Strict linear** (location → photo → category → note → submit → confirmation → detail).
- Q3 Splash + welcome hierarchy: **B — Splash: animated logo + tagline; Welcome: large hero illustration of city + reports, bilingual CTA pair, toggle in a footer-area control.** Civic tone.
- Q4 Bilingual toggle placement: **A — Top-right corner on every page.** Persistent global control; locale choice persists across screens and sessions.
- Q5 Geofence reject UX: **C — Two-step: detect → boundary overlay with the citizen's pin shown + the supported area shaded → CTA "Move pin to supported area" or "Cancel".** Explicit; the citizen sees the city boundary and chooses.
- Q6 Dedup-prompt surface: **D — Pre-submit summary screen (between 1.10 and 1.11).** Shows the full draft + nearby match candidate + Link or Submit choice.
- Q7 1.12 visual anchor: **A — Status trail as a vertical timeline.** Submitted → Routed → In progress → Resolved as four labeled nodes with timestamps; photos grouped below; photo delete is a per-photo action.
- Q8 Wireframe fidelity: **A — ASCII / grayscale in this stage; visual-regression gating fires in Refined Mockups.** Rough mockups are structural; refined mockups are pixel-perfect.

## Information architecture

```
CityFix /  (root)
├── /welcome              (1.2 — first run only)
├── /register             (1.3)
├── /verify               (1.4)
├── /login                (1.5)
├── /splash               (1.1 — entry; routes by auth state)
├── /report
│   ├── /location         (1.7)
│   ├── /photo            (1.8)
│   ├── /category         (1.9)
│   ├── /note             (1.10)
│   ├── /summary          (NEW — pre-submit summary, surfaces dedup prompt Q6)
│   └── /:id/submitted    (1.11)
├── /reports
│   └── /:id              (1.12 — My Reports Detail)
└── shared chrome
    ├── top bar (logo, locale toggle, my-reports link)
    └── footer (per-page; minimal)
```

## End-to-end user flow (happy path)

```
[off-platform]  →  /splash (1.1)
                       │
                       ▼ (auth-state routing)
   ┌───────────────────┴───────────────────┐
   ▼                                       ▼
not-authed                            authed
   │                                       │
   ▼                                       ▼
/welcome (1.2)  ──tap "Register"──►   /home (1.6, post-v1; v1 routes straight
   │                                  to /report/location when "Submit" is
   │                                  tapped from any chrome)
   │tap "Login"
   ▼
/login (1.5)  ─────────────►   /report/location (1.7)
                                    │
                                    ▼
                              /report/photo (1.8)
                                    │
                                    ▼
                              /report/category (1.9)
                                    │
                                    ▼
                              /report/note (1.10)
                                    │
                                    ▼ tap "Submit"
                              /report/summary (NEW)
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                  no dedup match        dedup match
                          │                    │
                          │            ┌───────┴───────┐
                          │            ▼               ▼
                          │       "Link to it"    "Submit as new"
                          │            │               │
                          ▼            ▼               ▼
                          └─────► /tickets POST (with dedup_match flag)
                                          │
                                          ▼
                                /report/:id/submitted (1.11)
                                          │
                                          ▼ tap "View report"
                                  /reports/:id (1.12)
                                          │
                                  (background — Web Push wired in 1.14)
                                          │
                                          ▼
                       [city corp routed → in progress → resolved]
                                          │
                                          ▼
                       push lands on device → deep-links back to /reports/:id
```

## Wireframes (ASCII / grayscale)

> All 12 wireframes render at the **large** design viewport (1440 × 900) and
> reflow at the **medium** viewport (1024 × 768). Rashid's phone-fallback rule
> does not apply here — this is Rahim's surface (web-first). ASCII art uses
> the following visual language:
>
> - `#` filled block · `·` muted background · `:` chrome / line
> - `[btn]` primary action · `(btn)` secondary action
> - `▶` radio / selected · `○` radio / unselected
> - `▣` filled checkbox · `☐` empty checkbox
> - `▼` dropdown · `[ i18n ]` locale toggle · `< top bar >` persistent chrome

### 1.1 Splash

```
+----------------------------------------------------------+
|                                                          |
|                                                          |
|                       · · · · · · ·                      |
|                       ·  LOGO  ·                         |
|                       · (anim) ·                         |
|                       · · · · · · ·                      |
|                                                          |
|                   "CityFix"                              |
|                   "আপনার শহর, আপনার কণ্ঠস্বর"            |
|                                                          |
|                       · · · · ·                          |
|                       (loading)                          |
|                       · · · · ·                          |
|                                                          |
+----------------------------------------------------------+
```

Notes:
- Static; animated logo + tagline. Loads < 2s on mid-range Android (per 1.1 acceptance).
- Routes by auth state in code: not-authed → `/welcome`; authed → `/report/location` (or `/reports/:id` for status-check deep-links).
- Location permission requested here (powers map surfaces, gives immediate value per UX Review #1).
- Notification permission **deferred** to after first successful report (UX Review #1, not at splash).

### 1.2 Welcome

```
+----------------------------------------------------------+
| <top bar: logo>                  [ i18n ] [i18n]         |
+----------------------------------------------------------+
|                            |                             |
|    "CityFix"               |   · · · · · · · · · ·       |
|    "আপনার শহর,             |   ·  hero illustration  ·   |
|     আপনার কণ্ঠস্বর"        |   ·  (abstract city map)·   |
|                            |   · · · · · · · · · ·       |
|    brief description       |                             |
|    (3 short lines)         |                             |
|                            |                             |
|    [ Register ]            |                             |
|    ( Login )               |                             |
|                            |                             |
+----------------------------------------------------------+
|  trust strip · privacy · 3 markers · i18n in footer area |
+----------------------------------------------------------+
```

Notes:
- Two-column web hero at large viewport (Q3-B); collapses to single column at medium.
- Brand voice per `02-content-language.md`: calm, honest, Bangla-first.
- Single primary CTA (Register); Login is a secondary. Per Q1-A, fresh-capture is the default entry; returning citizens reach `/login` via the secondary action.
- Locale toggle: persistent top-right (Q4-A) — set on welcome, persists across all pages and sessions.

### 1.3 Registration

```
+----------------------------------------------------------+
| <top bar: logo>                            [ i18n ]      |
+----------------------------------------------------------+
|                                                          |
|       "Create your CityFix account"                      |
|       "আপনার CityFix অ্যাকাউন্ট তৈরি করুন"               |
|                                                          |
|       ·  Phone (with country code)  [ _________ ]        |
|       ·  NID number                 [ _________ ]        |
|       ·  Full name (Bangla)         [ _________ ]        |
|       ·  Password (min 12)          [ _________ ]        |
|       ·  Confirm password           [ _________ ]        |
|                                                          |
|       ▣  I accept the terms and privacy notice           |
|                                                          |
|       [ Send verification code ]                         |
|       ( Already registered? Log in )                     |
|                                                          |
+----------------------------------------------------------+
```

Notes:
- Citizen registration gates the rest of the surface (per "Do Not Change" in WO-001).
- Phone unique per city; duplicate rejected with bilingual error.
- NID validation: format-only in v1 (real NID API check deferred to WO-004 admin or v1.1).
- Password policy: minimum length per `lib/auth/password.ts` (argon2id, OWASP 2024 params).
- On success → `/verify` (1.4) with the phone as URL param.

### 1.4 Verification (OTP)

```
+----------------------------------------------------------+
| <top bar: logo>                            [ i18n ]      |
+----------------------------------------------------------+
|                                                          |
|       "Enter the code we sent"                           |
|       "আমরা যে কোড পাঠিয়েছি সেটি লিখুন"                  |
|                                                          |
|       Sent to +880 ••• •••  •47                          |
|                                                          |
|       [ _ ] [ _ ] [ _ ] [ - ] [ - ] [ - ]                |
|        1    2    3    4    5    6                        |
|                                                          |
|       Resend in 0:42                                     |
|                                                          |
|       [ Verify ]                                         |
|                                                          |
|       ( Wrong number? Change )                          |
|                                                          |
+----------------------------------------------------------+
```

Notes:
- 6-digit OTP, 5-min TTL, single-use, 5 attempts cap (per `lib/auth/otp.ts`).
- Resend timer 60s.
- Auto-advance input fields (UX nicety, not yet spec'd at spec level; safe assumption for low-fi).
- Rate limit: 1 req/sec default from `lib/platform/rate-limit.ts`.

### 1.5 Login

```
+----------------------------------------------------------+
| <top bar: logo>                            [ i18n ]      |
+----------------------------------------------------------+
|                                                          |
|       "Welcome back"                                     |
|       "স্বাগত পেছনে"                                     |
|                                                          |
|       ·  Phone (with country code)  [ _________ ]        |
|       ·  Password                   [ _________ ]        |
|                                                          |
|       ( Forgot password? )                               |
|                                                          |
|       [ Log in ]                                         |
|       ( New here? Create an account )                    |
|                                                          |
+----------------------------------------------------------+
```

Notes:
- Returns session token bound to citizen's city (per PLAT-REQ-002).
- On success → `/report/location` (1.7) if "Submit" was the entry; otherwise `/reports/:id` for status-check deep-links; default `/report/location` is the v1 first-run experience.
- Forgot password: not in v1 (out-of-scope per WO-001; deferred to v1.1 or WO-004 admin).

### 1.7 Report — Location Confirm

```
+----------------------------------------------------------+
| <top bar: logo>   [Submit a report]    [ i18n ] [me]     |
+----------------------------------------------------------+
|                            |                             |
|                            |   1.7 Location               |
|                            |   ──────────                 |
|   · · · · · · · · · ·      |   "Drop a pin where"         |
|   ·  MAP (MapLibre)  ·     |   "পিনটি বসান যেখানে"        |
|   ·  ·   · pin ·    ·      |                             |
|   ·  ·   ·   ·    ·       |   23.7890°N  90.4075°E        |
|   ·  ·   ·   ·    ·       |   Ward 14 — Mirpur            |
|   · · · · · · · · · ·      |                             |
|                            |   ( Tap to drag pin )        |
|                            |                             |
|                            |   [ Continue → Photo ]       |
|                            |   ( Save as draft — v1.1 )   |
+----------------------------------------------------------+
```

Notes:
- **Geofence reject UX (Q5-C, R-1):** if the pin is outside the city boundary, replace the right rail with a boundary-overlay state:
  - Map shows citizen's pin + city boundary shaded
  - Right rail: "This pin is outside the supported area. Move the pin into the supported area or cancel."
  - CTAs: `[ Move pin to supported area ]` (re-centers on nearest in-boundary point) · `( Cancel )` (returns to /welcome or /login)
- Drag-to-adjust enabled.
- Reverse-geocoded ward label per `MapLibre + OSM + Nominatim` (dev); Mapbox tiles in prod if load justifies.
- Per Project Memory correction: 50m dedup radius and city-boundary geofence are orthogonal — geofence is the pre-submit guard, dedup is the post-pin policy.

### 1.8 Report — Photo Capture

```
+----------------------------------------------------------+
| <top bar: logo>   [Submit a report]    [ i18n ] [me]     |
+----------------------------------------------------------+
|                            |                             |
|                            |   1.8 Photo                  |
|                            |   ────────                  |
|   · · · · · · · · · ·      |   "Add up to 3 photos"       |
|   ·  viewfinder      ·     |   "৩টি পর্যন্ত ছবি যোগ করুন"  |
|   ·  (camera)        ·     |                             |
|   · · · · · · · · · ·      |   ▣ ▣ ▢   (1 / 3)            |
|                            |                             |
|                            |   [ Take photo ]             |
|                            |   ( Choose from gallery )    |
|                            |                             |
|                            |   [ Continue → Category ]    |
|                            |   ( ← Back to location )     |
+----------------------------------------------------------+
```

Notes:
- Multi-photo defaults: cap = 3, narrow-category cap = 2, mandatory minimum = 1 (per UX Review #6).
- Camera + gallery sources.
- Photo upload to WO-000 S3-compatible layer (deferred to v1.1 in audit, but the lib/path is in place).
- "← Back" preserves state in session (no draft persistence in v1 — online-only submit per Project Memory correction).

### 1.9 Report — Category Pick

```
+----------------------------------------------------------+
| <top bar: logo>   [Submit a report]    [ i18n ] [me]     |
+----------------------------------------------------------+
|                            |                             |
|                            |   1.9 Category               |
|                            |   ─────────                  |
|   (selected category       |   "What is the issue?"       |
|    preview pane —          |   "সমস্যাটি কী?"              |
|    photo + map pin)        |                             |
|                            |   ○  Streetlight             |
|                            |   ▶  Pothole / Road damage   |
|                            |   ○  Drain / Sewage          |
|                            |   ○  Garbage / Sanitation    |
|                            |   ○  Water supply            |
|                            |   ○  Sidewalk / Footpath     |
|                            |   ○  Traffic signal          |
|                            |   ○  Other                   |
|                            |                             |
|                            |   [ Continue → Note ]        |
|                            |   ( ← Back to photo )        |
+----------------------------------------------------------+
```

Notes:
- Category list comes from `GET /cities/:id/categories` (city-specific, populated by Aamir in WO-004).
- Dhaka template pre-populates the v1 categories (per WO-000 PLAT-REQ-003).
- Bangla label primary; English label secondary (Q4-A toggle).
- "Other" → free-text fallback in note step (1.10).

### 1.10 Report — Note & Submit

```
+----------------------------------------------------------+
| <top bar: logo>   [Submit a report]    [ i18n ] [me]     |
+----------------------------------------------------------+
|                            |                             |
|                            |   1.10 Note                  |
|                            |   ──────                     |
|   (photo strip +           |   "Anything to add?"         |
|    map + category          |   "কিছু যোগ করতে চাইলে"       |
|    summary)                |                             |
|                            |   [ optional note ___________|
|                            |     _____________________ ]  |
|                            |                             |
|                            |   ▢  Anonymize? (v1.1)       |
|                            |                             |
|                            |   [ Review & Submit ]        |
|                            |   ( ← Back to category )     |
+----------------------------------------------------------+
```

Notes:
- Note is optional; max length per spec (TBD at refined-mockups — safe placeholder 500 chars).
- "Review & Submit" → `/report/summary` (NEW, see below).
- "Anonymize" deferred to v1.1 (Project Memory: 365-day unread-photo lifecycle is the chosen reading of the trust signal).

### 1.10b Report — Summary (NEW pre-submit summary; surfaces dedup prompt per Q6-D)

```
+----------------------------------------------------------+
| <top bar: logo>   [Submit a report]    [ i18n ] [me]     |
+----------------------------------------------------------+
|                                                          |
|        "Review your report"                              |
|        "আপনার রিপোর্ট পর্যালোচনা করুন"                   |
|                                                          |
|        +--------------------+   +-----------------------+ |
|        | · photo strip     |   | Location: 23.78, 90.40| |
|        | · 3 thumbs        |   | Ward 14 — Mirpur      | |
|        +--------------------+   | Category: Pothole     | |
|                                  | Note: "big one..."   | |
|                                  +-----------------------+ |
|                                                          |
|        (no dedup match → no banner; primary CTA only)    |
|        ┌──────────────────────────────────────────────┐  |
|        │ Looks similar to an existing report           │  |
|        │ · existing thumb · 32m away · Pothole · 1d ago│  |
|        │ [ Link to this report ]                       │  |
|        │ ( Submit as new report )                      │  |
|        └──────────────────────────────────────────────┘  |
|                                                          |
|        [ Submit report ]                                 |
|        ( ← Back to note )                                |
+----------------------------------------------------------+
```

Notes:
- New page introduced to satisfy Q6-D (dedup prompt is a focused pre-submit summary, not a modal that interrupts the tap).
- The dedup banner is **conditional** — it only renders when the platform returns `dedup_match: true` (50m haversine check from `lib/platform/dedup.ts`).
- "Link to this report" → POSTs `/tickets` with `linked_ticket_id` (decline path is logged as audit entry per Project Memory; surface-level toast is on 1.11).
- "Submit as new report" → POSTs `/tickets` with no linked id; flag captured in audit log only.
- Per scope-document Q5: when the citizen declines, a brief confirm-toast on 1.11 says "your decline was noted" — closes the immediate feedback loop without leaking WO-002 semantics.

### 1.11 Report Submitted — Confirmation

```
+----------------------------------------------------------+
|                            · · · · · · · · · ·           |
|                            ·                       ·     |
|                            ·   +----------------+ ·     |
|                            ·   |   ✓ Submitted  | ·     |
|                            ·   +----------------+ ·     |
|                            ·                       ·     |
|                            ·   "We got it"              · |
|                            ·   "আমরা পেয়েছি"            · |
|                            ·                          ·  |
|                            ·   Ticket:                  · |
|                            ·   CF-2026-10-07-0042      ·  |
|                            ·                          ·  |
|                            ·   status trail            ·  |
|                            ·   ●───○───○───○           ·  |
|                            ·   Submitted                ·  |
|                            ·   Routed                   ·  |
|                            ·   In progress              ·  |
|                            ·   Resolved                 ·  |
|                            ·                          ·  |
|                            ·   [ View report ]          ·  |
|                            ·   ( Back to home — v1.1 )  ·  |
|                            ·                          ·  |
|                            ·   +----------------+ ·     |
|                            ·                       ·     |
|                            · · · · · · · · · · · ·     |
+----------------------------------------------------------+
```

Notes:
- Centered 640px card on neutral surface, identical at both viewports (per Phase B re-skin).
- 4-step status trail with current step highlighted; full trail lands on 1.12.
- Two-button CTA pair inside the card.
- Dedup-decline acknowledgement toast: "your decline was noted" — appears as a brief toast above the card (3s, no chrome conflict).
- Per Project Memory: "feel heard" trust signal = trail + push + post-resolution feedback. This page is the immediate-loop closer.

### 1.12 My Reports Detail

```
+----------------------------------------------------------+
| <top bar: logo>                      [ i18n ] [me]       |
+----------------------------------------------------------+
|                                                          |
|  +-- timeline (left, 1.5fr) --+   +-- meta (right, 1fr)-+|
|  |                            |   |                    | |
|  | ●  Submitted               |   | Status: In progress| |
|  |    Oct 7, 10:42            |   | Ticket: CF-...0042 | |
|  |    Pothole · Ward 14       |   | Submitted: Oct 7   | |
|  |                            |   | Last update: 11:14 | |
|  | ○  Routed                  |   |                    | |
|  |    (awaiting)              |   | "Anonymize?"       | |
|  |                            |   |  ▢  (v1.1)         | |
|  | ○  In progress             |   |                    | |
|  |    Oct 7, 11:14            |   | [ Delete photo ]   | |
|  |    Crew assigned           |   | [ Delete report ]  | |
|  |                            |   | (confirm modal)    | |
|  | ○  Resolved                |   |                    | |
|  |    (awaiting)              |   |                    | |
|  |                            |   |                    | |
|  +----------------------------+   +--------------------+ |
|                                                          |
|  +--- photos (full-width below) ----------------------+  |
|  | [photo] [photo] [photo]   [del] [del] [del]      |  |
|  +-----------------------------------------------------+ |
|                                                          |
|  +--- feedback prompt (post-resolved only) -----------+  |
|  |  "How did we do?"   ★ ★ ★ ★ ★   [ submit ]        |  |
|  +-----------------------------------------------------+ |
+----------------------------------------------------------+
```

Notes:
- **Q7-A: Status trail as a vertical timeline** is the primary visual anchor.
- Photos grouped below the trail; per-photo delete is a per-photo action (citizen-initiated; the WO-000 endpoint does not yet exist and WO-001 adds it per scope Q7).
- Internal actors are anonymized: "City corporation", not a specific dispatcher name (per "Do Not Change" in WO-001).
- Status pill + ticket metadata on the right rail (per Phase B 2026-10-04 re-skin).
- Two-column at large viewport; metadata stacks below trail at medium.
- Per Project Memory: indefinite photo retention with citizen-initiated delete + 365-day unread-photo lifecycle policy.

## Citizen push entry (1.14 — not a wireframe, but referenced)

> Page 1.14 is the **push notification** surface, not a route. It is owned by the Web Push pipeline (PLAT-REQ-006) and consumed at the device level. Wireframes for the push payload structure live in the design-system notifications spec, not in the citizen route set.
>
> On resolved transition:
> 1. Citizen device receives native push (VAPID) with payload `{ ticketId, status: "resolved", deepLink: "/reports/:id" }`.
> 2. Tapping the push deep-links to 1.12 with the resolved ticket.
> 3. The feedback prompt (`How did we do?`) is visible on 1.12 when the status is `resolved` — completes the trust loop.
>
> This is the post-v1 surface per scope-document.md (page 1.14 is **in** the 12 v1 must-ship set per scope Q12, but the **wireframe set** for this rough-mockups stage covers the 12 routes 1.1–1.12 per the stage direction; the push pipeline is referenced for completeness and is sketched in `lib/platform/push.ts`).

## Walking-skeleton boundary (per scope Q6)

The first Bolt's smallest working integrated slice is **pages 1.1–1.12**. Push (1.14) is wired in this stage set but lands in a later Bolt alongside the VAPID+Vercel edge runtime risk (R-5) resolution.

## Stage assumptions and frozen decisions

1. The 4-role auth model and the 4-status trail are frozen; not re-decided here.
2. The two-region "map + 480px side card" layout pattern is the v1 large-viewport default for 1.6, 1.7–1.10, 1.12 — consistent with the Phase B re-skin.
3. The new pre-submit summary page (1.10b) is introduced in this stage as the dedup-prompt surface (Q6-D); the stage flag this for refined-mockups and domain-design to adopt the route in the IA.
4. Locale toggle is persistent top-right (Q4-A); it persists across screens and sessions.
5. Wireframes are ASCII / grayscale; pixel-perfect mockups are the refined-mockups stage's deliverable (Q8-A).

## Cross-cutting acceptance gate (carried forward, not re-decided)

- Visual regression on Rahim's 4 hero mockups at `tolerance: 0.005` on 1440×900 and 1024×768 (team.md Mandated; intent statement).
- All copy localized through `lib/i18n/keys.ts` (team.md Mandated).
- `npx tsc --noEmit` clean before Bolt close (team.md Mandated).
- `npm run test:unit` green after editing `lib/` (team.md Mandated).
- `npm run test:mockups` green after editing any mockup HTML or `tokens.css` (team.md Mandated).

## Assumptions & Open Questions

None.
