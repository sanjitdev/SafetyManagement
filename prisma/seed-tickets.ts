/**
 * The demo report dataset — prisma/seed-tickets.ts
 *
 * Implements the dataset specified in `seed_data/cityfix-dhaka-seed-data.md`:
 * the 12 narrative reports (CF-1001..CF-1012), the 6 demo citizens
 * (CIT-01..CIT-06), and the 10 edge-case scenarios from §11.
 *
 * Called from `prisma/seed.ts` (which owns the city, departments,
 * categories, wards, crews and staff personas). This file owns
 * everything from the citizen level down: the demo citizens, the
 * tickets, their status trails, their photos and their audit rows.
 *
 * ── THE SPEC'S 8 CATEGORIES, THE DB'S 5 ───────────────────────────
 *
 * The spec names 8 categories (Drainage & sewerage, Roads &
 * infrastructure, Waste management, Electrical maintenance, Water
 * supply, Public safety, Traffic infrastructure, Public sanitation).
 * The database has 5 category slugs, seeded in `prisma/seed.ts`:
 *
 *     streetlight | pothole | drainage | garbage | other
 *
 * The user's decision was to map the spec's categories onto the
 * existing 5 WITHOUT changing the schema. The mapping is:
 *
 *     Drainage & sewerage      → drainage
 *     Roads & infrastructure   → pothole
 *     Waste management         → garbage
 *     Electrical maintenance   → streetlight
 *     Water supply             → other
 *     Public safety            → other
 *     Traffic infrastructure   → other
 *     Public sanitation        → other
 *
 * The spec itself sanctions this: "Adapt property names and enum values
 * to the actual CityFix schema." The spec's `category` and
 * `subcategory` both fold into the single `categoryId` FK; the
 * subcategory survives in the ticket `note`.
 *
 * ── THE SPEC'S 5 STATUSES, THE DB'S 6 ─────────────────────────────
 *
 * The spec's vocabulary is Reported → Verified → Assigned → In Progress
 * → Resolved. The database's `TicketStatus` enum is:
 *
 *     submitted | routed | in_progress | resolved | closed | cancelled
 *
 * There is no `verified` and no `assigned` status. Both collapse into
 * `routed`; the distinction survives in the TRAIL NOTE text (the
 * `TicketTrailEntry.note` column) and in the non-persisted
 * `specStatus` field on each report below. The spec's target
 * distribution — Reported 3, Verified 2, Assigned 2, In Progress 3,
 * Resolved 2 — is asserted against `specStatus` at the end of the seed,
 * so the demo still reads as the spec describes even though the DB
 * column is coarser.
 *
 * ── THE SPEC'S FIELDS, THE DB'S COLUMNS ────────────────────────────
 *
 *     title + description     → `note` (folded together)
 *     priority                → `internalNote` (folded with the
 *                                dispatcher's notes)
 *     isVerified / verifiedBy → the trail note + the audit row
 *     slaHours / dueAt        → NOT seeded. `SlaPolicy` rows already
 *                                exist per category; see the note on
 *                                `docs/PRODUCTION_READINESS_CHECKLIST.md`
 *                                blocker 9 — the policy rows are written
 *                                and never read.
 *     location.cityCorporation→ folded into `locationLabel`
 *                                (DSCC / DNCC) — there is no
 *                                `cityCorporation` column and adding one
 *                                is a schema change.
 *     source                  → implied by `reporterId` being a citizen
 *     comments                → NOT seeded. There is no comment table.
 *                                The spec's comments are represented as
 *                                trail notes, which is what the
 *                                citizen-facing status trail already is.
 *     notifications            → NOT seeded. Push notifications are a
 *                                runtime concern with no table.
 *     crew availability        → NOT seeded. There is no availability
 *                                table; availability is expressed by
 *                                whether `assignedCrewId` is set.
 *
 * ── WHY DIRECT PRISMA WRITES, NOT `transitionTicket()` ─────────────
 *
 * `lib/platform/transitions.ts` cannot be used for a seed, for three
 * reasons:
 *
 *   1. It stamps `resolvedAt` with `new Date()`, which would make the
 *      dataset non-deterministic.
 *   2. It cannot express the REOPENED edge case (§11.7) — the ALLOWED
 *      map has no edge out of `resolved`.
 *   3. Its compare-and-swap `updateMany({ where: { id, status, version } })`
 *      cannot set `locationLabel` / `wardId` / `note` in the same call,
 *      which a seed needs to do.
 *
 * So the trail rows and the ticket rows are written directly, inside the
 * same transaction, with `version` set to the number of status changes
 * the ticket went through — matching what the runtime path would have
 * produced.
 *
 * ── THE TRAIL IS A STATUS HISTORY, AND ONLY THAT ───────────────────
 *
 * Writing trail rows directly means nothing else would stop the seed
 * from writing a trail the runtime could never have produced. So the
 * seed mirrors the ALLOWED map from `lib/platform/transitions.ts` and
 * ASSERTS every trail it writes is a legal edge, before any write
 * happens. A typo in a trail fails the seed loudly.
 *
 * This caught a real bug while the dataset was being built: EDGE-05
 * ("reassigned to another crew") was modelled as a SECOND `routed`
 * step — a `routed → routed` transition the ALLOWED map does not have,
 * because "moving into routed" twice is not a thing. It is now
 * recorded the way the runtime records a crew change
 * (`lib/dispatcher/assign-crew.ts`): an audit row with the action
 * `ticket.assign_crew` and the before/after crew ids, and NO trail
 * row, because the status did not move.
 *
 * Exactly ONE trail edge in the dataset is outside the ALLOWED map:
 * EDGE-07's reopen out of `resolved` (§11.7). It is named explicitly
 * in `LEGAL_EXCEPTIONS`, and the seed asserts that every entry in
 * that list is actually used — so an exception cannot be added to
 * launder a future bug, and a bug cannot hide behind one.
 *
 * ── DETERMINISM ────────────────────────────────────────────────────
 *
 * Every timestamp is derived from a fixed anchor rather than the wall
 * clock, so the dataset is byte-identical across runs (the spec asks
 * for this in §12: "Keep demo data generation deterministic where
 * possible, using a fixed seed so screenshots and automated tests are
 * reproducible").
 *
 * The anchor is 2026-11-09T03:15:00Z, which is the `createdAt` of
 * CF-1001 in the spec's §8 example record.
 *
 * Where the spec states an EXPLICIT timestamp, that timestamp wins
 * over the derived one: CF-1001's `verifiedAt`
 * (2026-11-09T04:30:00Z) and `updatedAt` (2026-11-10T08:20:00Z) are
 * the spec's own values, converted from the +06:00 offsets it uses.
 *
 * ONE CAVEAT, inherent to a fixed anchor: `computeStats` in
 * `app/api/v1/activity/public/route.ts` computes `reportsThisMonth` from
 * the WALL CLOCK. The seeded reports therefore show up in the
 * "reports this month" stat until 2026-12-01, after which that stat
 * reads 0. This is a property of the fixed anchor, not a bug in the
 * stat, and the seed prints a warning about it.
 */

import type { Prisma, TicketStatus } from '@prisma/client';
import { hash } from '@node-rs/argon2';
import { seedPhotoUrl } from '@/lib/dev-store/seed-photo';
import { DHAKA_CENTER } from '@/lib/geo/constants';

/**
 * Argon2id parameters — MUST match `lib/auth/password.ts` and
 * `prisma/seed.ts`. A hash made with different parameters will not
 * verify.
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

/** The demo password for every seeded citizen: `12345678`. */
const DEMO_PASSWORD = '12345678';

/**
 * The fixed timestamp anchor. Every seeded timestamp is derived from
 * this, so re-running the seed produces identical data.
 */
const ANCHOR_MS = Date.parse('2026-11-09T03:15:00.000Z');

/** Hours → a Date `hoursAgo` before the anchor. */
function at(hoursAgo: number): Date {
  return new Date(ANCHOR_MS - hoursAgo * 3_600_000);
}

/**
 * A trail step's timestamp, given the report's creation time.
 *
 * `afterH` is the number of hours AFTER the report was created. The
 * authoring order down a trail is therefore naturally increasing
 * (submitted → routed → in_progress → resolved), which is what a
 * reader expects, and the resulting timestamps are monotonically
 * increasing — the property the citizen-facing status trail depends on
 * when it sorts by `timestamp`.
 */
