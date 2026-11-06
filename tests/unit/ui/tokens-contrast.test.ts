/**
 * The design token file must be MEASURABLE, not merely documented.
 *
 * This test reads the real `tokens.css` and checks every colour pair
 * that actually ships against WCAG 2.1 AA. A palette regression fails
 * here rather than in a screenshot nobody was looking at.
 *
 * WHY THIS EXISTS
 * ---------------
 * The pre-redesign palette had invisible accessibility failures:
 *
 *   - `--color-success: #16A34A` sat at 3.30:1 on white — below the
 *     4.5:1 AA floor for body text. It was used for success text in
 *     the admin adoption dashboard and the crew "resolved" button.
 *
 *   - `--color-accent` was referenced by FOUR components
 *     (`components/ui/FilterChipGroup.tsx`, `components/ui/StepIndicator.tsx`,
 *     `app/report/(create)/photo/page.tsx`, `app/report/(create)/summary/page.tsx`)
 *     but was NEVER DEFINED in `tokens.css`. The `var()` resolved to
 *     nothing, so the active filter chip rendered with no background
 *     and no border — a real bug, invisible to a colour-blind review
 *     and invisible to any test that did not parse the CSS.
 *
 * Both classes of bug are now impossible to ship: a missing token and
 * a failing contrast pair both fail this file.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contrastRatio,
  meetsAaText,
  meetsAaLargeText,
  resolveToken,
  parseHexColor,
  relativeLuminance,
} from '@/lib/ui/contrast';

const ROOT = process.cwd();
const TOKENS_CSS = join(
  ROOT,
  'design-artifacts',
  'D-Design-System',
  '01-Visual-Design',
  'tokens.css',
);

const css = readFileSync(TOKENS_CSS, 'utf8');

/** The `:root` block — the light theme. */
function rootBlock(source: string): string {
  const start = source.indexOf(':root');
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

/** A `.theme-dark` or `.theme-outdoor` block. */
function themeBlock(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start === -1) return '';
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

const light = rootBlock(css);
const dark = themeBlock(css, '.theme-dark');
const outdoor = themeBlock(css, '.theme-outdoor');

/** Resolve a token in a specific block, falling back to the full file. */
function token(block: string, name: string): string {
  const resolved = resolveToken(block, name);
  expect(resolved, `${name} must resolve to a hex colour`).not.toBeNull();
  return resolved as string;
}

/**
 * Read a token's RAW declared value.
 *
 * `resolveToken` only handles colours. Non-colour tokens — shadows
 * (`none`, `0 2px 4px rgba(...)`), icon sizes (`16px`), radii
 * (`12px`) — need the declared value as written.
 */
function rawToken(block: string, name: string): string {
  const match = new RegExp(`(?:^|[;{\\s])${name}\\s*:\\s*([^;]+)`, 'm').exec(block);
  expect(match, `${name} must be declared`).not.toBeNull();
  return (match as RegExpExecArray)[1].trim();
}

describe('token contrast utilities', () => {
  it('parses the hex forms a token file can contain', () => {
    expect(parseHexColor('#1E40AF')).toEqual([30, 64, 175]);
    expect(parseHexColor('1E40AF')).toEqual([30, 64, 175]);
    expect(parseHexColor('#abc')).toEqual([170, 187, 204]);
    expect(parseHexColor('#1E40AFAA')).toEqual([30, 64, 175]);
    expect(parseHexColor('not-a-colour')).toBeNull();
    expect(parseHexColor('#12345')).toBeNull();
  });

  it('computes the known reference luminances', () => {
    // White is 1.0 and black is 0.0 by definition.
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 6);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 6);
    // The WCAG reference pair: white on black is exactly 21:1.
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5);
    // A colour against itself is always 1:1.
    expect(contrastRatio('#1E40AF', '#1E40AF')).toBeCloseTo(1, 6);
  });

  it('is symmetric — foreground and background order does not matter', () => {
    expect(contrastRatio('#1E40AF', '#FFFFFF')).toBeCloseTo(
      contrastRatio('#FFFFFF', '#1E40AF'),
      10,
    );
  });

  it('treats a malformed colour as a failure, not a silent NaN', () => {
    expect(Number.isNaN(contrastRatio('nope', '#FFFFFF'))).toBe(true);
    expect(meetsAaText('nope', '#FFFFFF')).toBe(false);
  });

  it('resolves a token that references another token', () => {
    // --color-border-focus: var(--color-primary);
    expect(resolveToken(light, '--color-border-focus')).toBe('#1E40AF');
  });
});

