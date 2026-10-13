---
intent: 006-citizen-home-and-report-redesign
phase: inception
status: in-progress
created: 2026-10-13T18:00:00Z
updated: 2026-10-13T18:00:00Z
---

# Requirements: Citizen Home & Report-Flow Redesign

## Intent Overview

A visual + interaction redesign of the CityFix citizen-facing core:
the **home page** (city activity map + recent reports side panel) and
the **5-step report flow** (location → photo → category → note →
summary, plus the post-submit confirmation). No backend or data-model
changes — only the rendered surface.

The redesign elevates the v1 visual language to a "professional civic
service" register: high-contrast navy + accent-blue palette, generous
breathing room, clearly-defined interactive states, and an 8dp
rhythm. Every change must hold Bangla-first parity and the existing
WCAG-AA accessibility posture.

The token system in `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
is the source of truth. **This intent updates token values, not token
names**, so every component that already references `var(--color-*)`,
`var(--space-*)`, `var(--text-*)`, etc. automatically inherits the
new look. No find-and-replace, no new token names unless an
unmet need surfaces.

## Business Goals

| Goal | Success Metric | Priority |
|------|----------------|----------|
| Citizens complete a report faster | Median time-on-task for the 5-step flow drops from current baseline by ≥ 25% (measured via Vercel Web Analytics `flow_completed` event vs `flow_started`) | Must |
| Reported "looks dated / busy" feedback drops | User feedback mentions of "ugly" or "confusing" for `/home` + `/report/*` go to zero in the next user-research round | Should |
| WCAG-AA compliance holds on redesigned surfaces | All redesigned pages pass axe-core with zero serious or critical issues (Playwright run gated in CI) | Must |
| No regression on existing functionality | All 287 existing unit tests + 19 per-WO route specs stay green; no new TypeScript errors | Must |
| V1 launch stays live | No downtime beyond the normal Vercel preview-merge cycle; no scope creep into dispatcher/crew/admin surfaces | Must |

---

## Functional Requirements

### FR-1: Token-system refresh (the foundation)
- **Description**: Update the values of the existing color, surface,
  and ink tokens in `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`
  to the new palette so every component automatically picks up the
  change. Token **names** stay; only the hex values change.
- **New palette** (anchored to the ui-ux-pro-max "Accessible & Ethical"
  recommendation, adapted to CityFix's civic register):
  - `--color-primary`: `#0F172A` (slate-900 — high-contrast navy)
  - `--color-primary-hover`: `#1E293B` (slate-800)
  - `--color-primary-pressed`: `#020617` (slate-950)
  - `--color-primary-soft`: `#E0E7EF` (soft tinted background, used for selected states + badges)
  - `--color-accent`: `#0369A1` (sky-700 — primary action / CTA)
  - `--color-accent-hover`: `#075985` (sky-800)
  - `--color-surface-page`: `#F8FAFC` (slate-50 — page background)
  - `--color-surface-card`: `#FFFFFF` (cards, modals)
  - `--color-surface-raised`: `#F1F5F9` (slate-100 — fills, dividers, inputs)
  - `--color-surface-sunken`: `#E2E8F0` (slate-200 — sunken regions)
  - `--color-ink`: `#020617` (slate-950 — primary text)
  - `--color-ink-secondary`: `#334155` (slate-700 — captions, secondary)
  - `--color-ink-tertiary`: `#64748B` (slate-500 — placeholders)
  - `--color-border`: `#E2E8F0` (slate-200)
  - `--color-border-strong`: `#CBD5E1` (slate-300)
  - `--color-destructive`: `#DC2626` (red-600)
- **Acceptance Criteria**:
  - Every component in `app/home/`, `app/report/`, `app/report/[id]/submitted/`
    renders with the new colors without any per-component code change.
  - `npx tsc --noEmit` is clean.
  - All 287 unit tests + all 19 Playwright route specs pass without
    baseline-image updates (the shape and layout stay; only colors
    change — if a mockup baseline breaks, the redesign intentionally
    changed the visual; the new PNG must be reviewed and committed
    with the bolt).
  - Both light and high-contrast themes (`.theme-hc`) still pass
    WCAG-AA text contrast (≥ 4.5:1 for body, ≥ 3:1 for large text).
- **Priority**: Must
- **Related Stories**: TBD (decomposed in units stage)

### FR-2: Home page — Activity Map redesign
- **Description**: The two-region layout (`/home` — map on the left,
  side panel on the right at ≥1025px; stacked at narrower widths)
  keeps its structure, but the visual hierarchy is sharpened:
  - Map pins gain a clearly-defined selected / unselected state
    (selected = filled `--color-accent` circle with 4px outer ring;
    unselected = white circle with `--color-border-strong` border +
    category-color fill at 70% opacity).
  - The side panel uses a sticky header with the city name + a
    "Filter" affordance (chip-style toggle for "All / Open / Mine").
  - Each report card in the side panel becomes a denser, scannable
    row: status pill (left), category + ward (middle), age (right),
    with the note as a one-line ellipsis-truncated secondary line.
  - The "Submit a report" CTA is a single full-width primary button
    pinned to the bottom of the panel (desktop) or the bottom of the
    viewport (mobile).
  - Map controls (zoom, recenter, locate-me) move to a floating
    action cluster in the bottom-right of the map (Material/Floating
    UI pattern), with 48dp touch targets and a `--color-surface-card`
    background.
- **Acceptance Criteria**:
  - At 375px (small phone), 768px (tablet), 1024px (small desktop),
    and 1440px (desktop), the layout holds without horizontal scroll
    or overlap. The map is always ≥ 320px tall.
  - Selecting a pin updates the URL to include `?ticket=<id>` and
    scrolls the side panel to the matching card.
  - The Filter chip group is keyboard-navigable (Tab + Enter, arrow
    keys for chip group) with a visible focus ring (3-4px
    `--color-border-focus`).
  - The CTA is reachable in ≤ 1 tap from any scroll position on
    mobile (sticky bottom).
- **Priority**: Must
- **Related Stories**: TBD

### FR-3: Report flow — step progress + consistent shell
- **Description**: The `/report/*` layout adds a clear step indicator
  that tells the citizen where they are and what's left. The shell
  uses a sticky top bar with: brand mark, "Submit a report" badge,
  step indicator (1 of 5 → 5 of 5), and language toggle. The
  "Back" and "Continue" actions are a consistent sticky bottom bar
  on every step (mobile) and an in-card action row on desktop.
- **Step indicator**:
  - 5 numbered circles, connected by a 2px line.
  - Current step: filled with `--color-accent` and white number.
  - Completed steps: filled with `--color-primary` and a checkmark icon.
  - Future steps: filled with `--color-surface-raised`, `--color-ink-tertiary` number.
  - The line fills from left to right as the citizen progresses
    (animated, respects `prefers-reduced-motion`).
- **Acceptance Criteria**:
  - Every step route (`/report/location`, `/photo`, `/category`,
    `/note`, `/summary`, `/submitted`) renders the same shell.
  - The "Back" button is always reachable without scrolling on
    mobile (sticky bottom).
  - The "Continue" button is disabled until the current step's
    required field is filled (e.g., pin dropped for location, photo
    chosen for photo, category picked for category, etc.); disabled
    state has a 50% opacity and `aria-disabled="true"`.
  - Form fields use visible labels (not placeholder-only) and
    inline validation on blur.
  - On a 375px viewport, the step indicator collapses to "Step 2 of 5"
    text only (no numbered circles), keeping the shell under 56dp tall.
- **Priority**: Must
- **Related Stories**: TBD

### FR-4: Report flow — Location step redesign
- **Description**: The `/report/location` page keeps the two-region
  layout (map left, 480px side card right at desktop; stacked at
  mobile) but the side card is restructured:
  - "Confirm location" header (Bangla: "অবস্থান নিশ্চিত করুন")
  - One-paragraph instruction (Bangla, ≤ 24 words)
  - Reverse-geocoded address (one line, secondary text)
  - Ward name (one line, secondary text)
  - Coordinates (mono font, caption)
  - Big "Continue" primary button (full-width on mobile)
  - Small "Pick on map" text button below
- The geofence-reject path (R-1) becomes an inline error card with
  a single primary action: "Adjust the pin" (focuses the map).
- **Acceptance Criteria**:
  - The card never exceeds 480px wide on desktop.
  - On mobile, the card is at the bottom 40% of the screen, the map
    is the top 60% (no scroll within the card region).
  - The geofence-reject card is rendered above the map at a 12dp
    margin, with a `--color-destructive` left border, an X icon, and
    a one-sentence explanation.
  - Tapping "Adjust the pin" calls `map.flyTo({ center, zoom: 16 })`
    and removes focus from the button.
- **Priority**: Must
- **Related Stories**: TBD

### FR-5: Report flow — Photo step redesign
- **Description**: The `/report/photo` page becomes a clear
  "add up to 3 photos" surface with:
  - A primary "Take photo" / "Choose from library" action area
    (camera icon + label, 96dp tall, full-width on mobile).
  - A thumbnail strip (horizontal scroll) showing the current set
    with a small "X" to remove each.
  - A caption: "ছবি যোগ করলে দ্রুত সমাধান হয়" (Adding photos speeds
    resolution).
  - The narrow-category cap (2 for narrow categories per the v1
    spec) is enforced with a clear "1 of 2 added" counter.
- **Acceptance Criteria**:
  - The photo strip is keyboard-navigable (Tab through thumbnails,
    Enter on the remove "X").
  - The "Continue" button is disabled until at least 1 photo is
    added.
  - Tapping the primary area on a mobile device with `getUserMedia`
    support opens the camera; otherwise it falls back to the file
    picker.
  - The narrow-category cap is reflected in the counter and disables
    the primary area when reached.
- **Priority**: Must
- **Related Stories**: TBD

### FR-6: Report flow — Category step redesign
- **Description**: The `/report/category` page is a 2-column grid
  (1 column on mobile) of category cards. Each card shows the
  category icon (lucide-react), the Bangla name (large), the
  English name (small, secondary), and a chevron. Selected state:
  `--color-accent` border (2px), `--color-primary-soft` background,
  checkmark icon top-right.
- **Acceptance Criteria**:
  - Categories load from `/api/report/bootstrap` (existing endpoint).
  - Tapping a card selects it instantly; "Continue" enables.
  - Search/filter input at the top of the page filters cards by
    Bangla or English name (case-insensitive, debounced 200ms).
  - Long category lists scroll within the card region; the page
    itself does not scroll on desktop.
- **Priority**: Must
- **Related Stories**: TBD

### FR-7: Report flow — Note step redesign
- **Description**: The `/report/note` page is a single textarea with
  - Visible label (Bangla, "কিছু বলতে চান?") above the field
  - Helper text below the field ("ঐচ্ছিক — ২৮০ অক্ষর পর্যন্ত")
  - Character counter (live) at the bottom-right of the field
  - Big "Continue" primary button (full-width on mobile)
- **Acceptance Criteria**:
  - 280-char hard limit with a visible error state if exceeded.
  - The counter is announced to screen readers via `aria-live="polite"`.
  - The textarea auto-grows up to 5 lines, then scrolls internally.
  - "Continue" is always enabled (note is optional).
- **Priority**: Must
- **Related Stories**: TBD

### FR-8: Report flow — Summary step redesign
- **Description**: The `/report/summary` page is a 2-column
  confirmation surface (1 column on mobile). Left: a mini-map with
  the pin and a 240×240 thumbnail of the first photo. Right: a
  summary card listing category, ward, note, and photo count, each
  as a row with a small "Edit" text button that returns to the
  matching step. Below the card: a single "Submit report" primary
  button (full-width on mobile).
- **Acceptance Criteria**:
  - "Edit" buttons are keyboard-focusable and announce their target
    step (e.g. "Edit location").
  - Submit is gated on a "Confirm" checkbox ("আমি নিশ্চিত যে উপরের
    তথ্য সঠিক") per the v1 spec.
  - On submit, the button shows a loading state (spinner + "জমা
    হচ্ছে…") for the duration of the network request, then routes
    to `/report/[id]/submitted` on success or shows an inline error
    card on failure.
- **Priority**: Must
- **Related Stories**: TBD

### FR-9: Report flow — Submitted confirmation
- **Description**: The `/report/[id]/submitted` page is a clean
  success surface:
  - Large green checkmark (lucide `CheckCircle2`, 96dp) centered
  - "আপনার রিপোর্ট গ্রহণ করা হয়েছে" (Your report has been received)
    as the H1
  - Reference ID in mono font, copyable to clipboard
  - "What happens next" three-step list (Bangla):
    1. আমরা আপনার রিপোর্ট পর্যালোচনা করব (We will review your report)
    2. প্রাসঙ্গিক বিভাগে রাউট করা হবে (It will be routed to the relevant department)
    3. আপডেটের জন্য নোটিফিকেশন পাবেন (You will receive updates via notification)
  - Two actions: "View report" (primary) and "Back to home" (secondary)
- **Acceptance Criteria**:
  - The reference ID is selectable and has a "Copy" button that
    flashes a "Copied" toast for 1.5s.
  - The page is the only place the citizen sees a "submission
    succeeded" state — subsequent visits to `/report/[id]/submitted`
    for the same id do not re-show the success animation.
  - The H1 uses the display type scale (`--text-display-md` on
    mobile, `--text-display-lg` on desktop).
- **Priority**: Must
- **Related Stories**: TBD

### FR-10: Layout primitives & shared components
- **Description**: As the redesign lands, extract the repeated
  patterns into shared primitives so future pages can compose them:
  - `<StepIndicator steps={["Location","Photo","Category","Note","Summary"]} current={2} />`
  - `<ReportShell step={...} totalSteps={5} onBack={...} onContinue={...} canContinue={...}>`
  - `<FilterChipGroup options={...} value={...} onChange={...} />`
  - `<StatusPill status="submitted" />` (already exists in some form)
  - `<ReportCard ticket={...} variant="list" | "map" />`
- **Acceptance Criteria**:
  - All new primitives live under `components/ui/` and are typed
    (no `any`).
  - Each primitive has at least one Vitest unit test covering the
    default and one variant state.
  - The primitives do not import from app routes (server-only
    imports forbidden).
- **Priority**: Should
- **Related Stories**: TBD

---

## Non-Functional Requirements

### Performance

| Requirement | Metric | Target |
|-------------|--------|--------|
| Home page first contentful paint (4G, mid-range Android) | FCP | < 1.5s |
| Report flow step transition (client-side) | Perceived latency | < 200ms |
| Mockup test runtime | Playwright `01-mockups` | < 60s end-to-end |

### Scalability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Concurrent active report flows | In-memory dev store + prod Postgres | 1,000 / 10,000 (no change) |
| Pin density on home map | Open tickets per viewport | 200 pins without FPS < 30 (MapLibre cluster) |

### Security

| Requirement | Standard | Notes |
|-------------|----------|-------|
| No new client-side attack surface | OWASP ASVS L1 | No new `dangerouslySetInnerHTML`, no new localStorage of sensitive data |
| Authentication unchanged | Session cookie (existing) | This intent does not touch auth |
| XSS via report notes | Existing Zod validation + React escaping | No change; the redesign inherits |

### Reliability

| Requirement | Metric | Target |
|-------------|--------|--------|
| Visual regression gate | Playwright baselines | All baselines updated deliberately + reviewed in PR; tolerance `0.005` per `team.md` |
| No layout shift on step change | CLS | 0 (sticky top + bottom bars; images use `width` + `height`) |
| Reduced-motion respect | `prefers-reduced-motion` | All transitions collapse to instant (or ≤ 50ms) when set |

### Accessibility (WCAG 2.1 AA)

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Text contrast | WCAG 1.4.3 | All body text ≥ 4.5:1; large text ≥ 3:1 |
| Non-text contrast | WCAG 1.4.11 | All interactive controls ≥ 3:1 |
| Focus visible | WCAG 2.4.7 | 3-4px ring on every focusable element |
| Touch target size | WCAG 2.5.5 (AAA) | All tap targets ≥ 44×44px |
| Form labels | WCAG 1.3.1 + 3.3.2 | Every input has an associated `<label>` |
| Live regions | WCAG 4.1.3 | Step changes, character counters, "Copied" toast all use `aria-live` |
| Keyboard navigation | WCAG 2.1.1 | Every interactive element is reachable; no keyboard traps |
| Reduced motion | WCAG 2.3.3 | `prefers-reduced-motion: reduce` honored |
| Bangla + English | WCAG 3.1.1 + 3.1.2 | `lang` attribute set on every text container; toggle preserves both languages |

### Compliance

| Requirement | Standard | Notes |
|-------------|----------|-------|
| Privacy | 365-day unread-photo lifecycle (per `project.md` Corrections) | Inherited, not changed by this intent |
| Civic-language posture | Bangla-first, English-secondary | Every UI string comes from `lib/i18n/keys.ts`; no new hard-coded copy |

---

## Constraints

### Technical Constraints

**Project-wide standards** (inherited from `memory-bank/standards/`):
- TypeScript strict (`tsc --noEmit` must be clean)
- Named exports over default exports in `lib/` (React components may
  use default exports for `app/**/page.tsx` per Next.js convention)
- All i18n via `t(key, vars)` from `lib/i18n/keys.ts`
- All state changes audited via `writeAudit(...)` from
  `lib/platform/audit.ts` (this intent does not add new state changes
  — it changes the rendered surface, not the data flow)
- Playwright mockup baselines are gating; new mockup → new baseline

**Intent-specific constraints**:
- **Token-name stability**: the redesign may change token **values**
  but must not change token **names**. Components reference
  `var(--color-*)`, `var(--space-*)`, `var(--text-*)` etc. by name;
  the names are the public contract.
- **No new dependencies** unless the intent decomposes a unit that
  needs one (e.g. a new icon library). The current icon set in
  `components/` (lucide-react per the design artifacts) is the
  default. New icon requests require explicit per-bolt justification.
- **Bangla parity**: every English string in the new UI must have a
  Bangla equivalent in `lib/i18n/keys.ts`. The redesign may *add* new
  i18n keys but must not remove existing ones.
- **No backend changes**: the redesign is UI-only. The
  `/api/report/bootstrap`, `/api/v1/tickets`, and all other endpoints
  are untouched.
- **Mockup baseline updates**: when a visual change breaks a
  Playwright baseline, the new baseline must be reviewed in the PR
  (not silently overwritten) per `team.md` Forbidden.

### Business Constraints
- **No downtime**: the redesign ships as a normal Vercel auto-deploy
  on merge to `main`. No maintenance window required because the
  change is additive (new tokens, new component variants) and
  backwards-compatible (existing token names retained).
- **One intent, multiple bolts**: the scope (6 routes + 5 new
  primitives) is large enough to warrant 2–3 bolts, but stays a
  single intent so the design stays coherent. The Construction
  Agent will propose the bolt split at the units stage.
- **Timeline advisory**: the v2 roadmap (per `_progress/v2-roadmap.md`)
  defers most v2 work; this intent is the one explicit v2 work the
  user has chosen. There is no hard deadline, but the team has
  signalled "ship the redesign before onboarding the next cohort of
  citizens".

---

## Assumptions

| Assumption | Risk if Invalid | Mitigation |
|------------|-----------------|------------|
| The existing token names in `tokens.css` are the right contract; the redesign only changes values. | A user-facing bug surfaces in a component that relied on a value, not a name. | The construction agent must run the full unit + Playwright suite and visually re-verify the home + all 5 report steps before declaring complete. |
| ui-ux-pro-max's "Accessible & Ethical" palette is appropriate for a Bangladeshi civic service (not just a US government context). | A Bangla-first color choice fails contrast under local screen calibrations. | The `.theme-hc` (high-contrast) theme already exists; the construction agent must verify both light and high-contrast themes pass axe-core. |
| The 5-step report flow shape is kept. Collapsing it (single-page wizard or 3-step) is a follow-up, not this intent. | The user wanted fewer steps. | Checkpoint 2 in this requirements doc explicitly asks for the user's sign-off on the 5-step shape. |
| Playwright mockup baselines for the redesigned routes will need updates; the new baselines are reviewed in the PR. | A "looks fine" auto-update hides a real regression. | Per `team.md`, baselines are reviewed by the human. The construction agent must surface every updated baseline in the PR description. |
| No new dependencies are needed. | A redesign decision (e.g. a new map-pin component) needs a library not already in `package.json`. | The construction agent must justify any new dep in the bolt's `bolt.md` and the user signs off per the standard Construction review. |

---

## Open Questions

| Question | Owner | Due Date | Resolution |
|----------|-------|----------|------------|
| Should the 5-step shape be kept, or collapsed to 3 (location+photo → category+note → summary)? | Sanjit | Checkpoint 2 (this doc) | **Pending** |
| Should Rashid's "hands-busy" outdoor mode (`.theme-outdoor`) get the same token refresh, or is it out of scope? | Sanjit | Checkpoint 2 | **Pending** (default: in scope — it's a token-system change, so it inherits automatically; confirm) |
| Should the home map show only open tickets, or all (with a status filter)? | Sanjit | Checkpoint 2 | **Pending** (default: show all by default, filter chips for "All / Open / Mine") |
| Should the photo step's primary CTA be "Take photo" or "Add photo" (the v1 spec used "Add photo" but "Take photo" is more direct)? | Sanjit | Checkpoint 2 | **Pending** (default: "Add photo" — works on desktop too; the camera prompt fires only on mobile) |
| Should the submitted-page "What happens next" list be in Bangla only, or bilingual? | Sanjit | Checkpoint 2 | **Pending** (default: Bangla only, English toggle reveals both) |

---

## Requirement Quality Checklist

- [x] All requirements are testable (each FR has measurable acceptance criteria)
- [x] Acceptance criteria are binary (pass/fail)
- [x] NFRs have specific metrics and targets
- [x] Dependencies are identified (none outside the existing token + i18n + Playwright systems)
- [x] Constraints are documented (technical + business)
- [x] Assumptions are stated and risks assessed
- [ ] User sign-off at Checkpoint 2 (outstanding)