function stepAt(createdMs: number, afterH: number): Date {
  return new Date(createdMs + afterH * 3_600_000);
}

// =====================================================================
// Localities (spec §2)
// =====================================================================

/**
 * The demo ward — the single ward every seeded ticket, demo citizen
 * and staff persona lives in.
 *
 * ── WHY ONE WARD, AND WHY THIS ONE ─────────────────────────────────
 *
 * The ward is not decoration: it is the app's authorisation
 * boundary. Three separate surfaces scope on it:
 *
 *   - `GET /api/v1/dispatcher/queue` drops any ticket whose
 *     `wardId` is not the dispatcher's (`app/api/v1/dispatcher/
 *     queue/route.ts:128`);
 *   - `GET /api/v1/crew/tickets` drops any ticket whose `wardId` is
 *     not the crew member's (`app/api/v1/crew/tickets/route.ts:168`);
 *   - `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` refuses
 *     to assign a crew member whose `wardId` differs from the
 *     ticket's (`lib/dispatcher/assign-crew.ts:122`).
 *
 * `User.wardId` is a SINGLE column. A crew member therefore serves
 * exactly one ward, and every ticket assigned to them must live in
 * that ward. The spec's dataset spreads 22 reports across 10 named
 * localities and three crew members — a shape the one-ward-per-staff
 * model cannot express. Keeping the localities' real ward numbers
 * would have produced a dataset the app itself would refuse to
 * create: `assign-crew` would reject every single assignment.
 *
 * Ward 14 is the ward the persona spec already pins ("Ward 14, the
 * ward the persona spec says he lives in" —
 * `tests/unit/ward-routing-regression.test.ts:16`). It is also the
 * ward every seeded ticket lives in in the in-memory dev store
 * (`tests/unit/dispatcher/monitor.test.ts:39`: "Every seeded ticket
 * lives in ward_14"), and the ward the whole Playwright + Vitest
 * suite is written against. Putting the DB seed in the same ward is
 * what makes the two backends behave identically — the whole point
 * of the seed.
 *
 * The localities KEEP their own identity: the name, the Bangla
 * name, the DSCC/DNCC corporation and the coordinates are all still
 * per-locality (the coordinates are hand-placed offsets from
 * `DHAKA_CENTER`, per the user's decision). What a locality no
 * longer carries is a WARD — the ward is the demo jurisdiction, and
 * the locality is where inside it the problem is.
 *
 * Jamal STAYS in ward 20. That is deliberate and load-bearing: it
 * is what makes the cross-ward reject path testable — a dispatcher
 * trying to assign a ward-20 crew member to a ward-14 ticket gets
 * `403 cross_ward_access_denied` (`tests/unit/dispatcher/
 * assign-crew.test.ts:202`). No seeded ticket is assigned to him,
 * so he has no tickets in ward 20 and never appears in a ward-14
 * crew list.
 */
const DEMO_WARD_NUMBER = 14;

/**
 * The spec's 10 locations.
 *
 * The spec asks for "the full address, locality, city and
 * city-corporation identifier" to be stored separately. There is no
 * `cityCorporation` column and no separate location table, so the
 * corporation (DSCC / DNCC) is folded into `locationLabel` — the
 * string is "Locality, Dhaka (DSCC)" rather than a plain locality name.
 *
 * Every locality sits in `DEMO_WARD_NUMBER` — see the constant's
 * docblock for why the ward is not per-locality.
 */
interface Locality {
  /** The spec's location name, used as the lookup key. */
  name: string;
  /** The city's ward this locality sits in. */
  wardNumber: number;
  /** The label as the citizen sees it — locality + corporation. */
  label: string;
  /** The Bangla label. */
  labelBn: string;
  /** DSCC or DNCC, per the spec's "suggested city corporation". */
  corporation: 'DSCC' | 'DNCC';
}

const LOCALITIES: Record<string, Locality> = {
  'Dhanmondi 27': {
    name: 'Dhanmondi 27',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Dhanmondi 27, Dhaka (DSCC)',
    labelBn: 'ধানমন্ডি ২৭, ঢাকা (ডিএসসিসি)',
    corporation: 'DSCC',
  },
  'Green Road': {
    name: 'Green Road',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Green Road, Dhaka (DSCC)',
    labelBn: 'গ্রীন রোড, ঢাকা (ডিএসসিসি)',
    corporation: 'DSCC',
  },
  'New Market': {
    name: 'New Market',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'New Market, Dhaka (DSCC)',
    labelBn: 'নিউ মার্কেট, ঢাকা (ডিএসসিসি)',
    corporation: 'DSCC',
  },
  Kazipara: {
    name: 'Kazipara',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Kazipara, Dhaka (DNCC)',
    labelBn: 'কাজীপাড়া, ঢাকা (ডিএনসিসি)',
    corporation: 'DNCC',
  },
  Shewrapara: {
    name: 'Shewrapara',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Shewrapara, Dhaka (DNCC)',
    labelBn: 'শেওরপাড়া, ঢাকা (ডিএনসিসি)',
    corporation: 'DNCC',
  },
  'Mirpur 10': {
    name: 'Mirpur 10',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Mirpur 10, Dhaka (DNCC)',
    labelBn: 'মিরপুর ১০, ঢাকা (ডিএনসিসি)',
    corporation: 'DNCC',
  },
  Badda: {
    name: 'Badda',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Badda, Dhaka (DNCC)',
    labelBn: 'বাড্ডা, ঢাকা (ডিএনসিসি)',
    corporation: 'DNCC',
  },
  'Mohammadpur Town Hall': {
    name: 'Mohammadpur Town Hall',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Mohammadpur Town Hall, Dhaka (DNCC)',
    labelBn: 'মোহাম্মদপুর টাউন হল, ঢাকা (ডিএনসিসি)',
    corporation: 'DNCC',
  },
  Rampura: {
    name: 'Rampura',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Rampura, Dhaka (DSCC)',
    labelBn: 'রামপুরা, ঢাকা (ডিএসসিসি)',
    corporation: 'DSCC',
  },
  Fakirapool: {
    name: 'Fakirapool',
    wardNumber: DEMO_WARD_NUMBER,
    label: 'Fakirapool, Dhaka (DSCC)',
    labelBn: 'ফাকিরপুল, ঢাকা (ডিএসসিসি)',
    corporation: 'DSCC',
  },
};

// =====================================================================
// Demo citizens (spec §7)
// =====================================================================

/**
 * The spec's six demo citizens. `citizenId` is the spec's `CIT-0N`;
 * `id` is the database's primary key.
 *
 * ── THE PHONE BLOCK ────────────────────────────────────────────────
 *
 * The phone block `+880199000000N` is deliberately distinct from the
 * personas' `+880171100000N` block and from the `+88017…` mid-range
 * used by the "Probe" test users — `User.phone` is unique per city.
 *
 * The block is THIRTEEN digits, and that is load-bearing, not
 * cosmetic. The auth routes validate the phone against
 * `/^\+8801[0-9]{9}$/` (`app/api/v1/auth/login/route.ts:118`, and the
 * same rule in `register` and `verify-otp`): `+8801` plus NINE more
 * digits. A twelve-digit phone is well-formed-looking and unique, but
 * it is REJECTED at the login boundary — so a citizen with a
 * twelve-digit phone cannot log in at all, and the entire
 * citizen-facing surface (own reports, the status trail, the feedback
 * form) is unreachable. The first cut of this seed used
 * `+88019900000N` — twelve digits — which was clear of every collision
 * but unusable. `prisma/seed-tickets.ts` now asserts the shape of
 * every phone it writes, so this cannot regress silently.
 *
 * The NIDs are fictional values, padded so they pass the 10-digit
 * format the registration policy expects.
 */
interface CitizenSeed {
  id: string;
  citizenId: string;
  name: string;
  nameBn: string;
  phone: string;
  nid: string;
  /** The locality the citizen lives in — sets their ward scope. */
  locality: string;
}

