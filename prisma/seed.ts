/**
 * Dhaka city fixture seed — prisma/seed.ts
 *
 * Implements PLAT-REQ-003 step 3 of the build order: seeds Dhaka as the
 * reference city with the 5-category / 3-department / 50-ward template
 * (UX Scenarios §04 setup).
 *
 * ALSO seeds the full four-role persona roster, the crew teams they
 * belong to, and the per-category SLA policies — so that every
 * role-scoped surface in the app is reachable against a real
 * database without any manual provisioning.
 *
 * WHY THE PERSONAS EXIST
 * ----------------------
 * The v1 production database shipped with **citizens only**: no
 * dispatcher, no crew, no admin. Admin provisioning is circular by
 * design (an admin must exist before the admin's CSV import can create
 * dispatchers and crew, and admin writes require a WebAuthn ceremony),
 * so staff accounts could not be bootstrapped by the app itself.
 *
 * This seed closes that gap deterministically: it writes the rows
 * directly, with the same personas the in-memory dev store uses
 * (`lib/dev-store.ts` → `seed()`), so the local database and the dev
 * store behave the same way.
 *
 * Usage:
 *   npm run db:seed
 *
 * Idempotent: re-running is a no-op (uses upserts keyed on slug /
 * phone / email).
 *
 * The personas mirror `lib/dev-store.ts` exactly — same ids, same
 * phones, same NIDs, same ward / department scoping, same demo
 * password (`12345678`) — so a developer moving between the dev store
 * and the local Postgres sees identical behaviour.
 */

import { PrismaClient, type Role } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { seedTickets } from './seed-tickets';

const prisma = new PrismaClient();

/**
 * Argon2id parameters — MUST match `lib/auth/password.ts`
 * (`ARGON2_OPTIONS`). A hash made with different parameters will not
 * verify, so the demo password would silently stop working.
 *
 * `algorithm: 2` is Argon2id. The numeric literal avoids a const-enum
 * access, which `isolatedModules` forbids.
 */
