/**
 * Dhaka template (lib/admin/dhaka-template.ts).
 *
 * Bolt 005-002 (Intent 005, Unit 002):
 * the canonical Dhaka-North configuration
 * that an empty city applies to bootstrap
 * its departments / categories / wards.
 *
 * This module is PURE DATA + PURE
 * FUNCTIONS — no I/O. The dev store
 * + the production Prisma seed both
 * import this module. The
 * `applyDhakaTemplate(cityId, actorId)`
 * function uses the `db-switch` facade
 * to do the actual writes + audit-log
 * rows.
 *
 * The template's categories are
 * sorted by `slug ASC` for stable IDs
 * (the test suite pins this). The
 * template's version is recorded in
 * every `AuditEntry` written by
 * `applyDhakaTemplate(...)` so the
 * admin can see which version was
 * applied to a given city.
 */

import { db } from '@/lib/db-switch';

export const DHAKA_TEMPLATE_VERSION = '2026-10-12-v1';

export interface DhakaTemplateDepartment {
  slug: string;
  name: { bn: string; en: string };
  contactInfo?: string;
}

export interface DhakaTemplateCategory {
  slug: string;
  name: { bn: string; en: string };
  departmentSlug: string;
  isNarrow: boolean;
  narrowCategoryPhotoCap: number | null;
}

export interface DhakaTemplate {
  version: string;
  departments: DhakaTemplateDepartment[];
  categories: DhakaTemplateCategory[];
  wardTemplate: {
    count: number;
    namePattern: string;
  };
}

/**
 * The Dhaka-North configuration. Eight
 * departments, eight categories (each
 * bound to its department), three
 * placeholder wards. Categories are
 * sorted alphabetically by slug for
 * stable IDs (the dev-store factory
 * uses a counter; the prod path uses
 * the slug as a natural key).
 */
export const DHAKA_TEMPLATE: DhakaTemplate = {
  version: DHAKA_TEMPLATE_VERSION,
  departments: [
    {
      slug: 'streetlight',
      name: { bn: 'বিদ্যুৎ ও সড়ক আলো', en: 'Streetlight' },
      contactInfo: 'streetlight@cityfix.bd',
    },
    {
      slug: 'roads',
      name: { bn: 'রাস্তা ও ফুটপাত', en: 'Roads' },
      contactInfo: 'roads@cityfix.bd',
    },
    {
      slug: 'water',
      name: { bn: 'পানি সরবরাহ', en: 'Water' },
      contactInfo: 'water@cityfix.bd',
    },
    {
      slug: 'waste',
      name: { bn: 'বর্জ্য ব্যবস্থাপনা', en: 'Waste' },
      contactInfo: 'waste@cityfix.bd',
    },
    {
      slug: 'drainage',
      name: { bn: 'নর্দমা ও ড্রেন', en: 'Drainage' },
      contactInfo: 'drainage@cityfix.bd',
    },
    {
      slug: 'parks',
      name: { bn: 'উদ্যান ও খেলার মাঠ', en: 'Parks' },
      contactInfo: 'parks@cityfix.bd',
    },
    {
      slug: 'signage',
      name: { bn: 'যোগাযোগ চিহ্ন', en: 'Signage' },
      contactInfo: 'signage@cityfix.bd',
    },
    {
      slug: 'other',
      name: { bn: 'অন্যান্য', en: 'Other' },
      contactInfo: 'other@cityfix.bd',
    },
  ],
  categories: [
    {
      slug: 'drainage',
      name: { bn: 'নর্দমা', en: 'Drainage' },
      departmentSlug: 'drainage',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'footpath',
      name: { bn: 'ফুটপাত', en: 'Footpath' },
      departmentSlug: 'roads',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'garbage',
      name: { bn: 'আবর্জনা', en: 'Garbage' },
      departmentSlug: 'waste',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'other',
      name: { bn: 'অন্যান্য', en: 'Other' },
      departmentSlug: 'other',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'pothole',
      name: { bn: 'গর্ত', en: 'Pothole' },
      departmentSlug: 'roads',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'signage',
      name: { bn: 'যোগাযোগ চিহ্ন', en: 'Signage' },
      departmentSlug: 'signage',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'streetlight',
      name: { bn: 'সড়ক আলো', en: 'Streetlight' },
      departmentSlug: 'streetlight',
      isNarrow: false,
      narrowCategoryPhotoCap: null,
    },
    {
      slug: 'water_leak',
      name: { bn: 'পানি লিক', en: 'Water leak' },
      departmentSlug: 'water',
      isNarrow: true,
      narrowCategoryPhotoCap: 2,
    },
  ],
  wardTemplate: {
    count: 3,
    namePattern: 'Ward {n}',
  },
};

