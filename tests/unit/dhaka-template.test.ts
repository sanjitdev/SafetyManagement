/**
 * DHAKA_TEMPLATE shape + applyDhakaTemplate orchestration.
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  DHAKA_TEMPLATE,
  DHAKA_TEMPLATE_VERSION,
  applyDhakaTemplate,
} from '@/lib/admin/dhaka-template';

// The dev store + audit module need a
// stubbed-in env so the audit module
// doesn't try to open Prisma.
beforeEach(() => {
  process.env.CITYFIX_DEV_STORE = '1';
  process.env.DEV_SKIP_WEBAUTHN = '1';
});

describe('DHAKA_TEMPLATE (Bolt 005-002)', () => {
  it('has a version string', () => {
    expect(DHAKA_TEMPLATE.version).toBe(DHAKA_TEMPLATE_VERSION);
  });

  it('declares 8 departments', () => {
    expect(DHAKA_TEMPLATE.departments).toHaveLength(8);
  });

  it('declares 8 categories', () => {
    expect(DHAKA_TEMPLATE.categories).toHaveLength(8);
  });

  it('every category binds to a real department slug', () => {
    const deptSlugs = new Set(
      DHAKA_TEMPLATE.departments.map((d) => d.slug),
    );
    for (const cat of DHAKA_TEMPLATE.categories) {
      expect(deptSlugs.has(cat.departmentSlug)).toBe(true);
    }
  });

  it('categories are sorted by slug ASC for stable IDs', () => {
    const slugs = DHAKA_TEMPLATE.categories.map((c) => c.slug);
    const sorted = [...slugs].sort();
    expect(slugs).toEqual(sorted);
  });

  it('department slugs are unique', () => {
    const slugs = DHA_TEMPLATE_DEPT_SLUGS();
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('category slugs are unique', () => {
    const slugs = DHAKA_TEMPLATE.categories.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('narrow categories set photoCap=2; non-narrow set null', () => {
    const narrow = DHAKA_TEMPLATE.categories.find(
      (c) => c.isNarrow,
    );
    expect(narrow?.narrowCategoryPhotoCap).toBe(2);
    const wide = DHAKA_TEMPLATE.categories.find(
      (c) => !c.isNarrow,
    );
    expect(wide?.narrowCategoryPhotoCap).toBeNull();
  });

  it('wardTemplate seeds 3 placeholder wards', () => {
    expect(DHAKA_TEMPLATE.wardTemplate.count).toBe(3);
  });
});

describe('applyDhakaTemplate (Bolt 005-002)', () => {
  it('returns counts that match the template shape', async () => {
    const result = await applyDhakaTemplate('city_test_1', 'actor_test_1');
    expect(result.departmentsCreated).toBe(8);
    expect(result.categoriesCreated).toBe(8);
    expect(result.wardsCreated).toBe(3);
  });
});

function DHA_TEMPLATE_DEPT_SLUGS(): string[] {
  return DHAKA_TEMPLATE.departments.map((d) => d.slug);
}
