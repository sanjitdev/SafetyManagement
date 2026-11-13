# CityFix — Visual Design

The visual layer for CityFix. Defines the design tokens, the component library, and four role dashboards that establish the visual language for every page.

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
| `gallery.html` | Entry point. Embedded previews of all four dashboards + link to component library. |
| `mockups/dashboards.css` | Shared chrome for the four role dashboards: rail, top bar, heading, KPI cards, cards, pills, map, charts, quick actions, crew pieces, activity feed. |
| `mockups/01-citizen-dashboard.html` | The citizen's home. Hero band over a drawn skyline, report CTA + metric tiles, recent reports beside the status-around-you map, six-month statistics chart. |
| `mockups/02-dispatcher-dashboard.html` | The dispatcher's cockpit. Four split KPI cards with sparklines, city map with a selected-ticket popup, recent reports, crew-availability donut, quick actions, grouped bar chart. |
| `mockups/03-crew-dashboard.html` | The field surface. No top bar — the greeting, date chip and bell share the content column. Today's jobs, job map with the route to the next stop, focused job with the status trail. |
| `mockups/04-admin-dashboard.html` | The city-wide overview. Split KPI cards, city map with glyph pins, recent reports, three-series reports-trend line, crew-activity donut, four coloured quick-action tiles. |

## How to view

Open `gallery.html` in any modern browser. The mockups render with Tailwind via CDN and pull colors / type / spacing from `tokens.css`. Bangla glyphs render via Noto Sans Bengali (Google Fonts).

```
design-artifacts/D-Design-System/01-Visual-Design/
  gallery.html              ← start here
  components.html           ← component library
  tokens.css                ← design tokens
  README.md                 ← this file
  mockups/
    01-citizen-dashboard.html
    02-dispatcher-dashboard.html
    03-crew-dashboard.html
    04-admin-dashboard.html
    dashboards.css              ← shared chrome for all four dashboards
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

- **Default** — light mode. The four role dashboards are rendered in the light theme, matching the reference images in `ui-design/`. Dark mode remains a user-selectable alternative.
- **Outdoor** (`.theme-outdoor`) — for Rashid's in-progress view: pure white + pure black for sunlight readability. This is deliberately NOT softened by the redesign.
- **Dark** (`.theme-dark`) — optional, available for Habib's monitor.

## Coverage rationale

These four dashboards cover the structural patterns used across the app:

| Dashboard | Patterns defined |
|---|---|
| Citizen | Hero band over an illustration, primary report CTA, metric-tile strip, the citizen's own report list, status-around-you map with a legend, statistics line chart, civic trust bands |
| Dispatcher | Deep-navy role rail with a filled active-nav pill, top bar with search / bell / date chip, four SPLIT KPI cards with sparklines and trend percentages, city map with a selected-ticket popup, report list with status pills, crew-availability donut, quick-action tiles, grouped bar chart |
| Crew | Chrome-free field surface (no top bar), hard-hat greeting block, four KPI cards with chevrons, today's job list with mono `#CF-` ticket codes, job map with a dashed route, focused-job panel with the four-step status trail, upload and mark-done actions, recent activity feed, help band |
| Admin | Role rail with a skyline illustration, KPI cards with sparklines and up/down trends, city map with glyph-carrying pins, report list with photo thumbnails, three-series trend line, crew-activity donut with a stat list, four coloured quick-action tiles |

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
| Data display | `KpiRow`, `MetricStrip`, `Timeline` |
| Charts | `ChartFrame`, `TrendLine`, `CategoryBar`, `SlaBullet`, `StatCard` |

Each primitive carries its own accessibility contract, and each contract has a unit test in `tests/unit/components/`.

### The shared dashboard stylesheet

`tokens.css` is the single token source for every surface; `mockups/dashboards.css` adds the chrome all four dashboards share — the role rail, the top bar, the KPI card family, the status pills, the map card and the chart kit. The ticket codes stay deliberately separated by role: the citizen-facing code is the PUBLIC `#TIX-` reference a citizen quotes to the call centre, the crew job id is the internal `#CF-` reference the dispatcher hands out, and the two must never be confused.

## How engineering should use these

1. **The token names are the contract; the implementation is free.** Pages compose primitives — they do not define their own styles.
2. **Build components, not screens.** A page that hand-rolls a `<button>` has already gone wrong.
3. **Match Bangla typography.** Use Noto Sans Bengali (or its equivalent) for any Bangla text. Do not assume system fonts will render Bangla correctly on all platforms.
4. **Test the outdoor theme.** Rashid's Status: In Progress uses `.theme-outdoor`. Validate it on actual sunlight-readable displays before shipping.
5. **Use the dashboard mockups as the desktop reference.** The rail + top bar + card grid in `mockups/dashboards.css` is the shell every desktop surface follows. The dispatcher and admin dashboards (02, 04) are the two staff-side references; the crew dashboard (03) is the field reference and deliberately omits the top bar.

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