export interface ApplyDhakaTemplateResult {
  departmentsCreated: number;
  categoriesCreated: number;
  wardsCreated: number;
}

/**
 * Apply the Dhaka template to a city.
 * Append-only (per ADR-011): existing
 * rows are preserved. The template
 * is "additive" — collisions on the
 * `@@unique([cityId, slug])` constraint
 * surface as a 409 from the underlying
 * `db.department.create` /
 * `db.category.create` call.
 *
 * Writes one `AuditEntry` per pre-
 * populated entity with
 * `afterValue.snapshotVersion =
 * DHAKA_TEMPLATE_VERSION` so Aamir
 * can see which version was applied.
 */
export async function applyDhakaTemplate(
  cityId: string,
  actorId: string,
): Promise<ApplyDhakaTemplateResult> {
  // 1. Departments first (categories
  //    reference departments by id).
  const departmentIdBySlug = new Map<string, string>();
  let departmentsCreated = 0;
  for (const dept of DHAKA_TEMPLATE.departments) {
    const created = await db.department.create({
      data: {
        cityId,
        slug: dept.slug,
        name: dept.name.en,
        nameBn: dept.name.bn,
      },
    });
    departmentIdBySlug.set(dept.slug, created.id);
    await db.audit.create({
      data: {
        entityType: 'department',
        entityId: created.id,
        action: 'create',
        actorId,
        beforeValue: null,
        afterValue: {
          source: 'dhaka-template',
          snapshotVersion: DHAKA_TEMPLATE_VERSION,
          slug: dept.slug,
          name: dept.name,
        },
      },
    });
    departmentsCreated++;
  }

  // 2. Categories (each bound to its
  //    department via the slug lookup).
  let categoriesCreated = 0;
  for (const cat of DHAKA_TEMPLATE.categories) {
    const departmentId =
      departmentIdBySlug.get(cat.departmentSlug) ?? null;
    const created = await db.category.create({
      data: {
        cityId,
        departmentId,
        slug: cat.slug,
        name: cat.name.en,
        nameBn: cat.name.bn,
        narrowCategoryPhotoCap: cat.narrowCategoryPhotoCap,
      },
    });
    await db.audit.create({
      data: {
        entityType: 'category',
        entityId: created.id,
        action: 'create',
        actorId,
        beforeValue: null,
        afterValue: {
          source: 'dhaka-template',
          snapshotVersion: DHAKA_TEMPLATE_VERSION,
          slug: cat.slug,
          name: cat.name,
          departmentSlug: cat.departmentSlug,
          isNarrow: cat.isNarrow,
          narrowCategoryPhotoCap: cat.narrowCategoryPhotoCap,
        },
      },
    });
    categoriesCreated++;
  }

  // 3. Wards (placeholder — the
  //    admin draws the real polygons
  //    in the ward editor; the
  //    template's `count` seeds 3
  //    rows so the cities overview
  //    transitions from "setup" to
  //    "live").
  let wardsCreated = 0;
  for (let n = 1; n <= DHAKA_TEMPLATE.wardTemplate.count; n++) {
    const created = await db.ward.create({
      data: {
        cityId,
        number: n,
        name: DHAKA_TEMPLATE.wardTemplate.namePattern.replace(
          '{n}',
          String(n),
        ),
        nameBn: null,
        polygonGeoJson: null,
      },
    });
    await db.audit.create({
      data: {
        entityType: 'ward',
        entityId: created.id,
        action: 'create',
        actorId,
        beforeValue: null,
        afterValue: {
          source: 'dhaka-template',
          snapshotVersion: DHAKA_TEMPLATE_VERSION,
          number: n,
        },
      },
    });
    wardsCreated++;
  }

  return {
    departmentsCreated,
    categoriesCreated,
    wardsCreated,
  };
}
