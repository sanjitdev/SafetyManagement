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
import { seedPhotoUrl } from './dev-store/seed-photo';
import { nowIso, nowMs, slotInProductZone } from './format/clock';

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
  /**
   * Seed order, as an ISO timestamp.
   *
   * The Prisma `City` model carries `createdAt`, and
   * `db.city.findFirst({ orderBy: { createdAt: 'asc' } })` is how
   * the public activity feed picks the platform's PRIMARY city.
   * The dev store's `city.findMany` sorts by NAME, so without this
   * field the dev-store path would pick "Chattogram City
   * Corporation" (alphabetically first) while the Prisma path picks
   * Dhaka North — and Chattogram is seeded empty, so the public
   * landing page would show an empty feed in dev-store mode.
   *
   * The value is a monotonically increasing epoch offset from the
   * pinned seed clock, so it orders the same way the Prisma
   * `createdAt` column does.
   *
   * Typed `Date | string` because `lib/db-switch.ts` casts the
   * Prisma row (a `Date`) into the dev shape — the same parity
   * pattern the ticket serializer uses for `createdAt`/`resolvedAt`.
   */
  createdAt: Date | string;
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
  nameBn?: string | null;
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

/**
 * Bolt 007-001: a single photo attached to a ticket. The dev store
 * keeps the discriminator (`uploadedByRole`) + ordering key
 * (`uploadedAt`) the same shape as the Prisma `TicketPhoto` model.
 * `id` is a generated `tph_<8-hex>` to keep it visually distinct
 * from ticket ids.
 */
export interface DevTicketPhoto {
  id: string;
  ticketId: string;
  url: string;
  uploadedByRole: 'citizen' | 'crew' | string; // defensive: unknown string still surfaces
  uploadedAt: string; // ISO
  // WO-000 platform layer — the blob-storage metadata. NULL for
  // the legacy inline data-URL rows (the dev store never had
  // real bytes to store before the blob pipeline landed).
  storageKey?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
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
  // Bolt 007-001: the legacy `photoUrls: string[]` field is removed.
  // Photos are stored in the `ticketPhotos: Map<ticketId, DevTicketPhoto[]>`
  // keyed by ticket id; `getTicketWithTrail` joins the rows when it
  // returns the `DevTicketWithTrail` shape.
  internalNote: string | null;
  // WO-002 — the citizen's post-resolution feedback. Mirrors the
  // Prisma `Ticket.feedback String?` column: a compact JSON
  // document `{"rating":"positive","comment":"…"}` written by
  // `lib/citizen/feedback.ts`. NULL when the citizen has not
  // rated the resolution yet.
  //
  // Optional in the dev-store type (rather than `string | null`)
  // so the many hand-built test fixtures that plant a raw
  // `DevTicket` keep compiling; every read treats a missing
  // value exactly like `null`.
  feedback?: string | null;
  // Dedup-confirm linkage (DISP-006). When the dispatcher
  // confirms a dedup-decline flag, the citizen's ticket is closed
  // and `duplicateOfId` is set to the existing ticket's id.
  // `closeReason` records WHY the ticket was closed.
  duplicateOfId: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  /**
   * Optimistic-lock counter (2026-11-08). Mirrors the Prisma
   * `Ticket.version Int @default(0)` column.
   *
   * Optional in the type (rather than a required `number`) so the
   * hand-built test fixtures that plant a raw `DevTicket` keep
   * compiling; every read treats a missing value as 0, exactly as
   * the database default would.
   */
  version?: number;
  /**
   * Dedup-key backstop (2026-11-08). Mirrors the Prisma
   * `Ticket.dedupKey String?` column.
   *
   * Optional in the type (rather than `string | null`) so the
   * hand-built test fixtures that plant a raw `DevTicket` keep
   * compiling; every read treats a missing value exactly like `null`,
   * which is what the database does too.
   */
  dedupKey?: string | null;
}

export interface DevAuditEntry {
  id: string;
  entityType: 'ticket' | 'city' | 'category' | 'department' | 'ward' | 'user' | 'dedupFlag';
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
  /**
   * Bolt 007-001 — photos attached to tickets. Keyed by ticketId;
   * values are the per-ticket photo rows ordered by `uploadedAt`
   * ASC (matching the Prisma `TicketPhoto` index).
   */
  ticketPhotos: Map<string, DevTicketPhoto[]>;
}

declare global {
  // eslint-disable-next-line no-var
  var __CITYFIX_DEV_STORE__: Store | undefined;
}

/**
 * The `updatedAt` an update should stamp — STRICTLY AFTER the previous
 * one.
 *
 * ── Why not just `nowIso()` ────────────────────────────────────
 *
 * `updatedAt` is a monotonic version marker, not a wall-clock
 * reading. A row updated twice in the same millisecond must still
 * show that it changed, or "last modified" ordering collapses and a
 * reader cannot tell which of two writes came last.
 *
 * That mattered as soon as the clock was PINNED. Under a frozen
 * clock `nowIso()` returns the SAME instant on every call, so an
 * update stamped `updatedAt` equal to `createdAt` — and the change
 * became invisible rather than merely coarse. The old behaviour was
 * an accident of the wall clock advancing between two calls, and a
 * pinned clock exposes it.
 *
 * So the bump is explicit: take "now", and if it is not strictly
 * after the previous stamp, step forward by one millisecond. On a
 * live clock this is a no-op in all but the same-millisecond case;
 * under a pinned clock it produces a strictly increasing sequence
 * that mirrors what the database would have written.
 */
function bumpedTimestamp(previous: string): string {
  const now = nowMs();
  const prevMs = Date.parse(previous);
  const nextMs = Number.isNaN(prevMs) || now > prevMs ? now : prevMs + 1;
  return new Date(nextMs).toISOString();
}

