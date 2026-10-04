# Visual Direction — CityFix

> Phase 1 — Product Brief supplement. Originally deferred to Freya; consolidated here as the bridge between `content-language.md` and `design-artifacts/D-Design-System/01-Visual-Design/`.
> Status: Final — ready for handoff to Mimir's build phase.

---

## Purpose

This document is the visual contract for CityFix. It tells Mimir (and any future contributor) what the product looks like, why it looks that way, and which decisions are locked vs. tunable. The mechanical reference lives in `design-artifacts/D-Design-System/01-Visual-Design/tokens.css`; this brief names the *intent* behind every token so build-time choices are not arbitrary.

## One-line brand

**Apple-like calm confidence. Civic trust. Bangla-first.**

If CityFix were a person at a dinner party, they would be the trusted neighbor who works at the city corporation and genuinely cares — confident in their ability to make things happen, warm enough that you trust them with your complaint, but not chatty. The visual language is the same voice, drawn.

---

## Brand personality → visual translation

| Brand trait | Visual consequence |
|---|---|
| **Calm confidence** | Generous whitespace. Almost no shadows. Restrained primary color (`#2C5282`, blue-grey — not saturated blue). Status colors muted, not loud. |
| **Empathetic** | Warm off-white page (`#FAFAF7`), not pure white. Soft surfaces. Rounded corners (8–16px). No harsh edges. |
| **Civic-minded, quietly idealistic** | The hero copy can be confident; the visual styling is plain. Photography shows real Dhaka infrastructure problems, but mockups use gradient placeholders — the product trusts words and structure, not decoration. |
| **Not a tech startup** | No gradients on CTAs. No glow. No "wow" effects. Hero buttons are filled, single-color, restrained radius. |
| **Not a stern government notice** | No bureaucratic borders or dense tables in citizen-facing surfaces. No red-only warning palettes. Status colors include amber (in progress) and forest green (resolved), never pure red as a default. |
| **Not chatty / marketing** | No emoji in copy. No exclamation marks. No banner popups. Hero illustrations (when used) are calm and architectural — not cartoony. |

---

## Voice dimensions → typography and motion

CityFix's voice dimensions (from `content-language.md`) translate to typography as follows:

- **Calm and confident** → tight letter-spacing on display (`-0.022em`), generous line-height (`1.5` body, `1.2` display).
- **Plain, not flowery** → moderate type scale (44 / 32 / 24 / 20 / 17 / 16 / 15 / 14 / 12 px). No display sizes above 44px.
- **Earned emotion** → bold weights (`600`) reserved for primary actions and status pills; body stays at `400`/`500`.
- **Deep / targeted** → restrained motion. One easing curve (`--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`) for almost every transition. Three durations: `150ms` (fast), `200ms` (base), `320ms` (slow). No spring physics, no bounce.

---

## Color system

### Primary palette

| Token | Hex | Role |
|---|---|---|
| `--color-primary` | `#2C5282` | Primary actions, routed status, focus rings. Restrained blue-grey — not saturated. |
| `--color-ink` | `#0F1419` | Primary text. Near-black, not pure black, for warmth. |
| `--color-surface-page` | `#FAFAF7` | App background. Warm off-white. |
| `--color-surface-card` | `#FFFFFF` | Cards, modals. Pure white — pops slightly off the page. |

The deliberate choice: a civic app should not feel like a SaaS dashboard. The off-white background, near-black text, and blue-grey primary form a palette that reads as "trustworthy institution," not "tech product."

### Status colors

All four statuses are intentionally muted, not saturated:

| Status | Token | Hex | Visual cue |
|---|---|---|---|
| Submitted | `--color-status-submitted` | `#718096` | Slate — neutral, waiting |
| Routed | `--color-status-routed` | `#2C5282` | Primary blue — has a home |
| In progress | `--color-status-in-progress` | `#B7791F` | Amber — work happening |
| Resolved | `--color-status-resolved` | `#2F7A4F` | Forest green — done, confirmed |

Each status has a `-soft` companion token (`--color-status-X-soft`) used for pill backgrounds — never saturated fills, always tinted backgrounds with the saturated token reserved for text and icons.

### Category accents

Six accent colors, one per primary category, used for iconography in tiles and feed:

| Category | Token | Hex |
|---|---|---|
| Streetlight | `--color-cat-streetlight` | `#B7791F` (amber — electrical) |
| Pothole | `--color-cat-pothole` | `#4A5568` (slate) |
| Garbage | `--color-cat-garbage` | `#2F7A4F` (green) |
| Drain | `--color-cat-drain` | `#2C5282` (blue) |
| Sanitation | `--color-cat-sanitation` | `#805AD5` (purple) |
| Other | `--color-cat-other` | `#718096` (grey) |

Categories are visual, not functional — they do not affect routing or prioritization. They give citizens a way to scan a mixed feed.

### Themes

Three themes ship in v1:

