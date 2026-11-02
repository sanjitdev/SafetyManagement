/**
 * WCAG contrast helpers (lib/ui/contrast.ts).
 *
 * The design system's palette is not asserted by eye — it is MEASURED.
 * Every colour pair that ships in `tokens.css` is checked against
 * WCAG 2.1 AA in `tests/unit/ui/contrast.test.ts`, which reads the
 * real CSS file and fails the build when a pair drops below its
 * threshold.
 *
 * That matters because the previous palette had several AA failures
 * that no one could see: `--color-success` (#16A34A) sat at 3.30:1 on
 * white, and `--color-accent` was referenced by four components but
 * never defined at all — so the active filter chip rendered with no
 * background and no border.
 *
 * ## The maths
 *
 * WCAG relative luminance uses the sRGB primaries with a piecewise
 * transfer function: channels at or below 0.03928 are linearised with
 * `c / 12.92`, and the rest with `((c + 0.055) / 1.055) ^ 2.4`.
 * Contrast is then `(L_lighter + 0.05) / (L_darker + 0.05)`.
 *
 * AA thresholds:
 *   - 4.5:1 for body text (and for large text as a floor)
 *   - 3:1  for large text (>= 18.66px bold or >= 24px), for UI
 *          component boundaries, and for focus indicators
 */

/** A hex colour, e.g. `#1E40AF`. */
export type HexColor = string;

/**
 * Parse a hex colour into its 8-bit RGB channels.
 *
 * Accepts `#RGB`, `#RRGGBB` and `#RRGGBBAA` (alpha is ignored — the
 * tokens in this project are all opaque). Returns `null` for anything
 * it cannot parse, so a malformed token surfaces as a test failure
 * rather than a silent `NaN` comparison.
 */
export function parseHexColor(hex: HexColor): [number, number, number] | null {
  if (typeof hex !== 'string') return null;

  const cleaned = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;

  if (cleaned.length === 3) {
    return [
      parseInt(cleaned[0] + cleaned[0], 16),
      parseInt(cleaned[1] + cleaned[1], 16),
      parseInt(cleaned[2] + cleaned[2], 16),
    ];
  }

  if (cleaned.length === 6 || cleaned.length === 8) {
    return [
      parseInt(cleaned.slice(0, 2), 16),
      parseInt(cleaned.slice(2, 4), 16),
      parseInt(cleaned.slice(4, 6), 16),
    ];
  }

  return null;
}

/**
 * WCAG 2.1 relative luminance of a hex colour (0 = black, 1 = white).
 */
export function relativeLuminance(hex: HexColor): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return Number.NaN;

  const [r, g, b] = rgb.map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two hex colours (1:1 to 21:1).
 *
 * The ratio is symmetric — it does not matter which colour is the
 * foreground.
 */
export function contrastRatio(foreground: HexColor, background: HexColor): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);

  if (Number.isNaN(foregroundLuminance) || Number.isNaN(backgroundLuminance)) {
    return Number.NaN;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * The WCAG conformance levels this project checks against.
 */
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
export const AA_NON_TEXT = 3;

/**
 * Does a pair meet AA for body text?
 */
export function meetsAaText(foreground: HexColor, background: HexColor): boolean {
  const ratio = contrastRatio(foreground, background);
  return !Number.isNaN(ratio) && ratio >= AA_TEXT;
}

/**
 * Does a pair meet AA for large text and non-text UI boundaries?
 */
export function meetsAaLargeText(
  foreground: HexColor,
  background: HexColor,
): boolean {
  const ratio = contrastRatio(foreground, background);
  return !Number.isNaN(ratio) && ratio >= AA_LARGE_TEXT;
}

/**
 * Extract a token's resolved hex value from a CSS source block.
 *
 * The token may be written directly (`--color-primary: #1E40AF;`) or
 * as a reference to another token (`--color-border-focus:
 * var(--color-primary);`). References are resolved one level deep,
 * which covers everything in `tokens.css`.
 *
 * Returns `null` when the token is absent or cannot be resolved.
 */
export function resolveToken(css: string, token: string): string | null {
  const declaration = new RegExp(
    `(?:^|[;{\\s])${token}\\s*:\\s*([^;]+)`,
    'm',
  ).exec(css);

  if (!declaration) return null;

  const value = declaration[1].trim();

  const reference = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value);
  if (reference) {
    // Resolve the referenced token from the same source. Guard against
    // a self-reference looping forever.
    if (reference[1] === token) return null;
    return resolveToken(css, reference[1]);
  }

  if (!parseHexColor(value)) return null;
  return value;
}
