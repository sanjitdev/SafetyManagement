/**
 * Seed photos for the dev store's tickets.
 *
 * The crew dashboard's job rows show a photo thumbnail (the design
 * reference `ui-design/Crew Portal Dashboard.png` puts a picture of
 * the site next to every assignment) and the focused-job panel shows
 * the citizen's evidence photo. Without seeded photos the rows fall
 * back to the category glyph and the panel shows no evidence at all.
 *
 * WHY INLINE SVG DATA URLs
 * ------------------------
 * A seeded photo has to survive three things a remote URL would
 * not:
 *
 *   1. The dev store runs with no object storage. A blob URL would
 *      404 and the thumbnail would render as a broken image.
 *   2. The Playwright visual baselines must be deterministic. A
 *      network image changes with the CDN's cache state, so every
 *      baseline run would flake.
 *   3. The CSP allows `data:` for `img-src`, so an inline image is
 *      renderable with no extra policy change.
 *
 * The images are flat colour fields with a category glyph drawn on
 * top — enough to read as "a photo of the site" at thumbnail size,
 * and stable byte-for-byte across runs.
 */

/**
 * The category glyph drawn on the seeded photo, per category slug.
 *
 * Each glyph is authored on a 24×24 grid (the Material-style
 * coordinate system the rest of the app's `CategoryIcon` uses), so
 * the same path data can be reused verbatim here.
 */
const GLYPHS: Record<string, string> = {
  // A lamp post with a head that casts a cone of light.
  streetlight:
    '<path d="M11 21v-8M11 13H7.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<path d="M9 5h5l1.4 4.4H7.6z" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" fill="none"/>' +
    '<path d="M8.4 12.4 6 19M14.6 12.4 17 19" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.7" fill="none"/>',
  // A broken, uneven patch of road.
  pothole:
    '<path d="M4.6 13.2c1.4-2.6 4-4 7.4-4s6 1.4 7.4 4c1.3 2.4-.6 4.6-7.4 4.6s-8.7-2.2-7.4-4.6z" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" fill="none"/>' +
    '<path d="M9.4 12.6l1.4 1.2 2-2.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>',
  // An open drain grate with bars across it.
  drainage:
    '<rect x="3.6" y="6.4" width="16.8" height="11.2" rx="2.4" stroke="#fff" stroke-width="2.2" fill="none"/>' +
    '<path d="M7.6 6.4v11.2M12 6.4v11.2M16.4 6.4v11.2" stroke="#fff" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  // An overflowing bin.
  garbage:
    '<path d="M5.8 9h12.4l-1.3 11.4H7.1z" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" fill="none"/>' +
    '<path d="M9 9V6.6h6V9" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
    '<path d="M4.6 12.4h14.8" stroke="#fff" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
  other:
    '<circle cx="12" cy="12" r="7.4" stroke="#fff" stroke-width="2.2" fill="none"/>' +
    '<path d="M12 8.6v.2M12 11.4v4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
};

/**
 * The scene palette per category slug, so the rows read apart.
 *
 * Each entry is `[sky, ground]`. The sky is deliberately light — a
 * thumbnail that renders as a near-black rectangle reads as a broken
 * image rather than as a photo of a site.
 */
const BACKGROUNDS: Record<string, [string, string]> = {
  streetlight: ['#7fa7d4', '#3d5570'],
  pothole: ['#c9a87c', '#6b563a'],
  drainage: ['#7fbdb2', '#2f5b53'],
  garbage: ['#b39ab8', '#54415c'],
  other: ['#94a3b8', '#3f4a5c'],
};

/**
 * A deterministic inline SVG data URL standing in for a citizen's
 * photo of the issue site.
 *
 * `seed` varies the geometry so two tickets in the same category do
 * not render the identical image.
 */
export function seedPhotoUrl(categorySlug: string, seed: number): string {
  const slug = categorySlug in GLYPHS ? categorySlug : 'other';
  const glyph = GLYPHS[slug];
  const [sky, ground] = BACKGROUNDS[slug];
  // A deterministic pseudo-random offset derived from the seed, so the
  // horizon line and the speckles differ per ticket but never change
  // between runs.
  const jitter = ((seed * 37) % 17) - 8;
  const horizon = 108 + jitter;
  // A deterministic sun / lamp position in the sky.
  const sunX = 48 + ((seed * 29) % 200);
  const sunY = 30 + ((seed * 19) % 40);
  const speckle = Array.from({ length: 6 }, (_, i) => {
    const cx = 16 + ((seed * 13 + i * 37) % 288);
    const cy = 12 + ((seed * 11 + i * 23) % 88);
    return `<circle cx="${cx}" cy="${cy}" r="${2 + ((seed + i) % 3)}" fill="#ffffff" fill-opacity="0.22"/>`;
  }).join('');
  // A row of distant buildings along the horizon, so two tickets in
  // the SAME category do not render the identical picture. Each
  // building's width and height is derived from the seed.
  const skyline = Array.from({ length: 7 }, (_, i) => {
    const bw = 26 + ((seed * 17 + i * 23) % 22);
    const bh = 20 + ((seed * 29 + i * 13) % 46);
    const bx = i * 48 - ((seed * 11) % 16);
    return `<rect x="${bx}" y="${horizon - bh}" width="${bw}" height="${bh}" fill="#0b1b2b" fill-opacity="0.3"/>`;
  }).join('');
  // The ground plane gets a hint of texture so it is not a flat wash.
  const groundMarks = Array.from({ length: 5 }, (_, i) => {
    const mx = 12 + ((seed * 31 + i * 41) % 280);
    const my = horizon + 16 + ((seed * 19 + i * 29) % 84);
    return `<rect x="${mx}" y="${my}" width="${18 + ((seed + i) % 26)}" height="4" rx="2" fill="#ffffff" fill-opacity="0.1"/>`;
  }).join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="${ground}"/>` +
    `</linearGradient></defs>` +
    // The sky-to-ground wash.
    `<rect width="320" height="240" fill="url(#g)"/>` +
    // A low sun so the sky is not a flat field.
    `<circle cx="${sunX}" cy="${sunY}" r="13" fill="#ffffff" fill-opacity="0.4"/>` +
    speckle +
    // The distant skyline, drawn behind the ground plane.
    skyline +
    // The ground plane, darker than the sky.
    `<rect y="${horizon}" width="320" height="${240 - horizon}" fill="#000" fill-opacity="0.22"/>` +
    groundMarks +
    // The category glyph, scaled up from its 24-unit authoring grid
    // and centred in the frame so it reads at thumbnail size.
    `<g transform="translate(160 ${horizon - 4}) scale(4.4) translate(-12 -12)" opacity="0.92">${glyph}</g>` +
    `</svg>`;
  // `encodeURIComponent` keeps the data URL safe inside a CSS
  // `url("…")` and inside a JSON payload.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