const CITIZENS: CitizenSeed[] = [
  {
    id: 'seed_cit_01',
    citizenId: 'CIT-01',
    name: 'Rahim Uddin',
    nameBn: 'রহিম উদ্দিন',
    phone: '+8801990000001',
    nid: '1990000001',
    locality: 'Dhanmondi 27',
  },
  {
    id: 'seed_cit_02',
    citizenId: 'CIT-02',
    name: 'Nusrat Jahan',
    nameBn: 'নুসরাত জাহান',
    phone: '+8801990000002',
    nid: '1990000002',
    locality: 'Green Road',
  },
  {
    id: 'seed_cit_03',
    citizenId: 'CIT-03',
    name: 'Tanvir Ahmed',
    nameBn: 'তানভীর আহমেদ',
    phone: '+8801990000003',
    nid: '1990000003',
    locality: 'Mirpur 10',
  },
  {
    id: 'seed_cit_04',
    citizenId: 'CIT-04',
    name: 'Sadia Islam',
    nameBn: 'সাদিয়া ইসলাম',
    phone: '+8801990000004',
    nid: '1990000004',
    locality: 'Badda',
  },
  {
    id: 'seed_cit_05',
    citizenId: 'CIT-05',
    name: 'Mahmud Hasan',
    nameBn: 'মাহমুদ হাসান',
    phone: '+8801990000005',
    nid: '1990000005',
    locality: 'Mohammadpur Town Hall',
  },
  {
    id: 'seed_cit_06',
    citizenId: 'CIT-06',
    name: 'Farzana Akter',
    nameBn: 'ফারজানা আক্তার',
    phone: '+8801990000006',
    nid: '1990000006',
    locality: 'Rampura',
  },
];

// =====================================================================
// Report + trail + photo shapes
// =====================================================================

/**
 * The spec's five-stage vocabulary. NOT a database column — it lives
 * only in the trail notes and in the distribution assertion at the end
 * of the seed.
 */
type SpecStatus =
  | 'Reported'
  | 'Verified'
  | 'Assigned'
  | 'In Progress'
  | 'Resolved';

/** One step of a ticket's status history. */
interface TrailStep {
  /** The status the ticket moved INTO. */
  toStatus: TicketStatus;
  /** Who acted — the citizen, the dispatcher, the crew, or the admin. */
  actorId: string;
  /** The note — where the spec's finer-grained stage names live. */
  note: string;
  /**
   * Hours AFTER the report was created. The authoring order down a
   * trail is naturally increasing, and so are the timestamps it
   * produces.
   *
   * FRACTIONAL values are allowed and are used where the spec states
   * an exact timestamp — CF-1001's `verifiedAt` is 1h15m after
   * creation, which is `1.25`. Round numbers are used everywhere
   * else, where the spec gives no explicit time.
   */
  afterH: number;
}

/** One photo attached to a ticket. */
interface PhotoSpec {
  /** 'citizen' = the "before" set; 'crew' = the "after" set. */
  role: 'citizen' | 'crew';
  /** The seed index for `seedPhotoUrl` — varies the generated image. */
  seed: number;
  /** Hours AFTER the report was created. */
  afterH: number;
}

/**
 * A crew reassignment — the job moving to a different crew member
 * WITHOUT the ticket's status changing.
 *
 * This is NOT a trail step. The trail is a STATUS history: every row
 * on it records a move into a status, and the ALLOWED transition map
 * has no `routed → routed` edge because there is no such thing as
 * "moving into routed" twice.
 *
 * The runtime records a crew change the way
 * `lib/dispatcher/assign-crew.ts` records it: an AUDIT row with the
 * action `ticket.assign_crew` and the before/after crew ids, and no
 * trail row at all. The seed does the same, so EDGE-05 ("reassigned to
 * another crew") reads on the citizen's status trail exactly as it
 * would if a dispatcher had really reassigned the job — the trail
 * shows `submitted → routed` and the assignment change lives in the
 * audit log where the runtime puts it.
 */
interface ReassignmentSpec {
  /** Who made the change — the dispatcher, in the runtime's case. */
  actorId: string;
  /** The crew member the job was taken FROM. */
  fromCrewId: string;
  /** The crew member the job was given TO. */
  toCrewId: string;
  /** The note recorded with the change. */
  note: string;
  /** Hours AFTER the report was created. */
  afterH: number;
}

/** One report, in the seed's own vocabulary. */
interface SeedReport {
  /** The database primary key — stable, so the seed is idempotent. */
  id: string;
  /** The spec's reference (CF-1001, EDGE-01) — used in notes. */
  ref: string;
  /** The spec's status stage. */
  specStatus: SpecStatus;
  /** The database status this collapses to. */
  status: TicketStatus;
  /** One of the 5 category slugs. */
  categorySlug: string;
  /** The locality key into LOCALITIES. */
  locality: string;
  /** The citizen who reported it. */
  reporterId: string;
  /** The crew member assigned, if any. */
  assignedCrewId: string | null;
  /** Title + description, folded into `note`. */
  note: string;
  /** Priority + dispatcher notes, folded into `internalNote`. */
  internalNote: string | null;
  /** The citizen's post-resolution feedback. */
  feedback: string | null;
  /** Why the ticket was closed. */
  closeReason: string | null;
  /** The ticket this one duplicates, if any. */
  duplicateOfId: string | null;
  /**
   * Hours before the anchor the ticket was created. Larger = older.
   * This is the report's `createdAt`.
   */
  createdOffsetH: number;
  /**
   * Hours AFTER creation the ticket was resolved — null if not
   * resolved. This is the report's `resolvedAt`.
   */
  resolvedAfterH: number | null;
  /** The ordered status history. */
  trail: TrailStep[];
  /** The photos. */
  photos: PhotoSpec[];
  /**
   * Crew reassignments — status-preserving changes to who is doing
   * the job. Written as audit rows, NOT as trail rows. See
   * `ReassignmentSpec`.
   */
  reassignments?: ReassignmentSpec[];
}

// =====================================================================
// The staff personas the seed acts as
// =====================================================================

/**
 * The ALLOWED transition map, mirrored from
 * `lib/platform/transitions.ts:71-78`.
 *
 * The seed writes trail rows DIRECTLY, so nothing else would stop it
 * from writing an illegal transition. This map is the guard: the
 * seed asserts every trail it writes is a legal edge, so a typo in a
 * trail (or a "reassignment" mistakenly modelled as a second
 * `routed` step) fails the seed loudly instead of shipping a trail
 * the runtime could never have produced.
 *
 * ONE DELIBERATE EXCEPTION: EDGE-07's reopen out of `resolved`. The
 * ALLOWED map has no edge out of `resolved` at all, so the seed
 * writes that one row directly and names it explicitly in
 * `LEGAL_EXCEPTIONS`.
 */
const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  submitted: ['routed', 'cancelled'],
  routed: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  closed: [],
  cancelled: [],
};

/**
 * The trail edges the seed writes that are NOT in the ALLOWED map.
 *
 * Each entry names the report and the exact edge it writes. The
 * assertion below checks that this list is exactly the set of illegal
 * edges the dataset contains — so an entry cannot be quietly added
 * (to launder an accidental bug), and an accidental illegal edge
 * cannot be quietly written (it fails the assertion).
 */
const LEGAL_EXCEPTIONS: Array<{ ref: string; from: TicketStatus; to: TicketStatus }> = [
  // §11.7 — a reopened report. The status machine has no edge out of
  // `resolved`, so this row is written directly.
  { ref: 'EDGE-07', from: 'resolved', to: 'in_progress' },
];

/**
 * Assert that a report's trail is a sequence of legal transitions.
 *
 * The first step of every trail is `submitted` (the report's
 * creation). Every subsequent step must be an edge in the ALLOWED
 * map, unless it is one of the documented `LEGAL_EXCEPTIONS`.
 *
 * Throws with the offending report and edge, so a failure names the
 * problem rather than just failing the count.
 */
function assertLegalTrail(report: SeedReport): void {
  let from: TicketStatus = 'submitted';
  for (let i = 0; i < report.trail.length; i += 1) {
    const step = report.trail[i];
    const to = step.toStatus;

    if (i === 0) {
      if (to !== 'submitted') {
        throw new Error(
          `seed-tickets: ${report.ref} trail must start at "submitted", found "${to}".`,
        );
      }
      from = to;
      continue;
    }

    const isAllowed = ALLOWED_TRANSITIONS[from].includes(to);
    const isException = LEGAL_EXCEPTIONS.some(
      (e) => e.ref === report.ref && e.from === from && e.to === to,
    );

    if (!isAllowed && !isException) {
      throw new Error(
        `seed-tickets: ${report.ref} trail step ${i + 1} is an illegal transition ` +
          `"${from}" → "${to}". The ALLOWED map does not have that edge. ` +
          'If this is intentional, add it to LEGAL_EXCEPTIONS with a reason.',
      );
    }
    from = to;
  }
}

