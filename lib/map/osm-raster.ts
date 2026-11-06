/**
 * The shared OpenStreetMap raster basemap setup.
 *
 * Three components build the same style by hand —
 * `components/MapView.tsx`, `components/DispatcherMap.tsx` and
 * `components/CityActivityMap.tsx` — and each one had its own
 * copy of the tile URL, the attribution and the font stack.
 * That duplication is exactly how the pin-number bug happened:
 * the symbol layers asked for a `text-font` that no glyph
 * server had, and because the style declared no `glyphs` URL,
 * MapLibre silently rendered the text as nothing.
 *
 * WHY GLYPHS MATTER
 * -----------------
 * MapLibre can only draw a `text-field` when the style declares
 * a `glyphs` endpoint that serves the glyph ranges for the
 * requested font stack. Without it, symbol layers with text
 * render as invisible — no error, no console warning from the
 * map, just missing text. So `GLYPHS_URL` and `SYMBOL_FONT` are
 * a matched pair: the URL must serve the font named in
 * `SYMBOL_FONT`.
 *
 * The demotiles glyph server carries `Noto Sans Regular` and
 * `Noto Sans Semibold` (verified 2026-11-06); it does NOT carry
 * `Open Sans Regular`, which is what the layers used to ask for.
 */

/** OpenStreetMap raster basemap. No API key, no token, no auth. */
export const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * The glyph endpoint that backs every `text-field` in the app's
 * maps. The `{fontstack}` / `{range}` placeholders are filled in
 * by MapLibre with the layer's `text-font` stack and the unicode
 * range it needs.
 */
export const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

/**
 * The font stack used by every symbol layer that draws text.
 * Must be a font the `GLYPHS_URL` server actually serves.
 */
export const SYMBOL_FONT = ['Noto Sans Regular'] as const;
