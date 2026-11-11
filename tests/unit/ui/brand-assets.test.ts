import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The brand assets are hand-authored SVG with no build step, which makes
 * them easy to break by accident. This test pins the invariants that a
 * broken asset would violate:
 *
 *  - The SVG is well-formed enough to render (balanced tags, a real
 *    viewBox, a closing `</svg>`).
 *  - It is SELF-CONTAINED. A `<use href="other.svg#id">` reference, a
 *    web font, a `<script>` or a raster `<image>` all break when the
 *    file is rendered as an `<img>` — which is exactly how the header
 *    and the favicon consume them.
 *  - The colours are the design tokens, not arbitrary hexes.
 *  - `public/favicon.svg` matches `logo/favicon.svg` byte for byte.
 */

const ROOT = process.cwd();
const ASSETS = join(ROOT, 'design-artifacts', 'D-Design-System', '02-Assets');

const MARK = join(ASSETS, 'logo', 'cityfix-mark.svg');
const WORDMARK = join(ASSETS, 'logo', 'cityfix-wordmark.svg');
const FAVICON = join(ASSETS, 'logo', 'favicon.svg');
const OG = join(ASSETS, 'og-image.svg');
const PUBLIC_FAVICON = join(ROOT, 'public', 'favicon.svg');
const PUBLIC_OG = join(ROOT, 'public', 'og-image.svg');

/** The palette the assets are allowed to use. */
const ALLOWED_COLOURS = new Set([
  '#0F172A', // wordmark ink
  '#1E40AF', // civic blue — the pin body, the card field, the favicon tile
  '#16A34A', // service green — the check
  '#60A5FA', // dark-theme blue (social card pin)
  '#4ADE80', // dark-theme green (social card + favicon check)
  '#FFFFFF', // white — the carved eye, the favicon pin
  '#DBEAFE', // social card taglines
  '#BFDBFE',
  '#93C5FD',
  '#3B82F6', // social card hairline rule
]);

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

/** Every hex colour in an SVG source. */
function hexColours(source: string): string[] {
  return [...source.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) =>
    m[0].toUpperCase(),
  );
}

describe('the brand assets exist', () => {
  for (const [name, path] of [
    ['cityfix-mark.svg', MARK],
    ['cityfix-wordmark.svg', WORDMARK],
    ['favicon.svg', FAVICON],
    ['og-image.svg', OG],
    ['public/favicon.svg', PUBLIC_FAVICON],
    ['public/og-image.svg', PUBLIC_OG],
  ] as const) {
    it(`${name} is present`, () => {
      expect(existsSync(path), `${name} must exist at ${path}`).toBe(true);
    });
  }
});

describe('every brand asset is a well-formed, self-contained SVG', () => {
  for (const [name, path] of [
    ['cityfix-mark.svg', MARK],
    ['cityfix-wordmark.svg', WORDMARK],
    ['favicon.svg', FAVICON],
    ['og-image.svg', OG],
    ['public/favicon.svg', PUBLIC_FAVICON],
    ['public/og-image.svg', PUBLIC_OG],
  ] as const) {
    describe(name, () => {
      it('is an svg document', () => {
        const source = read(path).trim();
        expect(source.startsWith('<svg')).toBe(true);
        expect(source.endsWith('</svg>')).toBe(true);
      });

      it('declares a viewBox', () => {
        expect(read(path)).toMatch(/viewBox="/);
      });

      it('has no external file reference', () => {
        // `<use href="other.svg#id">` does not render inside an <img>.
        const source = read(path);
        const externalUse = source.match(/href="[^"]*\.svg#/);
        expect(externalUse, 'the mark must be inlined, not referenced').toBeNull();
      });

      it('has no script', () => {
        expect(read(path)).not.toMatch(/<script/i);
      });

      it('has no raster image', () => {
        expect(read(path)).not.toMatch(/<image/i);
      });

      it('has no web font import', () => {
        expect(read(path)).not.toMatch(/@import|fonts\.googleapis|@font-face/i);
      });

      it('carries an accessible title', () => {
        const source = read(path);
        expect(source).toMatch(/<title/);
        expect(source).toMatch(/role="img"/);
      });
    });
  }
});

describe('the brand assets use only the design-token palette', () => {
  for (const [name, path] of [
    ['cityfix-mark.svg', MARK],
    ['cityfix-wordmark.svg', WORDMARK],
    ['favicon.svg', FAVICON],
    ['og-image.svg', OG],
  ] as const) {
    it(`${name} uses no off-palette colour`, () => {
      const offPalette = hexColours(read(path)).filter(
        (colour) => !ALLOWED_COLOURS.has(colour),
      );
      expect(
        offPalette,
        `${name} uses colours outside the token palette: ${offPalette.join(', ')}`,
      ).toEqual([]);
    });
  }
});

describe('the logo mark carries the brand idea', () => {
  it('draws the check in the service green', () => {
    // "reported → resolved" — the check is the half of the idea that
    // says the issue gets fixed.
    const source = read(MARK);
    expect(source).toMatch(/#16A34A/i);
    expect(source).toMatch(/<path[^>]*stroke="#16A34A"/i);
  });

  it('draws the pin in the civic blue', () => {
    // The pin IS the civic identity, so it wears --color-primary rather
    // than the ink colour the first draft used.
    expect(read(MARK)).toMatch(/fill="#1E40AF"/i);
  });

  it('carves the eye out as a square, not a circle', () => {
    // A round hole reads as a generic map pin; the square is what makes
    // the mark read as civic and Swiss, and it is the shape that stays
    // crisp at 16px.
    const source = read(MARK);
    expect(source).toMatch(/<rect[^>]*fill="#FFFFFF"/i);
    expect(source).not.toMatch(/<circle/i);
  });

  it('is small enough to ship in a favicon', () => {
    expect(read(MARK).length).toBeLessThan(2048);
    expect(read(FAVICON).length).toBeLessThan(1024);
  });
});

describe('the wordmark inlines the mark', () => {
  it('carries the pin path itself, not a reference', () => {
    const source = read(WORDMARK);
    expect(source).toMatch(/fill="#1E40AF"/);
    expect(source).toMatch(/stroke="#16A34A"/);
    expect(source).toMatch(/<rect[^>]*fill="#FFFFFF"/);
  });

  it('sets the word in a tight, bold weight', () => {
    const source = read(WORDMARK);
    expect(source).toMatch(/font-weight="700"/);
    expect(source).toMatch(/letter-spacing="-/);
  });
});

describe('the runtime copies match the source assets', () => {
  it('public/favicon.svg is identical to logo/favicon.svg', () => {
    // A drifted favicon is invisible until someone spots it in a tab.
    expect(read(PUBLIC_FAVICON)).toBe(read(FAVICON));
  });

  it('public/og-image.svg is identical to the 02-Assets copy', () => {
    expect(read(PUBLIC_OG)).toBe(read(OG));
  });
});

describe('the social card is a flat bilingual civic card', () => {
  it('uses the 1200x630 Open Graph canvas', () => {
    expect(read(OG)).toMatch(/viewBox="0 0 1200 630"/);
  });

  it('carries both a Bangla and an English tagline', () => {
    const source = read(OG);
    // Bangla-first: the Bangla line is the headline.
    expect(source).toMatch(/আপনার শহরের সমস্যা জানান/);
    expect(source).toMatch(/Report a city issue/);
  });
});