/**
 * Assert that the declared `LEGAL_EXCEPTIONS` are all actually used.
 *
 * Without this, an exception could be added to the list "just in case"
 * and would silently license a future illegal edge on that report.
 * The exception must be exercised by the dataset to be real.
 */
function assertExceptionsAreUsed(reports: SeedReport[]): void {
  for (const exception of LEGAL_EXCEPTIONS) {
    const report = reports.find((r) => r.ref === exception.ref);
    if (!report) {
      throw new Error(
        `seed-tickets: LEGAL_EXCEPTIONS names ${exception.ref}, which is not in the dataset.`,
      );
    }
    const used = report.trail.some((step, i) => {
      if (i === 0) return false;
      const from = report.trail[i - 1].toStatus;
      return from === exception.from && step.toStatus === exception.to;
    });
    if (!used) {
      throw new Error(
        `seed-tickets: LEGAL_EXCEPTIONS names the edge ` +
          `"${exception.from}" → "${exception.to}" for ${exception.ref}, ` +
          'but that edge is not in the report\'s trail. Remove the exception.',
      );
    }
  }
}

/**
 * The acting staff. These are the EXISTING personas seeded by
 * `prisma/seed.ts` — the seed reuses them rather than creating new
 * dispatchers, crews or admins (the user's decision).
 *
 * The spec's own roster (DISP-01, DISP-02, CREWUSER-01..04) is not
 * created: the database has 2 seeded `Crew` rows and 3 crew personas,
 * and adding staff would contradict the "keep existing staff" decision.
 */
const ACTORS = {
  dispatcher: 'user_dispatcher_habib',
  admin: 'user_admin_anwar',
  crewStreetlight: 'user_crew_rashid',
  crewRoads: 'user_crew_karim',
  crewOther: 'user_crew_jamal',
} as const;

/**
 * ── WHERE A SEEDED TICKET LIVES, AND WHO CAN SEE IT ─────────────────
 *
 * The ward is an authorisation boundary, not decoration. Three
 * surfaces scope on it and one scopes on the department:
 *
 *   - `GET /api/v1/dispatcher/queue` — ticket.wardId must equal the
 *     dispatcher's ward, and the ticket's category department must
 *     equal the dispatcher's department (`app/api/v1/dispatcher/
 *     queue/route.ts:128-137`);
 *   - `GET /api/v1/crew/tickets` — same two checks, against the crew
 *     member (`app/api/v1/crew/tickets/route.ts:167-177`);
 *   - `PATCH /api/v1/dispatcher/tickets/[id]/assign-crew` — the chosen
 *     crew member's ward must equal the ticket's ward
 *     (`lib/dispatcher/assign-crew.ts:122`), and their department
 *     must equal the ticket's category department
 *     (`lib/dispatcher/assign-crew.ts:143-153`).
 *
 * `User.wardId` is a SINGLE column, so a crew member serves exactly
 * one ward and can only hold tickets in that ward. That is what
 * fixes the seed's shape: **a ticket lives in the ward of the crew
 * member who holds it**, and an unassigned ticket lives in the
 * dispatcher's ward, because that is where it waits to be triaged.
 *
 * The three crew personas have three different scopes, and the
 * dataset is spread across them to make every staff surface
 * reachable:
 *
 *   | crew    | ward | department          | holds            |
 *   |---------|------|---------------------|------------------|
 *   | Rashid  | 14   | streetlight         | streetlight jobs |
 *   | Karim   | 14   | roads & drainage    | drainage + roads |
 *   | Jamal   | 20   | waste management    | the waste jobs   |
 *
 * Jamal's ward 20 is not arbitrary: it is what keeps the cross-ward
 * reject path testable — a dispatcher trying to assign a ward-20
 * crew member to a ward-14 ticket gets `403
 * cross_ward_access_denied` (`tests/unit/dispatcher/
 * assign-crew.test.ts:202`). It is also why the seed cannot put
 * EVERY ticket in one ward: the dataset needs a ticket in a ward
 * other than the dispatcher's for that path to mean anything.
 *
 * The dispatcher's own scope (ward 14, streetlight maintenance) is
 * fixed by the persona spec and is mirrored verbatim by the in-memory
 * dev store (`lib/dev-store.ts`) — the Playwright suite asserts it
 * (`tests/21-dispatcher-crew-picker.spec.ts:88-89`). So the
 * dispatcher's triage queue holds the ward-14 streetlight reports and
 * the ward-14 no-department ("other") reports, and the ward-14
 * drainage reports sit with Karim. That is the app working as
 * designed, not a gap in the seed.
 */

/** The ward each crew persona is scoped to. */
const CREW_WARD: Record<string, number> = {
  'user_crew_rashid': DEMO_WARD_NUMBER, // 14
  'user_crew_karim': DEMO_WARD_NUMBER, // 14
  'user_crew_jamal': 20,
};

/**
 * The department each crew persona is scoped to, by DEPARTMENT SLUG
 * (the same slugs `prisma/seed.ts` uses when it seeds the
 * departments).
 *
 * The category → department mapping in `prisma/seed.ts` is:
 * `drainage` → roads-drainage, `pothole` → roads-drainage,
 * `garbage` → waste-management, `streetlight` → streetlight-
 * maintenance, `other` → (no department).
 */
const CREW_DEPARTMENT_SLUG: Record<string, string> = {
  'user_crew_rashid': 'streetlight-maintenance',
  'user_crew_karim': 'roads-drainage',
  'user_crew_jamal': 'waste-management',
};

/**
 * The category slugs each crew member can actually work — derived
 * from their department. A category with NO department (the "other"
 * bucket) is not department-scoped, so it is eligible for everyone.
 *
 * `lib/dispatcher/assign-crew.ts` and
 * `lib/dispatcher/list-crew-for-ward.ts` both treat a null-department
 * category as "anyone in the ward may take it", and this table
 * mirrors that exactly.
 */
const CATEGORY_DEPARTMENT_SLUG: Record<string, string | null> = {
  drainage: 'roads-drainage',
  pothole: 'roads-drainage',
  garbage: 'waste-management',
  streetlight: 'streetlight-maintenance',
  other: null,
};

/**
 * The ward a seeded ticket lives in.
 *
 * A ticket assigned to a crew member lives in THAT crew member's
 * ward — the only ward the app would ever let them be assigned, so
 * it is the only ward a seed may put it in. An unassigned ticket
 * lives in the dispatcher's ward, because that is where it waits to
 * be triaged.
 */
function wardForReport(report: SeedReport): number {
  if (report.assignedCrewId) {
    const ward = CREW_WARD[report.assignedCrewId];
    if (ward === undefined) {
      throw new Error(
        `seed-tickets: ${report.ref} is assigned to ${report.assignedCrewId}, ` +
          'which has no ward in CREW_WARD.',
      );
    }
    return ward;
  }
  return DEMO_WARD_NUMBER;
}

/**
 * Assert that an assignment is one the app would actually accept.
 *
 * `assign-crew` refuses a crew member whose ward differs from the
 * ticket's, and one whose department differs from the ticket's
 * category department. The seed writes rows directly, so nothing
 * else would stop it from writing an assignment the runtime would
 * reject — an assignment that then VANISHES from that crew member's
 * list, because the crew list applies the same two filters.
 *
 * This assertion is the reason the dataset's shape is what it is.
 */
function assertAssignable(report: SeedReport): void {
  if (!report.assignedCrewId) return;
  const crewId = report.assignedCrewId;

  const crewWard = CREW_WARD[crewId];
  if (crewWard === undefined) {
    throw new Error(
      `seed-tickets: ${report.ref} is assigned to ${crewId}, which is not a crew persona.`,
    );
  }

  const categoryDepartment = CATEGORY_DEPARTMENT_SLUG[report.categorySlug];
  if (categoryDepartment === undefined) {
    throw new Error(
      `seed-tickets: ${report.ref} has an unknown category "${report.categorySlug}".`,
    );
  }
  const crewDepartment = CREW_DEPARTMENT_SLUG[crewId];

  if (categoryDepartment !== null && crewDepartment !== categoryDepartment) {
    throw new Error(
      `seed-tickets: ${report.ref} (${report.categorySlug} → ` +
        `${categoryDepartment}) is assigned to ${crewId}, who is in ` +
        `${crewDepartment}. assign-crew would refuse this with ` +
        'cross_department_access_denied, and the crew list would hide ' +
        'the ticket from its own assignee.',
    );
  }

  // The ward check: a ticket assigned to a crew member must live in
  // that crew member's ward. `wardForReport` guarantees it, so this
  // assertion is about the function, not the data — but it is the
  // invariant the whole dataset hangs on, so it is checked.
  const ticketWard = wardForReport(report);
  if (ticketWard !== crewWard) {
    throw new Error(
      `seed-tickets: ${report.ref} is assigned to ${crewId} (ward ${crewWard}) ` +
        `but would live in ward ${ticketWard}. assign-crew would refuse this ` +
        'with cross_ward_access_denied.',
    );
  }
}

