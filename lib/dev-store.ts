/**
 * In-memory dev store (lib/dev-store.ts).
 *
 * Purpose: let the WO-001 citizen report flow run end-to-end in a browser
 * without a live Postgres + Prisma connection. Active only when
 * `process.env.CITYFIX_DEV_STORE === '1'` (set in `npm run dev:feat`).
 *
 * The store mirrors the Prisma surface for the queries the routes use:
 *   - City.findUnique
 *   - Category.findMany
 *   - Ward.findMany
 *   - Ticket.{findUnique, findFirst, findMany, create, update}
 *   - TicketTrailEntry.create
 *   - AuditEntry.create
 *   - User.findUnique
 *
 * It also exposes a `devMintSession` helper used by the dev-only login
 * route to issue a citizen session cookie without OTP/SMS.
 *
 * Production code paths (Prisma) are untouched on disk; route handlers
 * import `db` from this module instead of `@/lib/db` when CITYFIX_DEV_STORE
 * is set.
 *
 * Why not a vitest-only stub: the user asked for a fully-functioning
 * feature in a real browser, which means `next dev` + real HTTP routes.
 */

import { randomUUID } from 'node:crypto';
import { DHAKA_CENTER } from './geo/constants';

export { DHAKA_CENTER };

type Role = 'citizen' | 'dispatcher' | 'crew' | 'admin';
type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

export interface DevCity {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  defaultLanguage: 'bn' | 'en';
  dedupRadiusMeters: number;
}

export interface DevWard {
  id: string;
  cityId: string;
  number: number;
  name: string;
  nameBn: string | null;
  polygonGeoJson: string | null;
}

export interface DevCategory {
  id: string;
  cityId: string;
  departmentId: string | null;
  slug: string;
  name: string;
  nameBn: string | null;
  narrowCategoryPhotoCap: number | null;
}

export interface DevDepartment {
  id: string;
  cityId: string;
  slug: string;
  name: string;
  nameBn: string | null;
}

export interface DevUser {
  id: string;
  cityId: string;
  role: Role;
  phone: string | null;
  nid: string | null;
  name: string;
  email: string | null;
  passwordHash: string | null;
  wardId: string | null;
  departmentId: string | null;
  languageOverride: 'bn' | 'en' | null;
  /** Bolt 005-001 — WebAuthn-mandatory-for-admin-writes. */
  webAuthnCredentials: DevWebAuthnCredential[] | null;
  /** Bolt 005-001 — most-recent unconsumed challenge (cached). */
  webAuthnChallenge: DevWebAuthnChallengePayload | null;
}

export interface DevTrailEntry {
  id: string;
  ticketId: string;
  toStatus: TicketStatus;
  actorId: string;
  note: string | null;
  timestamp: string; // ISO
}

