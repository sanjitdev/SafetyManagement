/**
 * Vitest: the API error-code → localised message mapping
 * (`lib/photo/error-code.ts`).
 *
 * ## What this pins
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
 * These tests pin that unknown codes map to `null` (the caller's
 * generic fallback) and that the one dedicated key is actually
 * registered in the i18n registry with both locales.
 */

import { describe, expect, it } from 'vitest';
import {
  PHOTO_TOO_LARGE_CODE,
  photoErrorKeyForCode,
} from '@/lib/photo/error-code';
import { TRANSLATIONS } from '@/lib/i18n/keys';

describe('photoErrorKeyForCode', () => {
  it('maps the too-large code to its dedicated copy', () => {
    expect(photoErrorKeyForCode(PHOTO_TOO_LARGE_CODE)).toBe(
      'report.note.photo_too_large',
    );
  });

  it('returns null for the generic invalid-input code', () => {
    expect(photoErrorKeyForCode('invalid_input')).toBeNull();
  });

  it('returns null for the invalid-json code', () => {
    expect(photoErrorKeyForCode('invalid_json')).toBeNull();
  });

  it('returns null for an unknown code', () => {
    expect(photoErrorKeyForCode('some_future_code')).toBeNull();
  });

  it('never throws on a non-string input', () => {
    expect(photoErrorKeyForCode(undefined)).toBeNull();
    expect(photoErrorKeyForCode(null)).toBeNull();
    expect(photoErrorKeyForCode(123)).toBeNull();
    expect(photoErrorKeyForCode({})).toBeNull();
  });
});

describe('the mapped key is registered', () => {
  it('has both a Bangla and an English string', () => {
    const entry = TRANSLATIONS['report.note.photo_too_large'];
    expect(entry).toBeDefined();
    expect(entry.bn.length).toBeGreaterThan(0);
    expect(entry.en.length).toBeGreaterThan(0);
  });

  it('carries no placeholder — the copy names no number', () => {
    const entry = TRANSLATIONS['report.note.photo_too_large'];
    expect(entry.bn).not.toMatch(/\{/);
    expect(entry.en).not.toMatch(/\{/);
  });
});