const SPEC_REPORTS: SeedReport[] = [
  {
    id: 'ticket_seed_cf_1001',
    ref: 'CF-1001',
    specStatus: 'In Progress',
    status: 'in_progress',
    categorySlug: 'drainage',
    locality: 'Dhanmondi 27',
    reporterId: 'seed_cit_01',
    assignedCrewId: 'user_crew_karim',
    note:
      'Severe waterlogging on Dhanmondi 27. Rainwater has accumulated on the road, making it difficult for pedestrians and vehicles to pass. Nearby roadside drainage appears blocked.',
    internalNote: 'Priority: Critical. Verified by the dispatcher; drainage response team assigned.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 0,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_01',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Verified — the report is actionable. Drainage Response assigned.',
        // The spec's §8 record gives `verifiedAt` as
        // 2026-11-09T10:30:00+06:00 = 2026-11-09T04:30:00Z. The
        // ticket was created at 2026-11-09T03:15:00Z, so the
        // verification is 1h15m later — 1.25 hours.
        afterH: 1.25,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_karim',
        note: 'Team arrived; initial inspection indicates a blocked drain.',
        // The spec's §8 record gives `updatedAt` as
        // 2026-11-10T14:20:00+06:00 = 2026-11-10T08:20:00Z, which
        // is this step's timestamp (and therefore the ticket's
        // `updatedAt`). From the 03:15:00Z creation that is 29h05m
        // later — 29.0833... hours.
        afterH: 29 + 5 / 60,
      },
    ],
    photos: [{ role: 'citizen', seed: 1001, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1002',
    ref: 'CF-1002',
    specStatus: 'Verified',
    status: 'routed',
    categorySlug: 'pothole',
    locality: 'Green Road',
    reporterId: 'seed_cit_02',
    assignedCrewId: null,
    note:
      'Large pothole near road junction on Green Road. The hole is deep enough to catch a motorcycle wheel and is right beside the bus stop.',
    internalNote: 'Priority: High. Verified by the dispatcher; awaiting crew assignment.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 12,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_02',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Verified — the report is actionable. Awaiting crew assignment.',
        afterH: 4,
      },
    ],
    photos: [{ role: 'citizen', seed: 1002, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1003',
    ref: 'CF-1003',
    specStatus: 'Assigned',
    status: 'routed',
    categorySlug: 'drainage',
    locality: 'New Market',
    reporterId: 'seed_cit_02',
    assignedCrewId: 'user_crew_karim',
    note:
      'Blocked roadside drainage on New Market. Water pools across the market entrance and the grate is packed with waste.',
    internalNote: 'Priority: High. Assigned to the drainage response team.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 20,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_02',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — department and crew selected for the drain clearance.',
        afterH: 6,
      },
    ],
    photos: [{ role: 'citizen', seed: 1003, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1004',
    ref: 'CF-1004',
    specStatus: 'Reported',
    status: 'submitted',
    categorySlug: 'pothole',
    locality: 'Kazipara',
    reporterId: 'seed_cit_03',
    assignedCrewId: null,
    note:
      'Broken road surface on Kazipara. A section of the carriageway has collapsed into potholes across the bus stop approach.',
    internalNote: 'Priority: Medium. Awaiting dispatcher review.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 30,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_03',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
    ],
    photos: [{ role: 'citizen', seed: 1004, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1005',
    ref: 'CF-1005',
    specStatus: 'In Progress',
    status: 'in_progress',
    categorySlug: 'garbage',
    locality: 'Shewrapara',
    reporterId: 'seed_cit_03',
    assignedCrewId: 'user_crew_jamal',
    note:
      'Overflowing roadside garbage at Shewrapara. Waste has not been collected for several days and is spilling into the drain.',
    internalNote: 'Priority: High. Sanitation team assigned.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 44,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_03',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — sanitation team selected for the site cleanup.',
        afterH: 3,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_jamal',
        note: 'Crew on site; clearing the bin and washing the kerb.',
        afterH: 14,
      },
    ],
    photos: [
      { role: 'citizen', seed: 1005, afterH: 0 },
      { role: 'citizen', seed: 1006, afterH: 0 },
    ],
  },
  {
    id: 'ticket_seed_cf_1006',
    ref: 'CF-1006',
    specStatus: 'Assigned',
    status: 'routed',
    categorySlug: 'streetlight',
    locality: 'Mirpur 10',
    reporterId: 'seed_cit_03',
    assignedCrewId: 'user_crew_rashid',
    note:
      'Non-functional streetlights in Mirpur 10. A whole stretch of the road has been dark since the last maintenance visit.',
    internalNote: 'Priority: Medium. Electrical team assigned.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 60,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_03',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — electrical team selected for the lamp inspection.',
        afterH: 4,
      },
    ],
    photos: [{ role: 'citizen', seed: 1007, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1007',
    ref: 'CF-1007',
    specStatus: 'Verified',
    status: 'routed',
    categorySlug: 'other',
    locality: 'Badda',
    reporterId: 'seed_cit_04',
    assignedCrewId: null,
    note:
      'Open roadside drain in Badda. The cover is missing and the exposed chamber is a hazard to pedestrians and motorcyclists.',
    internalNote: 'Priority: Critical. Public safety — escalated and verified. Awaiting crew assignment.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 72,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_04',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Verified — escalated as a critical public safety issue.',
        afterH: 2,
      },
    ],
    photos: [{ role: 'citizen', seed: 1008, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1008',
    ref: 'CF-1008',
    specStatus: 'Resolved',
    status: 'resolved',
    categorySlug: 'garbage',
    locality: 'Mohammadpur Town Hall',
    reporterId: 'seed_cit_05',
    assignedCrewId: 'user_crew_jamal',
    note:
      'Garbage accumulation near Mohammadpur Town Hall. The pile blocks the footpath outside the hall entrance.',
    internalNote: 'Priority: High. Sanitation team assigned.',
    feedback: 'Cleared promptly. Thank you.',
    closeReason: 'resolved',
    duplicateOfId: null,
    createdOffsetH: 96,
    resolvedAfterH: 22,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_05',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — sanitation team selected for the site cleanup.',
        afterH: 3,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_jamal',
        note: 'Crew arrived; collection started.',
        afterH: 14,
      },
      {
        toStatus: 'resolved',
        actorId: 'user_crew_jamal',
        note: 'Waste collected and the footpath swept. After-photos attached.',
        afterH: 22,
      },
    ],
    photos: [
      { role: 'citizen', seed: 1009, afterH: 0 },
      { role: 'crew', seed: 1010, afterH: 22 },
    ],
  },
  {
    id: 'ticket_seed_cf_1009',
    ref: 'CF-1009',
    specStatus: 'Reported',
    status: 'submitted',
    categorySlug: 'drainage',
    locality: 'Rampura',
    reporterId: 'seed_cit_06',
    assignedCrewId: null,
    note:
      'Waterlogging near Rampura intersection. Water stands across the junction after every rainfall.',
    internalNote: 'Priority: High. Awaiting dispatcher review.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 120,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_06',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
    ],
    photos: [{ role: 'citizen', seed: 1011, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1010',
    ref: 'CF-1010',
    specStatus: 'In Progress',
    status: 'in_progress',
    categorySlug: 'pothole',
    locality: 'Fakirapool',
    reporterId: 'seed_cit_06',
    assignedCrewId: 'user_crew_karim',
    note:
      'Damaged footpath at Fakirapool. Several slabs are cracked and lifted, which is dangerous for pedestrians at night.',
    internalNote: 'Priority: Medium. Road maintenance team assigned.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 144,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_06',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — road maintenance team selected for the footpath repair.',
        afterH: 4,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_karim',
        note: 'Crew started the footpath repair.',
        afterH: 16,
      },
    ],
    photos: [{ role: 'citizen', seed: 1012, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1011',
    ref: 'CF-1011',
    specStatus: 'Reported',
    status: 'submitted',
    categorySlug: 'other',
    locality: 'Dhanmondi 27',
    reporterId: 'seed_cit_01',
    assignedCrewId: null,
    note:
      'Exposed manhole cover at Dhanmondi 27. The cover is missing and the open chamber is on a busy footpath.',
    internalNote: 'Priority: Critical. Public safety. Awaiting dispatcher review.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 168,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_01',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
    ],
    photos: [{ role: 'citizen', seed: 1013, afterH: 0 }],
  },
  {
    id: 'ticket_seed_cf_1012',
    ref: 'CF-1012',
    specStatus: 'Resolved',
    status: 'resolved',
    categorySlug: 'other',
    locality: 'Kazipara',
    reporterId: 'seed_cit_03',
    assignedCrewId: 'user_crew_karim',
    note:
      'Water leakage from municipal pipe at Kazipara. Water is running continuously across the footpath.',
    internalNote: 'Priority: High. Water supply — routed to the roads team for the pipe repair.',
    feedback: 'Resolved, though the puddle came back the next day.',
    closeReason: 'resolved',
    duplicateOfId: null,
    createdOffsetH: 192,
    resolvedAfterH: 22,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_03',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — water supply issue routed to the roads team for the pipe repair.',
        afterH: 3,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_karim',
        note: 'Crew on site; the leaking joint was located.',
        afterH: 14,
      },
      {
        toStatus: 'resolved',
        actorId: 'user_crew_karim',
        note: 'Pipe joint repaired and the road resurfaced.',
        afterH: 22,
      },
    ],
    photos: [
      { role: 'citizen', seed: 1014, afterH: 0 },
      { role: 'crew', seed: 1015, afterH: 22 },
    ],
  },
];