describe('the light theme palette meets WCAG AA', () => {
  /**
   * Text on a surface. Each entry is [foreground token, background token].
   * These are the pairs a reader actually sees.
   */
  const TEXT_PAIRS: Array<[string, string]> = [
    ['--color-ink', '--color-surface-page'],
    ['--color-ink', '--color-surface-card'],
    ['--color-ink', '--color-surface-raised'],
    ['--color-ink', '--color-surface-sunken'],
    ['--color-ink-secondary', '--color-surface-page'],
    ['--color-ink-secondary', '--color-surface-card'],
    ['--color-ink-secondary', '--color-surface-raised'],
    ['--color-ink-secondary', '--color-surface-sunken'],
    ['--color-ink-tertiary', '--color-surface-page'],
    ['--color-ink-tertiary', '--color-surface-card'],
    ['--color-ink-tertiary', '--color-surface-raised'],
    ['--color-ink-tertiary', '--color-surface-sunken'],
    ['--color-primary', '--color-surface-card'],
    ['--color-primary', '--color-surface-page'],
    // Brand text on its own soft fill — the active nav pill, the
    // selected chip, the brand callout. The dark theme's soft fills
    // were #1E3A8A / #0C4A6E, which carried the brand foreground at
    // 4.07:1 and 4.42:1 — under the AA floor.
    ['--color-primary', '--color-primary-soft'],
    ['--color-accent', '--color-accent-soft'],
    ['--color-accent', '--color-surface-card'],
    ['--color-accent', '--color-surface-page'],
    ['--color-accent', '--color-surface-raised'],
    ['--color-success', '--color-surface-card'],
    ['--color-success', '--color-success-soft'],
    ['--color-success', '--color-surface-raised'],
    ['--color-warning', '--color-surface-card'],
    ['--color-warning', '--color-warning-soft'],
    ['--color-warning', '--color-surface-raised'],
    ['--color-danger', '--color-surface-card'],
    ['--color-danger', '--color-danger-soft'],
    ['--color-danger', '--color-surface-sunken'],
    ['--color-on-primary', '--color-primary'],
    ['--color-on-accent', '--color-accent'],
    ['--color-on-success', '--color-success'],
    ['--color-on-warning', '--color-warning'],
    ['--color-on-danger', '--color-danger'],
    ['--color-on-info', '--color-info'],
    // Status pills — the saturated foreground on its own soft fill.
    ['--color-status-submitted', '--color-status-submitted-soft'],
    ['--color-status-routed', '--color-status-routed-soft'],
    ['--color-status-in-progress', '--color-status-in-progress-soft'],
    ['--color-status-resolved', '--color-status-resolved-soft'],
    ['--color-status-error', '--color-status-error-soft'],
    ['--color-status-warning', '--color-status-warning-soft'],
    ['--color-status-paused', '--color-status-in-progress-soft'],
    // Category accents on the surfaces they appear on.
    ['--color-cat-streetlight', '--color-surface-card'],
    ['--color-cat-streetlight', '--color-surface-raised'],
    ['--color-cat-pothole', '--color-surface-card'],
    ['--color-cat-garbage', '--color-surface-card'],
    ['--color-cat-drain', '--color-surface-card'],
    ['--color-cat-sanitation', '--color-surface-card'],
    ['--color-cat-other', '--color-surface-card'],
  ];

  for (const [foreground, background] of TEXT_PAIRS) {
    it(`${foreground} on ${background} is at least 4.5:1`, () => {
      const fg = token(light, foreground);
      const bg = token(light, background);
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `${foreground} (${fg}) on ${background} (${bg}) is ${ratio.toFixed(2)}:1 — AA body text needs 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('the light theme interactive boundaries meet WCAG AA', () => {
  /**
   * Non-text UI boundaries need 3:1 — an input's border must be
   * distinguishable from its background, and a focus ring must be
   * visible against the surface it is drawn on.
   */
  it('the input border is visible against the card and the raised fill', () => {
    const border = token(light, '--color-border-input');
    expect(
      contrastRatio(border, token(light, '--color-surface-card')),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(border, token(light, '--color-surface-raised')),
    ).toBeGreaterThanOrEqual(3);
  });

  it('the focus ring is visible on every surface it is drawn on', () => {
    const focus = token(light, '--color-border-focus');
    for (const surface of [
      '--color-surface-page',
      '--color-surface-card',
      '--color-surface-raised',
      '--color-surface-sunken',
    ]) {
      expect(
        contrastRatio(focus, token(light, surface)),
        `focus ring on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the dark theme palette meets WCAG AA', () => {
  const TEXT_PAIRS: Array<[string, string]> = [
    ['--color-ink', '--color-surface-card'],
    ['--color-ink', '--color-surface-page'],
    ['--color-ink', '--color-surface-raised'],
    ['--color-ink-secondary', '--color-surface-card'],
    ['--color-ink-secondary', '--color-surface-page'],
    ['--color-ink-secondary', '--color-surface-raised'],
    ['--color-ink-tertiary', '--color-surface-card'],
    ['--color-ink-tertiary', '--color-surface-page'],
    ['--color-ink-tertiary', '--color-surface-raised'],
    ['--color-primary', '--color-surface-card'],
    ['--color-primary', '--color-surface-page'],
    ['--color-primary', '--color-primary-soft'],
    ['--color-accent', '--color-surface-card'],
    ['--color-accent', '--color-surface-page'],
    ['--color-accent', '--color-accent-soft'],
    ['--color-on-primary', '--color-primary'],
    ['--color-on-accent', '--color-accent'],
    ['--color-on-success', '--color-success'],
    ['--color-on-warning', '--color-warning'],
    ['--color-on-danger', '--color-danger'],
    ['--color-on-info', '--color-info'],
    ['--color-success', '--color-surface-card'],
    ['--color-warning', '--color-surface-card'],
    ['--color-danger', '--color-surface-card'],
    ['--color-status-submitted', '--color-status-submitted-soft'],
    ['--color-status-routed', '--color-status-routed-soft'],
    ['--color-status-in-progress', '--color-status-in-progress-soft'],
    ['--color-status-resolved', '--color-status-resolved-soft'],
    ['--color-status-error', '--color-status-error-soft'],
    ['--color-status-warning', '--color-status-warning-soft'],
  ];

  for (const [foreground, background] of TEXT_PAIRS) {
    it(`${foreground} on ${background} is at least 4.5:1`, () => {
      const fg = token(dark, foreground);
      const bg = token(dark, background);
      const ratio = contrastRatio(fg, bg);
      expect(
        ratio,
        `${foreground} (${fg}) on ${background} (${bg}) is ${ratio.toFixed(2)}:1 — AA body text needs 4.5:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('the focus ring is visible on every dark surface it is drawn on', () => {
    const focus = token(dark, '--color-border-focus');
    for (const surface of [
      '--color-surface-page',
      '--color-surface-card',
      '--color-surface-raised',
    ]) {
      expect(
        contrastRatio(focus, token(dark, surface)),
        `dark focus ring on ${surface}`,
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('the outdoor theme stays at maximum contrast', () => {
  it('keeps black-on-white body text', () => {
    const fg = token(outdoor, '--color-ink');
    const bg = token(outdoor, '--color-surface-page');
    expect(fg).toBe('#000000');
    expect(bg).toBe('#FFFFFF');
    expect(contrastRatio(fg, bg)).toBe(21);
  });

  it('keeps every surface white — outdoor mode has no fills', () => {
    for (const surface of [
      '--color-surface-page',
      '--color-surface-card',
      '--color-surface-raised',
      '--color-surface-sunken',
    ]) {
      expect(token(outdoor, surface)).toBe('#FFFFFF');
    }
  });

  it('keeps the borders black', () => {
    expect(token(outdoor, '--color-border')).toBe('#000000');
    expect(token(outdoor, '--color-border-strong')).toBe('#000000');
    expect(token(outdoor, '--color-border-input')).toBe('#000000');
  });

  it('drops every decorative shadow', () => {
    for (const shadow of ['--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-modal']) {
      expect(rawToken(outdoor, shadow)).toBe('none');
    }
  });

  it('keeps the semantic status colours legible on white', () => {
    for (const status of ['--color-success', '--color-warning', '--color-danger']) {
      expect(
        meetsAaText(token(outdoor, status), '#FFFFFF'),
        `${status} on white in outdoor mode`,
      ).toBe(true);
    }
  });
});

describe('the token file ships everything the source references', () => {
  /**
   * The bug this catches: `--color-accent` was referenced by four
   * components and never defined. A `var()` with no fallback resolves
   * to nothing, so the declaration silently drops and the element
   * inherits — no error, no warning, just a wrong UI.
   */
  const TOKENS_THAT_MUST_EXIST = [
    '--color-accent',
    '--color-accent-hover',
    '--color-accent-soft',
    '--color-on-accent',
    '--color-border-input',
    '--shadow-focus',
    '--icon-size-sm',
    '--icon-size-md',
    '--icon-size-lg',
    '--text-display-xl',
    '--text-display-lg',
    '--text-display-md',
    '--text-display-sm',
    '--text-body-lg',
    '--text-body',
    '--text-body-sm',
    '--text-caption',
    '--text-micro',
    '--leading-normal',
    '--touch-min',
    '--touch-large',
    '--touch-cta',
  ];

  for (const name of TOKENS_THAT_MUST_EXIST) {
    it(`${name} is defined`, () => {
      expect(css, `${name} is referenced by the source but not defined`).toContain(
        `${name}:`,
      );
    });
  }

  it('defines the icon size scale', () => {
    // Icon sizes are lengths, not colours — read the declared value.
    expect(rawToken(light, '--icon-size-sm')).toBe('16px');
    expect(rawToken(light, '--icon-size-md')).toBe('20px');
    expect(rawToken(light, '--icon-size-lg')).toBe('24px');
  });

  it('keeps every surface and ink token the admin console depends on', () => {
    // `tests/unit/admin-theme-tokens.test.ts` asserts these are
    // defined; this test additionally proves they resolve to REAL
    // colours, so a token that resolves to nothing cannot pass.
    for (const name of [
      '--color-surface-page',
      '--color-surface-card',
      '--color-surface-raised',
      '--color-surface-sunken',
      '--color-ink',
      '--color-ink-secondary',
      '--color-ink-tertiary',
      '--color-ink-muted',
      '--color-border',
      '--color-border-strong',
      '--color-border-focus',
      '--color-primary',
      '--color-primary-hover',
      '--color-primary-pressed',
      '--color-primary-soft',
      '--color-on-primary',
      '--color-success',
      '--color-success-soft',
      '--color-on-success',
      '--color-warning',
      '--color-warning-soft',
      '--color-on-warning',
      '--color-danger',
      '--color-danger-soft',
      '--color-on-danger',
      '--color-info',
      '--color-info-soft',
      '--color-on-info',
      '--color-rail',
      '--color-rail-hover',
      '--color-rail-active',
      '--color-rail-ink',
      '--color-rail-ink-muted',
      '--color-rail-border',
      '--color-rail-accent',
    ]) {
      expect(resolveToken(light, name), `${name} must resolve`).not.toBeNull();
      expect(resolveToken(dark, name), `dark ${name} must resolve`).not.toBeNull();
    }
  });
});

describe('the contrast helpers behave as the AA gates expect', () => {
  it('meetsAaText is false below 4.5 and true above', () => {
    expect(meetsAaText('#16A34A', '#FFFFFF')).toBe(false);
    expect(meetsAaText('#15803D', '#FFFFFF')).toBe(true);
  });

  it('meetsAaLargeText is true for the 3:1 band', () => {
    // A 3:1 pair is fine for large text and UI boundaries, but not for
    // body copy. #75869C on white is 3.72:1 — inside the band.
    expect(meetsAaLargeText('#75869C', '#FFFFFF')).toBe(true);
    expect(meetsAaText('#75869C', '#FFFFFF')).toBe(false);
    // #94A3B8 is 2.56:1 — below even the 3:1 band, which is why it
    // is the disabled ink and never a border colour.
    expect(meetsAaLargeText('#94A3B8', '#FFFFFF')).toBe(false);
  });
});
