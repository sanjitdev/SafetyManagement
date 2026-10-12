/**
 * Dhaka city fixture seed — prisma/seed.ts
 *
 * Implements PLAT-REQ-003 step 3 of the build order: seeds Dhaka as the
 * reference city with the 5-category / 3-department / 50-ward template
 * (UX Scenarios §04 setup).
 *
 * Usage:
 *   npm run db:seed
 *
 * Idempotent: re-running is a no-op (uses upserts keyed on slug).
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DHAKA_DEPARTMENTS = [
  { slug: 'streetlight-maintenance', name: 'Streetlight Maintenance', nameBn: 'রাস্তার আলো বিভাগ' },
  { slug: 'roads-drainage', name: 'Roads & Drainage', nameBn: 'রাস্তা ও ড্রেনেজ বিভাগ' },
  { slug: 'waste-management', name: 'Waste Management', nameBn: 'বর্জ্য ব্যবস্থাপনা বিভাগ' },
];

const DHAKA_CATEGORIES = [
  {
    slug: 'streetlight',
    name: 'Broken streetlight',
    nameBn: 'রাস্তার আলো নেই',
    departmentSlug: 'streetlight-maintenance',
    narrowCategoryPhotoCap: 2, // UX Review revision #6
  },
  {
    slug: 'pothole',
    name: 'Pothole / road damage',
    nameBn: 'রাস্তায় গর্ত',
    departmentSlug: 'roads-drainage',
    narrowCategoryPhotoCap: null,
  },
  {
    slug: 'drainage',
    name: 'Drainage blocked',
    nameBn: 'ড্রেনে পানি জমেছে',
    departmentSlug: 'roads-drainage',
    narrowCategoryPhotoCap: null,
  },
  {
    slug: 'garbage',
    name: 'Garbage not collected',
    nameBn: 'আবর্জনা পরিষ্কার হচ্ছে না',
    departmentSlug: 'waste-management',
    narrowCategoryPhotoCap: null,
  },
  {
    slug: 'other',
    name: 'Other',
    nameBn: 'অন্যান্য',
    departmentSlug: null,
    narrowCategoryPhotoCap: null,
  },
];

async function main() {
  console.log('Seeding Dhaka template…');

  const dhaka = await prisma.city.upsert({
    where: { slug: 'dhaka-north' },
    update: {},
    create: {
      slug: 'dhaka-north',
      name: 'Dhaka North City Corporation',
      nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
      defaultLanguage: 'bn',
      dedupRadiusMeters: 50, // PLAT-REQ-004 recommendation
    },
  });
  console.log(`  City: ${dhaka.name}`);

  // Departments
  const departmentMap = new Map<string, string>();
  for (const d of DHAKA_DEPARTMENTS) {
    const dept = await prisma.department.upsert({
      where: { cityId_slug: { cityId: dhaka.id, slug: d.slug } },
      update: {},
      create: {
        cityId: dhaka.id,
        slug: d.slug,
        name: d.name,
        nameBn: d.nameBn,
      },
    });
    departmentMap.set(d.slug, dept.id);
    console.log(`    Dept: ${d.name}`);
  }

  // Categories (linked to departments)
  for (const c of DHAKA_CATEGORIES) {
    const deptId = c.departmentSlug ? departmentMap.get(c.departmentSlug) ?? null : null;
    await prisma.category.upsert({
      where: { cityId_slug: { cityId: dhaka.id, slug: c.slug } },
      update: {},
      create: {
        cityId: dhaka.id,
        slug: c.slug,
        name: c.name,
        nameBn: c.nameBn,
        departmentId: deptId,
        narrowCategoryPhotoCap: c.narrowCategoryPhotoCap,
      },
    });
    console.log(`    Category: ${c.name}`);
  }

  // Wards — Dhaka North has 54 wards in the official count, but for the
  // pilot we seed 50 with placeholder GeoJSON polygons (empty feature).
  // Aamir's WO-004 work replaces these with real boundaries.
  for (let n = 1; n <= 50; n++) {
    const placeholderPolygon = JSON.stringify({
      type: 'Feature',
      properties: { ward_number: n },
      geometry: {
        type: 'Polygon',
        // Empty polygon — Aamir fills these in via the ward-boundary editor (Feature #19)
        coordinates: [[]],
      },
    });
    await prisma.ward.upsert({
      where: { cityId_number: { cityId: dhaka.id, number: n } },
      update: {},
      create: {
        cityId: dhaka.id,
        number: n,
        name: `Ward ${n}`,
        nameBn: `ওয়ার্ড ${n}`,
        polygonGeoJson: placeholderPolygon,
      },
    });
  }
  console.log(`  Wards: 50 placeholder polygons`);

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });