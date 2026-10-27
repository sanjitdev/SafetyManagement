/**
 * Unit tests for the admin user-provisioning db access layer
 * (`lib/admin/users-db.ts`).
 *
 * These tests exercise the DEV-STORE path of every exported function.
 * The dev store is pure in-memory JS with no I/O, so it is safe to run
 * in vitest with `CITYFIX_DEV_STORE=1` (the default in
 * `vitest.config.ts`).
 *
 * The dev store ships a DEMO seed (3 cities, 4 personas, 1 ward, 3
 * departments, 6 tickets). `resetStore()` re-creates that seed, so
 * every test calls `clearStore()` afterwards to empty the collections
 * and make the assertions exact rather than seed-relative.
 *
 * What is covered:
 *   - `listCityUsers` — the city filter + the optional provisioning
 *     columns (`nameBn` / `status` / `lastLoginAt` / `crewId`) that
 *     are read defensively off the row.
 *   - `listCityCrews` — the dev path returns `[]` (the dev store has
 *     no `crews` collection).
 *   - `listCitySessions` — the city filter, the optional `userIds`
 *     filter, and the empty-match case.
 *   - `listCityWards` — sorted by ward number ascending.
 *   - `listCityDepartments`.
 *   - `findCityUser` — the city-scope guard (a user from another city
 *     must resolve to `null`).
 *   - `findUserByIdentifier` — phone / email match, whitespace trim,
 *     and the empty-identifier guard.
 *   - `createCityUser` / `updateCityUser` / `deleteCityUser` — the
 *     dev-store write path, including the "user has tickets → cannot
 *     be deleted" rule and the "sessions are dropped on delete" rule.
 *   - `listCityTickets` — the JS-side date-range filter (the dev
 *     store cannot filter on a `createdAt` range).
 *   - `listTicketTrail` — the ticket-id filter + the empty-set guard.
 *   - `listCityCitizens` / `listCityStaff` — the role partition.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { resetStore, getStore, DEV_CITY_ID } from '@/lib/dev-store';
import {
  createCityUser,
  deleteCityUser,
  findCityUser,
  findUserByIdentifier,
  listCityCitizens,
  listCityCrews,
  listCityDepartments,
  listCitySessions,
  listCityStaff,
  listCityTickets,
  listCityUsers,
  listCityWards,
  listTicketTrail,
  updateCityUser,
} from '@/lib/admin/users-db';

const OTHER_CITY = 'city_other';

/**
 * Reset the dev store to the demo seed, then empty every collection
 * so each test starts from a known-empty world.
 */
function clearStore() {
  resetStore();
  const store = getStore();
  store.users.clear();
  store.tickets.clear();
  store.sessions.clear();
  store.trail.length = 0;
  store.wards.clear();
  store.departments.clear();
  store.cities.clear();
}