- **Default (light)** — warm off-white + near-black + blue-grey primary. The default for all surfaces except Rashid's in-progress view.
- **`.theme-outdoor`** — Rashid's "Status: In Progress" screen only. Pure white background, pure black text, no greys, designed for direct-sunlight readability on LCD and OLED. Auto-switches by ambient-light sensor when available; manual toggle otherwise. **This is a deliberate accessibility choice, not a dark mode.**
- **`.theme-dark`** — Optional dark mode for Habib's monitor. Activated per-user in settings. Same structure as default, inverted surface and ink tokens.

**No theme builder, no per-city theming.** Themes are defined at the platform level; per-city variation is content (language, categories, department names), not visual.

---

## Typography

### Type families

- **Display + Body:** Noto Sans Bengali. System fallback for Latin: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui`. Bangla-first means Latin is the fallback, not the other way around.
- **Mono:** `ui-monospace, "SF Mono", Menlo, Consolas` — for ticket IDs (e.g., `DHK-00042`).

**Why Noto Sans Bengali:** it is the most reliable webfont for proper Bangla glyph rendering across platforms. System fonts will not render Bangla consistently on all devices — this is a build requirement, not a stylistic preference.

### Type scale

| Token | Size | Use |
|---|---|---|
| `--text-display-xl` | 44px | Hero titles (Welcome, hero report screens) |
| `--text-display-lg` | 32px | H1 — section heroes |
| `--text-display-md` | 24px | H2 — page titles, modal titles |
| `--text-display-sm` | 20px | H3 — card titles, group headings |
| `--text-body-lg` | 17px | Large body — primary content |
| `--text-body` | 16px | Base body |
| `--text-body-sm` | 15px | Small body — dense UI |
| `--text-caption` | 14px | Captions, helper text |
| `--text-micro` | 12px | Micro labels, metadata |

Line heights: `1.2` on display, `1.5` on body, `1.65` for relaxed reading. Apple signature — generous, never cramped.

---

## Spacing, radius, shadows

### Spacing

4px base. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96 (`--space-1` through `--space-9`).

**Section padding:** 48–64px on desktop hero / confirmation surfaces.
**Component padding:** 16–24px standard; 32px on hero cards.
**Touch targets:** minimum 44px height (`--touch-min`). Primary CTAs are 64px tall (`--touch-cta`).

### Radii

| Token | Value | Use |
|---|---|---|
| `--radius-xs` | 4px | Chips, inputs, mono tags |
| `--radius-sm` | 8px | Buttons, small cards |
| `--radius-md` | 12px | Medium cards |
| `--radius-lg` | 16px | Hero cards, photo blocks, modal |
| `--radius-xl` | 24px | Reserved for future use |
| `--radius-pill` | 9999px | Status pills, filter pills, primary CTA |

The CTA-as-pill is a deliberate choice — it makes the primary action feel approachable, not institutional.

### Shadows

Almost no shadows by default. This is the inverse of most civic / government UIs.

| Token | Value | Use |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgba(15,20,25,0.04)` | Cards (the only shadow most elements get) |
| `--shadow-sm` | `0 2px 4px rgba(15,20,25,0.05), 0 1px 2px rgba(15,20,25,0.03)` | Dropdowns, hover states |
| `--shadow-md` | `0 4px 12px rgba(15,20,25,0.07), 0 1px 3px rgba(15,20,25,0.04)` | Popovers |
| `--shadow-lg` | `0 12px 32px rgba(15,20,25,0.10), 0 2px 6px rgba(15,20,25,0.05)` | Modals on hover |
| `--shadow-modal` | `0 24px 48px rgba(15,20,25,0.16), 0 4px 12px rgba(15,20,25,0.08)` | Modal base |

No glowing shadows. No colored shadows. The depth hierarchy is *whitespace first, shadows last*.

---

## Layout and breakpoints

| Token | Value | Use |
|---|---|---|
| `--layout-mobile-max` | 480px | Citizen mobile viewport target |
| `--layout-tablet-max` | 1024px | Tablet / field-crew viewport |
| `--layout-desktop` | 1440px | Dispatcher / admin desktop target |
| `--header-height-mobile` | 56px | Citizen app header |
| `--header-height-desktop` | 64px | Authority app header |
| `--sticky-cta-height` | 64px | Bottom-sticky primary CTA |

**Mobile-first, desktop-scaled.** The citizen app is mobile-first by user profile (smartphone, on the street, often low-bandwidth). The authority app is desktop-first (Habib and Aamir use laptops and tablets, not phones). Rashid's field app is mobile-first with `.theme-outdoor` for the in-progress screen.

**Three-region desktop pattern.** Habib's dispatcher surface, Aamir's admin surface, and any future authority-side list-and-detail surface use the same structure: filter rail (left) / list (middle) / detail (right). The `daily-queue-dashboard.html` mockup is the reference.

---

