# CityFix — Visual Design

The visual layer for CityFix. Defines the design tokens, component patterns, and 5 hero mockups that establish the visual language for all 33 pages.

## Brand personality

Apple-like calm confidence. Civic trust. Bangla-first.

> If CityFix were a person at a dinner party, they would be confident and assured, empathetic, civic-minded and quietly idealistic — the trusted neighbor who works at the city corporation and genuinely cares.

Source: `design-artifacts/A-Product-Brief/content-language.md`

## Files

| File | Purpose |
|---|---|
| `tokens.css` | The single source of truth for the visual language. CSS custom properties only — colors, type, spacing, radii, shadows, motion. |
| `components.html` | A self-documenting library of every component pattern, applied to the tokens. Open in browser to scan. |
| `gallery.html` | Entry point. Embedded previews of all 5 mockups + link to component library. |
| `mockups/01-welcome.html` | First-run welcome screen. Pure typography moment. |
| `mockups/02-home-city-activity.html` | Map + activity bottom sheet + Report CTA. |
| `mockups/03-report-submitted.html` | Confirmation + 4-step status trail + ticket ID. |
| `mockups/04-my-reports-detail.html` | Before/after photos + metadata + feedback prompt. |
| `mockups/05-daily-queue-dashboard.html` | Habib's cockpit. Desktop 3-region layout. |

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
```

## Token highlights

### Color
- **Primary** `#2C5282` — restrained blue-grey, used for primary actions and the routed status.
- **Ink** `#0F1419` — near-black for primary text.
- **Surface page** `#FAFAF7` — warm off-white (not pure white) for app background.
- **Status colors** — muted, not saturated: Submitted (slate), Routed (primary blue), In progress (amber), Resolved (forest green).
- **Category accents** — one color per report category for iconography in tiles and feed.

### Type
- **Display + Body** — Noto Sans Bengali for proper Bangla glyphs, system-ui fallback for Latin.
- **Mono** — system monospace stack for ticket IDs.
- **Scale** — 12 / 14 / 15 / 16 / 17 / 20 / 24 / 32 / 44 px.
- **Line-height** — generous (1.5 base, 1.2 on display). Apple signature.
- **Letter-spacing** — tight on display (-0.022em), normal on body.

### Spacing
- 4px base. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Generous whitespace — sections use 48-64px padding.

### Radii
- Small (4px) — chips, inputs, mono tags.
- Medium (8px) — buttons, small cards.
- Large (16px) — hero cards, photo blocks, modal.
- Pill (9999px) — status pills, filter pills, CTA buttons.

### Shadows
- Almost no shadows by default.
- Cards: `0 1px 2px rgba(0,0,0,0.04)`.
- Modals: `0 24px 48px rgba(0,0,0,0.16)`.

### Themes
- **Default** — light mode with warm off-white.
- **Outdoor** (`.theme-outdoor`) — for Rashid's in-progress view: pure white + pure black for sunlight readability.
- **Dark** (`.theme-dark`) — optional, available for Habib's monitor.

## Coverage rationale

These 5 mockups were chosen to cover the structural patterns used in all 33 pages:

| Mockup | Patterns defined |
|---|---|
| Welcome | Hero typography, primary CTA, trust copy, language register |
| Home / City Activity | Map, bottom sheet, floating action button, activity feed, sticky header with notifications |
| Report Submitted | Hero confirmation, status trail, ticket ID, sticky CTA, secondary link |
| My Reports Detail | Photo pair + multi-photo overflow, metadata block, feedback prompt, compact trail |
| Daily Queue Dashboard | Desktop 3-region layout, stats strip, filter rail, ticket list, detail pane, keyboard hints |

The remaining 28 pages are spec'd well enough that engineering can build them from the spec + tokens without separate mockups. Component patterns (buttons, inputs, pills, banners, modals) are defined in `components.html`.

## How engineering should use these

1. **Translate tokens to your framework.** Mimir's build phase should generate the equivalent of `tokens.css` in your chosen design system (Tailwind config, CSS-in-JS, CSS variables — whichever fits). The token names are the contract; the implementation is free.
2. **Build components, not screens.** The component library is the build target. Pages compose components — they don't define their own styles.
3. **Match Bangla typography.** Use Noto Sans Bengali (or its equivalent) for any Bangla text. Do not assume system fonts will render Bangla correctly on all platforms.
4. **Test the outdoor theme.** Rashid's Status: In Progress uses `.theme-outdoor`. Validate it on actual sunlight-readable displays before shipping.
5. **Use the dashboard mockup as the desktop reference.** Three-region layout (filter rail / list / detail) is the dispatcher pattern. Other desktop pages (Habib's monitor, ticket detail, performance snapshot, Aamir's admin pages) follow the same structure with variations.

## What's deliberately out of scope

- **Real logo / wordmark** — the mockups use a placeholder dot + "CityFix" text. Final logo design is a separate task; Aamir's city setup may define per-city marks.
- **Real photographs** — all photo blocks use gradient placeholders. Real city-infra photography is a content task, not a design task.
- **Custom icon set** — mockups use Heroicons inline SVG as placeholders. A custom icon set (12-24 line icons covering the 6 categories and the platform's actions) is a v1.1 enhancement.
- **Animations** — tokens define durations and easings, but the mockups are static. The transition definitions live in the spec; motion implementation is in Mimir's build.
- **Component code (React/Vue/etc.)** — these are visual references. Mimir produces the actual component library in code.

## Source references

- `design-artifacts/A-Product-Brief/content-language.md` — brand personality, voice.
- `design-artifacts/B-Trigger-Map/02-persona-rahim-the-reporter.md` — citizen tone, expectations.
- `design-artifacts/B-Trigger-Map/03-persona-habib-the-handler.md` — dispatcher desktop patterns.
- `design-artifacts/B-Trigger-Map/04-persona-rashid-the-resolver.md` — field-crew outdoor context.
- `design-artifacts/C-UX-Scenarios/<NN-scenario>/<N.M-page>/<N.M-page>.md` — page specs (the source of truth for content & behavior). Each page lives in its scenario folder under `C-UX-Scenarios/`.
