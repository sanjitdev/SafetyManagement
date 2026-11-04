# CityFix — Visual Design

The visual layer for CityFix. Defines the design tokens, the component library, and 7 hero mockups that establish the visual language for every page.

## Brand personality

Civic trust. Calm confidence. Bangla-first.

> If CityFix were a person at a dinner party, they would be confident and assured, empathetic, civic-minded and quietly idealistic — the trusted neighbor who works at the city corporation and genuinely cares.

Source: `design-artifacts/A-Product-Brief/content-language.md`

## The direction: Accessible + Swiss / Minimal

The visual system is **flat, dense-but-calm, and high-contrast**. Concretely:

- **1px borders, not shadow stacks.** A raised surface is a hairline border on the page background. Shadows are reserved for overlays only (modals, popovers, toasts).
- **8px rhythm.** A 4px half-step for the tight pairs.
- **Hairline dividers** instead of boxes around everything.
- **Tabular numerals** on every figure, so columns of numbers line up.
- **One accent, many meanings.** Civic blue is the only brand colour; status colours are semantic and muted.

Two rules govern every component:

1. **Never colour alone.** A status carries a shape (a Phosphor icon), a word, and a colour — so it survives a greyscale printout and a colour-blind reader.
2. **Never a chart without its data.** Every chart ships a visible, sortable data table.

## Files

| File | Purpose |
|---|---|
| `tokens.css` | The single source of truth for the visual language. CSS custom properties only — colors, type, spacing, radii, shadows, motion. |
| `components.html` | A self-documenting library of every component pattern, applied to the tokens. Open in browser to scan. |
| `gallery.html` | Entry point. Embedded previews of all 7 mockups + link to component library. |
| `mockups/01-welcome.html` | First-run welcome screen. Pure typography moment. |
| `mockups/02-home-city-activity.html` | Map + activity bottom sheet + Report CTA. |
| `mockups/03-report-submitted.html` | Confirmation + 4-step status trail + ticket ID. |
| `mockups/04-my-reports-detail.html` | Before/after photos + metadata + feedback prompt. |
| `mockups/05-daily-queue-dashboard.html` | Habib's cockpit. Desktop 3-region layout. |
| `mockups/06-field-app-home.html` | Rashid's start-of-day. Web-first, phone fallback. |
| `mockups/07-status-in-progress.html` | Rashid's hands-busy live work view (`.theme-outdoor`). |
| `mockups/08-login.html` | Sign-in. Two-region auth shell: form + civic story column. |
| `mockups/09-register.html` | Account creation. Three-stage funnel + live password rules. |
| `mockups/10-verify-otp.html` | Phone verification. Six OTP boxes, resend countdown, recovery card. |
| `mockups/11-public-landing.html` | Anonymous landing. Hero + live stats + map card + activity grid. |
| `mockups/12-feed.html` | Signed-in city activity feed. Sticky filter chips + report rows. |

## How to view

Open `gallery.html` in any modern browser. The mockups render with Tailwind via CDN and pull colors / type / spacing from `tokens.css`. Bangla glyphs render via Noto Sans Bengali (Google Fonts).

```
design-artifacts/D-Design-System/01-Visual-Design/
  gallery.html              ← start here
  components.html           ← component library
  tokens.css                ← design tokens
  README.md                 ← this file
  mockups/
    01-welcome.html
    02-home-city-activity.html
    03-report-submitted.html
    04-my-reports-detail.html
    05-daily-queue-dashboard.html
    06-field-app-home.html
    07-status-in-progress.html
```

## Token highlights

### Color

| Token | Value | Role |
|---|---|---|
| `--color-primary` | `#1E40AF` | Civic blue. Primary actions only — at most one CTA in view. 8.72:1 on white. |
| `--color-accent` | `#0369A1` | Links and focus accents. Deliberately distinct from primary so a link never reads as a button. |
| `--color-ink` | `#020617` | Near-black primary text. |
| `--color-surface-page` | `#F8FAFC` | Cool off-white app background. |
| `--color-surface-card` | `#FFFFFF` | Cards, modals. |
| `--color-success` | `#15803D` | An OUTCOME, never a CTA. There is no green button. |
| `--color-warning` | `#B45309` | Attention required. |
| `--color-danger` | `#C81E1E` | Destructive actions and failures. |

Status colours are muted, not saturated: Submitted (slate), Routed (primary blue), In progress (amber), Resolved (forest green). Each has a `-soft` companion fill, and every foreground clears WCAG AA against both white and its own fill.

Category accents give each report category one colour for its iconography: streetlight (amber), pothole (slate), garbage (green), drain (blue), sanitation (purple), other (grey).

### Type

- **Display + Body** — Noto Sans Bengali for proper Bangla glyphs, system-ui fallback for Latin.
- **Mono** — system monospace stack for ticket IDs.
- **Scale** — 12 / 14 / 15 / 16 / 17 / 20 / 24 / 32 / 44 px.
- **Line-height** — 1.6 is the FLOOR for Bangla body copy. At 1.5 the matras and descenders clipped inside pills and buttons.
- **Letter-spacing** — tight on display (-0.022em), normal on body.

### Spacing

- 8px base, 4px half-step. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.

### Radii

- Small (4px) — chips, mono tags.
- Input (8px) — inputs, selects, textareas, buttons.
- Card (12px) — cards and panels.
- Pill (9999px) — status pills, filter pills, badges.

