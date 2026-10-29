/**
 * API error-code → localised message mapping (lib/photo/error-code.ts).
 *
 * ── Why this module exists ─────────────────────────────────────
 *
 * The citizen-facing surfaces used to render the RAW machine code
 * straight out of the API response:
 *
 *   setError(body.error ?? `…`);
 *
 * so a rejected photo showed the literal string `invalid_input` to
 * the citizen. The machine code is for the API contract; the
 * MESSAGE is for the person.
 *
 * This module maps the codes that have dedicated copy. Anything it
 * does not recognise returns `null` and the caller falls back to its
 * generic localised message — so an unknown or future code can
 * never leak raw to the screen.
 *
 * Pure and client-safe, so it is unit-testable in Vitest's `node`
 * environment and shared by the note + summary pages.
 */

/** The API error code for a photo that exceeds the per-photo cap. */
export const PHOTO_TOO_LARGE_CODE = 'photo_too_large';

/**
 * Map an API error code to the i18n key that carries its copy.
 *
 * Returns `null` for codes with no dedicated copy → the caller uses
 * its generic fallback.
 */
export function photoErrorKeyForCode(
  code: unknown,
): 'report.note.photo_too_large' | null {
  if (code === PHOTO_TOO_LARGE_CODE) return 'report.note.photo_too_large';
  return null;
}