function seed(): Store {
  const cityId = 'city_dhaka_north';
  const wardId = 'ward_14';
  // Demo password hash for every seed persona — `12345678`. The hash
  // matches `lib/auth/password.ts` ARGON2_OPTIONS (argon2id m=19 t=2 p=1).
  // Generated once with `@node-rs/argon2.hash('12345678', ARGON2_OPTIONS)`
  // and pinned here so `seed()` stays synchronous. The
  // `/api/v1/auth/login` route (citizen-only) reads it back through
  // `verifyPassword`; the non-citizen personas keep a hash for shape
  // symmetry even though they go through the dev bypasses.
  const DEMO_PASSWORD_HASH =
    '$argon2id$v=19$m=19456,t=2,p=1$cNxBSUpBTuez1gSOuhgAmg$eUXOGvvCTogurvOEG5CT/IiHQmBnmDmCKj3FwnxDk3c';
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
  /**
   * The seed clock, for the cities' `createdAt`.
   *
   * `createdAt` is what `db.city.findFirst({ orderBy: { createdAt:
   * 'asc' } })` sorts by to pick the platform's PRIMARY city (the
   * public activity feed's anonymous default). The cities are seeded
   * with descending offsets — Dhaka North is the OLDEST, so it stays
   * the primary city, exactly as the Prisma seed's insert order makes
   * it. Without this the dev store's name sort would pick Chattogram
   * (alphabetically first), and Chattogram is seeded EMPTY — so the
   * public landing page would render an empty feed.
   */
  const citySeedClock = nowMs();
  cities.set(cityId, {
    id: cityId,
    slug: 'dhaka-north',
    name: 'Dhaka North City Corporation',
    nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
    defaultLanguage: 'bn',
    dedupRadiusMeters: 50,
    createdAt: new Date(citySeedClock).toISOString(),
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
    createdAt: new Date(citySeedClock + 1000).toISOString(),
  });
  const chittagongId = 'city_chittagong';
  cities.set(chittagongId, {
    id: chittagongId,
    slug: 'chittagong',
    name: 'Chattogram City Corporation',
    nameBn: 'চট্টগ্রাম সিটি কর্পোরেশন',
    defaultLanguage: 'bn',
    dedupRadiusMeters: 50,
    createdAt: new Date(citySeedClock + 2000).toISOString(),
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
  // A SECOND ward in the SAME city, so the out-of-scope paths are
  // reachable from the dev store.
  //
  // `POST /api/tickets` validates the client-supplied ward against
  // the session's city (app/api/tickets/route.ts:155) and rejects an
  // unknown ward with 400 `ward_not_in_city`. With only `ward_14`
  // seeded, there was NO way to file a ticket in a ward the
  // dispatcher is not scoped to — so the dispatcher-scope rules
  // ("a ticket outside my ward returns 404, not 403") could not be
  // exercised against the dev store at all. The Prisma seed has the
  // same gap (prisma/seed.ts seeds only `ward_14`).
  //
  // The ward id is `ward_15` to match what the route specs use for
  // their out-of-ward fixtures.
  wards.set('ward_15', {
    id: 'ward_15',
    cityId,
    number: 15,
    name: 'Ward 15 — Cantonment',
    nameBn: 'ওয়ার্ড ১৫ — ক্যান্টনমেন্ট',
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
    passwordHash: DEMO_PASSWORD_HASH,
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
    passwordHash: DEMO_PASSWORD_HASH,
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
    passwordHash: DEMO_PASSWORD_HASH,
    wardId,
    departmentId: deptIds.streetlight,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  });
  // Bolt 007-002: a second crew user in the same ward so the
  // dispatcher picker dropdown has more than one option. (Same
  // wardId as Rashid.) The picker is ward-scoped, not
  // department-scoped, so the departmentId doesn't change the
  // filter — but a real second crew member makes the dropdown
  // testable.
  //
  // Karim is bound to `dept_roads` (not `dept_streetlight` like
  // Rashid) so the ward has a crew for the roads department too.
  // A ticket's department comes from its category, and the crew
  // list filters on that department — so the roads-category seed
  // tickets (the in-progress pothole, the resolved drainage) are
  // assigned to Karim. Before this, they were assigned to Rashid
  // (a streetlight crew), which put the seed at odds with the
  // department rule and left Rashid's in-progress list empty.
  const crewId2 = 'user_crew_karim';
  users.set(crewId2, {
    id: crewId2,
    cityId,
    role: 'crew',
    phone: '+8801711000004',
    nid: '5234567890',
    name: 'Karim',
    email: null,
    passwordHash: DEMO_PASSWORD_HASH,
    wardId,
    departmentId: deptIds.roads,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  });
  // Bolt 007-002: a crew user in a different ward (a future
  // wardId, `ward_other`) so the cross-ward reject path is
  // testable from the dev store. The dev store only seeds
  // ward_14 today, but adding this row does not require any
  // city config — the user row is enough to exercise the
  // service-layer check.
  const crewIdOther = 'user_crew_jamal';
  users.set(crewIdOther, {
    id: crewIdOther,
    cityId,
    role: 'crew',
    phone: '+8801711000005',
    nid: '6234567890',
    name: 'Jamal',
    email: null,
    passwordHash: DEMO_PASSWORD_HASH,
    wardId: 'ward_other',
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
    passwordHash: DEMO_PASSWORD_HASH,
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
  /*
   * The seed clock.
   *
   * Every seeded ticket, trail entry and audit row carries a timestamp
   * derived from the moment the store was seeded. That is fine for
   * behaviour and fatal for VISUAL REGRESSION: the rendered page shows
   * an absolute local time ("০৬ নভে, ২০২৬, ০৩:৪৪ PM"), so a screenshot
   * taken now can never match a baseline captured earlier — or later.
   *
   * The symptom is a visual-baseline test that fails no matter how many
   * times the baseline is regenerated. The route-spec suite hit exactly
   * this: `18-admin-audit-light` and `19-admin-tickets-light` failed
   * because every row's timestamp differed, and the pixel diff grew and
   * shrank with the wall clock. Regenerating the baseline "fixes" it for
   * exactly as long as nobody looks at it again.
   *
   * `nowMs()` is the shared pinned clock (`lib/format/clock.ts`):
   * `CITYFIX_SEED_NOW` pins the epoch the seed is built from, so the
   * store seeds the SAME absolute timestamps on every run, on every
   * machine, in every timezone — and the rendered page is
   * byte-identical.
   */
  const now = nowMs();
  const day = 24 * 60 * 60 * 1000;
  /**
   * A wall-clock time TODAY at the given hour/minute.
   *
   * The crew dashboard's job rows show the slot time an assignment
   * was dispatched. Seeding that with a relative offset ("3 hours
   * ago") makes every row land on the same clock time whenever the
   * store is seeded inside one hour, so the list reads as duplicate
   * rows. Pinning each open assignment to a fixed slot of the day
   * keeps the dashboard legible: 10:00, 12:30, 15:00.
   *
   * If the requested slot has already passed today, the time is
   * rolled back to yesterday at the same hour — a slot in the past
   * is still a valid dispatch record.
   *
   * THE SLOT IS A DHAKA WALL-CLOCK TIME
   * -----------------------------------
   * `setHours` sets the hour in the RUNTIME's timezone. On a UTC
   * server "10:00" became 16:00 Dhaka time, so the seeded rows showed
   * a different slot on every machine and the visual baseline could
   * never hold. `slotInProductZone` computes the slot in the
   * product's zone (Asia/Dhaka) and converts back to an instant —
   * which is the same instant on every machine.
   */
  const slotTime = (base: number, hour: number, minute: number): Date =>
    slotInProductZone(new Date(base), hour, minute);
  const tickets = new Map<string, DevTicket>();
  const trail: DevTrailEntry[] = [];
  // Bolt 007-001: pre-seeded with the same five `seedTickets`. The
  // legacy `photoUrls[]` array was always empty in v1 (the dev store
  // does not persist user-uploaded photos), so the backfill is a
  // no-op. The Map is kept here so the v1.1+ flows (citizen upload,
  // crew after-photo) have a stable container to mutate.
  const ticketPhotos = new Map<string, DevTicketPhoto[]>();
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
      internalNote: null,
      feedback: null,
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
      internalNote: 'Crew dispatched; please verify the wire casing before starting work.',
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 2 * day).toISOString(),
      updatedAt: slotTime(now, 10, 0).toISOString(),
      resolvedAt: null,
    },
    {
      id: 'ticket_seed_inprogress_1',
      cityId,
      wardId,
      // A streetlight category, so the ticket belongs to
      // `dept_streetlight` — the department the crew persona
      // (Rashid) is bound to. The crew list filters on the
      // ticket's category department, so a roads-category ticket
      // would never appear in Rashid's list.
      categoryId: catIds.streetlight,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'in_progress',
      locationLng: DHAKA_CENTER.lng - 0.002,
      locationLat: DHAKA_CENTER.lat + 0.001,
      locationLabel: 'Mirpur 14, main road',
      locationLabelBn: 'মিরপুর ১৪, প্রধান সড়ক',
      note: 'Streetlight out on the main road for three nights. The stretch is pitch dark after sunset.',
      internalNote: 'Crew dispatched; ETA tomorrow morning.',
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 4 * day).toISOString(),
      updatedAt: slotTime(now, 10, 0).toISOString(),
      resolvedAt: null,
    },
    {
      id: 'ticket_seed_resolved_1',
      cityId,
      wardId,
      categoryId: catIds.drainage,
      reporterId: citizenId,
      // Drainage is `dept_roads` — assigned to Karim (the roads
      // crew), not Rashid (the streetlight crew).
      assignedCrewId: crewId2,
      status: 'resolved',
      locationLng: DHAKA_CENTER.lng + 0.001,
      locationLat: DHAKA_CENTER.lat - 0.002,
      locationLabel: 'Mirpur 11, side lane',
      locationLabelBn: 'মিরপুর ১১, পাশের গলি',
      note: 'Drainage blocked; water pooling after rain.',
      internalNote: 'Cleared by waste-management crew.',
      feedback: null,
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
      internalNote: 'Duplicate of an earlier ticket; closed by dispatcher.',
      feedback: null,
      duplicateOfId: null,
      closeReason: 'duplicate',
      createdAt: new Date(now - 20 * day).toISOString(),
      updatedAt: new Date(now - 5 * day).toISOString(),
      resolvedAt: null,
    },
    /*
     * CREW DASHBOARD SEED — Rashid's completed history.
     *
     * The crew DASHBOARD (/crew) shows four KPIs, two of which are
     * about work the crew has ALREADY FINISHED: "Completed Today"
     * and "Avg. Resolution Time". Neither is derivable from the
     * actionable set (`routed` + `in_progress`) — a finished ticket
     * is not in it by definition.
     *
     * These three resolved rows give the dashboard real history to
     * aggregate: one resolved a few HOURS ago (so "Completed Today"
     * is non-zero), and two resolved on earlier days (so the average
     * resolution time spans more than one value rather than being a
     * single data point).
     *
     * All three are `cat_streetlight` → `dept_streetlight`, which is
     * the department the crew persona (Rashid) is bound to — so they
     * pass the crew list's category-department filter.
     */
    {
      id: 'ticket_seed_crew_done_today_1',
      cityId,
      wardId,
      categoryId: catIds.streetlight,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'resolved',
      locationLng: DHAKA_CENTER.lng + 0.0035,
      locationLat: DHAKA_CENTER.lat + 0.0035,
      locationLabel: 'Mirpur 15, school gate',
      locationLabelBn: 'মিরপুর ১৫, স্কুলের গেট',
      note: 'The light above the school gate is completely dark.',
      internalNote: 'Fuse replaced; unit tested at 19:00.',
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      resolvedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'ticket_seed_crew_done_today_2',
      cityId,
      wardId,
      categoryId: catIds.streetlight,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'resolved',
      locationLng: DHAKA_CENTER.lng - 0.0035,
      locationLat: DHAKA_CENTER.lat + 0.0035,
      locationLabel: 'Mirpur 16, mosque lane',
      locationLabelBn: 'মিরপুর ১৬, মসজিদের গলি',
      note: 'Streetlight flickering for a week, now off completely.',
      internalNote: 'Driver replaced; wiring re-terminated.',
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
      updatedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      resolvedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'ticket_seed_crew_done_earlier_1',
      cityId,
      wardId,
      categoryId: catIds.streetlight,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'resolved',
      locationLng: DHAKA_CENTER.lng + 0.005,
      locationLat: DHAKA_CENTER.lat + 0.0005,
      locationLabel: 'Mirpur 17, market junction',
      locationLabelBn: 'মিরপুর ১৭, বাজারের মোড়',
      note: 'Two streetlights out on the junction.',
      internalNote: 'Both units replaced.',
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 3 * day).toISOString(),
      updatedAt: new Date(now - 2 * day).toISOString(),
      resolvedAt: new Date(now - 2 * day).toISOString(),
    },
    /*
     * Two more OPEN assignments for Rashid. The dashboard's
     * "Today's Jobs" list and its NUMBERED map pins need enough
     * rows to show the numbering the design specifies (1, 2, 3),
     * and the design's job list shows a mix of In Progress /
     * Pending / Assigned rather than a single row.
     *
     * `cat_other` has no department, so it stays visible to every
     * crew regardless of the department filter.
     */
    {
      id: 'ticket_seed_crew_routed_2',
      cityId,
      wardId,
      categoryId: catIds.other,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'routed',
      locationLng: DHAKA_CENTER.lng - 0.0015,
      locationLat: DHAKA_CENTER.lat - 0.0015,
      locationLabel: 'Mirpur 18, community centre',
      locationLabelBn: 'মিরপুর ১৮, কমিউনিটি সেন্টার',
      note: 'The light in front of the community centre is out.',
      internalNote: null,
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 1 * day).toISOString(),
      updatedAt: slotTime(now, 12, 30).toISOString(),
      resolvedAt: null,
    },
    {
      id: 'ticket_seed_crew_routed_3',
      cityId,
      wardId,
      categoryId: catIds.streetlight,
      reporterId: citizenId,
      assignedCrewId: crewId,
      status: 'routed',
      locationLng: DHAKA_CENTER.lng + 0.0005,
      locationLat: DHAKA_CENTER.lat - 0.0035,
      locationLabel: 'Mirpur 19, footbridge',
      locationLabelBn: 'মিরপুর ১৯, ফুটব্রিজ',
      note: 'Footbridge approach light is out — very dark at night.',
      internalNote: null,
      feedback: null,
      duplicateOfId: null,
      closeReason: null,
      createdAt: new Date(now - 3 * day).toISOString(),
      updatedAt: slotTime(now, 15, 0).toISOString(),
      resolvedAt: null,
    },
  ];
  for (const t of seedTickets) tickets.set(t.id, t);
  /*
   * Seed photos.
   *
   * The crew dashboard's job rows show a photo thumbnail of the site
   * (the design reference puts a picture next to every assignment),
   * and the focused-job panel shows the citizen's evidence photo.
   * The dev store previously seeded no photos at all, so every row
   * fell back to the category glyph and the panel showed no evidence.
   *
   * The photos are inline SVG data URLs — see
   * `lib/dev-store/seed-photo.ts` for why they are inline rather
   * than remote (determinism for the visual baselines, no object
   * storage, and the CSP already allows `data:` for images).
   *
   * Every seeded ticket gets ONE citizen "before" photo. The
   * tickets the crew has already finished ALSO get a crew "after"
   * photo, so the "Completed" evidence path has something to show.
   */
  const seedCategorySlug: Record<string, string> = {
    [catIds.streetlight]: 'streetlight',
    [catIds.pothole]: 'pothole',
    [catIds.drainage]: 'drainage',
    [catIds.garbage]: 'garbage',
    [catIds.other]: 'other',
  };
  for (const [index, t] of seedTickets.entries()) {
    const slug = seedCategorySlug[t.categoryId] ?? 'other';
    const photos: DevTicketPhoto[] = [
      {
        id: `tph_seed_${t.id}_before`,
        ticketId: t.id,
        url: seedPhotoUrl(slug, index + 1),
        uploadedByRole: 'citizen',
        uploadedAt: t.createdAt,
        storageKey: null,
        mimeType: 'image/svg+xml',
        sizeBytes: null,
        width: 320,
        height: 240,
      },
    ];
    if (t.status === 'resolved' || t.status === 'closed') {
      photos.push({
        id: `tph_seed_${t.id}_after`,
        ticketId: t.id,
        url: seedPhotoUrl(slug, index + 11),
        uploadedByRole: 'crew',
        uploadedAt: t.resolvedAt ?? t.updatedAt,
        storageKey: null,
        mimeType: 'image/svg+xml',
        sizeBytes: null,
        width: 320,
        height: 240,
      });
    }
    ticketPhotos.set(t.id, photos);
  }
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
        // The crew that worked the ticket — matches `assignedCrewId`.
        actorId: t.assignedCrewId ?? 'user_crew_rashid',
        note: 'Crew on site; light unit marked for replacement.',
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
      /*
       * A RESOLVED ticket also gets the crew's own resolution
       * entry. Without it the trail stops at `routed` and the
       * dashboard's status trail shows the job as still pending —
       * and the "Completed Today" KPI would have no trail entry
       * to hang its activity line on.
       *
       * `closed` rows are dispatcher-closed (e.g. duplicates), not
       * crew-completed, so they get no crew entry.
       */
      if (t.status === 'resolved' && t.assignedCrewId) {
        trail.push({
          id: `trail_seed_${t.id}_resolved`,
          ticketId: t.id,
          toStatus: 'resolved',
          actorId: t.assignedCrewId,
          note: t.internalNote,
          timestamp: t.resolvedAt ?? t.updatedAt,
        });
      }
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
    /**
     * Bolt 005-004 — audit dashboard seed. Five deterministic rows
     * so the visual baseline captures a non-empty table.
     * Timestamps are relative to `Date.now()` so the row order
     * is stable across test runs.
     */
    audit: [
      {
        id: 'aud_seed_otp_fail',
        entityType: 'user',
        entityId: 'user_citizen_rahim',
        action: 'otp_send_failed',
        actorId: 'user_citizen_rahim',
        beforeValue: null,
        afterValue: {
          phone: '+8801712345678',
          provider: 'twilio',
          error: 'twilio_api_error',
        },
        timestamp: new Date(now - 1 * 60_000).toISOString(),
      },
      {
        id: 'aud_seed_ward_create',
        entityType: 'ward',
        entityId: 'ward_14',
        action: 'create',
        actorId: 'user_admin_anwar',
        beforeValue: null,
        afterValue: {
          number: 14,
          name: 'Ward 14',
          nameBn: 'ওয়ার্ড ১৪',
        },
        timestamp: new Date(now - 5 * 60_000).toISOString(),
      },
      {
        id: 'aud_seed_dedup_update',
        entityType: 'city',
        entityId: 'city_dhaka_north',
        action: 'update',
        actorId: 'user_admin_anwar',
        beforeValue: { dedupRadiusMeters: 50 },
        afterValue: { dedupRadiusMeters: 100 },
        timestamp: new Date(now - 30 * 60_000).toISOString(),
      },
      {
        id: 'aud_seed_category_create',
        entityType: 'category',
        entityId: 'cat_streetlight',
        action: 'create',
        actorId: 'user_admin_anwar',
        beforeValue: null,
        afterValue: {
          slug: 'streetlight',
          name: 'Streetlight',
          nameBn: 'বাতি',
          departmentId: 'dept_streetlight',
        },
        timestamp: new Date(now - 60 * 60_000).toISOString(),
      },
      {
        id: 'aud_seed_city_create',
        entityType: 'city',
        entityId: 'city_dhaka_north',
        action: 'create',
        actorId: 'user_admin_anwar',
        beforeValue: null,
        afterValue: {
          slug: 'dhaka-north',
          name: 'Dhaka North City Corporation',
          nameBn: 'ঢাকা উত্তর সিটি কর্পোরেশন',
          defaultLanguage: 'bn',
          dedupRadiusMeters: 50,
        },
        timestamp: new Date(now - 24 * 60 * 60_000).toISOString(),
      },
    ],
    sessions: new Map(),
    otps: new Map(),
    dedupFlags: new Map(),
    webAuthnChallenges: new Map(),
    ticketPhotos,
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
    /**
     * The FIRST city, honouring `orderBy.createdAt`.
     *
     * Mirrors the Prisma call the public activity feed makes:
     * `db.city.findFirst({ orderBy: { createdAt: 'asc' } })` picks
     * the platform's PRIMARY city for an anonymous visitor.
     *
     * The sort is on `createdAt`, NOT on `name` — `findMany` above
     * sorts by name, and "Chattogram City Corporation" sorts before
     * "Dhaka North City Corporation". Sorting the primary-city
     * lookup by name would pick Chattogram, which is seeded empty,
     * and the public landing page would render an empty feed.
     *
     * `desc` reverses the order. A city with no `createdAt` (a row
     * created before this field existed) sorts last on an ascending
     * query, which keeps the oldest seeded city first.
     */
    findFirst(args?: {
      orderBy?: { createdAt: 'asc' | 'desc' };
    }): DevCity | null {
      const list = [...getStore().cities.values()];
      const dir = args?.orderBy?.createdAt === 'desc' ? -1 : 1;
      const ms = (value: Date | string | undefined): number => {
        if (!value) return Number.POSITIVE_INFINITY;
        return typeof value === 'string' ? Date.parse(value) : value.getTime();
      };
      list.sort((a, b) => {
        const at = ms(a.createdAt);
        const bt = ms(b.createdAt);
        if (at === bt) return a.name.localeCompare(b.name);
        return (at - bt) * dir;
      });
      return list[0] ?? null;
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
        // A city created at runtime is NEWER than every seeded city,
        // so it never displaces the platform's primary city.
        createdAt: new Date(nowMs() + 3000).toISOString(),
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
    updateProfile(args: {
      where: { id: string };
      data: { name: string; nameBn: string | null };
    }): DevUser {
      const users = getStore().users;
      const current = users.get(args.where.id);
      if (!current) throw new Error('User not found');
      const updated = { ...current, ...args.data };
      users.set(updated.id, updated);
      return updated;
    },
    findFirst(args: {
      where: { cityId: string; phone: string; role?: string };
    }): DevUser | null {
      return (
        [...getStore().users.values()].find(
          (u) =>
            u.cityId === args.where.cityId &&
            u.phone === args.where.phone &&
            (args.where.role === undefined || u.role === args.where.role),
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
        /**
         * Optional. A department-scoped role (dispatcher / crew) is
         * bound to exactly one department roster; a citizen or admin
         * is not. The seeded personas all carry their department, so
         * `create` accepts it too — without it, a test could not
         * build a second crew member inside a given department and
         * would have to fall back to the warehouse fixture.
         */
        departmentId?: string | null;
        email?: string | null;
      };
    }): DevUser {
      const u: DevUser = {
        id: args.data.id,
        cityId: args.data.cityId,
        role: args.data.role,
        phone: args.data.phone,
        nid: args.data.nid,
        name: args.data.name,
        email: args.data.email ?? null,
        passwordHash: args.data.passwordHash,
        wardId: args.data.wardId,
        departmentId: args.data.departmentId ?? null,
        languageOverride: null,
        webAuthnCredentials: null,
        webAuthnChallenge: null,
      };
      getStore().users.set(u.id, u);
      return u;
    },
    // Bolt 007-002: list users filtered by an arbitrary subset of
    // (cityId, role, wardId, departmentId). The dev store is a
    // Map<id, user>, so the filter is a single pass; the result
    // is sorted by `name` ASC so the dispatcher's picker dropdown
    // has a stable order. Empty / missing clauses are treated as
    // "match anything" so the call site can pass `{ cityId, role }`
    // to list all crew in a city regardless of ward.
    findMany(args: {
      where: Partial<{
        cityId: string;
        role: string;
        wardId: string;
        departmentId: string;
      }>;
      orderBy?: { name: 'asc' | 'desc' };
    }): DevUser[] {
      const rows = [...getStore().users.values()].filter((u) => {
        if (args.where.cityId !== undefined && u.cityId !== args.where.cityId) return false;
        if (args.where.role !== undefined && u.role !== args.where.role) return false;
        if (args.where.wardId !== undefined && u.wardId !== args.where.wardId) return false;
        if (
          args.where.departmentId !== undefined &&
          u.departmentId !== args.where.departmentId
        ) return false;
        return true;
      });
      const dir = args.orderBy?.name === 'desc' ? 'desc' : 'asc';
      rows.sort((a, b) => a.name.localeCompare(b.name) * (dir === 'asc' ? 1 : -1));
      return rows;
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
        reporterId?: string;
        /**
         * The assigned crew member. Accepts a plain string (equality)
         * or `{ in: string[] }`, mirroring Prisma's filter surface.
         *
         * Added for the crew-capacity rule (2026-11-08). The dev
         * store must support the same filters the Prisma path does,
         * for the same reason it implements the compare-and-swap: a
         * query that only works against real Prisma is a query the CI
         * suite never exercises.
         */
        assignedCrewId?: string | { in: string[] };
        status?: { in: TicketStatus[] };
        locationLat?: { gte: number; lte: number };
        locationLng?: { gte: number; lte: number };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }): DevTicket[] {
      // The dev store mirrors the Prisma query surface. Prisma rejects
      // unknown top-level filter keys (e.g. a `reporterId` placed
      // beside `where` instead of inside it), so the shim must too —
      // otherwise a malformed query passes against the dev store and
      // only fails against real Prisma in production.
      const KNOWN_ARGS = new Set(['where', 'orderBy', 'take', 'skip']);
      for (const key of Object.keys(args)) {
        if (!KNOWN_ARGS.has(key)) {
          throw new Error(
            `dev-store: unsupported ticket.findMany argument "${key}" ` +
              `(filters must be nested inside "where")`,
          );
        }
      }
      const all = [...getStore().tickets.values()];
      const filtered = all.filter((t) => {
        for (const [k, v] of Object.entries(args.where ?? {})) {
          if (k === 'status') {
            const wanted = (v as { in: TicketStatus[] }).in;
            if (!wanted.includes(t.status)) return false;
            continue;
          }
          if (k === 'assignedCrewId') {
            const wanted =
              typeof v === 'string' ? [v] : (v as { in: string[] }).in;
            const actual = (t as unknown as Record<string, unknown>)[k] as
              | string
              | null;
            // Prisma's `in` does not match NULL, and a plain equality
            // filter on a nullable column does not match NULL either.
            // Mirrored here so a `assignedCrewId: null` filter means
            // "unassigned", not "everything".
            if (actual === null || actual === undefined) return false;
            if (!wanted.includes(actual)) return false;
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
      });
      filtered.sort((a, b) => {
        const dir = args.orderBy?.createdAt === 'desc' ? -1 : 1;
        return dir * (a.createdAt < b.createdAt ? -1 : 1);
      });
      return typeof args.take === 'number' ? filtered.slice(0, args.take) : filtered;
    },
    create(args: {
      data: Omit<DevTicket, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'duplicateOfId' | 'closeReason' | 'feedback'> & {
        duplicateOfId?: string | null;
        closeReason?: string | null;
        feedback?: string | null;
      };
    }): DevTicket {
      const id = `tkt_${randomUUID().slice(0, 8)}`;
      const now = nowIso();
      const t: DevTicket = {
        ...args.data,
        duplicateOfId: args.data.duplicateOfId ?? null,
        closeReason: args.data.closeReason ?? null,
        feedback: args.data.feedback ?? null,
        dedupKey: args.data.dedupKey ?? null,
        id,
        createdAt: now,
        updatedAt: now,
        resolvedAt: null,
      };
      // THE DEDUP-KEY UNIQUE INDEX (2026-11-08).
      //
      // The dev store must enforce the same unique index the database
      // enforces, for the same reason it implements the compare-and-
      // swap: a dev store that skipped the constraint would let the
      // whole CI suite pass while production refused the duplicate
      // insert. The point of the dev store is to be a faithful
      // stand-in for the database's concurrency semantics, not a
      // more permissive one.
      //
      // The semantics match Postgres exactly:
      //   - NULLs are DISTINCT. A ticket with no key never collides
      //     with anything, so the acknowledged-duplicate path (which
      //     deliberately carries no key) always works.
      //   - The scope is `(cityId, dedupKey)`.
      //   - The violation is reported as a Postgres unique violation
      //     (SQLSTATE 23505) with the constraint named, so the
      //     caller's `isDedupConflict` recognises it.
      if (t.dedupKey) {
        for (const existing of getStore().tickets.values()) {
          if (existing.cityId === t.cityId && existing.dedupKey === t.dedupKey) {
            const err = new Error(
              `Unique constraint failed on the fields: (\`cityId\`,\`dedupKey\`)`,
            ) as Error & {
              code?: string;
              meta?: { target: string[]; constraint: string };
            };
            err.code = '23505';
            err.meta = {
              target: ['cityId', 'dedupKey'],
              constraint: 'Ticket_cityId_dedupKey_key',
            };
            throw err;
          }
        }
      }
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
        updatedAt: bumpedTimestamp(cur.updatedAt),
      };
      getStore().tickets.set(args.where.id, next);
      return next;
    },
    /**
     * CONDITIONAL update — the compare-and-swap primitive, mirroring
     * Prisma's `updateMany` with a compound `where`.
     *
     * Returns the number of rows changed: 1 when the guard held, 0
     * when it did not (another writer got there first). The Prisma
     * path returns `updateMany`'s `count`, which is exactly this.
     *
     * WHY THE DEV STORE MUST IMPLEMENT THE GUARD, NOT JUST THE WRITE.
     * The dev store's read-then-set pair is atomic only by accident of
     * Node's single-threaded event loop. An implementation here that
     * simply wrote the row would let the whole CI suite pass while
     * production silently lost a status update. The point of the dev
     * store is to be a faithful stand-in for the database's
     * concurrency semantics, not a faster one.
     *
     * The `where` clauses are ANDed, matching SQL semantics:
     *   - `id`       — always required
     *   - `status`   — the caller's expected current status
     *   - `version`  — the caller's expected current version
     */
    updateWhere(args: {
      where: { id: string; status?: TicketStatus; version?: number };
      data: Partial<DevTicket> & { version?: number };
    }): number {
      const cur = getStore().tickets.get(args.where.id);
      if (!cur) return 0;
      if (
        args.where.status !== undefined &&
        cur.status !== args.where.status
      ) {
        return 0;
      }
      if (
        args.where.version !== undefined &&
        (cur.version ?? 0) !== args.where.version
      ) {
        return 0;
      }
      const next: DevTicket = {
        ...cur,
        ...args.data,
        updatedAt: bumpedTimestamp(cur.updatedAt),
      };
      getStore().tickets.set(args.where.id, next);
      return 1;
    },
    /**
     * Bump the optimistic-lock counter without touching anything else.
     * Mirrors `prismaClient.ticket.updateMany({ data: { version: { increment: 1 } } })`.
     */
    bumpVersion(args: { where: { id: string } }): void {
      const cur = getStore().tickets.get(args.where.id);
      if (!cur) return;
      getStore().tickets.set(args.where.id, {
        ...cur,
        version: (cur.version ?? 0) + 1,
        updatedAt: bumpedTimestamp(cur.updatedAt),
      });
    },
  },
  /**
   * Bolt 007-001 — ticket photo CRUD. The dev store mirrors the
   * Prisma `TicketPhoto` model with a `Map<ticketId, DevTicketPhoto[]>`
   * keyed by ticketId; ordering is `uploadedAt` ASC inside each list.
   */
  ticketPhoto: {
    create(args: {
      data: Omit<DevTicketPhoto, 'id' | 'uploadedAt'> & {
        uploadedAt?: string;
      };
    }): DevTicketPhoto {
      const id = `tph_${randomUUID().slice(0, 8)}`;
      const row: DevTicketPhoto = {
        ...args.data,
        id,
        uploadedAt: args.data.uploadedAt ?? nowIso(),
      };
      const store = getStore();
      const list = store.ticketPhotos.get(args.data.ticketId) ?? [];
      list.push(row);
      list.sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1));
      store.ticketPhotos.set(args.data.ticketId, list);
      return row;
    },
    findManyForTicket(args: { ticketId: string }): DevTicketPhoto[] {
      const list = getStore().ticketPhotos.get(args.ticketId) ?? [];
      // Always return a fresh, sorted copy so callers cannot mutate
      // the store's internal state by holding a reference.
      return list
        .slice()
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1));
    },
    /**
     * The DELETE flow: the citizen's `DELETE /api/tickets/[id]/photos/[idx]`
     * route passes the photo's position in the citizen's ordered list
     * (i.e. the photo's index inside the `beforePhotoUrls` array).
     * The dev store resolves that index against the per-ticket list
     * filtered to `uploadedByRole === 'citizen'` and removes the
     * matching row. Returns the removed row (or null when no match).
     */
    deleteByCitizenIndex(args: {
      ticketId: string;
      idx: number;
    }): DevTicketPhoto | null {
      const store = getStore();
      const list = store.ticketPhotos.get(args.ticketId) ?? [];
      const citizenRows = list
        .slice()
        .sort((a, b) => (a.uploadedAt < b.uploadedAt ? -1 : 1))
        .filter((p) => p.uploadedByRole === 'citizen');
      const target = citizenRows[args.idx];
      if (!target) return null;
      const next = list.filter((p) => p.id !== target.id);
      store.ticketPhotos.set(args.ticketId, next);
      return target;
    },
  },
  trail: {
    create(args: {
      data: Omit<DevTrailEntry, 'id' | 'timestamp'>;
    }): DevTrailEntry {
      const entry: DevTrailEntry = {
        ...args.data,
        id: `trl_${randomUUID().slice(0, 8)}`,
        timestamp: nowIso(),
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
        timestamp: nowIso(),
      };
      getStore().audit.push(entry);
      return entry;
    },
    /**
     * Bolt 005-004 — audit dashboard read surface. The dev-store
     * audit shape is `DevAuditEntry` (timestamp as ISO string;
     * `actorId` flat on the row). The `where` clause mirrors the
     * Prisma `auditEntry.findMany` shape with the dev-friendly
     * ISO-string bounds on `createdAt` (the dev store keeps
     * timestamps as ISO; Date.parse is used for comparisons).
     */
    findMany(args: {
      where?: {
        actorId?: string;
        action?: string | { in: string[] };
        entityType?: string | { in: string[] };
        createdAt?: { gte?: string; lte?: string; lt?: string };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }): DevAuditEntry[] {
      const all = [...getStore().audit];
      const filtered = all.filter((row) => {
        if (args.where?.actorId && row.actorId !== args.where.actorId) {
          return false;
        }
        if (args.where?.action) {
          if (typeof args.where.action === 'string') {
            if (row.action !== args.where.action) return false;
          } else if (!args.where.action.in.includes(row.action)) {
            return false;
          }
        }
        if (args.where?.entityType) {
          if (typeof args.where.entityType === 'string') {
            if (row.entityType !== args.where.entityType) return false;
          } else if (!args.where.entityType.in.includes(row.entityType)) {
            return false;
          }
        }
        if (args.where?.createdAt) {
          const t = Date.parse(row.timestamp);
          if (
            args.where.createdAt.gte !== undefined &&
            t < Date.parse(args.where.createdAt.gte)
          ) {
            return false;
          }
          if (
            args.where.createdAt.lte !== undefined &&
            t > Date.parse(args.where.createdAt.lte)
          ) {
            return false;
          }
          if (
            args.where.createdAt.lt !== undefined &&
            t >= Date.parse(args.where.createdAt.lt)
          ) {
            return false;
          }
        }
        return true;
      });
      const dir = args.orderBy?.createdAt === 'asc' ? 1 : -1;
      filtered.sort((a, b) => dir * (a.timestamp < b.timestamp ? -1 : 1));
      return args.take !== undefined
        ? filtered.slice(0, args.take)
        : filtered;
    },
  },
  session: {
    create(args: {
      data: Omit<DevSession, 'id' | 'createdAt' | 'lastSeenAt'>;
    }): DevSession {
      const id = `ses_${randomUUID().slice(0, 24)}`;
      const now = nowIso();
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
        createdAt: nowIso(),
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
        flaggedAt: nowIso(),
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
        createdAt: nowIso(),
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
    /**
     * SECURITY_AUDIT finding #6 — consume a challenge.
     *
     * A WebAuthn challenge is a one-shot nonce. Once it has
     * authorised a write it must not authorise another one: a
     * single assertion is a proof of possession at one moment,
     * not a bearer token for the next five minutes.
     *
     * The row is deleted rather than flagged, so the deletion is
     * visible to `findLatest` — a stale row that merely *looked*
     * consumed would still satisfy the guard.
     */
    consume(args: { id: string; userId: string }): boolean {
      const store = getStore();
      const row = store.webAuthnChallenges.get(args.id);
      if (!row || row.userId !== args.userId) return false;
      store.webAuthnChallenges.delete(args.id);
      return true;
    },
  },
};

export interface DevTicketWithTrail extends DevTicket {
  trail: DevTrailEntry[];
  /**
   * Bolt 007-001: photos joined inline (the dev store does not
   * implement Prisma's `include`; it mirrors the join shape).
   * Ordered by `uploadedAt` ASC. The serializer partitions this
   * into `beforePhotoUrls` (role === 'citizen') and
   * `afterPhotoUrls` (role === 'crew'). Empty array when the
   * ticket has no photos.
   */
  photos: DevTicketPhoto[];
  // Denormalised from the ticket's category.departmentId for
  // dispatcher/crew scope checks. The Prisma ticket model
  // does not store this directly; the dev store mirrors the
  // join inline so the route layer can do `withTrail.departmentId`
  // without a second lookup.
  departmentId: string | null;
  /**
   * Denormalised from the ticket's ward. The Prisma ticket
   * model exposes this via the `ward` relation; the dev store
   * mirrors the join inline so the route layer can render the
   * citizen-facing label without a second lookup.
   */
  wardName: string | null;
  wardNameBn: string | null;
  /**
   * Bolt 008-002 — Story 002: denormalised city + reporter
   * display names so the route layer can render
   * `Dhaka North City Corporation` / `Rahim` without a second
   * round-trip. The serializer exposes these on every role
   * (city names are not PII; the reporter is the citizen
   * themselves on the citizen branch, so the dispatcher's view
   * is the only path that needs to anonymise — and that
   * anonymisation already lives in the serializer's actor
   * field, not in the underlying data).
   */
  cityName: string | null;
  cityNameBn: string | null;
  reporterName: string | null;
  /**
   * Denormalised category display fields, mirrored from the
   * `category` join so the dev-store and Prisma paths return the
   * same shape. `categorySlug` is the machine key the staff
   * surfaces switch on to pick a glyph.
   */
  categorySlug: string | null;
  categoryName: string | null;
  categoryNameBn: string | null;
}

export function getTicketWithTrail(id: string): DevTicketWithTrail | null {
  const t = devDb.ticket.findUnique({ where: { id } });
  if (!t) return null;
  const trail = getStore()
    .trail.filter((e) => e.ticketId === id)
    .sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const category = devDb.category.findUnique({ where: { id: t.categoryId } });
  const ward = devDb.ward.findUnique({ where: { id: t.wardId } });
  const city = devDb.city.findUnique({ where: { id: t.cityId } });
  const reporter = devDb.user.findUnique({ where: { id: t.reporterId } });
  const photos = devDb.ticketPhoto.findManyForTicket({ ticketId: id });
  return {
    ...t,
    trail,
    photos,
    departmentId: category?.departmentId ?? null,
    wardName: ward?.name ?? null,
    wardNameBn: ward?.nameBn ?? null,
    cityName: city?.name ?? null,
    cityNameBn: city?.nameBn ?? null,
    reporterName: reporter?.name ?? null,
    categorySlug: category?.slug ?? null,
    categoryName: category?.name ?? null,
    categoryNameBn: category?.nameBn ?? null,
  };
}
