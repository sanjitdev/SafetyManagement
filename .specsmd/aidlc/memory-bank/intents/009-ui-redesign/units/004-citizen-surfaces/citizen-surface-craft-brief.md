---
unit: 004-citizen-surfaces
intent: 009-ui-redesign
applies-to: story-010-citizen-page-implementation
status: active
created: 2026-11-12T00:00:00Z
updated: 2026-11-12T00:00:00Z
---

# Citizen Surface Craft Brief

**Read this before implementing Story 010.** The four citizen mockups
(`13`–`16`) are approved as the visual contract. This brief records the
rules those mockups follow, so the React pages that mirror them land in
the same visual world instead of drifting into a generic dashboard.

It exists because the mockups were authored, audited against a design
craft floor, and corrected. Every rule below was either a defect found
in the mockups and fixed, or a rule the mockups already satisfied and
the pages must keep satisfying. Do not re-derive them — apply them.

## 0. The source of truth, in order

1. `design-artifacts/D-Design-System/01-Visual-Design/mockups/13-home-city-activity.html`
2. `design-artifacts/D-Design-System/01-Visual-Design/mockups/14-report-shell.html`
3. `design-artifacts/D-Design-System/01-Visual-Design/mockups/15-my-reports.html`
4. `design-artifacts/D-Design-System/01-Visual-Design/mockups/16-report-detail-trail.html`
5. `design-artifacts/D-Design-System/01-Visual-Design/mockups/citizen-surfaces.css`
   — the shared chrome for all four. One file, not four copies.
6. `design-artifacts/D-Design-System/01-Visual-Design/tokens.css` — the
   only source of colour, spacing, type and radius. Never a raw hex.

`app/home/page.tsx` already exists and is the reference implementation of
the hub. When a mockup and the shipped page disagree, **the shipped page
wins on behaviour and the mockup wins on layout** — but read
`app/home/page.tsx` first, because it already solves several of the
problems below and you should port its solution rather than invent one.

## 1. Mode: Operate

This is an app surface, not a marketing page. The citizen is completing a
task — reporting a pothole — and the design's job is to make that task
obvious and finishable. Expression yields to scanability.

Concretely: the citizen must always be able to answer "where am I, what
is still missing, how many photos can I still add" without reading more
than the element they are looking at.

## 2. Dark is the default, and it is not a category choice

`lib/theme/appearance.ts` sets `APPEARANCE_DEFAULT = 'dark'`, and
`PRODUCT.md` commits: *"Dark appearance is the default on every app
page. Users may still select light appearance."*

So every citizen page renders dark by default. The four mockups carry
`<html class="theme-dark">` for exactly this reason — an earlier revision
rendered them all light and misrepresented the product.

In React, do **not** hard-code `theme-dark`. The live app applies the
persisted appearance through a synchronous inline boot script to avoid a
flash of the wrong theme. Render through the same mechanism the rest of
the app uses. If you find yourself adding a `theme-dark` class literal
in a page component, you have chosen the wrong layer.