beforeEach(() => {
  clearStore();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function seedCityUser(overrides: Partial<{
  id: string;
  cityId: string;
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
  wardId: string | null;
  departmentId: string | null;
}> = {}) {
  const id = overrides.id ?? 'user_x';
  const store = getStore();
  const user = {
    id,
    cityId: overrides.cityId ?? DEV_CITY_ID,
    role: (overrides.role ?? 'citizen') as never,
    phone: overrides.phone ?? null,
    nid: null,
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? null,
    passwordHash: 'hash',
    wardId: overrides.wardId ?? null,
    departmentId: overrides.departmentId ?? null,
    languageOverride: null,
    webAuthnCredentials: null,
    webAuthnChallenge: null,
  };
  store.users.set(id, user as never);
  return user as never;
}

function seedTicket(
  id: string,
  createdAt: string,
  overrides: Partial<{ cityId: string; reporterId: string; assignedCrewId: string | null }> = {},
) {
  getStore().tickets.set(id, {
    id,
    cityId: overrides.cityId ?? DEV_CITY_ID,
    wardId: 'ward_14',
    categoryId: 'cat_pothole',
    reporterId: overrides.reporterId ?? 'u_a',
    status: 'submitted',
    locationLat: 23.7,
    locationLng: 90.4,
    locationLabel: null,
    locationLabelBn: null,
    note: null,
    assignedCrewId: overrides.assignedCrewId ?? null,
    internalNote: null,
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
  } as never);
}

function seedSession(id: string, userId: string, cityId = DEV_CITY_ID) {
  getStore().sessions.set(id, {
    id,
    userId,
    cityId,
    wardId: null,
    departmentId: null,
    expiresAt: '2999-01-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    lastSeenAt: '2026-10-01T00:00:00.000Z',
  } as never);
}

// ---------------------------------------------------------------------------
// listCityUsers
// ---------------------------------------------------------------------------

describe('listCityUsers', () => {
  it('returns only the users in the requested city', async () => {
    seedCityUser({ id: 'u_a', cityId: DEV_CITY_ID });
    seedCityUser({ id: 'u_b', cityId: OTHER_CITY });

    const rows = await listCityUsers(DEV_CITY_ID);
    expect(rows.map((r) => r.id)).toEqual(['u_a']);
  });

  it('returns an empty list for a city with no users', async () => {
    expect(await listCityUsers(DEV_CITY_ID)).toEqual([]);
  });

  it('normalises nullable fields to null', async () => {
    seedCityUser({ id: 'u_a', email: null, phone: null, wardId: null, departmentId: null });

    const [row] = await listCityUsers(DEV_CITY_ID);
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.wardId).toBeNull();
    expect(row.departmentId).toBeNull();
    expect(row.createdAt).toBeNull();
    expect(row.updatedAt).toBeNull();
  });

  it('carries the optional provisioning columns when the row has them', async () => {
    seedCityUser({ id: 'u_a' });
    // The dev store's `User` shape has no provisioning columns, so
    // they are attached directly to simulate the Prisma row.
    const store = getStore();
    const u = store.users.get('u_a') as unknown as Record<string, unknown>;
    u.nameBn = 'পরীক্ষা';
    u.status = 'active';
    u.lastLoginAt = '2026-10-20T10:00:00.000Z';
    u.crewId = 'crew_1';

    const [row] = await listCityUsers(DEV_CITY_ID);
    expect(row.nameBn).toBe('পরীক্ষা');
    expect(row.status).toBe('active');
    expect(row.lastLoginAt).toBe('2026-10-20T10:00:00.000Z');
    expect(row.crewId).toBe('crew_1');
  });
});

// ---------------------------------------------------------------------------
// listCityCrews
// ---------------------------------------------------------------------------

describe('listCityCrews', () => {
  it('returns an empty list on the dev backend (no crews collection)', async () => {
    expect(await listCityCrews(DEV_CITY_ID)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listCitySessions
// ---------------------------------------------------------------------------

describe('listCitySessions', () => {
  it('returns the sessions of the city users', async () => {
    seedCityUser({ id: 'u_a' });
    seedCityUser({ id: 'u_b', cityId: OTHER_CITY });
    seedSession('ses_a', 'u_a');
    seedSession('ses_b', 'u_b', OTHER_CITY);

    const rows = await listCitySessions(DEV_CITY_ID);
    expect(rows.map((r) => r.userId)).toEqual(['u_a']);
  });

  it('filters to the supplied userIds', async () => {
    seedCityUser({ id: 'u_a' });
    seedCityUser({ id: 'u_b' });
    seedSession('ses_a', 'u_a');
    seedSession('ses_b', 'u_b');

    const rows = await listCitySessions(DEV_CITY_ID, ['u_b']);
    expect(rows.map((r) => r.userId)).toEqual(['u_b']);
  });

  it('returns an empty list when the userIds filter matches nobody', async () => {
    seedCityUser({ id: 'u_a' });
    seedSession('ses_a', 'u_a');
    expect(await listCitySessions(DEV_CITY_ID, ['nobody'])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listCityWards / listCityDepartments
// ---------------------------------------------------------------------------

describe('listCityWards', () => {
  it('returns the city wards sorted by ward number ascending', async () => {
    const store = getStore();
    for (const [id, number] of [
      ['ward_20', 20],
      ['ward_3', 3],
      ['ward_14', 14],
    ] as const) {
      store.wards.set(id, {
        id,
        cityId: DEV_CITY_ID,
        number,
        name: `Ward ${number}`,
        nameBn: null,
        polygonGeoJson: null,
      } as never);
    }

    const rows = await listCityWards(DEV_CITY_ID);
    expect(rows.map((w) => w.number)).toEqual([3, 14, 20]);
  });

  it('excludes the wards of another city', async () => {
    getStore().wards.set('ward_x', {
      id: 'ward_x',
      cityId: OTHER_CITY,
      number: 1,
      name: 'Other',
      nameBn: null,
      polygonGeoJson: null,
    } as never);
    expect(await listCityWards(DEV_CITY_ID)).toEqual([]);
  });
});

describe('listCityDepartments', () => {
  it('returns the city departments', async () => {
    getStore().departments.set('dept_a', {
      id: 'dept_a',
      cityId: DEV_CITY_ID,
      slug: 'a',
      name: 'Dept A',
      nameBn: null,
    } as never);
    getStore().departments.set('dept_b', {
      id: 'dept_b',
      cityId: OTHER_CITY,
      slug: 'b',
      name: 'Dept B',
      nameBn: null,
    } as never);

    const rows = await listCityDepartments(DEV_CITY_ID);
    expect(rows.map((d) => d.id)).toEqual(['dept_a']);
  });
});

// ---------------------------------------------------------------------------
// findCityUser
// ---------------------------------------------------------------------------

describe('findCityUser', () => {
  it('finds a user in the city', async () => {
    seedCityUser({ id: 'u_a', name: 'Habib Rahman' });
    const row = await findCityUser(DEV_CITY_ID, 'u_a');
    expect(row?.id).toBe('u_a');
    expect(row?.name).toBe('Habib Rahman');
  });

  it('returns null for a user from another city (city-scope guard)', async () => {
    seedCityUser({ id: 'u_a', cityId: OTHER_CITY });
    expect(await findCityUser(DEV_CITY_ID, 'u_a')).toBeNull();
  });

  it('returns null for an unknown user id', async () => {
    expect(await findCityUser(DEV_CITY_ID, 'nope')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findUserByIdentifier
// ---------------------------------------------------------------------------

describe('findUserByIdentifier', () => {
  it('matches on phone', async () => {
    seedCityUser({ id: 'u_a', phone: '+8801711000010' });
    const row = await findUserByIdentifier(DEV_CITY_ID, '+8801711000010');
    expect(row?.id).toBe('u_a');
  });

  it('matches on email', async () => {
    seedCityUser({ id: 'u_a', email: 'habib@example.com' });
    const row = await findUserByIdentifier(DEV_CITY_ID, 'habib@example.com');
    expect(row?.id).toBe('u_a');
  });

  it('trims surrounding whitespace before matching', async () => {
    seedCityUser({ id: 'u_a', phone: '+8801711000010' });
    const row = await findUserByIdentifier(DEV_CITY_ID, '  +8801711000010  ');
    expect(row?.id).toBe('u_a');
  });

  it('returns null for an empty / whitespace-only identifier', async () => {
    expect(await findUserByIdentifier(DEV_CITY_ID, '')).toBeNull();
    expect(await findUserByIdentifier(DEV_CITY_ID, '   ')).toBeNull();
  });

  it('returns null when no user carries the identifier', async () => {
    seedCityUser({ id: 'u_a', phone: '+8801711000010' });
    expect(await findUserByIdentifier(DEV_CITY_ID, '+8801799999999')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// createCityUser / updateCityUser / deleteCityUser
// ---------------------------------------------------------------------------

describe('createCityUser', () => {
  it('creates a user on the dev backend and returns the row', async () => {
    const row = await createCityUser({
      id: 'u_new',
      cityId: DEV_CITY_ID,
      role: 'dispatcher',
      name: 'New Dispatcher',
      email: 'new@example.com',
      phone: '+8801700000000',
      passwordHash: 'hashed',
      wardId: 'ward_14',
      departmentId: null,
    });

    expect(row.id).toBe('u_new');
    expect(row.role).toBe('dispatcher');
    expect(row.name).toBe('New Dispatcher');
    expect(row.email).toBe('new@example.com');
    expect(row.createdAt).toBeNull();
    expect(getStore().users.get('u_new')).toBeTruthy();
  });
});

describe('updateCityUser', () => {
  it('updates the requested fields and returns the row', async () => {
    seedCityUser({ id: 'u_a', name: 'Old Name' });

    const row = await updateCityUser('u_a', { name: 'New Name', role: 'crew' });
    expect(row?.name).toBe('New Name');
    expect(row?.role).toBe('crew');
  });

  it('returns null for an unknown user', async () => {
    expect(await updateCityUser('nope', { name: 'X' })).toBeNull();
  });
});

describe('deleteCityUser', () => {
  it('deletes a user that has no tickets', async () => {
    seedCityUser({ id: 'u_a' });
    expect(await deleteCityUser('u_a')).toBe(true);
    expect(getStore().users.has('u_a')).toBe(false);
  });

  it('drops the user sessions on delete', async () => {
    seedCityUser({ id: 'u_a' });
    seedSession('ses_a', 'u_a');

    expect(await deleteCityUser('u_a')).toBe(true);
    expect(getStore().sessions.has('ses_a')).toBe(false);
  });

  it('refuses to delete a user who reported a ticket', async () => {
    seedCityUser({ id: 'u_a' });
    seedTicket('tkt_1', '2026-10-01T00:00:00.000Z', { reporterId: 'u_a' });

    expect(await deleteCityUser('u_a')).toBe(false);
    expect(getStore().users.has('u_a')).toBe(true);
  });

  it('refuses to delete a user who is the assigned crew on a ticket', async () => {
    seedCityUser({ id: 'u_a' });
    seedTicket('tkt_1', '2026-10-01T00:00:00.000Z', {
      reporterId: 'someone_else',
      assignedCrewId: 'u_a',
    });

    expect(await deleteCityUser('u_a')).toBe(false);
  });

  it('returns false for an unknown user', async () => {
    expect(await deleteCityUser('nope')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// listCityTickets
// ---------------------------------------------------------------------------

describe('listCityTickets', () => {
  it('lists the city tickets with the ISO fields normalised', async () => {
    seedTicket('tkt_1', '2026-10-01T00:00:00.000Z');
    const rows = await listCityTickets(DEV_CITY_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('tkt_1');
    expect(rows[0].createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(rows[0].updatedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(rows[0].resolvedAt).toBeNull();
    expect(rows[0].feedback).toBeNull();
  });

  it('excludes the other city tickets', async () => {
    seedTicket('tkt_1', '2026-10-01T00:00:00.000Z');
    seedTicket('tkt_2', '2026-10-01T00:00:00.000Z', { cityId: OTHER_CITY });
    const rows = await listCityTickets(DEV_CITY_ID);
    expect(rows.map((r) => r.id)).toEqual(['tkt_1']);
  });

  it('applies the from-bound in JS (the dev store cannot range-filter)', async () => {
    seedTicket('tkt_old', '2026-09-01T00:00:00.000Z');
    seedTicket('tkt_new', '2026-10-20T00:00:00.000Z');

    const rows = await listCityTickets(DEV_CITY_ID, '2026-10-01T00:00:00.000Z');
    expect(rows.map((r) => r.id)).toEqual(['tkt_new']);
  });

  it('applies the to-bound in JS', async () => {
    seedTicket('tkt_old', '2026-09-01T00:00:00.000Z');
    seedTicket('tkt_new', '2026-10-20T00:00:00.000Z');

    const rows = await listCityTickets(
      DEV_CITY_ID,
      undefined,
      '2026-10-01T00:00:00.000Z',
    );
    expect(rows.map((r) => r.id)).toEqual(['tkt_old']);
  });

  it('applies both bounds together', async () => {
    seedTicket('tkt_a', '2026-09-01T00:00:00.000Z');
    seedTicket('tkt_b', '2026-10-05T00:00:00.000Z');
    seedTicket('tkt_c', '2026-11-01T00:00:00.000Z');

    const rows = await listCityTickets(
      DEV_CITY_ID,
      '2026-10-01T00:00:00.000Z',
      '2026-10-31T00:00:00.000Z',
    );
    expect(rows.map((r) => r.id)).toEqual(['tkt_b']);
  });

  it('skips a ticket whose createdAt cannot be parsed', async () => {
    seedTicket('tkt_bad', 'not-a-date');
    expect(await listCityTickets(DEV_CITY_ID)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// listTicketTrail
// ---------------------------------------------------------------------------

describe('listTicketTrail', () => {
  it('returns an empty list for an empty ticket-id set', async () => {
    expect(await listTicketTrail([])).toEqual([]);
  });

  it('returns only the trail entries for the requested tickets', async () => {
    getStore().trail.push({
      id: 'trl_1',
      ticketId: 'tkt_1',
      fromStatus: null,
      toStatus: 'submitted',
      actorId: 'u_a',
      note: null,
      timestamp: '2026-10-01T00:00:00.000Z',
    } as never);
    getStore().trail.push({
      id: 'trl_2',
      ticketId: 'tkt_2',
      fromStatus: null,
      toStatus: 'routed',
      actorId: 'u_b',
      note: null,
      timestamp: '2026-10-02T00:00:00.000Z',
    } as never);

    const rows = await listTicketTrail(['tkt_1']);
    expect(rows).toHaveLength(1);
    expect(rows[0].ticketId).toBe('tkt_1');
    expect(rows[0].toStatus).toBe('submitted');
    expect(rows[0].timestamp).toBe('2026-10-01T00:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// listCityCitizens / listCityStaff
// ---------------------------------------------------------------------------

describe('listCityCitizens / listCityStaff', () => {
  it('partitions the city users by the citizen role', async () => {
    seedCityUser({ id: 'u_c', role: 'citizen' });
    seedCityUser({ id: 'u_d', role: 'dispatcher' });
    seedCityUser({ id: 'u_k', role: 'crew' });
    seedCityUser({ id: 'u_a', role: 'admin' });

    const citizens = await listCityCitizens(DEV_CITY_ID);
    expect(citizens.map((c) => c.id)).toEqual(['u_c']);

    const staff = await listCityStaff(DEV_CITY_ID);
    expect(staff.map((s) => s.id).sort()).toEqual(['u_a', 'u_d', 'u_k']);
    expect(staff.map((s) => s.role).sort()).toEqual([
      'admin',
      'crew',
      'dispatcher',
    ]);
  });

  it('falls back to the epoch for a citizen row with no createdAt', async () => {
    seedCityUser({ id: 'u_c', role: 'citizen' });
    const [c] = await listCityCitizens(DEV_CITY_ID);
    expect(c.createdAt).toBe(new Date(0).toISOString());
  });
});
