# Third-Party Notices

CityFix ships with the following third-party work. Each entry states the
licence and — more usefully — what **this project** must do to stay
within it.

---

## Noto Sans Bengali — SIL Open Font License 1.1

**Where it is used:** the entire UI. `tokens.css` sets
`--font-body` and `--font-display` to `"Noto Sans Bengali"`.

**What we must do:** the OFL allows embedding the font in a website or
application, including commercial use, and permits embedding it in
documents. We may not **sell the font on its own**, and we may not
reserve the font name "Noto Sans Bengali" for a modified version. If the
font is ever modified, the modified version must not use the reserved
name.

The full licence text ships with the font package and is also published
at <https://scripts.sil.org/OFL>.

> Noto Sans Bengali is the **only** family in the stack that renders
> Bangla. Poppins and Open Sans do not carry Bangla glyphs, so any
> font suggestion that replaces it would silently break the entire
> Bangla-first interface.

---

## Phosphor Icons — MIT

**Where it is used:** every icon in the product, via the registry at
`lib/ui/icon-map.ts` (`@phosphor-icons/react`, v2.1.10).

**What we must do:** keep the copyright notice and the permission notice
in any copy of the software or of a substantial portion of it. The
licence permits commercial use, modification, distribution and private
use, with no warranty.

---

## Recharts — MIT

**Where it is used:** the ops dashboards — `/dispatcher/performance` and
`/admin/cities/[id]/adoption` — via `components/ui/charts/`.

**What we must do:** the same as above: retain the copyright and licence
notices. Charts are `dynamic()`-imported so the bundle cost lands only on
the pages that draw them.

---

## MapLibre GL JS — BSD 3-Clause

**Where it is used:** the city activity map, the dispatcher map, and the
report location picker.

**What we must do:** retain the copyright notice, the list of conditions
and the disclaimer in redistributions. BSD 3-Clause is permissive — no
endorsement may be implied.

---

## OpenStreetMap data — Open Database License (ODbL)

**Where it is used:** the base map layer on every map surface.

**What we must do — this is a licence requirement, not a nicety:**

1. **Attribution must be visible on every map.** The attribution must
   read **"© OpenStreetMap contributors"** and must be present wherever
   the map is displayed — including the citizen map, the dispatcher map,
   and the location picker. It cannot be hidden behind a settings
   toggle, and it cannot live only on the About page.
2. **MapLibre's logo must also be shown**, per MapLibre's own terms.
3. The ODbL permits derived databases, but share-alike obligations
   attach to a **substantial extraction** of OSM data. The application
   stores no OSM-derived data — the map is a rendered tile layer — so
   share-alike does not currently attach. If the project ever begins
   storing OSM-derived datasets, this notice must be revisited.

---

## Map tile provider — must be named

**Where it is used:** the raster tile source the MapLibre style loads.

**What we must do:** the attribution block on every map must name the
**actual** tile provider, not only OpenStreetMap. A provider that
proxies OSM tiles (for example a self-hosted or commercial tile server)
carries its own attribution requirement, and the OSM tile usage policy
prohibits bulk downloading and requires a valid `User-Agent` with
contact details.

The tile source is configured in the map components; see
`app/home/page.tsx`, `app/dispatcher/map/page.tsx` and the report
location step for the URL and the attribution markup.

---

## Third-party marks are authentic or absent — never fabricated

The CityFix logo mark, the wordmark, the favicon and the social card in
this folder are **original work**.

A **Dhaka North City Corporation seal is NOT drawn.** Drawing an
approximation of a government body official seal would be a
misrepresentation, and the civic platform should not imply an endorsement
that does not exist. A neutral `Buildings` glyph placeholder ships in its
place, with the swap slot documented in `README.md`.

---

## Summary table

| Component | Licence | Obligation |
|---|---|---|
| Noto Sans Bengali | OFL 1.1 | No name reservation; no standalone sale |
| Phosphor Icons | MIT | Retain notice |
| Recharts | MIT | Retain notice |
| MapLibre GL JS | BSD 3-Clause | Retain notice; no implied endorsement |
| OpenStreetMap data | ODbL | **Attribution on every map** |
| Map tile provider | Provider-specific | **Name the provider in the attribution** |
