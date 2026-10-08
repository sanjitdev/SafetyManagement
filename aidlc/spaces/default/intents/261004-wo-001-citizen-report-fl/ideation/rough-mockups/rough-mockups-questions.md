# Rough Mockups Questions — WO-001 Citizen Report Flow

> WO-001 (citizen report flow) — Ideation phase, Rough Mockups stage.
> Brownfield build on the now-complete WO-000 platform layer.
> Workflow-selected scope: `feature` [scope]. Depth: Standard (5-8 questions).
> Conversation language: English.
> Stage direction: produce low-fidelity wireframes (ASCII art) for the 12
> v1 must-ship pages (1.1–1.12 per scope-document.md), the end-to-end user
> flow diagram, and the information architecture outline. Reviewer:
> aidlc-product-lead-agent (advisory).

## Sources

- Intent statement: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/intent-capture/intent-statement.md`
- Scope document: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/scope-definition/scope-document.md`
- Intent backlog: `aidlc/spaces/default/intents/261004-wo-001-citizen-report-fl/ideation/scope-definition/intent-backlog.md`
- Team memory: `aidlc/spaces/default/memory/team.md`
- Project memory: `aidlc/spaces/default/memory/project.md`

## Q1 — Primary user entry point for v1

Rahim the Reporter typically opens the app from one of three places: a deep link from a city notice, a status-check on a previously-submitted report, or a fresh capture from the home map. Which entry point should the splash (1.1) and welcome (1.2) optimize for as the v1 default?

A. **Fresh capture** — splash routes to "Submit a report" as the primary CTA; returning citizens reach their My Reports via a top-right link
B. **Status check** — splash shows the citizen's most-recent report status (if any) and a primary "Submit a new report" CTA; assumes returning-citizen volume exceeds fresh-capture volume in the pilot
C. **Multi-CTA neutral** — splash shows both "Submit" and "My reports" as equally prominent CTAs with no default; the user chooses
E. Other (please specify)

[Answer]: A

## Q2 — Core user flow (happy path) sequencing

The submit path has six steps (1.7 location → 1.8 photo → 1.9 category → 1.10 note+submit → 1.11 confirmation → 1.12 my reports detail). For the ≤ 60s time-to-submit target, the wireframes can present the steps in different orderings. Which ordering should the wireframes encode?

A. **Strict linear (location → photo → category → note → submit → confirmation → detail)** — one step per screen; back-button always returns to the previous step
B. **Linear with progressive disclosure (location → photo+category combined → note → submit → confirmation → detail)** — combines photo and category on one screen to cut steps from 6 to 5
C. **Photo-first (1.7 location auto-detected from photo GPS → 1.8 photo → 1.9 category → 1.10 note → submit → confirmation → detail)** — photo carries the pin; location confirm becomes a confirmation step, not a capture step
D. **Map-first (splash → 1.7 map drop-pin → 1.9 category → 1.8 photo → 1.10 note → submit → confirmation → detail)** — map pin drives the rest; category picks a category-specific capture flow
E. Other (please specify)

[Answer]: A

## Q3 — Information hierarchy on the splash (1.1) and welcome (1.2)

The welcome screen is the user's first impression and the place where the bilingual toggle lives. The splash precedes the welcome. What is the dominant element on each?

A. **Splash: animated logo + tagline; Welcome: bilingual CTA pair ("Register" / "Login") + the toggle in a top-right corner** — minimal; the bilingual toggle is secondary chrome
B. **Splash: animated logo + tagline; Welcome: large hero illustration of city + reports, bilingual CTA pair, toggle in a footer-area control** — the illustration sets the city-civic tone
C. **Splash: minimal logo; Welcome: city activity preview (top 3 nearby reports on a map) + Register/Login + toggle** — discovery-first; shows the platform value at first glance
D. **Splash: minimal logo; Welcome: empty state with a clear path forward (Register or Login) and a small "What is this?" link** — onboarding-first; keeps the empty-state pattern consistent with the rest of the app
E. Other (please specify)

[Answer]: B

## Q4 — Bilingual toggle placement and default locale

Per `team.md` Mandated i18n through `lib/i18n/keys.ts`, every user-facing string goes through the typed key registry. The welcome screen needs the language toggle. Where does it live?