/**
 * The 10 edge cases (spec §11)
 *
 * These exercise the status machine, the dedup path, the geofence and
 * the degraded paths. Each gets a trail sequence that is legal under
 * the ALLOWED map — except `edge_07` (the reopened issue), which has
 * no legal edge out of `resolved` and is therefore written directly.
 */
const EDGE_REPORTS: SeedReport[] = [
  {
    id: 'ticket_seed_edge_01',
    ref: 'EDGE-01',
    specStatus: 'Reported',
    status: 'cancelled',
    categorySlug: 'drainage',
    locality: 'Dhanmondi 27',
    reporterId: 'seed_cit_02',
    assignedCrewId: null,
    note:
      'Blocked drain at Dhanmondi 27. The same drain as the earlier report on this road — submitting anyway because the water has spread further.',
    internalNote: 'Duplicate — linked to the original report. Both submissions retained.',
    feedback: null,
    closeReason: 'duplicate',
    duplicateOfId: 'ticket_seed_cf_1001',
    createdOffsetH: 3,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_02',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'cancelled',
        actorId: 'user_dispatcher_habib',
        note: 'Duplicate — linked to the original report; the citizen submission is retained.',
        afterH: 2,
      },
    ],
    photos: [{ role: 'citizen', seed: 2001, afterH: 0 }],
  },
  {
    id: 'ticket_seed_edge_02',
    ref: 'EDGE-02',
    specStatus: 'Reported',
    status: 'cancelled',
    categorySlug: 'other',
    locality: 'Rampura',
    reporterId: 'seed_cit_05',
    assignedCrewId: null,
    note:
      'Streetlight not working on a service road outside the city corporation boundary.',
    internalNote: 'Rejected — the location is outside the city corporation service area.',
    feedback: null,
    closeReason: 'cancelled',
    duplicateOfId: null,
    createdOffsetH: 8,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_05',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'cancelled',
        actorId: 'user_dispatcher_habib',
        note: 'Rejected — the location is outside the city corporation service area.',
        afterH: 2,
      },
    ],
    photos: [],
  },
  {
    id: 'ticket_seed_edge_03',
    ref: 'EDGE-03',
    specStatus: 'In Progress',
    status: 'in_progress',
    categorySlug: 'other',
    locality: 'Badda',
    reporterId: 'seed_cit_06',
    assignedCrewId: 'user_crew_jamal',
    note:
      'Uncovered manhole on the Badda link road. The chamber is fully open to traffic.',
    internalNote: 'Priority: Critical. Public safety — escalated and given immediate attention.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 14,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_06',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Escalated as critical — safety barrier requested and crew dispatched.',
        afterH: 1,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_jamal',
        note: 'Crew on site; the chamber has been covered with a temporary plate.',
        afterH: 6,
      },
    ],
    photos: [{ role: 'citizen', seed: 2002, afterH: 0 }],
  },
  {
    id: 'ticket_seed_edge_04',
    ref: 'EDGE-04',
    specStatus: 'Verified',
    status: 'routed',
    categorySlug: 'drainage',
    locality: 'Fakirapool',
    reporterId: 'seed_cit_03',
    assignedCrewId: null,
    note:
      'Waterlogging at a low point in Fakirapool. Standing water since the last rainfall.',
    internalNote: 'Priority: High. Verified — waiting in the dispatch queue; no drainage crew is currently available.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 26,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_03',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Verified — waiting in the dispatch queue for an available crew.',
        afterH: 2,
      },
    ],
    photos: [],
  },
  {
    id: 'ticket_seed_edge_05',
    ref: 'EDGE-05',
    specStatus: 'Assigned',
    status: 'routed',
    categorySlug: 'garbage',
    locality: 'Shewrapara',
    reporterId: 'seed_cit_04',
    assignedCrewId: 'user_crew_jamal',
    note:
      'Missed waste collection in Shewrapara. Two days of household waste is uncollected.',
    internalNote: 'Priority: High. Reassigned — the original crew went off duty.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 34,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_04',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned to the first sanitation team.',
        afterH: 2,
      },
    ],
    photos: [],
    // The reassignment is NOT a trail step — the status did not move.
    // It is recorded as an audit row, exactly as the runtime's
    // `assignCrew` records it.
    reassignments: [
      {
        actorId: 'user_dispatcher_habib',
        fromCrewId: 'user_crew_karim',
        toCrewId: 'user_crew_jamal',
        note: 'Reassigned — the first crew went off duty; the job was transferred to another team.',
        afterH: 6,
      },
    ],
  },
  {
    id: 'ticket_seed_edge_06',
    ref: 'EDGE-06',
    specStatus: 'In Progress',
    status: 'in_progress',
    categorySlug: 'streetlight',
    locality: 'New Market',
    reporterId: 'seed_cit_06',
    assignedCrewId: 'user_crew_rashid',
    note:
      'A row of streetlights on the New Market service road has been out for over a week.',
    internalNote: 'Priority: Medium. Overdue — the resolution deadline has passed.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 240,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_06',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — electrical team selected for the lamp inspection.',
        afterH: 4,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_rashid',
        note: 'Crew started the lamp inspection; the transformer needs replacing.',
        afterH: 12,
      },
    ],
    photos: [{ role: 'citizen', seed: 2003, afterH: 0 }],
  },
  {
    id: 'ticket_seed_edge_07',
    ref: 'EDGE-07',
    specStatus: 'In Progress',
    status: 'in_progress',
    categorySlug: 'drainage',
    locality: 'Green Road',
    reporterId: 'seed_cit_02',
    assignedCrewId: 'user_crew_karim',
    note:
      'Drain still overflowing on Green Road after the earlier clearance.',
    internalNote: 'Priority: High. Reopened — the citizen disputes the resolution.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 280,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_02',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — drainage team selected for the drain clearance.',
        afterH: 3,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_karim',
        note: 'Crew arrived; the blockage was cleared.',
        afterH: 10,
      },
      {
        toStatus: 'resolved',
        actorId: 'user_crew_karim',
        note: 'Drain cleared and the site washed down.',
        afterH: 14,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_dispatcher_habib',
        note: 'Reopened — the citizen disputes the resolution; the drain is overflowing again.',
        afterH: 20,
      },
    ],
    photos: [
      { role: 'citizen', seed: 2004, afterH: 0 },
      { role: 'crew', seed: 2005, afterH: 14 },
    ],
  },
  {
    id: 'ticket_seed_edge_08',
    ref: 'EDGE-08',
    specStatus: 'Resolved',
    status: 'resolved',
    categorySlug: 'pothole',
    locality: 'Mohammadpur Town Hall',
    reporterId: 'seed_cit_01',
    assignedCrewId: 'user_crew_karim',
    note:
      'Pothole on the road outside Mohammadpur Town Hall.',
    internalNote: 'Priority: Medium. Awaiting citizen review of the crew completion evidence.',
    feedback: null,
    closeReason: 'resolved',
    duplicateOfId: null,
    createdOffsetH: 300,
    resolvedAfterH: 18,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_01',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Assigned — road maintenance team selected for the pothole repair.',
        afterH: 3,
      },
      {
        toStatus: 'in_progress',
        actorId: 'user_crew_karim',
        note: 'Crew arrived; the pothole was cut out ready for filling.',
        afterH: 10,
      },
      {
        toStatus: 'resolved',
        actorId: 'user_crew_karim',
        note: 'Pothole filled and rolled. Completion note and after-photo submitted for review.',
        afterH: 18,
      },
    ],
    photos: [
      { role: 'citizen', seed: 2006, afterH: 0 },
      { role: 'crew', seed: 2007, afterH: 18 },
    ],
  },
  {
    id: 'ticket_seed_edge_09',
    ref: 'EDGE-09',
    specStatus: 'Verified',
    status: 'routed',
    categorySlug: 'garbage',
    locality: 'Rampura',
    reporterId: 'seed_cit_04',
    assignedCrewId: 'user_crew_jamal',
    note:
      'Overflowing bin beside the Rampura footpath. Waste is spilling onto the pavement.',
    internalNote: 'Priority: Medium. Verified — a competing assignment was rejected by the version guard.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 320,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_04',
        note: 'Report submitted by the citizen.',
        afterH: 0,
      },
      {
        toStatus: 'routed',
        actorId: 'user_dispatcher_habib',
        note: 'Verified and assigned — a second dispatcher assignment was rejected by the version guard.',
        afterH: 4,
      },
    ],
    photos: [],
  },
  {
    id: 'ticket_seed_edge_10',
    ref: 'EDGE-10',
    specStatus: 'Reported',
    status: 'submitted',
    categorySlug: 'streetlight',
    locality: 'Rampura',
    reporterId: 'seed_cit_01',
    assignedCrewId: null,
    note:
      'Streetlight flickering near the Rampura junction.',
    internalNote: 'Priority: Medium. Low-confidence geocode — the address is incomplete and needs manual correction.',
    feedback: null,
    closeReason: null,
    duplicateOfId: null,
    createdOffsetH: 330,
    resolvedAfterH: null,
    trail: [
      {
        toStatus: 'submitted',
        actorId: 'seed_cit_01',
        note: 'Report submitted by the citizen — location given approximately; needs correction.',
        afterH: 0,
      },
    ],
    photos: [],
  },
];
/** All 22 reports, the spec's 12 first. */
export const ALL_REPORTS: SeedReport[] = [...SPEC_REPORTS, ...EDGE_REPORTS];

