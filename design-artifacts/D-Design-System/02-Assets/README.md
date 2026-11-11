# CityFix Brand Assets

Original brand work for the CityFix civic-reporting platform.

**Everything in this folder is self-contained SVG** — no external file
references, no web fonts, no scripts, no raster images. Every asset
renders correctly inside an `<img>` tag, in an email, and in a social
card preview.

---

## The assets

| File | Size | Used for |
|---|---|---|
| `logo/cityfix-mark.svg` | 24×24 | The app icon / avatar mark, the header mark, the report confirmation seal |
| `logo/cityfix-wordmark.svg` | 152×32 | The header lockup — mark + "CityFix" |
| `logo/favicon.svg` | 32×32 | The browser tab and the installed PWA icon |
| `og-image.svg` | 1200×630 | The social card for a shared report link |

Runtime copies live in `public/`:
`public/favicon.svg` and `public/og-image.svg`.

> `public/favicon.svg` must stay byte-identical to `logo/favicon.svg`.
> A test in `tests/unit/ui/` asserts this, because a drifted favicon is
> invisible until someone spots it in a browser tab.

---

## The idea

**A civic map pin whose carved square eye holds a check.**

- The **pin** is the civic issue: a problem pinned to a place.
- The **eye** is the issue, looked at — carved *out* of the pin as
  negative space.
- The **check** is the outcome: reported, and then resolved.

The eye is a **square** with a tight 2-unit corner radius, not a circle.
A round hole reads as a generic map pin; the square reads as civic and
Swiss, and it matches the radius language of the app's own cards and
tiles. It is also the shape that survives at 16px — a hard-edged square
with one punched-out tick stays legible in a favicon where a soft round
one turns to mush.

The check is drawn with a stroke, so the negative space stays open around
it: the eye reads as the pin's hole, not as a filled square.

---

## Colour provenance

Every colour in every asset comes from a design token, so a theme change
is traceable rather than guesswork. The source of truth is
`../01-Visual-Design/tokens.css`.

| Element | Hex | Token |
|---|---|---|
| Pin body (civic blue) | `#1E40AF` | `--color-primary` |
| Carved eye (mark) | `#FFFFFF` | `--color-surface-card` |
| Service green (check) | `#16A34A` | `--color-success` family |
| Social card field | `#1E40AF` | `--color-primary` |
| Wordmark ink | `#0F172A` | `--color-ink` family |

Two deliberate deviations, both for legibility on a blue field:

- The social card uses the **dark-theme** blue `#60A5FA` for the pin and
  `#4ADE80` for its check, because the light-theme `#1E40AF` pin would
  disappear against the `#1E40AF` card background. The eye is filled with
  the card's own blue so it still reads as carved.
- The favicon is the mark on the civic-blue tile with the pin inverted
  to white, so it reads as a hole punched in the tile — the same
  inversion, one step further.
- The favicon and the social card are **flat**, with no gradient and no
  shadow, to match the Swiss/Minimal direction and to stay legible in a
  social feed at thumbnail size.

### The runtime mark follows the theme

`components/CityFixMark.tsx` renders the same geometry with CSS custom
properties — `--color-primary` for the pin, `--color-surface-card` for
the carved eye, `--color-success` for the check — so the in-app mark
inverts with the dark theme without a second code path. The hand-authored
SVGs in this folder are the light-theme (and social-card) variants.

---

## The swap slot — a real DNCC seal

**No Dhaka North City Corporation seal is drawn here.** A government
body's official seal is not something to approximate: drawing a
plausible-looking seal would misrepresent the organisation and imply an
endorsement that does not exist. Third-party marks here are **authentic
or absent — never fabricated**.

A neutral `Buildings` glyph placeholder ships in its place.

**Where the real seal goes when it is supplied:**

| Slot | File | Marker |
|---|---|---|
| Header / app icon | `logo/cityfix-mark.svg` | the `<path fill="#1E40AF">` pin body — replace with the seal's paths, keeping the same 24×24 viewBox |
| Social card | `og-image.svg` | the `<g transform="translate(120, 215) scale(4)">` group — replace the group's children with the seal's paths |
| Favicon / PWA icon | `logo/favicon.svg` | the `<rect>` + the `<g transform="translate(4, 4)">` mark group — replace the group's children with the seal's paths, keeping the same 32×32 viewBox |
| Runtime mark | `components/CityFixMark.tsx` | the `<svg>`'s three children — replace with the seal's paths, keeping the same 24×24 viewBox |

The seal must be supplied as a vector with a transparent background, and
must not be recoloured — it carries its own official colours. Keep the
same viewBox so nothing else in the layout has to move.

---

## Regenerating

The assets are hand-authored SVG with no build step — edit them
directly. After any change, check that:

1. Every file starts with `<svg` and ends with `</svg>`.
2. No file contains `<script`, `href="http`, or `<image`.
3. `public/favicon.svg` still matches `logo/favicon.svg` byte for byte.

```powershell
node -e "const fs=require('fs');const files=['design-artifacts/D-Design-System/02-Assets/logo/cityfix-mark.svg','design-artifacts/D-Design-System/02-Assets/logo/cityfix-wordmark.svg','design-artifacts/D-Design-System/02-Assets/logo/favicon.svg','design-artifacts/D-Design-System/02-Assets/og-image.svg','public/favicon.svg','public/og-image.svg'];for(const f of files){const s=fs.readFileSync(f,'utf8');const ok=s.trim().startsWith('<svg')&&s.trim().endsWith('</svg>');console.log(ok?'OK  ':'BAD ',f,s.length+'b');}"
```

---

## Licences

See `NOTICE.md` for the third-party notices and the obligations this
project carries for them. The assets in this folder are original work
with no third-party rights attached.
