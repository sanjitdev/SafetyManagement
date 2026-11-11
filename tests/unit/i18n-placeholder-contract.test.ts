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

/**
 * ── The `%{name}` spelling ───────────────────────────────────────
 *
 * `interpolate` matches `/\{(\w+)\}/g` — braces only. Five public
 * landing templates were authored as `%{rate}`, `%{value}`,
 * `%{number}` and `%{count}`, so the `%` survived the substitution
 * and the visitor saw:
 *
 * ```text
 * %0 days
 * %0% resolved, target 85%
 * ```
 *
 * The braces still matched, so the number went in and the stray `%`
 * stayed — which is why the card read as a number with a typo rather
 * than as a broken template. `tests/unit/i18n.test.ts` asserts every
 * referenced key is REGISTERED; registration is not correctness, and
 * a key registered with the wrong placeholder spelling passes that
 * check.
 *
 * So the guard below is registry-wide: no template may use the `%`
 * prefix, because `interpolate` has never supported it.
 */
describe('the registry uses the {name} placeholder spelling only', () => {
  it('has no template with a %-prefixed placeholder', () => {
    const offenders: Array<{ key: string; locale: string; template: string }> = [];
    for (const [key, entry] of Object.entries(TRANSLATIONS)) {
      for (const locale of ['bn', 'en'] as const) {
        const template = entry[locale];
        if (/%\{(\w+)\}/.test(template)) {
          offenders.push({ key, locale, template });
        }
      }
    }
    expect(
      offenders,
      `templates use the unsupported %-prefixed placeholder spelling:\n${offenders
        .map((o) => `  ${o.key} (${o.locale}): ${o.template}`)
        .join('\n')}`,
    ).toEqual([]);
  });

  it('renders the public landing stats row without a stray %', () => {
    // The exact strings a visitor saw before the fix.
    expect(t('public.stats.days', { value: 0 }, 'en')).toBe('0 days');
    expect(t('public.stats.days', { value: 3.4 }, 'en')).toBe('3.4 days');
    expect(t('public.stats.resolved.foot', { rate: 0 }, 'en')).toBe(
      '0% resolved, target 85%',
    );
    expect(t('public.stats.resolved.foot', { rate: 82 }, 'en')).toBe(
      '82% resolved, target 85%',
    );
    // Bangla too — the `%` was leaking in both locales.
    expect(t('public.stats.days', { value: 0 }, 'bn')).toBe('0 দিন');
    expect(t('public.stats.resolved.foot', { rate: 0 }, 'bn')).toBe(
      '0% সমাধান, লক্ষ্য ৮৫%',
    );
  });

  it('leaves no literal placeholder or stray % in the stats row', () => {
    const rendered = [
      t('public.stats.reports_this_month', null, 'en'),
      t('public.stats.resolved', null, 'en'),
      t('public.stats.avg_time', null, 'en'),
      t('public.stats.days', { value: 2.5 }, 'en'),
      t('public.stats.resolved.foot', { rate: 50 }, 'en'),
    ];
    for (const out of rendered) {
      expect(out).not.toContain('{');
      expect(out).not.toContain('%{');
      expect(out).not.toMatch(/^\s*%|\s%(?!\s)/);
    }
  });

  it('renders the unused-but-registered ward and photo keys correctly', () => {
    // `public.location.ward` and `public.card.photos` have no call
    // site yet, so nothing rendered them — but they were registered
    // with the same wrong spelling and would break the moment a
    // caller appeared.
    expect(t('public.location.ward', { number: 14 }, 'en')).toBe('Ward 14');
    expect(t('public.location.ward', { number: 14 }, 'bn')).toBe('ওয়ার্ড 14');
    expect(t('public.card.photos', { count: 2 }, 'en')).toBe('2 photos');
    expect(t('public.card.photos', { count: 2 }, 'bn')).toBe('2টি ছবি');
  });

  it('renders the landing feed pagination keys correctly', () => {
    // The feed's "Showing X of Y" line interpolates two numbers. It
    // uses the same `{name}` spelling as every other key — a `%`
    // here would leak a stray percent sign into the page, which is
    // exactly the defect this file exists to catch.
    expect(t('public.feed.showing', { shown: 20, total: 58 }, 'en')).toBe(
      'Showing 20 of 58',
    );
    expect(t('public.feed.showing', { shown: 58, total: 58 }, 'en')).toBe(
      'Showing 58 of 58',
    );
    expect(t('public.feed.showing', { shown: 0, total: 0 }, 'en')).toBe(
      'Showing 0 of 0',
    );
    const bangla = t('public.feed.showing', { shown: 20, total: 58 }, 'bn');
    expect(bangla).toContain('20');
    expect(bangla).toContain('58');
    expect(bangla).not.toContain('{');
    expect(bangla).not.toContain('%');
  });

  it('leaves no literal placeholder in the pagination controls', () => {
    const rendered = [
      t('public.feed.load_older', null, 'en'),
      t('public.feed.load_older', null, 'bn'),
      t('public.feed.showing', { shown: 20, total: 58 }, 'en'),
    ];
    for (const out of rendered) {
      expect(out).not.toContain('{');
      expect(out).not.toContain('%{');
    }
  });
});

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