// =====================================================================
// The seed itself
// =====================================================================

/**
 * What `prisma/seed.ts` hands over.
 *
 * The maps are built in `prisma/seed.ts` during the city bootstrap and
 * are passed in rather than re-queried, so the ticket seed runs inside
 * the same transaction without a second round-trip.
 */
export interface SeedTicketsContext {
  cityId: string;
  /** Ward number → ward id. */
  wardByNumber: Map<number, string>;
  /** Category slug → category id. */
  categoryBySlug: Map<string, string>;
}

/**
 * The number of reports the seed must produce. Asserted at the end of
 * the run — a silent shortfall would leave the demo quietly wrong.
 */
const EXPECTED_REPORT_COUNT = 22;

/**
 * The spec's target distribution for the 12 narrative reports
 * (§4 "Suggested distribution for the initial 12 reports").
 */
const EXPECTED_SPEC_DISTRIBUTION: Record<SpecStatus, number> = {
  Reported: 3,
  Verified: 2,
  Assigned: 2,
  'In Progress': 3,
  Resolved: 2,
};

/**
 * A deterministic pseudo-random offset for a ticket's coordinates.
 *
 * The spec's §2 says "Do not make up latitude/longitude coordinates.
 * Resolve coordinates using a geocoding service and review the results."
 * The user's decision was to hand-place offsets from `DHAKA_CENTER`
 * instead — deterministic, and no network call in a seed script. The
 * offsets stay inside roughly a kilometre of the centre, which is the
 * span of the Dhaka localities the dataset covers.
 *
 * The function is a pure function of the ticket's id, so the same
 * ticket always lands on the same point.
 */
function coordinatesFor(id: string): { lat: number; lng: number } {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100_000;
  }
  // Offsets in the range ±0.008° lat (~±900 m) and ±0.010° lng.
  const latOffset = ((hash % 1601) - 800) / 100_000;
  const lngOffset = (((hash >> 3) % 2001) - 1000) / 100_000;
  return {
    lat: Number((DHAKA_CENTER.lat + latOffset).toFixed(6)),
    lng: Number((DHAKA_CENTER.lng + lngOffset).toFixed(6)),
  };
}

/**
 * Seed the demo dataset: the 6 citizens, the 22 reports, their status
 * trails, their photos and their audit rows.
 *
 * ── THE TRANSACTION ─────────────────────────────────────────────────
 *
 * The `prisma` argument MUST be a transaction client — the one handed
 * out by `prisma.$transaction(async (tx) => …)`. Everything below
 * runs inside it, so a failure anywhere rolls the whole thing back
 * and leaves no partial dataset behind.
 *
 * This is not a stylistic preference. The seed writes ~150 rows
 * across four tables, and its own assertions (the ticket count, the
 * spec distribution) run at the END. Without a transaction, a failure
 * on the last report would commit 21 reports, 54 trail rows and a
 * half-written trail for the 22nd — and the count assertion would
 * then fire on the NEXT run, reporting a shortfall that had already
 * been committed. The clear phase and the write phase therefore share
 * ONE transaction in `prisma/seed.ts`.
 *
 * The type is `Prisma.TransactionClient`, not `PrismaClient`, so the
 * compiler rejects a call that passes the root client — the mistake
 * this signature exists to prevent.
 */
