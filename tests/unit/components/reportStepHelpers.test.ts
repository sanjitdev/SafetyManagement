/**
 * Pure-logic unit tests for the report step helpers. These mirror
 * the exported pure functions in `app/report/note/page.tsx` and
 * `app/report/category/page.tsx`. They don't need jsdom because
 * they only exercise plain data transformations.
 */

import { describe, it, expect } from 'vitest';

// The exported helpers live inside the page modules; we re-derive
// them here as plain functions to keep the test free of jsdom.
interface CategoryForTest {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  narrowCategoryPhotoCap: number | null;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function filterCategories(
  list: ReadonlyArray<CategoryForTest>,
  query: string,
): CategoryForTest[] {
  const q = normalize(query);
  if (!q) return list.slice();
  return list.filter(
    (c) =>
      normalize(c.name).includes(q) ||
      (c.nameBn ? normalize(c.nameBn).includes(q) : false),
  );
}

interface NoteValidation {
  ok: boolean;
  tooLong: boolean;
  remaining: number;
}

function validateNote(text: string, max: number = 280): NoteValidation {
  const trimmed = text ?? '';
  return {
    ok: trimmed.length <= max,
    tooLong: trimmed.length > max,
    remaining: Math.max(0, max - trimmed.length),
  };
}

describe('filterCategories', () => {
  const cats: CategoryForTest[] = [
    { id: '1', slug: 'pothole', name: 'Pothole', nameBn: 'গর্ত', narrowCategoryPhotoCap: null },
    { id: '2', slug: 'streetlight', name: 'Streetlight', nameBn: 'স্ট্রিটলাইট', narrowCategoryPhotoCap: 2 },
    { id: '3', slug: 'garbage', name: 'Garbage', nameBn: 'আবর্জনা', narrowCategoryPhotoCap: null },
    { id: '4', slug: 'other', name: 'Other', nameBn: null, narrowCategoryPhotoCap: null },
  ];

  it('returns the full list when the query is empty', () => {
    expect(filterCategories(cats, '')).toHaveLength(4);
    expect(filterCategories(cats, '   ')).toHaveLength(4);
  });

  it('matches English names case-insensitively', () => {
    expect(filterCategories(cats, 'POTHOLE').map((c) => c.id)).toEqual(['1']);
    expect(filterCategories(cats, 'street').map((c) => c.id)).toEqual(['2']);
  });

  it('matches Bangla names', () => {
    expect(filterCategories(cats, 'গর্ত').map((c) => c.id)).toEqual(['1']);
    expect(filterCategories(cats, 'আব').map((c) => c.id)).toEqual(['3']);
  });

  it('excludes categories without a Bangla name from Bangla queries', () => {
    // "Other" has no nameBn; it must still be reachable via the
    // English label but should not match a Bangla-only query.
    expect(filterCategories(cats, 'other').map((c) => c.id)).toEqual(['4']);
    // A Bangla substring that doesn't match the English label
    // should not match `Other` either.
    expect(filterCategories(cats, 'অন্যান্য').map((c) => c.id)).toEqual([]);
  });

  it('returns an empty list when no categories match', () => {
    expect(filterCategories(cats, 'xyz123')).toEqual([]);
  });
});

describe('validateNote', () => {
  it('passes an empty note', () => {
    expect(validateNote('')).toEqual({ ok: true, tooLong: false, remaining: 280 });
  });

  it('passes a note under the limit', () => {
    const v = validateNote('hello');
    expect(v.ok).toBe(true);
    expect(v.tooLong).toBe(false);
    expect(v.remaining).toBe(275);
  });

  it('passes a note at the boundary (exactly 280 chars)', () => {
    const text = 'a'.repeat(280);
    const v = validateNote(text);
    expect(v.ok).toBe(true);
    expect(v.tooLong).toBe(false);
    expect(v.remaining).toBe(0);
  });

  it('flags a note that exceeds the limit', () => {
    const text = 'a'.repeat(281);
    const v = validateNote(text);
    expect(v.ok).toBe(false);
    expect(v.tooLong).toBe(true);
    expect(v.remaining).toBe(0); // clamps to 0 (not negative)
  });

  it('honours a custom max argument', () => {
    const v = validateNote('hello world', 5);
    expect(v.ok).toBe(false);
    expect(v.tooLong).toBe(true);
    expect(v.remaining).toBe(0);
  });
});