### Shadows

- Cards have NO shadow — a 1px border lifts them.
- Overlays only: `--shadow-modal`, `--shadow-popover`.
- `--shadow-focus` is the focus ring, so a component can draw a focus state without owning the outline geometry.

### Themes

- **Default** — dark mode with midnight navy surfaces and civic-blue focus states; light mode remains user-selectable.
- **Outdoor** (`.theme-outdoor`) — for Rashid's in-progress view: pure white + pure black for sunlight readability. This is deliberately NOT softened by the redesign.
- **Dark** (`.theme-dark`) — optional, available for Habib's monitor.

## Coverage rationale

These 12 mockups cover the structural patterns used across the app:

| Mockup | Patterns defined |
|---|---|
| Welcome | Hero typography, primary CTA, trust copy, language register |
| Home / City Activity | Map, bottom sheet, floating action button, activity feed, sticky header with notifications |
| Report Submitted | Hero confirmation, status trail, ticket ID, sticky CTA, secondary link |
| My Reports Detail | Photo pair + multi-photo overflow, metadata block, feedback prompt, compact trail |
| Daily Queue Dashboard | Desktop 3-region layout, stats strip, filter rail, ticket list, detail pane, keyboard hints |
| Field App Home | Top bar, quick-stats, today's queue, in-flow CTA |
| Status: In Progress | Hands-busy full-bleed work view in the high-contrast outdoor palette |
| Log in | Two-region auth shell, error summary linked to the field, show/hide password, recovery path |
| Create account | Three-stage signup rail, live password-requirement rows, consent checkbox |
| Verify your phone | Single-digit OTP boxes, named delivery channel, resend countdown, recovery card |
| Public landing | Anonymous hero, live stats strip, status-coloured map card, trust row, PII-free feed |
| City activity feed | Signed-in app header, sticky filter chips with counts, "new" badge state |

The remaining pages are spec'd well enough that engineering can build them from the spec + tokens without separate mockups. Component patterns are defined in `components.html`.

## The component library (in code)

`components.html` is the visual reference; `components/ui/` is the implementation, and the two are kept in step. The primitives that ship:

| Area | Primitives |
|---|---|
| Actions | `Button`, `IconButton` |
| Metadata | `Badge`, `Avatar`, `StatusPill` |
| Forms | `Field`, `Input`, `Select`, `Textarea` |
| Layout | `Card`, `Panel`, `Toolbar`, `FilterBar`, `DataTable` |
| States | `EmptyState`, `ErrorState`, `LoadingState` |
| Navigation | `Breadcrumb`, `SideNav`, `Tabs` |
| Overlays | `Modal`, `Toast` |
| Data display | `KpiRow`, `Timeline` |
| Charts | `ChartFrame`, `TrendLine`, `CategoryBar`, `SlaBullet`, `StatCard` |

Each primitive carries its own accessibility contract, and each contract has a unit test in `tests/unit/components/`.

## How engineering should use these

1. **The token names are the contract; the implementation is free.** Pages compose primitives — they do not define their own styles.
2. **Build components, not screens.** A page that hand-rolls a `<button>` has already gone wrong.
3. **Match Bangla typography.** Use Noto Sans Bengali (or its equivalent) for any Bangla text. Do not assume system fonts will render Bangla correctly on all platforms.
4. **Test the outdoor theme.** Rashid's Status: In Progress uses `.theme-outdoor`. Validate it on actual sunlight-readable displays before shipping.
5. **Use the dashboard mockup as the desktop reference.** Three-region layout (filter rail / list / detail) is the dispatcher pattern. Other desktop pages follow the same structure with variations.

## What the tests enforce

The visual system is not a convention — it is checked:

| Test | What it holds |
|---|---|
| `tests/unit/ui/tokens-contrast.test.ts` | Every shipped colour pair clears WCAG AA; every referenced token is defined. |
| `tests/unit/ui/mockup-tokens.test.ts` | Every `var(--token)` in the mockups and the library names a token `tokens.css` defines. |
| `tests/unit/admin-theme-tokens.test.ts` | The dark block defines no token the light block lacks — the class of bug that made two admin panels transparent. |
| `tests/unit/components/*.test.tsx` | Each primitive's accessibility contract. |

## What's deliberately out of scope

- **Real photographs** — all photo blocks use gradient placeholders. Real city-infra photography is a content task, not a design task.
- **Animations** — tokens define durations and easings, but the mockups are static. The transition definitions live in the spec.
- **Per-city brand marks** — the CityFix mark is a platform-level asset. A city may define its own mark as a separate task.

## Source references

- `design-artifacts/A-Product-Brief/content-language.md` — brand personality, voice.
- `design-artifacts/B-Trigger-Map/02-persona-rahim-the-reporter.md` — citizen tone, expectations.
- `design-artifacts/B-Trigger-Map/03-persona-habib-the-handler.md` — dispatcher desktop patterns.
- `design-artifacts/B-Trigger-Map/04-persona-rashid-the-resolver.md` — field-crew outdoor context.
- `design-artifacts/C-UX-Scenarios/<NN-scenario>/<N.M-page>/<N.M-page>.md` — page specs (the source of truth for content & behavior). Each page lives in its scenario folder under `C-UX-Scenarios/`.