export interface DevTicket {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  reporterId: string;
  assignedCrewId: string | null;
  status: TicketStatus;
  locationLng: number;
  locationLat: number;
  locationLabel: string | null;
  locationLabelBn: string | null;
  note: string | null;
  photoUrls: string[];
  internalNote: string | null;
  // Dedup-confirm linkage (DISP-006). When the dispatcher
  // confirms a dedup-decline flag, the citizen's ticket is closed
  // and `duplicateOfId` is set to the existing ticket's id.
  // `closeReason` records WHY the ticket was closed.
  duplicateOfId: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface DevAuditEntry {
  id: string;
  entityType: 'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user';
  entityId: string;
  action: string;
  actorId: string;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  timestamp: string;
}

export interface DevDedupFlag {
  id: string;
  cityId: string;
  wardId: string;
  departmentId: string | null;
  ticketId: string;
  originalTicketId: string;
  citizenReason: string | null;
  status: 'pending' | 'confirmed' | 'dismissed';
  flaggedAt: string;
  resolvedById: string | null;
  resolvedAt: string | null;
}

export interface DevSession {
  id: string;
  userId: string;
  cityId: string;
  wardId: string | null;
  departmentId: string | null;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface DevOtpCode {
  id: string;
  userId: string;
  codeHash: string; // argon2 hash of the 6-digit code
  scope: 'registration' | 'login' | 'password-reset';
  expiresAt: string;
  usedAt: string | null;
  attempts: number;
  createdAt: string;
}

/**
 * A registered WebAuthn credential (mirrors the
 * `User.webAuthnCredentials` JSON column in production).
 * Bolt 005-001.
 */
export interface DevWebAuthnCredential {
  credentialID: string; // base64url
  credentialPublicKey: Uint8Array;
  counter: number;
  transports?: string[];
  registeredAt: string; // ISO 8601
  name: string;
}

/**
 * The most-recent unconsumed challenge for a user
 * (mirrors the `User.webAuthnChallenge` JSON column in production).
 * Bolt 005-001.
 */
export interface DevWebAuthnChallengePayload {
  challenge: string;
  expiresAt: string; // ISO
}

/**
 * Server-side challenge ledger row (mirrors the `WebAuthnChallenge`
 * Prisma table in production). Bolt 005-001.
 */
export interface DevWebAuthnChallenge {
  id: string;
  userId: string;
  challenge: string;
  expiresAt: string;
  createdAt: string;
}

interface Store {
  cities: Map<string, DevCity>;
  wards: Map<string, DevWard>;
  categories: Map<string, DevCategory>;
  departments: Map<string, DevDepartment>;
  users: Map<string, DevUser>;
  tickets: Map<string, DevTicket>;
  trail: DevTrailEntry[];
  audit: DevAuditEntry[];
  sessions: Map<string, DevSession>;
  otps: Map<string, DevOtpCode>;
  dedupFlags: Map<string, DevDedupFlag>;
  /** Bolt 005-001 — server-side WebAuthn challenge ledger. */
  webAuthnChallenges: Map<string, DevWebAuthnChallenge>;
}

declare global {
  // eslint-disable-next-line no-var
  var __CITYFIX_DEV_STORE__: Store | undefined;
}

function seed(): Store {
  const cityId = 'city_dhaka_north';
  const wardId = 'ward_14';
  const catIds = {
    streetlight: 'cat_streetlight',
    pothole: 'cat_pothole',
    drainage: 'cat_drainage',
    garbage: 'cat_garbage',
    other: 'cat_other',
  };
  const deptIds = {
    streetlight: 'dept_streetlight',
    roads: 'dept_roads',
    waste: 'dept_waste',
  };
  const citizenId = 'user_citizen_rahim';

  const cities = new Map<string, DevCity>();
  cities.set(cityId, {
    id: cityId,
    slug: 'dhaka-north',
    name: 'Dhaka North City Corporation',
    nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
    defaultLanguage: 'bn',
    dedupRadiusMeters: 50,
  });
  // Bolt 005-002 — two extra cities for
  // the admin's cities overview:
  //   - Dhaka-South (a sister city
  //     that already has a few rows
  //     seeded so its status is "live")
  //   - Chattogram (empty so the
  //     "Apply Dhaka template" button
  //     has a non-trivial visual baseline)
  const dhakaSouthId = 'city_dhaka_south';
  cities.set(dhakaSouthId, {
    id: dhakaSouthId,
    slug: 'dhaka-south',
    name: 'Dhaka South City Corporation',
    nameBn: 'ঢাকা দক্ষিণ সিটি কর্পোরেশন',
    defaultLanguage: 'bn',
    dedupRadiusMeters: 50,
  });
  const chittagongId = 'city_chittagong';
  cities.set(chittagongId, {
    id: chittagongId,
    slug: 'chittagong',
    name: 'Chattogram City Corporation',
    nameBn: 'চট্টগ্রাম সিটি কর্পোরেশন',
    defaultLanguage: 'bn',
    dedupRadiusMeters: 50,
  });

  const wards = new Map<string, DevWard>();
  wards.set(wardId, {
    id: wardId,
    cityId,
    number: 14,
    name: 'Ward 14 — Mirpur',
    nameBn: 'ওয়ার্ড ১৪ — মিরপুর',
    polygonGeoJson: null,
  });

  const departments = new Map<string, DevDepartment>();
  departments.set(deptIds.streetlight, {
    id: deptIds.streetlight,
    cityId,
    slug: 'streetlight-maintenance',
    name: 'Streetlight Maintenance',
    nameBn: 'রাস্তার আলো বিভাগ',
  });
  departments.set(deptIds.roads, {
    id: deptIds.roads,
    cityId,
    slug: 'roads-drainage',
    name: 'Roads & Drainage',
    nameBn: 'রাস্তা ও ড্রেনেজ বিভাগ',
  });
  departments.set(deptIds.waste, {
    id: deptIds.waste,
    cityId,
    slug: 'waste-management',
    name: 'Waste Management',
    nameBn: 'বর্জ্য ব্যবস্থাপনা বিভাগ',
  });

  const categories = new Map<string, DevCategory>();
  categories.set(catIds.streetlight, {
    id: catIds.streetlight,
    cityId,
    departmentId: deptIds.streetlight,
    slug: 'streetlight',
    name: 'Broken streetlight',
    nameBn: 'রাস্তার আলো নেই',
    narrowCategoryPhotoCap: 2,
  });
  categories.set(catIds.pothole, {
    id: catIds.pothole,
    cityId,
    departmentId: deptIds.roads,
    slug: 'pothole',
    name: 'Pothole / road damage',
    nameBn: 'রাস্তায় গর্ত',
    narrowCategoryPhotoCap: null,
  });
  categories.set(catIds.drainage, {
    id: catIds.drainage,
    cityId,
    departmentId: deptIds.roads,
    slug: 'drainage',
    name: 'Drainage blocked',
    nameBn: 'ড্রেনে পানি জমেছে',
    narrowCategoryPhotoCap: null,
  });
  categories.set(catIds.garbage, {
    id: catIds.garbage,
    cityId,
    departmentId: deptIds.waste,
    slug: 'garbage',
    name: 'Garbage not collected',
    nameBn: 'আবর্জনা পরিষ্কার হচ্ছে না',
    narrowCategoryPhotoCap: null,
  });
  categories.set(catIds.other, {
    id: catIds.other,
    cityId,
    departmentId: null,
    slug: 'other',
    name: 'Other',
    nameBn: 'অন্যান্য',
    narrowCategoryPhotoCap: null,
  });

  const users = new Map<string, DevUser>();
  users.set(citizenId, {
    id: citizenId,
    cityId,
    role: 'citizen',
    phone: '+8801711000000',
    nid: '1234567890',
    name: 'Rahim',
    email: null,
    passwordHash: null,
    wardId,
    departmentId: null,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  });
  // Demo non-citizen personas for the e2e human-tester flow. They are
  // city-scoped and (for dispatcher/crew) ward-scoped — mirroring the
  // production four-role model so the role-guard surfaces realistic
  // authz behaviour in the dev store.
  const dispatcherId = 'user_dispatcher_habib';
  users.set(dispatcherId, {
    id: dispatcherId,
    cityId,
    role: 'dispatcher',
    phone: '+8801711000001',
    nid: '2234567890',
    name: 'Habib',
    email: null,
    passwordHash: null,
    wardId,
    departmentId: deptIds.streetlight,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  });
  const crewId = 'user_crew_rashid';
  users.set(crewId, {
    id: crewId,
    cityId,
    role: 'crew',
    phone: '+8801711000002',
    nid: '3234567890',
    name: 'Rashid',
    email: null,
    passwordHash: null,
    wardId,
    departmentId: deptIds.streetlight,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  });
  const adminId = 'user_admin_anwar';
  users.set(adminId, {
    id: adminId,
    cityId,
    role: 'admin',
    phone: '+8801711000003',
    nid: '4234567890',
    name: 'Anwar',
    // Bolt 005-001: the admin's email is the identifier the
    // /api/auth/webauthn/login route uses to look up the
    // admin before issuing a challenge. The design log
    // (`4.1-admin-console-login` + the bolt's
    // ddd-02-technical-design) pins this as
    // `admin@cityfix.bd`.
    email: 'admin@cityfix.bd',
    passwordHash: null,
    wardId: null,
    departmentId: null,
    languageOverride: null,
    // Bolt 005-001: the dev admin starts with no registered
    // WebAuthn credential. The first time the dev admin hits a
    // /api/v1/admin/* write route (with the dev seam disabled),
    // the guard returns 401 webauthn_required. The
    // /admin/login page in Bolt 005-002 will prompt the dev
    // admin to register a key.
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  });

  // Seed home-feed demo tickets so the /home page renders non-empty
  // states for the four filter pills (Bolt 002-002 visual baselines).
  // Statuses: one submitted, one in_progress, one resolved, one closed.
  // The `closed` row is not exposed as a pill — it is included so the
  // `all` pill visibly contains it and the per-status pills do not.
  //
  // NOTE: these seed tickets share the dev ward with the unit tests
  // under `tests/unit/dev-store.test.ts`. To avoid colliding with
  // those test fixtures (which create their own tickets with
  // `cat_streetlight`), the seed here is keyed to a different
  // `categoryId` (`cat_other`) that no test uses. The home page's
  // `ActivityCard` reads the localised category name via
  // `serializeTicketForRole`, so `cat_other` is a deliberate,
  // visible choice for the citizen ("Other" / "অন্যান্য") and not
  // a debug-only marker.
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const tickets = new Map<string, DevTicket>();
  const trail: DevTrailEntry[] = [];
  const seedTickets: DevTicket[] = [
    {
      id: 'ticket_seed_submitted_1',
      cityId,
      wardId,
      categoryId: catIds.other,
      reporterId: citizenId,
      assignedCrewId: null,
      status: 'submitted',
      locationLng: DHAKA_CENTER.lng + 0.004,
      locationLat: DHAKA_CENTER.lat + 0.003,
      locationLabel: 'Mirpur 10, near the bazaar',
      locationLabelBn: 'মিরপুর ১০, বাজারের কাছে',
      note: 'Streetlight has been out for 3 nights. The intersection is dangerous after dark.',
      photoUrls: [],
      internalNote: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 1 * day).toISOString(),
      updatedAt: new Date(now - 1 * day).toISOString(),
      resolvedAt: null,
    },
    {
      id: 'ticket_seed_routed_1',
      cityId,
      wardId,
      categoryId: catIds.streetlight,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'routed',
      locationLng: DHAKA_CENTER.lng + 0.002,
      locationLat: DHAKA_CENTER.lat + 0.002,
      locationLabel: 'Mirpur 12, side road',
      locationLabelBn: 'মিরপুর ১২, পাশের সড়ক',
      note: 'Streetlight pole leaning after the storm. Live wires may be exposed.',
      photoUrls: [],
      internalNote: 'Crew dispatched; please verify the wire casing before starting work.',
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 2 * day).toISOString(),
      updatedAt: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
    },
    {
      id: 'ticket_seed_inprogress_1',
      cityId,
      wardId,
      categoryId: catIds.pothole,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'in_progress',
      locationLng: DHAKA_CENTER.lng - 0.002,
      locationLat: DHAKA_CENTER.lat + 0.001,
      locationLabel: 'Mirpur 14, main road',
      locationLabelBn: 'মিরপুর ১৪, প্রধান সড়ক',
      note: 'Deep pothole near the bus stop. Two motorcycles have fallen.',
      photoUrls: [],
      internalNote: 'Crew dispatched; ETA tomorrow morning.',
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 4 * day).toISOString(),
      updatedAt: new Date(now - 1 * day).toISOString(),
      resolvedAt: null,
    },
    {
      id: 'ticket_seed_resolved_1',
      cityId,
      wardId,
      categoryId: catIds.drainage,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'resolved',
      locationLng: DHAKA_CENTER.lng + 0.001,
      locationLat: DHAKA_CENTER.lat - 0.002,
      locationLabel: 'Mirpur 11, side lane',
      locationLabelBn: 'মিরপুর ১১, পাশের গলি',
      note: 'Drainage blocked; water pooling after rain.',
      photoUrls: [],
      internalNote: 'Cleared by waste-management crew.',
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 10 * day).toISOString(),
      updatedAt: new Date(now - 2 * day).toISOString(),
      resolvedAt: new Date(now - 2 * day).toISOString(),
    },
    {
      id: 'ticket_seed_closed_1',
      cityId,
      wardId,
      categoryId: catIds.garbage,
      reporterId: citizenId,
      assignedCrewId: null,
      status: 'closed',
      locationLng: DHAKA_CENTER.lng - 0.004,
      locationLat: DHAKA_CENTER.lat - 0.003,
      locationLabel: 'Mirpur 13, residential block',
      locationLabelBn: 'মিরপুর ১৩, আবাসিক ব্লক',
      note: 'Garbage has not been collected for a week.',
      photoUrls: [],
      internalNote: 'Duplicate of an earlier ticket; closed by dispatcher.',
      duplicateOfId: null,
      closeReason: 'duplicate',
      createdAt: new Date(now - 20 * day).toISOString(),
      updatedAt: new Date(now - 5 * day).toISOString(),
      resolvedAt: null,
    },
  ];
  for (const t of seedTickets) tickets.set(t.id, t);
  // One trail entry per seed ticket so getTicketWithTrail has rows.
  // For tickets already past `submitted`, add a `routed` trail entry
  // (dispatcher) and — for in_progress/resolved — a final trail entry
  // matching the ticket's current status. This mirrors the production
  // trail shape the crew sees on the detail page.
  for (const t of seedTickets) {
    trail.push({
      id: `trail_seed_${t.id}`,
      ticketId: t.id,
      toStatus: 'submitted',
      actorId: t.reporterId,
      note: null,
      timestamp: t.createdAt,
    });
    if (t.status === 'routed') {
      trail.push({
        id: `trail_seed_${t.id}_route`,
        ticketId: t.id,
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: null,
        timestamp: t.updatedAt,
      });
    } else if (t.status === 'in_progress') {
      trail.push({
        id: `trail_seed_${t.id}_route`,
        ticketId: t.id,
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: null,
        timestamp: new Date(
          new Date(t.updatedAt).getTime() - 60 * 60 * 1000,
        ).toISOString(),
      });
      trail.push({
        id: `trail_seed_${t.id}_inprogress`,
        ticketId: t.id,
        toStatus: 'in_progress',
        actorId: 'user_crew_rashid',
        note: 'Crew on site; pothole marked for repair.',
        timestamp: t.updatedAt,
      });
    } else if (t.status === 'resolved' || t.status === 'closed') {
      trail.push({
        id: `trail_seed_${t.id}_route`,
        ticketId: t.id,
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: null,
        timestamp: new Date(
          new Date(t.updatedAt).getTime() - 3 * 60 * 60 * 1000,
        ).toISOString(),
      });
    }
  }

  return {
    cities,
    wards,
    categories,
    departments,
    users,
    tickets,
    trail,
    audit: [],
    sessions: new Map(),
    otps: new Map(),
    dedupFlags: new Map(),
    webAuthnChallenges: new Map(),
  };
}