const ARGON2_OPTIONS = {
  algorithm: 2 as const,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * The demo password for every seeded persona: `12345678`.
 *
 * It satisfies the registration policy in `lib/auth/password.ts`
 * (>= 8 chars, >= 1 digit). It is a DEMO credential for a local
 * development database — never seed this into a production database
 * that holds real citizens' data.
 */
const DEMO_PASSWORD = '12345678';

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

/**
 * The demo ward the personas are scoped to. Mirrors `ward_14` in
 * `lib/dev-store.ts` — the ward the dispatcher and most crew members
 * are bound to.
 */
const DEMO_WARD_NUMBER = 14;

/**
 * The crew teams. `Crew` rows are the PRODUCTION path for the admin
 * user-management surface (`lib/admin/users.ts` → `resolveCrews`):
 * when they exist, the admin screen lists real teams and their
 * members; when they do not, the app synthesises teams from each
 * member's (ward, department) pair.
 *
 * Seeding them exercises the real path rather than the fallback.
 */
const DHAKA_CREWS = [
  {
    name: 'Mirpur Streetlight Team',
    nameBn: 'মিরপুর স্ট্রীটলাইট টিম',
    departmentSlug: 'streetlight-maintenance',
  },
  {
    name: 'Mirpur Roads Team',
    nameBn: 'মিরপুর রোডস টিম',
    departmentSlug: 'roads-drainage',
  },
  {
    // The waste team's crew row. The city has three departments and
    // three crew members; without a waste team the admin console's
    // crew list would show no team that can work a "Garbage not
    // collected" report. See the `user_crew_jamal` persona below.
    name: 'Mirpur Waste Team',
    nameBn: 'মিরপুর বর্জ্য ব্যবস্থাপনা টিম',
    departmentSlug: 'waste-management',
  },
];

/**
 * The per-category resolution SLA. `SlaPolicy` is NOT consulted by
 * any current surface (see `lib/admin/adoption.ts` and
 * `lib/admin/users.ts`) — the "avg time to resolve" stat is computed
 * from the ticket rows themselves (`resolvedAt - createdAt`). The model
 * exists and the seed populates it to keep the schema exercised rather
 * than empty, but the modelled SLA is **not enforced**: the policy rows
 * are written and never read.
 *
 * See `docs/PRODUCTION_READINESS_CHECKLIST.md` blocker 9.
 */
const DHAKA_SLA_POLICIES = [
  { categorySlug: 'streetlight', resolveHours: 72 },
  { categorySlug: 'pothole', resolveHours: 168 },
  { categorySlug: 'drainage', resolveHours: 120 },
  { categorySlug: 'garbage', resolveHours: 48 },
  { categorySlug: 'other', resolveHours: 168 },
];

/**
 * The four-role persona roster — the same set the in-memory dev store
 * seeds (`lib/dev-store.ts`). Every field is copied from there so the
 * two backends are interchangeable.
 *
 * `wardNumber` is the ward each persona is scoped to. `null` means
 * the persona is NOT ward-scoped (the admin has no ward scope —
 * admin actions are city-wide).
 */
interface PersonaSeed {
  id: string;
  role: Role;
  name: string;
  nameBn: string | null;
  phone: string;
  nid: string;
  email: string | null;
  wardNumber: number | null;
  departmentSlug: string | null;
  crewName: string | null;
  /** Account lifecycle status: 'active' | 'invited' | 'disabled'. */
  status: string;
}

const PERSONAS: PersonaSeed[] = [
  {
    id: 'user_citizen_rahim',
    role: 'citizen',
    name: 'Rahim',
    nameBn: 'রহিম',
    phone: '+8801711000000',
    nid: '1234567890',
    email: null,
    wardNumber: DEMO_WARD_NUMBER,
    departmentSlug: null,
    crewName: null,
    status: 'active',
  },
  {
    id: 'user_dispatcher_habib',
    role: 'dispatcher',
    name: 'Habib',
    nameBn: 'হাবিব',
    phone: '+8801711000001',
    nid: '2234567890',
    email: null,
    wardNumber: DEMO_WARD_NUMBER,
    departmentSlug: 'streetlight-maintenance',
    crewName: null,
    status: 'active',
  },
  {
    id: 'user_admin_anwar',
    role: 'admin',
    name: 'Anwar',
    nameBn: 'আনোয়ার',
    phone: '+8801711000003',
    nid: '4234567890',
    // Bolt 005-001: the admin's email is the identifier the
    // /api/auth/webauthn/login route uses to look up the admin before
    // issuing a challenge. The design log pins this as
    // `admin@cityfix.bd`.
    email: 'admin@cityfix.bd',
    wardNumber: null,
    departmentSlug: null,
    crewName: null,
    status: 'active',
  },
  {
    id: 'user_crew_rashid',
    role: 'crew',
    name: 'Rashid',
    nameBn: 'রশিদ',
    phone: '+8801711000002',
    nid: '3234567890',
    email: null,
    wardNumber: DEMO_WARD_NUMBER,
    departmentSlug: 'streetlight-maintenance',
    crewName: 'Mirpur Streetlight Team',
    status: 'active',
  },
  {
    id: 'user_crew_karim',
    role: 'crew',
    name: 'Karim',
    nameBn: 'করিম',
    phone: '+8801711000004',
    nid: '5234567890',
    email: null,
    wardNumber: DEMO_WARD_NUMBER,
    departmentSlug: 'roads-drainage',
    crewName: 'Mirpur Roads Team',
    status: 'active',
  },
  {
    id: 'user_crew_jamal',
    role: 'crew',
    name: 'Jamal',
    nameBn: 'জামাল',
    phone: '+8801711000005',
    nid: '6234567890',
    email: null,
    // A different ward, so the cross-ward reject path is testable.
    wardNumber: 20,
    // Jamal is the WASTE-MANAGEMENT crew — the third department.
    //
    // The city's three departments are streetlight maintenance, roads
    // & drainage, and waste management. Rashid covers streetlight,
    // Karim covers roads & drainage, and without a third crew member
    // NOBODY could work a "Garbage not collected" report: the crew
    // list filters on the ticket's category department
    // (`app/api/v1/crew/tickets/route.ts:169-175`), and
    // `assign-crew` refuses a crew member whose department differs
    // from the ticket's (`lib/dispatcher/assign-crew.ts:143-153`). A
    // waste ticket assigned to a streetlight or roads crew member
    // would VANISH from that member's own list.
    //
    // He was a second streetlight crew member, which duplicated
    // Rashid and left the waste department with nobody. He stays in
    // ward 20 — that is what keeps the cross-ward reject path
    // testable — so the seeded waste reports live in ward 20 with
    // him (`prisma/seed-tickets.ts` → `wardForReport`).
    departmentSlug: 'waste-management',
    crewName: 'Mirpur Waste Team',
    status: 'active',
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
  const categoryMap = new Map<string, string>();
  for (const c of DHAKA_CATEGORIES) {
    const deptId = c.departmentSlug ? departmentMap.get(c.departmentSlug) ?? null : null;
    const category = await prisma.category.upsert({
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
    categoryMap.set(c.slug, category.id);
    console.log(`    Category: ${c.name}`);
  }

  // Wards — Dhaka North has 54 wards in the official count, but for the
  // pilot we seed 50 with placeholder GeoJSON polygons (empty feature).
  // Aamir's WO-004 work replaces these with real boundaries.
  const wardMap = new Map<number, string>();
  for (let n = 1; n <= 50; n += 1) {
    const placeholderPolygon = JSON.stringify({
      type: 'Feature',
      properties: { ward_number: n },
      geometry: {
        type: 'Polygon',
        // Empty polygon — Aamir fills these in via the ward-boundary editor (Feature #19)
        coordinates: [[]],
      },
    });
    const ward = await prisma.ward.upsert({
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
    wardMap.set(n, ward.id);
  }
  console.log(`  Wards: 50 placeholder polygons`);

  // Per-category SLA policies.
  for (const p of DHAKA_SLA_POLICIES) {
    const categoryId = categoryMap.get(p.categorySlug);
    if (!categoryId) continue;
    await prisma.slaPolicy.upsert({
      where: { cityId_categoryId: { cityId: dhaka.id, categoryId } },
      update: { resolveHours: p.resolveHours },
      create: {
        cityId: dhaka.id,
        categoryId,
        resolveHours: p.resolveHours,
      },
    });
  }
  console.log(`  SLA policies: ${DHAKA_SLA_POLICIES.length}`);

  // Crew teams. `Crew` is unique on (cityId, name).
  const crewMap = new Map<string, string>();
  for (const c of DHAKA_CREWS) {
    const crew = await prisma.crew.upsert({
      where: { cityId_name: { cityId: dhaka.id, name: c.name } },
      update: {},
      create: {
        cityId: dhaka.id,
        name: c.name,
        nameBn: c.nameBn,
        departmentId: c.departmentSlug
          ? departmentMap.get(c.departmentSlug) ?? null
          : null,
      },
    });
    crewMap.set(c.name, crew.id);
    console.log(`    Crew: ${c.name}`);
  }

  // The personas.
  //
  // The password hash is computed ONCE and shared by every persona.
  // Hashing 6 identical passwords separately would burn 6x the
  // argon2 time for no benefit — the hash is salted internally, so
  // one hash verifies against the same plaintext for every row.
  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  const roleCounts = new Map<Role, number>();
  for (const p of PERSONAS) {
    const user = await prisma.user.upsert({
      where: { id: p.id },
      update: {
        role: p.role,
        name: p.name,
        nameBn: p.nameBn,
        email: p.email,
        passwordHash,
        wardId:
          p.wardNumber !== null ? wardMap.get(p.wardNumber) ?? null : null,
        departmentId: p.departmentSlug
          ? departmentMap.get(p.departmentSlug) ?? null
          : null,
        crewId: p.crewName ? crewMap.get(p.crewName) ?? null : null,
        status: p.status,
      },
      create: {
        id: p.id,
        cityId: dhaka.id,
        role: p.role,
        name: p.name,
        nameBn: p.nameBn,
        phone: p.phone,
        nid: p.nid,
        email: p.email,
        passwordHash,
        wardId:
          p.wardNumber !== null ? wardMap.get(p.wardNumber) ?? null : null,
        departmentId: p.departmentSlug
          ? departmentMap.get(p.departmentSlug) ?? null
          : null,
        crewId: p.crewName ? crewMap.get(p.crewName) ?? null : null,
        status: p.status,
      },
    });
    roleCounts.set(user.role, (roleCounts.get(user.role) ?? 0) + 1);
    console.log(`    User: ${user.name} (${user.role})`);
  }

  const summary = [...roleCounts.entries()]
    .map(([role, n]) => `${role}=${n}`)
    .join(' ');
  console.log(`  Personas: ${summary}`);

  // The demo reports.
  //
  // The old reports are cleared, then the spec dataset is written (see
  // `prisma/seed-tickets.ts`). Both phases run inside ONE transaction:
  //
  //   - The clear alone would leave the city with zero reports if the
  //     write failed — a demo with no data.
  //   - The write alone would leave the old reports in place if it
  //     failed — a demo with 58 stale tickets plus a partial dataset.
  //
  // One transaction means the database is either the old dataset or
  // the new one, never a mixture. The ticket seed's own assertions
  // (the final ticket count, the spec distribution) run inside it
  // too, so a failure rolls the whole thing back.
  console.log('Clearing existing reports…');
  await prisma.$transaction(async (tx) => {
    // Audit rows are deleted before the tickets they reference. The
    // audit row's `entityType` names the audited ENTITY, while
    // `actorId` names who acted — both must be handled, because
    // `AuditEntry.actorId` is `Restrict` and would otherwise block the
    // user deletes below.
    await tx.auditEntry.deleteMany({ where: { entityType: 'ticket' } });
    await tx.auditEntry.deleteMany({ where: { entityType: 'dedupFlag' } });
    // Deleting the tickets cascades their trail entries, photos and
    // dedup flags.
    await tx.ticket.deleteMany({ where: { cityId: dhaka.id } });

    // The "Probe" test users left behind by earlier manual testing.
    // Their audit rows must go first — `AuditEntry.actorId` is
    // `Restrict`, so a probe user cannot be deleted while it still
    // appears as an actor.
    const probeIds = (
      await tx.user.findMany({
        where: { cityId: dhaka.id, name: { startsWith: 'Probe ' } },
        select: { id: true },
      })
    ).map((u) => u.id);
    if (probeIds.length > 0) {
      await tx.auditEntry.deleteMany({ where: { actorId: { in: probeIds } } });
      await tx.session.deleteMany({ where: { userId: { in: probeIds } } });
      await tx.user.deleteMany({ where: { id: { in: probeIds } } });
      console.log(`  Removed ${probeIds.length} probe users`);
    }

    // The write phase, in the SAME transaction.
    await seedTickets(tx, {
      cityId: dhaka.id,
      wardByNumber: wardMap,
      categoryBySlug: categoryMap,
    });
  });

  console.log(`  Demo password for every persona: ${DEMO_PASSWORD}`);
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