export async function seedTickets(
  prisma: Prisma.TransactionClient,
  ctx: SeedTicketsContext,
): Promise<void> {
  const { cityId, wardByNumber, categoryBySlug } = ctx;

  // -- The transition legality check ------------------------------------
  //
  // Run BEFORE any write. The seed writes trail rows directly, so
  // nothing else would catch a trail that the runtime could never
  // have produced. Failing here means the database is never touched
  // with an illegal trail.
  assertExceptionsAreUsed(ALL_REPORTS);
  for (const r of ALL_REPORTS) {
    assertLegalTrail(r);
    assertAssignable(r);
  }

  // -- The demo citizens ------------------------------------------------
  //
  // The password hash is computed ONCE and shared. Hashing 6 identical
  // passwords separately would burn 6x the argon2 time for no benefit —
  // the hash is salted internally, so one hash verifies against the
  // same plaintext for every row.
  const passwordHash = await hash(DEMO_PASSWORD, ARGON2_OPTIONS);

  for (const c of CITIZENS) {
    // The phone must be ACCEPTED BY THE LOGIN ROUTE. A citizen
    // whose phone the auth boundary rejects cannot log in, which
    // makes the whole citizen-facing surface unreachable — the
    // report is in the database but the reporter cannot see it.
    // Assert it here rather than discovering it in a manual demo.
    if (!/^\+8801[0-9]{9}$/.test(c.phone)) {
      throw new Error(
        `seed-tickets: ${c.citizenId}'s phone "${c.phone}" is not a valid ` +
          'login phone. The auth routes require /^\\+8801[0-9]{9}$/ — ' +
          '`+8801` plus nine more digits.',
      );
    }
    const locality = LOCALITIES[c.locality];
    if (!locality) {
      throw new Error(
        `seed-tickets: unknown locality "${c.locality}" for ${c.citizenId}`,
      );
    }
    // A citizen is scoped to the demo ward, same as the report they
    // file: v1 does not support cross-ward filing (cross-ward filing
    // is a v1.1 surface), so a citizen's report and the citizen
    // belong to the same ward. Their LOCALITY — the name on the
    // report — is still the one the spec gave them.
    const wardId = wardByNumber.get(DEMO_WARD_NUMBER);
    if (!wardId) {
      throw new Error(
        `seed-tickets: ward ${DEMO_WARD_NUMBER} is missing for ${c.citizenId}`,
      );
    }
    await prisma.user.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        nameBn: c.nameBn,
        phone: c.phone,
        nid: c.nid,
        passwordHash,
        wardId,
        status: 'active',
      },
      create: {
        id: c.id,
        cityId,
        role: 'citizen',
        name: c.name,
        nameBn: c.nameBn,
        phone: c.phone,
        nid: c.nid,
        passwordHash,
        wardId,
        status: 'active',
      },
    });
  }
  console.log(`  Demo citizens: ${CITIZENS.length}`);

  // -- The reports, their trails, photos and audit rows ------------------
  for (const r of ALL_REPORTS) {
    const categoryId = categoryBySlug.get(r.categorySlug);
    if (!categoryId) {
      throw new Error(
        `seed-tickets: unknown category "${r.categorySlug}" on ${r.ref}`,
      );
    }
    const locality = LOCALITIES[r.locality];
    if (!locality) {
      throw new Error(
        `seed-tickets: unknown locality "${r.locality}" on ${r.ref}`,
      );
    }
    // The ticket's ward is the ward of the crew member holding it —
    // or the dispatcher's ward when nobody holds it yet. See
    // `wardForReport`.
    const wardNumber = wardForReport(r);
    const wardId = wardByNumber.get(wardNumber);
    if (!wardId) {
      throw new Error(
        `seed-tickets: ward ${wardNumber} is missing for ${r.ref}`,
      );
    }

    const createdAt = at(r.createdOffsetH);
    const createdMs = createdAt.getTime();
    const resolvedAt =
      r.resolvedAfterH === null ? null : stepAt(createdMs, r.resolvedAfterH);
    const { lat, lng } = coordinatesFor(r.id);

    // The ticket's `updatedAt` is the timestamp of its LAST trail step —
    // the same thing the runtime transition path would have produced.
    const lastStep = r.trail[r.trail.length - 1];
    const updatedAt = stepAt(createdMs, lastStep.afterH);

    // `version` counts the status changes, matching the optimistic-lock
    // counter the runtime path increments on every transition.
    const version = Math.max(0, r.trail.length - 1);

    const ticketData = {
      wardId,
      categoryId,
      reporterId: r.reporterId,
      assignedCrewId: r.assignedCrewId,
      status: r.status,
      locationLat: lat,
      locationLng: lng,
      locationLabel: locality.label,
      locationLabelBn: locality.labelBn,
      note: r.note,
      internalNote: r.internalNote,
      feedback: r.feedback,
      closeReason: r.closeReason,
      duplicateOfId: r.duplicateOfId,
      createdAt,
      updatedAt,
      resolvedAt,
      version,
      // `dedupKey` is deliberately left NULL on every row. See the
      // header for why.
      dedupKey: null,
    };

    await prisma.ticket.upsert({
      where: { id: r.id },
      update: ticketData,
      create: { id: r.id, cityId, ...ticketData },
    });

    // -- The status trail ------------------------------------------------
    //
    // Written directly rather than through `transitionTicket()` — see
    // the header. The trail is APPEND-ONLY (spec §12), so the existing
    // rows for this ticket are cleared first and rewritten. That keeps
    // the seed idempotent without rewriting history in the runtime
    // sense: a seed is a fresh write, not a mutation of a live report.
    await prisma.ticketTrailEntry.deleteMany({ where: { ticketId: r.id } });
    for (let i = 0; i < r.trail.length; i += 1) {
      const step = r.trail[i];
      await prisma.ticketTrailEntry.create({
        data: {
          id: `ticket_trail_seed_${r.ref.toLowerCase().replace('-', '_')}_${i + 1}`,
          ticketId: r.id,
          toStatus: step.toStatus,
          actorId: step.actorId,
          note: step.note,
          timestamp: stepAt(createdMs, step.afterH),
        },
      });
    }

    // -- The photos ------------------------------------------------------
    await prisma.ticketPhoto.deleteMany({ where: { ticketId: r.id } });
    for (let i = 0; i < r.photos.length; i += 1) {
      const p = r.photos[i];
      await prisma.ticketPhoto.create({
        data: {
          id: `ticket_photo_seed_${r.ref.toLowerCase().replace('-', '_')}_${i + 1}`,
          ticketId: r.id,
          url: seedPhotoUrl(r.categorySlug, p.seed),
          mimeType: 'image/svg+xml',
          uploadedByRole: p.role,
          uploadedAt: stepAt(createdMs, p.afterH),
        },
      });
    }

    // -- The audit trail -------------------------------------------------
    //
    // One audit row per status change, matching the runtime path's
    // `ticket.transition` action (lib/platform/audit.ts).
    await prisma.auditEntry.deleteMany({
      where: { entityType: 'ticket', entityId: r.id },
    });
    for (let i = 0; i < r.trail.length; i += 1) {
      const step = r.trail[i];
      await prisma.auditEntry.create({
        data: {
          id: `audit_seed_${r.ref.toLowerCase().replace('-', '_')}_${i + 1}`,
          entityType: 'ticket',
          entityId: r.id,
          action: 'ticket.transition',
          actorId: step.actorId,
          afterValue: {
            toStatus: step.toStatus,
            note: step.note,
          },
          timestamp: stepAt(createdMs, step.afterH),
        },
      });
    }

    // -- The reassignment audit rows -------------------------------------
    //
    // A crew change that does NOT move the status is recorded the way
    // the runtime records it (`lib/dispatcher/assign-crew.ts`): an
    // audit row with the action `ticket.assign_crew` and the
    // before/after crew ids — and NO trail row, because the trail is
    // a status history.
    const reassignments = r.reassignments ?? [];
    for (let i = 0; i < reassignments.length; i += 1) {
      const re = reassignments[i];
      await prisma.auditEntry.create({
        data: {
          id: `audit_seed_${r.ref.toLowerCase().replace('-', '_')}_reassign_${i + 1}`,
          entityType: 'ticket',
          entityId: r.id,
          action: 'ticket.assign_crew',
          actorId: re.actorId,
          beforeValue: { assignedCrewId: re.fromCrewId },
          afterValue: { assignedCrewId: re.toCrewId, note: re.note },
          timestamp: stepAt(createdMs, re.afterH),
        },
      });
    }
  }
  console.log(`  Reports: ${ALL_REPORTS.length}`);

  // -- The assertions ---------------------------------------------------
  //
  // The spec asks the seed to "fail clearly if a required relationship
  // is missing" and to keep the dashboard numbers derived from the
  // records rather than hardcoded. Both are honoured here: the counts
  // below are counted from the rows that were just written.

  const written = await prisma.ticket.count({ where: { cityId } });
  if (written !== EXPECTED_REPORT_COUNT) {
    throw new Error(
      `seed-tickets: expected ${EXPECTED_REPORT_COUNT} tickets, found ${written}. ` +
        'A report failed to write, or an old one survived the clear phase.',
    );
  }

  const specCounts = new Map<SpecStatus, number>();
  for (const r of SPEC_REPORTS) {
    specCounts.set(r.specStatus, (specCounts.get(r.specStatus) ?? 0) + 1);
  }
  for (const [stage, expected] of Object.entries(EXPECTED_SPEC_DISTRIBUTION)) {
    const actual = specCounts.get(stage as SpecStatus) ?? 0;
    if (actual !== expected) {
      throw new Error(
        `seed-tickets: the spec reports should hold ${expected} "${stage}" reports, found ${actual}.`,
      );
    }
  }

  const statusCounts = await prisma.ticket.groupBy({
    by: ['status'],
    where: { cityId },
    _count: true,
  });
  console.log(
    `  Status distribution: ${statusCounts
      .map((s) => `${s.status}=${s._count}`)
      .sort()
      .join(' ')}`,
  );

  const trailCount = await prisma.ticketTrailEntry.count({
    where: { ticket: { cityId } },
  });
  const photoCount = await prisma.ticketPhoto.count({
    where: { ticket: { cityId } },
  });
  console.log(`  Trail entries: ${trailCount}  Photos: ${photoCount}`);

  console.log('  Note: the "reports this month" stat is wall-clock based.');
  console.log('        With the fixed anchor it reads 0 after 2026-12-01.');
  console.log('  Note: EDGE-07 is written directly — the ALLOWED transition');
  console.log('        map has no edge out of "resolved" to reopen from.');
}

/**
 * The demo credentials for the seeded citizens, for the seed's console
 * output. Exported so `prisma/seed.ts` can print them once, alongside
 * the personas' credentials.
 */
export const CITIZEN_DEMO_PASSWORD = DEMO_PASSWORD;