**Check the dark values before you check the light ones.** A colour pair
that is fine on white can be invisible on `#0B1220`. In particular:
`--color-surface-card` (#111827) and `--color-map-bg` (#0F172A) are
near-identical in the dark theme, and `--color-ink-tertiary` (#9CA3AF)
is the lowest-contrast ink you are allowed to use. The mockup's map
originally filled its building blocks with `--color-surface-card` at 28%
opacity; against the map background they vanished completely and the map
read as an empty field with two pins on it. The fix was to carry the
shape on a **stroke** in a token that actually contrasts.

## 3. The citizen's own words are never clipped

The note under each report title is the citizen's own description of
their problem. An earlier revision clipped it to one line with an
ellipsis, which hid the only text the citizen authored. It now wraps to
at most two lines.

When you port the row to React, wrap it. Do not re-add
`text-overflow: ellipsis; white-space: nowrap`.

## 4. Hierarchy comes from structure, not from a grid of equal cards

The hub's numbers are **not** three identical KPI tiles, and the report
list is **not** a grid of equal cards. Equal-size boxes say "these matter
equally", which is false of a primary action next to a set of counts.

The approved shape is a **hierarchy**:

- The primary action (the report CTA) gets **its own brand-filled
  surface** — `--color-primary` background, `--color-on-primary` text.
- The read-only figures share **one** surface, divided by **1px
  hairlines** (`border-left: 1px solid var(--color-border)`), not
  separated into boxes.

This is what `components/ui/MetricStrip.tsx` already does, and it is why
that component's own docstring warns about the hero-metric template. Use
`MetricStrip`. Do not hand-roll a `<div>` per figure.

The same rule governs every other surface: a card grid is only correct
when the items in it genuinely are peers. On the citizen surfaces they
usually are not — a CTA and a count are not peers, a photo and a caption
are not peers, a status badge and a ticket code are not peers.

## 5. No kicker, no eyebrow, no section numbers

Never put a small uppercase word above a heading to label it —
"REPORTS", "আপনার রিপোর্ট", "DASHBOARD", "01", "SECTION TWO". This is
an absolute ban. A heading says what it is; a label above it repeats it
in smaller type.

Also banned: the hero-metric template, nested cards, gradient text,
decorative glass/blur panels, coloured `border-left` thicker than 1px,
hard offset shadows, sparklines or progress rings standing in for
content, monospace used as costume, unicode glyphs as icons, and
geometric masks as illustration.

## 6. Every status is a word plus an icon plus a colour

Never colour alone. Every status chip carries an icon and the status
word:

| Status | Word | Icon |
|---|---|---|
| Submitted | নতুন | dashed circle |
| Routed | রাউট | arrow out of a box |
| In progress | চলমান | clock |
| Resolved | সমাধান | circle with a tick |

The same applies to the map pins and the timeline steps: the trail's
future steps are dimmed but still carry their icon and their label, so
the state is readable without colour vision.

Use `components/ui/StatusPill.tsx`.

## 7. Photos are drawn, not dashed boxes

A dashed grey rectangle reads as "no content here". Every report
thumbnail in the mockups is a small SVG **scene** of the report's actual
subject — a broken traffic signal, an unlit streetlight, a pothole, a
flooded drain, a blocked drain — and each carries `role="img"` with a
Bangla `aria-label` describing it.

In the live app these are real uploads, so the equivalent is the real
image with a correct `alt`. What carries over is the rule: **a photo
slot must show the photo**. An empty slot is an add affordance, and it
looks different from a filled one — the mockup's filled tile has a solid
border and a remove button; the empty tile has a dashed border.

`components/ui/PhotoPlaceholder.tsx` exists for the empty case.

## 8. Type hierarchy, and the 1.25× rule

Adjacent type sizes need a ratio of at least **1.25×**, or the heading
and the paragraph read as the same level. The mockup's card title was
20px over 16px body — 1.18×, and it failed. It is now 24px
(`--text-display-md`), a 1.5× step that also matches the H1 on the other
citizen surfaces.

The approved scale:

| Role | Token | Size |
|---|---|---|
| Page title | `--text-display-md` | 24px |
| Section title | `--text-h2` | 20px |
| Card title (the step's own H1) | `--text-display-md` | 24px |
| Body | `--text-body` | 16px |
| Secondary body | `--text-body-sm` | 15px |
| Caption | `--text-caption` | 14px |
| Micro | `--text-micro` | 12px |

A step card's title is 24px because that card **is** the page's single
focus for that step. A subordinate card — the "your chosen location"
reminder under the photo step — is `--text-h2`, because it is a
secondary heading, not the page's subject.

Measure: keep body copy at 65–75 characters per line.

## 9. Bangla copy, and the em-dash

The surfaces are Bangla-first. English is secondary.

**Do not use em-dashes in citizen-facing copy.** An earlier revision had
eight of them in one page's body text and five in another, which turned
the sentences into typographic scaffolding. They have all been replaced
with Bengali commas (`,`) or a full stop. Write the same way.

**One carve-out, and it is structural rather than decorative.** The
progress sentence under the step rail (§10) separates the position from
the step name with an em-dash: `ধাপ ২ / ৫ — ছবি যোগ করুন`. That em-dash
is a *separator between two labelled fields*, not a parenthetical aside
inside a sentence, and it is the mockup's own string. Keep it. The ban
applies to prose, not to a delimiter that carries meaning.

Also: no kicker words, no "Lorem", no invented counts. Every number on
these surfaces comes from real data — `PRODUCT.md` says so directly:
*"Do not fabricate operational metrics or notification counts; dashboard
figures must come from existing data."*

## 10. The report flow shell

The five steps are locked: **১ অবস্থান → ২ ছবি → ৩ ক্যাটাগরি → ৪ নোট → ৫ সারসংক্ষেপ**.

The step rail states progress three ways, because colour alone is not a
cue:

- The rail itself — completed steps are filled with a tick, the current
  step is an outlined circle with its number, future steps are sunken.
- A connector line whose fill marks progress.
- A **sentence** under the rail: `ধাপ ২ / ৫ — ছবি যোগ করুন`. Digits
  and words, never colour alone.

The photo cap indicator reads `1 / 3 ছবি` — the count, the cap and the
unit in one line. It is never a bare progress bar: a bar alone would
hide the number the citizen needs. It also carries
`role="status"` and an `aria-label` stating both the current count and
the cap.

The flow is a **focused, single-task shell**. Its top bar carries the
brand, the task tag and the two global controls — not the full site
navigation. The full nav belongs to the app header on the hub and the
list, not to a mid-flow step.

The action bar is **fixed to the bottom** with two buttons: back, and
"next: \<step name\>". The page's bottom padding must reserve the bar's
**real footprint**, not just its content height:

```css
padding-bottom: calc(
  var(--sticky-cta-height)   /* 64px — the bar's content height   */
  + var(--space-3) * 2       /* the bar's own padding, both sides  */
  + 1px                      /* the bar's top border               */
  + var(--space-8)           /* clearance                          */
);
```

Reserving only `--sticky-cta-height` left ~26px of the last card hidden
behind the bar. This bit once; do not reintroduce it.

## 11. Focus, selection, scrollbars — the browser surfaces

These are part of the design, not browser defaults. The shared
`citizen-surfaces.css` themes all three:

```css
::selection { background: var(--color-primary); color: var(--color-on-primary); }
html { scrollbar-color: var(--color-border-strong) var(--color-surface-page); }
:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
```

Every interactive element needs a visible focus ring. The mockup CSS
applies it via `:where(a, button, [role="button"], input, select,
textarea):focus-visible` so it applies to every primitive without
re-declaring it. Do the same in the React layer — a focus ring that
exists only on some controls is worse than none, because the user
learns it is unreliable.

## 12. The map (hub only)

The live hub uses MapLibre. The mockup draws an approximation, and that
approximation has rules worth keeping:

- Roads are drawn as a **network** of curved paths at differing widths
  (arterial 26px, avenue 18px, side street 9px, lane 6px).
- City blocks are **many small footprints**, not one slab, so the map
  has a grain you can read.
- The park is a low-opacity wash with **tree canopies carrying the
  shape**, not a green rectangle.
- The lake has a **shoreline path**, not a flat band.
- Street labels carry a halo (`paint-order="stroke"`) so they stay
  legible over the fill.
- **Every street label sits ON the road it names.** A label a dozen
  pixels off its road reads as floating text over a building block,
  not as a street. The vertical streets rotate by a **negative** angle
  (`rotate(-84 …)`) so the text reads bottom-to-top, the way a real map
  sets a north-south street name; a positive angle runs it downward,
  which is not how a map is read. The mockup got this wrong twice —
  `কাজী নজরুল ইসলাম সড়ক` sat 14px right of its avenue, and
  `বেগম রোকেয়া সরণি` ran down the park instead of down its road.
- The pin is **one authored teardrop path** — a circular head tapering
  to a point — matching `components/CityActivityMap.tsx`. A circle
  alone reads as a status dot, not as a place to go.

**Do not use `preserveAspectRatio="slice"` on a viewBox whose aspect
ratio differs from its container.** `slice` scales to cover and crops
the overflow. The map's viewBox is 600×460 and its card changes height
across breakpoints; `slice` cropped the map's top and bottom away
entirely at 1024px, leaving an empty field with two pins on it. The
card now carries `aspect-ratio: 600 / 460` and the SVG uses
`xMidYMid meet`, so the whole city is in frame at every width.

## 13. Touch targets and spacing

- Minimum touch target: `var(--touch-min)` (44px). Every button and
  icon button uses it. A 32px icon button is not a touch target.
- The icon sizes are `--icon-size-sm` / `--icon-size-md` / `--icon-size-xl`.
- Spacing is on the `--space-*` scale. No ad-hoc pixel values.
- Card radius is `--radius-card` (12px); large panels `--radius-lg`
  (16px). The craft floor allows 12–16px and no more.
- Declare elevation **once**. Do not stack shadows.

## 14. The status trail

`/reports/[id]` carries a **vertical** `Timeline` with a per-step icon
and a timestamp on every step. Use `components/ui/Timeline.tsx`.

**The step's `aside` note lives INSIDE the body column, not beside
it.** The mockup's `.trail-note` is a block inside `.trail-body`
(`flex: 1; min-width: 0`), so the note sits under the timestamp at the
body's full width.

The React port got this wrong by rendering the note as a flex
**sibling** of the body with `flex: '1 0 100%'` to push it onto its
own line. But the step row is `flex-wrap: nowrap`, so a 100% basis
starved the body: it collapsed to **width 0** and the timestamp
wrapped **one word per line** ("৩০ অক্টো, ২০২৬, ০৯:১৫ AM · সিটি
কর্পোরেশন" stacked down a narrow strip). The trail measured **968px
tall for four steps**; with the note inside the body it is **365px**.

A full-width flex basis is not a way to force a line break in a
non-wrapping flex row. It is a way to starve the sibling. If a
sibling's width needs to be full, the sibling needs to be a **block
child of the body column**, not a row peer of it.

The detail page also keeps, from earlier intents:

- the **labelled before/after photo groups** (Intent 007) — each group
  carries a heading, and the before/after pair shows the *scene
  changed*, not just a badge saying it did;
- the **`tkt_*` pill** (Intent 008) — the public short code.

**No raw internal id is visible on any citizen surface.** Not the
database id, not the row id, not a UUID. The pill is the public code.

Note that the raw id still appears in the page's *RSC flight payload*
(the URL segment). That is the address of the page, not a leaked
field — it is not in the rendered text, and the citizen cannot see it
without opening devtools. The rule is about what the surface shows,
not about what the transport carries.

## 15. Icons

Inline SVG, stroke-based, `stroke-linecap="round"`,
`stroke-linejoin="round"`, `currentColor`, `aria-hidden="true"` when the
icon is decorative and accompanied by text. No emoji as icons, no
unicode glyphs, no icon font. An icon that carries meaning on its own
needs an `aria-label` on its control.

## 16. Before you call it done

- `npx tsc --noEmit` — clean.
- `npm run test:unit` — green (required after editing anything under `lib/`).
- `npm run test:mockups` — green (required after editing any mockup
  HTML or `tokens.css`).
- `npm run test:mockups` covers the four citizen mockups at 1440×900
  and 1024×768 against committed baselines at tolerance `0.005`.

**Baselines are regenerated on the CI platform, never by hand on
Windows.** If a baseline legitimately changes because the mockup
changed, regenerate it through the workflow. A hand-regenerated baseline
on Windows silently encodes a different rasterisation and will fail on
CI for reasons that look unrelated.

Then, before you submit:

- Every surface renders dark by default and follows the persisted
  appearance when the citizen changes it.
- Every interactive element has a visible focus ring.
- Every status is word + icon + colour.
- Every number comes from real data.
- No raw internal id is visible.
- No em-dash in citizen copy.
- No kicker above a heading.
- No equal-size card grid where the items are not peers.

## 17. Where the mockups live, and the shared CSS

`design-artifacts/D-Design-System/01-Visual-Design/mockups/citizen-surfaces.css`
holds the shared chrome: top bar, brand, nav, buttons, icon buttons,
avatar, page shell, status pills, report rows, filter chips, browser
surfaces, focus.

Each mockup used to carry its own copy-pasted ~100-line header block,
and those copies drifted — one hardcoded `44px` where another used
`var(--touch-min)`, one had a 48px button where another had 44px. The
drift is why the buttons ended up different sizes on different screens.
**One shared file, one definition, no copies.** If you add a surface,
add to `citizen-surfaces.css` rather than to a page.
