/**
 * Vitest: regression guard for i18n placeholder drift.
 *
 * ## The bug
 *
 * The report photo capture step renders a live counter pill:
 *
 * ```tsx
 * {t('report.photo.counter', { count: photoUrls.length, cap }, LANG)}
 * ```
 *
 * but the translation template read:
 *
 * ```
 * bn: '{count} / {max} ছবি',
 * en: '{count} / {max} photos',
 * ```
 *
 * `interpolate` leaves a placeholder intact when no var matches it
 * (the gap stays visible in QA — that is deliberate, see the
 * "falls back when the placeholder is missing" test in
 * `i18n.test.ts`). So the citizen saw the literal string
 *
 * ```text
 * 0 / {max} ছবি
 * ```
 *
 * instead of `0 / 3 ছবি`. The `{count}` half interpolated fine,
 * which is why the bug read as a half-broken pill rather than a
 * missing translation.
 *
 * ## Why it slipped through
 *
 * `tests/unit/i18n.test.ts` asserts that every referenced key is
 * REGISTERED in `TRANSLATIONS`. Registration is not correctness —
 * a key can be present with a placeholder no call site ever
 * supplies, and nothing flagged it.
 *
 * ## What these tests pin
 *
 * 1. The specific regression: `report.photo.counter` renders the
 *    number, not a literal placeholder.
 * 2. The convention: the photo-flow keys use `{cap}`, matching the
 *    call sites and `lib/report-photo-cap.ts` → `derivePhotoCap`.
 * 3. A general guard: no template in the registry may contain a
 *    placeholder that is spelled inconsistently between its `bn`
 *    and `en` forms (a cheap proxy for drift — the two forms are
 *    authored together and should use the same variable names).
 */

import { describe, expect, it } from 'vitest';
import { t, TRANSLATIONS } from '@/lib/i18n/keys';

/**
 * Every placeholder in a template, e.g. `'{count} / {cap} ছবি'` →
 * `['count', 'cap']`.
 */
function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

describe('report.photo.counter — the live counter renders numbers', () => {
  it('renders the count and the cap, not a literal placeholder', () => {
    // The exact string a citizen saw before the fix.
    const out = t('report.photo.counter', { count: 0, cap: 3 }, 'bn');
    expect(out).toBe('0 / 3 ছবি');
    expect(out).not.toContain('{max}');
    expect(out).not.toContain('{cap}');
    expect(out).not.toContain('{count}');
  });

  it('renders the English form too', () => {
    const out = t('report.photo.counter', { count: 0, cap: 3 }, 'en');
    expect(out).toBe('0 / 3 photos');
    expect(out).not.toContain('{');
  });

  it('tracks the live count', () => {
    expect(t('report.photo.counter', { count: 1, cap: 3 }, 'en')).toBe(
      '1 / 3 photos',
    );
    expect(t('report.photo.counter', { count: 3, cap: 3 }, 'en')).toBe(
      '3 / 3 photos',
    );
  });

  it('reflects a narrowed cap (the narrow-category cap is 2)', () => {
    expect(t('report.photo.counter', { count: 0, cap: 2 }, 'bn')).toBe(
      '0 / 2 ছবি',
    );
  });
});

describe('the photo-flow keys use the `cap` variable', () => {
  it('report.photo.counter uses {count} and {cap}', () => {
    const entry = TRANSLATIONS['report.photo.counter'];
    expect(placeholders(entry.bn)).toEqual(['count', 'cap']);
    expect(placeholders(entry.en)).toEqual(['count', 'cap']);
  });

  it('report.photo.cap_tooltip uses {cap}', () => {
    // The sibling key on the same screen. It was always correct,
    // which is what makes `counter` the outlier.
    const entry = TRANSLATIONS['report.photo.cap_tooltip'];
    expect(placeholders(entry.bn)).toEqual(['cap']);
    expect(placeholders(entry.en)).toEqual(['cap']);
  });

  it('no photo-flow key mentions {max}', () => {
    // `{max}` was the odd spelling out. `cap` is the name the call
    // sites and `derivePhotoCap` use.
    const photoKeys = Object.keys(TRANSLATIONS).filter((k) =>
      k.startsWith('report.photo.'),
    );
    expect(photoKeys.length).toBeGreaterThan(0);
    for (const key of photoKeys) {
      const entry = TRANSLATIONS[key as keyof typeof TRANSLATIONS];
      expect(placeholders(entry.bn), key).not.toContain('max');
      expect(placeholders(entry.en), key).not.toContain('max');
    }
  });
});

describe('every registry template uses the same placeholder names in bn and en', () => {
  it('has no bn/en placeholder drift', () => {
    const drifted: Array<{ key: string; bn: string[]; en: string[] }> = [];
    for (const [key, entry] of Object.entries(TRANSLATIONS)) {
      const bn = placeholders(entry.bn).sort();
      const en = placeholders(entry.en).sort();
      if (JSON.stringify(bn) !== JSON.stringify(en)) {
        drifted.push({ key, bn, en });
      }
    }
    expect(
      drifted,
      `placeholder drift between bn and en:\n${drifted
        .map((d) => `  ${d.key}: bn=[${d.bn}] en=[${d.en}]`)
        .join('\n')}`,
    ).toEqual([]);
  });
});

/**
 * ── The photo-size fix's new keys ───────────────────────────────
 *
 * The four keys added with the photo downscale + the dedicated
 * `photo_too_large` API code. They carry NO placeholder: the copy
 * names no number, so it survives any future change to the cap.
 */
describe('the photo-size keys carry no placeholder', () => {
  const NEW_KEYS = [
    'report.photo.processing',
    'report.photo.too_large',
    'report.note.photo_too_large',
    'crew.photo.error.too_large',
  ] as const;

  it('are all registered with both locales', () => {
    for (const key of NEW_KEYS) {
      const entry = TRANSLATIONS[key];
      expect(entry, key).toBeDefined();
      expect(entry.bn.length, key).toBeGreaterThan(0);
      expect(entry.en.length, key).toBeGreaterThan(0);
    }
  });

  it('name no size in either locale', () => {
    for (const key of NEW_KEYS) {
      const entry = TRANSLATIONS[key];
      expect(placeholders(entry.bn), key).toEqual([]);
      expect(placeholders(entry.en), key).toEqual([]);
    }
  });

  it('render without leaving a literal placeholder', () => {
    for (const key of NEW_KEYS) {
      for (const lang of ['bn', 'en'] as const) {
        const out = t(key, null, lang);
        expect(out, `${key}/${lang}`).not.toContain('{');
      }
    }
  });
});