A. **Top-right corner on every page** — persistent global control; locale choice persists across screens and sessions
B. **Welcome screen only** — locale is chosen at entry; default Bangla unless the user selects English at registration (NID nationality-driven default)
C. **Settings page** — locale is changed via Settings, not surfaced at welcome; default Bangla
D. **Top-right corner on splash and welcome only** — locale is chosen during onboarding; subsequent pages inherit it
E. Other (please specify)

[Answer]: A

## Q5 — Geofence reject UX (the R-1 design gap from feasibility)

Feasibility flagged the geofence reject UX path as undesigned (R-1). When a citizen's pin is outside the city boundary, what does the location-confirm screen (1.7) do?

A. **Hard reject — disable submit, show full-screen error "Outside city limits"** — strict; protects data integrity
B. **Soft nudge — show the boundary overlay, suggest the nearest supported area, let the citizen adjust the pin** — flexible; preserves data flow at the cost of guidance
C. **Two-step: detect → boundary overlay with the citizen's pin shown + the supported area shaded → CTA "Move pin to supported area" or "Cancel"** — explicit; the citizen sees the city boundary and chooses
D. **Capture-anywhere, route-flag-valid:** accept the report but flag the pin as outside the city; the city-side reviewer (WO-002) decides
E. Other (please specify)

[Answer]: C

## Q6 — Dedup-decline flow surface

Per scope-definition Q5, a brief confirm-toast on the submit success page (1.11) acknowledges the citizen's decline of a dedup match. The actual dedup prompt itself happens BEFORE submission. Where on the wireframes does the dedup prompt live?

A. **Inline on the note+submit screen (1.10)** — after the citizen taps Submit but before the report is created; shows the nearby report card with a "Link to this" or "Submit as new" choice
B. **Modal on the note+submit screen (1.10)** — interrupts the submit tap with a focused dialog; same Link-or-New choice
C. **Inline on the location-confirm screen (1.7)** — checks dedup against the pin before photo/category capture; citizen sees the nearby report and chooses to link or proceed fresh
D. **Pre-submit summary screen (between 1.10 and 1.11)** — shows the full draft + nearby match candidate + Link or Submit choice
E. Other (please specify)

[Answer]: D

## Q7 — My Reports Detail (1.12) information hierarchy

The my-reports detail page carries the persistent status trail (the trust-signal core) and photo delete. What is the page's primary visual anchor?

A. **Status trail as a vertical timeline** — Submitted → Routed → In progress → Resolved as four labeled nodes with timestamps; photos grouped below; photo delete is a per-photo action
B. **Hero photo with status pill** — the most recent photo is the visual anchor; status is a colored pill at the top; the full trail expands inline
C. **Card stack (one card per state transition)** — each transition is its own card with timestamp + note; newest at top
D. **Split: status trail left, photo grid right** — two-column desktop, stacked on mobile; status is always visible while the user browses photos
E. Other (please specify)

[Answer]: A

## Q8 — Wireframe fidelity and viewport gating

Per `team.md` Mandated visual-regression gating, `npm run test:mockups` runs Playwright baselines at `tolerance: 0.005` on 1440×900 + 1024×768. Rough mockups in this stage are LOW-fidelity (ASCII or grayscale per wireframing-guide.md). How do the wireframes satisfy the visual-regression contract?

A. **Wireframes stay ASCII / grayscale in this stage; visual-regression gating fires in the Refined Mockups stage next** — rough mockups are structural; refined mockups are pixel-perfect
B. **Wireframes include a minimal HTML mockup per page at 1440×900 + 1024×768; visual-regression baseline is captured in this stage** — coarse but gate-able from day one
C. **Wireframes are ASCII only; visual-regression gating applies only to the 4 hero mockups in Refined Mockups, not all 12 pages** — baseline scope is bounded
D. **Wireframes are HTML at all 12 pages, all 2 viewports** — full coverage; more baselines to maintain
E. Other (please specify)

[Answer]: A

## Consolidated Summary Confirmation

- Looks correct
- Request changes

[Answer]: Looks correct

## Assumption Confirmation

- A. Accept assumptions
- B. Convert to follow-up questions

[Answer]: A