export function getStore(): Store {
  if (!globalThis.__CITYFIX_DEV_STORE__) {
    globalThis.__CITYFIX_DEV_STORE__ = seed();
  }
  return globalThis.__CITYFIX_DEV_STORE__;
}

export function isDevStore(): boolean {
  return process.env.CITYFIX_DEV_STORE === '1';
}

export function resetStore(): void {
  globalThis.__CITYFIX_DEV_STORE__ = seed();
}

export const DEV_CITIZEN_ID = 'user_citizen_rahim';
export const DEV_DISPATCHER_ID = 'user_dispatcher_habib';
export const DEV_CREW_ID = 'user_crew_rashid';
export const DEV_ADMIN_ID = 'user_admin_anwar';
export const DEV_CITY_ID = 'city_dhaka_north';
export const DEV_WARD_ID = 'ward_14';

// Tiny query helpers — keep the surface small so the route handlers stay
// readable. Anything more complex belongs in a service module.

export const devDb = {
  city: {
    findUnique(args: { where: { id: string } }): DevCity | null {
      return getStore().cities.get(args.where.id) ?? null;
    },
    findUniqueBySlug(args: { where: { slug: string } }): DevCity | null {
      return (
        [...getStore().cities.values()].find((c) => c.slug === args.where.slug) ?? null
      );
    },
    findMany(): DevCity[] {
      const list = [...getStore().cities.values()];
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    },
    create(args: {
      data: {
        slug: string;
        name: string;
        nameBn: string | null;
        defaultLanguage: 'bn' | 'en';
        dedupRadiusMeters: number;
      };
    }): DevCity {
      const id = `city_${args.data.slug.replace(/-/g, '_')}`;
      const city: DevCity = {
        id,
        slug: args.data.slug,
        name: args.data.name,
        nameBn: args.data.nameBn,
        defaultLanguage: args.data.defaultLanguage,
        dedupRadiusMeters: args.data.dedupRadiusMeters,
      };
      getStore().cities.set(id, city);
      return city;
    },
    update(args: {
      where: { id: string };
      data: Partial<{
        name: string;
        nameBn: string | null;
        defaultLanguage: 'bn' | 'en';
        dedupRadiusMeters: number;
      }>;
    }): DevCity {
      const existing = getStore().cities.get(args.where.id);
      if (!existing) {
        throw new Error(`city ${args.where.id} not found`);
      }
      const updated: DevCity = { ...existing, ...args.data };
      getStore().cities.set(args.where.id, updated);
      return updated;
    },
    delete(args: { where: { id: string } }): void {
      getStore().cities.delete(args.where.id);
    },
  },
  ward: {
    findFirst(args: {
      where: { cityId: string };
      orderBy?: { number: 'asc' | 'desc' };
    }): DevWard | null {
      const list = [...getStore().wards.values()].filter(
        (w) => w.cityId === args.where.cityId,
      );
      list.sort((a, b) =>
        (args.orderBy?.number ?? 'asc') === 'asc'
          ? a.number - b.number
          : b.number - a.number,
      );
      return list[0] ?? null;
    },
    findMany(args: { where: { cityId: string } }): DevWard[] {
      const list = [...getStore().wards.values()].filter(
        (w) => w.cityId === args.where.cityId,
      );
      list.sort((a, b) => a.number - b.number);
      return list;
    },
    findUnique(args: { where: { id: string } }): DevWard | null {
      return getStore().wards.get(args.where.id) ?? null;
    },
    create(args: {
      data: {
        cityId: string;
        number: number;
        name: string;
        nameBn: string | null;
        polygonGeoJson: string | null;
      };
    }): DevWard {
      const id = `ward_${args.data.cityId.replace(/^city_/, '')}_${args.data.number}`;
      const ward: DevWard = {
        id,
        cityId: args.data.cityId,
        number: args.data.number,
        name: args.data.name,
        nameBn: args.data.nameBn,
        polygonGeoJson: args.data.polygonGeoJson,
      };
      getStore().wards.set(id, ward);
      return ward;
    },
    update(args: {
      where: { id: string };
      data: Partial<{
        name: string;
        nameBn: string | null;
        polygonGeoJson: string | null;
      }>;
    }): DevWard {
      const existing = getStore().wards.get(args.where.id);
      if (!existing) {
        throw new Error(`ward ${args.where.id} not found`);
      }
      const updated: DevWard = { ...existing, ...args.data };
      getStore().wards.set(args.where.id, updated);
      return updated;
    },
    delete(args: { where: { id: string } }): void {
      getStore().wards.delete(args.where.id);
    },
  },
  department: {
    findMany(args: { where: { cityId: string } }): DevDepartment[] {
      const list = [...getStore().departments.values()].filter(
        (d) => d.cityId === args.where.cityId,
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    },
    findUnique(args: { where: { id: string } }): DevDepartment | null {
      return getStore().departments.get(args.where.id) ?? null;
    },
    create(args: {
      data: {
        cityId: string;
        slug: string;
        name: string;
        nameBn: string | null;
      };
    }): DevDepartment {
      const id = `dept_${args.data.cityId.replace(/^city_/, '')}_${args.data.slug.replace(/-/g, '_')}`;
      const dept: DevDepartment = {
        id,
        cityId: args.data.cityId,
        slug: args.data.slug,
        name: args.data.name,
        nameBn: args.data.nameBn,
      };
      getStore().departments.set(id, dept);
      return dept;
    },
    update(args: {
      where: { id: string };
      data: Partial<{ name: string; nameBn: string | null; slug: string }>;
    }): DevDepartment {
      const existing = getStore().departments.get(args.where.id);
      if (!existing) {
        throw new Error(`department ${args.where.id} not found`);
      }
      const updated: DevDepartment = { ...existing, ...args.data };
      getStore().departments.set(args.where.id, updated);
      return updated;
    },
    delete(args: { where: { id: string } }): void {
      getStore().departments.delete(args.where.id);
    },
    countByCity(args: { where: { cityId: string } }): number {
      return [...getStore().departments.values()].filter(
        (d) => d.cityId === args.where.cityId,
      ).length;
    },
  },
  category: {
    findMany(args: { where: { cityId: string } }): DevCategory[] {
      const list = [...getStore().categories.values()].filter(
        (c) => c.cityId === args.where.cityId,
      );
      list.sort((a, b) => a.name.localeCompare(b.name));
      return list;
    },
    findUnique(args: { where: { id: string } }): DevCategory | null {
      return getStore().categories.get(args.where.id) ?? null;
    },
    create(args: {
      data: {
        cityId: string;
        departmentId: string | null;
        slug: string;
        name: string;
        nameBn: string | null;
        narrowCategoryPhotoCap: number | null;
      };
    }): DevCategory {
      const id = `cat_${args.data.cityId.replace(/^city_/, '')}_${args.data.slug.replace(/-/g, '_')}`;
      const cat: DevCategory = {
        id,
        cityId: args.data.cityId,
        departmentId: args.data.departmentId,
        slug: args.data.slug,
        name: args.data.name,
        nameBn: args.data.nameBn,
        narrowCategoryPhotoCap: args.data.narrowCategoryPhotoCap,
      };
      getStore().categories.set(id, cat);
      return cat;
    },
    update(args: {
      where: { id: string };
      data: Partial<{
        name: string;
        nameBn: string | null;
        departmentId: string | null;
        narrowCategoryPhotoCap: number | null;
      }>;
    }): DevCategory {
      const existing = getStore().categories.get(args.where.id);
      if (!existing) {
        throw new Error(`category ${args.where.id} not found`);
      }
      const updated: DevCategory = { ...existing, ...args.data };
      getStore().categories.set(args.where.id, updated);
      return updated;
    },
    delete(args: { where: { id: string } }): void {
      getStore().categories.delete(args.where.id);
    },
    countByCity(args: { where: { cityId: string } }): number {
      return [...getStore().categories.values()].filter(
        (c) => c.cityId === args.where.cityId,
      ).length;
    },
  },
  user: {
    findUnique(args: { where: { id: string } }): DevUser | null {
      return getStore().users.get(args.where.id) ?? null;
    },
    findFirst(args: {
      where: { cityId: string; phone: string; role: string };
    }): DevUser | null {
      return (
        [...getStore().users.values()].find(
          (u) =>
            u.cityId === args.where.cityId &&
            u.phone === args.where.phone &&
            u.role === args.where.role,
        ) ?? null
      );
    },
    // Bolt 005-001 — used by the anonymous `/api/auth/webauthn/login`
    // route to resolve the admin by email (the only stable
    // identifier the browser has before a session is minted).
    // Filters by email + role; returns the first matching user.
    findFirstByEmail(args: {
      where: { email: string; role: string };
    }): DevUser | null {
      return (
        [...getStore().users.values()].find(
          (u) =>
            u.email === args.where.email &&
            u.role === args.where.role,
        ) ?? null
      );
    },
    create(args: {
      data: {
        id: string;
        cityId: string;
        role: Role;
        phone: string;
        nid: string;
        name: string;
        passwordHash: string;
        wardId: string;
      };
    }): DevUser {
      const u: DevUser = {
        id: args.data.id,
        cityId: args.data.cityId,
        role: args.data.role,
        phone: args.data.phone,
        nid: args.data.nid,
        name: args.data.name,
        email: null,
        passwordHash: args.data.passwordHash,
        wardId: args.data.wardId,
        departmentId: null,
        languageOverride: null,
        webAuthnCredentials: null,
        webAuthnChallenge: null,
      };
      getStore().users.set(u.id, u);
      return u;
    },
    /** Bolt 005-001. Returns the user's `webAuthnCredentials`
     * (parsed array) + `webAuthnChallenge` (cached payload). */
    webAuthn: {
      readCredentials(userId: string): {
        webAuthnCredentials: DevWebAuthnCredential[] | null;
        webAuthnChallenge: DevWebAuthnChallengePayload | null;
      } {
        const u = getStore().users.get(userId);
        if (!u) {
          return { webAuthnCredentials: null, webAuthnChallenge: null };
        }
        return {
          webAuthnCredentials: u.webAuthnCredentials,
          webAuthnChallenge: u.webAuthnChallenge,
        };
      },
      writeCredentials(
        userId: string,
        credentials: DevWebAuthnCredential[] | null,
      ): void {
        const u = getStore().users.get(userId);
        if (!u) throw new Error(`user ${userId} not found`);
        getStore().users.set(userId, { ...u, webAuthnCredentials: credentials });
      },
      writeChallenge(
        userId: string,
        challenge: DevWebAuthnChallengePayload | null,
      ): void {
        const u = getStore().users.get(userId);
        if (!u) throw new Error(`user ${userId} not found`);
        getStore().users.set(userId, { ...u, webAuthnChallenge: challenge });
      },
      bumpCounter(
        userId: string,
        credentialId: string,
        newCounter: number,
      ): void {
        const u = getStore().users.get(userId);
        if (!u) throw new Error(`user ${userId} not found`);
        const list = u.webAuthnCredentials ?? [];
        getStore().users.set(userId, {
          ...u,
          webAuthnCredentials: list.map((c) =>
            c.credentialID === credentialId ? { ...c, counter: newCounter } : c,
          ),
        });
      },
      revokeCredential(
        userId: string,
        credentialId: string,
      ): { removed: DevWebAuthnCredential; remaining: number } {
        const u = getStore().users.get(userId);
        if (!u) throw new Error(`user ${userId} not found`);
        const list = u.webAuthnCredentials ?? [];
        const target = list.find((c) => c.credentialID === credentialId);
        if (!target) throw new Error(`credential ${credentialId} not found`);
        const remaining = list.filter((c) => c.credentialID !== credentialId);
        getStore().users.set(userId, { ...u, webAuthnCredentials: remaining });
        return { removed: target, remaining: remaining.length };
      },
    },
  },
  ticket: {
    findUnique(args: { where: { id: string } }): DevTicket | null {
      return getStore().tickets.get(args.where.id) ?? null;
    },
    findFirst(args: {
      where?: {
        cityId?: string;
        categoryId?: string;
        status?: { in: TicketStatus[] };
        locationLat?: { gte: number; lte: number };
        locationLng?: { gte: number; lte: number };
      };
    }): DevTicket | null {
      const all = [...getStore().tickets.values()];
      return (
        all.find((t) => {
          for (const [k, v] of Object.entries(args.where ?? {})) {
            if (k === 'status') {
              const wanted = (v as { in: TicketStatus[] }).in;
              if (!wanted.includes(t.status)) return false;
              continue;
            }
            if (k === 'locationLat' || k === 'locationLng') {
              const range = v as { gte: number; lte: number };
              const val = (t as unknown as Record<string, unknown>)[k] as number;
              if (val < range.gte || val > range.lte) return false;
              continue;
            }
            if ((t as unknown as Record<string, unknown>)[k] !== v) return false;
          }
          return true;
        }) ?? null
      );
    },
    findMany(args: {
      where?: {
        cityId?: string;
        categoryId?: string;
        status?: { in: TicketStatus[] };
        locationLat?: { gte: number; lte: number };
        locationLng?: { gte: number; lte: number };
      };
      reporterId?: string;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }): DevTicket[] {
      const all = [...getStore().tickets.values()];
      const filtered = all.filter((t) => {
        for (const [k, v] of Object.entries(args.where ?? {})) {
          if (k === 'status') {
            const wanted = (v as { in: TicketStatus[] }).in;
            if (!wanted.includes(t.status)) return false;
            continue;
          }
          if (k === 'locationLat' || k === 'locationLng') {
            const range = v as { gte: number; lte: number };
            const val = (t as unknown as Record<string, unknown>)[k] as number;
            if (val < range.gte || val > range.lte) return false;
            continue;
          }
          if ((t as unknown as Record<string, unknown>)[k] !== v) return false;
        }
        if (args.reporterId && t.reporterId !== args.reporterId) return false;
        return true;
      });
      filtered.sort((a, b) => {
        const dir = args.orderBy?.createdAt === 'desc' ? -1 : 1;
        return dir * (a.createdAt < b.createdAt ? -1 : 1);
      });
      return typeof args.take === 'number' ? filtered.slice(0, args.take) : filtered;
    },
    create(args: {
      data: Omit<DevTicket, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'duplicateOfId' | 'closeReason'> & {
        duplicateOfId?: string | null;
        closeReason?: string | null;
      };
    }): DevTicket {
      const id = `tkt_${randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const t: DevTicket = {
        ...args.data,
        duplicateOfId: args.data.duplicateOfId ?? null,
        closeReason: args.data.closeReason ?? null,
        id,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      };
      getStore().tickets.set(id, t);
      return t;
    },
    update(args: {
      where: { id: string };
      data: Partial<DevTicket>;
    }): DevTicket {
      const cur = getStore().tickets.get(args.where.id);
      if (!cur) throw new Error(`ticket ${args.where.id} not found`);
      const next: DevTicket = {
        ...cur,
        ...args.data,
        updatedAt: new Date().toISOString(),
      };
      getStore().tickets.set(args.where.id, next);
      return next;
    },
  },
  trail: {
    create(args: {
      data: Omit<DevTrailEntry, 'id' | 'timestamp'>;
    }): DevTrailEntry {
      const entry: DevTrailEntry = {
        ...args.data,
        id: `trl_${randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
      };
      getStore().trail.push(entry);
      return entry;
    },
  },
  audit: {
    create(args: {
      data: Omit<DevAuditEntry, 'id' | 'timestamp'>;
    }): DevAuditEntry {
      const entry: DevAuditEntry = {
        ...args.data,
        id: `aud_${randomUUID().slice(0, 8)}`,
        timestamp: new Date().toISOString(),
      };
      getStore().audit.push(entry);
      return entry;
    },
  },
  session: {
    create(args: {
      data: Omit<DevSession, 'id' | 'createdAt' | 'lastSeenAt'>;
    }): DevSession {
      const id = `ses_${randomUUID().slice(0, 24)}`;
      const now = new Date().toISOString();
      const session: DevSession = {
        ...args.data,
        id,
        createdAt: now,
        lastSeenAt: now,
      };
      getStore().sessions.set(id, session);
      return session;
    },
    findUnique(args: { where: { id: string } }): DevSession | null {
      return getStore().sessions.get(args.where.id) ?? null;
    },
    delete(args: { where: { id: string } }): void {
      getStore().sessions.delete(args.where.id);
    },
    update(args: {
      where: { id: string };
      data: Partial<DevSession>;
    }): DevSession {
      const cur = getStore().sessions.get(args.where.id);
      if (!cur) throw new Error(`session ${args.where.id} not found`);
      const next = { ...cur, ...args.data };
      getStore().sessions.set(args.where.id, next);
      return next;
    },
  },
  otp: {
    create(args: {
      data: Omit<DevOtpCode, 'id' | 'createdAt' | 'usedAt' | 'attempts'>;
    }): DevOtpCode {
      const id = `otp_${randomUUID().slice(0, 8)}`;
      const entry: DevOtpCode = {
        ...args.data,
        id,
        usedAt: null,
        attempts: 0,
        createdAt: new Date().toISOString(),
      };
      getStore().otps.set(id, entry);
      return entry;
    },
    findFirst(args: {
      where: { userId: string; scope: string; usedAt: null };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): DevOtpCode | null {
      const list = [...getStore().otps.values()].filter((o) => {
        if (o.userId !== args.where.userId) return false;
        if (o.scope !== args.where.scope) return false;
        if (args.where.usedAt !== null) return false;
        return true;
      });
      const dir = args.orderBy?.createdAt === 'desc' ? -1 : 1;
      list.sort((a, b) => dir * (a.createdAt < b.createdAt ? -1 : 1));
      return list[0] ?? null;
    },
    update(args: {
      where: { id: string };
      data: Partial<DevOtpCode>;
    }): DevOtpCode {
      const cur = getStore().otps.get(args.where.id);
      if (!cur) throw new Error(`otp ${args.where.id} not found`);
      const next: DevOtpCode = { ...cur, ...args.data };
      getStore().otps.set(args.where.id, next);
      return next;
    },
    countRecent(args: {
      where: { userId: string; scope: string; since: string };
    }): number {
      return [...getStore().otps.values()].filter(
        (o) =>
          o.userId === args.where.userId &&
          o.scope === args.where.scope &&
          o.createdAt >= args.where.since,
      ).length;
    },
  },
  dedupFlag: {
    findUnique(args: { where: { id: string } }): DevDedupFlag | null {
      return getStore().dedupFlags.get(args.where.id) ?? null;
    },
    findMany(args: {
      where?: {
        cityId?: string;
        status?: string;
      };
      orderBy?: { flaggedAt: 'asc' | 'desc' };
    }): DevDedupFlag[] {
      const all = [...getStore().dedupFlags.values()];
      const filtered = all.filter((f) => {
        for (const [k, v] of Object.entries(args.where ?? {})) {
          if ((f as unknown as Record<string, unknown>)[k] !== v) return false;
        }
        return true;
      });
      filtered.sort((a, b) => {
        const dir = args.orderBy?.flaggedAt === 'desc' ? -1 : 1;
        return dir * (a.flaggedAt < b.flaggedAt ? -1 : 1);
      });
      return filtered;
    },
    create(args: {
      data: Omit<DevDedupFlag, 'id' | 'flaggedAt' | 'status' | 'resolvedById' | 'resolvedAt'> & {
        status?: 'pending' | 'confirmed' | 'dismissed';
        resolvedById?: string | null;
        resolvedAt?: string | null;
      };
    }): DevDedupFlag {
      const id = `df_${randomUUID().slice(0, 8)}`;
      const entry: DevDedupFlag = {
        ...args.data,
        id,
        status: args.data.status ?? 'pending',
        flaggedAt: new Date().toISOString(),
        resolvedById: args.data.resolvedById ?? null,
        resolvedAt: args.data.resolvedAt ?? null,
      };
      getStore().dedupFlags.set(id, entry);
      return entry;
    },
    update(args: {
      where: { id: string };
      data: Partial<DevDedupFlag>;
    }): DevDedupFlag {
      const cur = getStore().dedupFlags.get(args.where.id);
      if (!cur) throw new Error(`dedupFlag ${args.where.id} not found`);
      const next: DevDedupFlag = { ...cur, ...args.data };
      getStore().dedupFlags.set(args.where.id, next);
      return next;
    },
  },
  /** Bolt 005-001 — server-side WebAuthn challenge ledger. */
  webAuthnChallenge: {
    create(args: {
      userId: string;
      challenge: string;
      expiresAt: string;
    }): DevWebAuthnChallenge {
      const id = `wbc_${randomUUID().slice(0, 12)}`;
      const row: DevWebAuthnChallenge = {
        id,
        userId: args.userId,
        challenge: args.challenge,
        expiresAt: args.expiresAt,
        createdAt: new Date().toISOString(),
      };
      getStore().webAuthnChallenges.set(id, row);
      return row;
    },
    findLatest(args: { userId: string }): DevWebAuthnChallenge | null {
      const list = [...getStore().webAuthnChallenges.values()].filter(
        (c) => c.userId === args.userId,
      );
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return list[0] ?? null;
    },
    findById(args: {
      userId: string;
      id: string;
    }): DevWebAuthnChallenge | null {
      const row = getStore().webAuthnChallenges.get(args.id);
      if (!row || row.userId !== args.userId) return null;
      return row;
    },
  },
};

export interface DevTicketWithTrail extends DevTicket {
  trail: DevTrailEntry[];
}

export function getTicketWithTrail(id: string): DevTicketWithTrail | null {
  const t = devDb.ticket.findUnique({ where: { id } });
  if (!t) return null;
  const trail = getStore()
    .trail.filter((e) => e.ticketId === id)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  return { ...t, trail };
}