## Motion

Three durations, one easing curve. No spring physics, no bounce, no parallax.

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 150ms | Hover, focus, micro-feedback |
| `--duration-base` | 200ms | State changes, button presses, pill toggles |
| `--duration-slow` | 320ms | Modal open/close, page transitions |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Almost everything (Apple signature) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Reserved for two-state swaps (theme switch) |

**Motion is informational, never decorative.** No animated mascots, no celebration animations on submit. The only "earned" motion is the resolution confirmation — and even that is a single status-pill transition plus a check-mark draw, not a confetti burst.

---

## Component language

The five hero mockups (`design-artifacts/D-Design-System/01-Visual-Design/mockups/`) and the component library (`components.html`) define the visual language. The remaining 28 pages compose these components — they do not define their own styles.

**Component patterns established:**

- **Buttons** — three styles (primary, secondary, tertiary) × three states (default, hover, pressed) × three sizes (sm, md, lg/cta). Primary is pill-shaped; secondary and tertiary are radius-sm.
- **Inputs** — label, helper text, error state. Border-focus uses primary color. No floating labels.
- **Cards** — `--shadow-xs` only; border for definition when needed. Padding `--space-5` or `--space-6`.
- **Status pills** — soft background + saturated text, pill-shaped. Four variants (submitted, routed, in-progress, resolved). Used everywhere status appears.
- **Status trail** — four-step trail (submitted / routed / in progress / resolved) with timestamps. Used in confirmation and ticket detail surfaces.
- **Photo blocks** — single, pair (before/after), and multi (cap 3, with "+n" overflow indicator). Multi-photo pattern is the resolution-trust surface.
- **Banners** — error, warning, info. Restrained copy, no exclamation marks.
- **Filter pills** — same shape as status pills; click-to-toggle.
- **Modals** — `--radius-lg`, `--shadow-modal`, max-width 480px mobile / 560px desktop.

---

## Photography and iconography

- **Photography** — gradient placeholders in mockups. Real photography (citizen photos, before/after pairs) is content, not design. v1 ships with photo upload and storage; the visual treatment is consistent across mockup and real.
- **Iconography** — Heroicons (inline SVG) as placeholders. A custom icon set (12–24 line icons covering the six categories and the platform's primary actions) is a v1.1 enhancement, not a v1 requirement.

---

## Out of scope (v1)

These are deliberate omissions, not oversights:

- **Real logo / wordmark** — mockups use a placeholder dot + "CityFix" text. Final wordmark design is a separate task. Per-city marks (Aamir's city-setup flow) are out of scope.
- **Custom illustrations** — placeholder copy and structural design carry the visual story in v1.
- **Animation library** — tokens define durations and easings, but motion implementation is in Mimir's build, not pre-defined here.
- **Component code (React/Vue/etc.)** — these are visual references. Mimir produces the actual component library in code.
- **Brand book / style guide PDF** — this document and `tokens.css` are the brand reference.

---

## How engineering (Mimir) should use this

1. **Translate tokens, don't invent them.** Every visual decision in the build maps to a token in `tokens.css`. If a new token is needed, add it there first; do not hardcode values in components.
2. **Build components, not screens.** Pages compose components. The component library in `components.html` is the build target.
3. **Match Bangla typography.** Use Noto Sans Bengali (or its equivalent) for any Bangla text. Do not assume system fonts will render Bangla correctly on all platforms.
4. **Test `.theme-outdoor` on actual sunlight-readable hardware** before shipping Rashid's in-progress view. The token values are calibrated; the platform must deliver them.
5. **Use the dashboard mockup as the desktop reference.** Three-region layout (filter rail / list / detail) is the dispatcher / admin pattern. Variations on this structure are the right way to extend; new desktop layouts should justify themselves against this pattern.
6. **Honest copy is enforced in the visual layer.** Pill text, banner copy, and empty states all read "routed to X department" — never "will be fixed in N days." If a new component surfaces status to the citizen, default to honest language; review with Freya's specs.

---

## Source references

- `design-artifacts/A-Product-Brief/product-brief.md` — vision, constraints, success criteria
- `design-artifacts/A-Product-Brief/content-language.md` — brand personality, tone, language strategy
- `design-artifacts/B-Trigger-Map/*.md` — driving forces behind every visual decision
- `design-artifacts/C-UX-Scenarios/<NN-scenario>/<N.M-page>/<N.M-page>.md` — page specs (source of truth for content & behavior). Each page lives in its scenario folder under `C-UX-Scenarios/`.
- `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` — mechanical token definitions
- `design-artifacts/D-Design-System/01-Visual-Design/components.html` — component library reference
- `design-artifacts/D-Design-System/01-Visual-Design/gallery.html` — embedded preview of all mockups

---

_Produced by Saga — 2026-09-18_
_Consolidates Freya's visual design work into the brief suite so Mimir's build phase has a single visual contract to read._