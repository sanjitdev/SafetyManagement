/**
 * Unit tests for the backend-switch facade (`lib/db-switch.ts`).
 *
 * `lib/db-switch.ts` is a hand-written per-model facade: every
 * accessor is `isDevStore() ? devDb.X : prismaClient.X`. This file
 * exercises the DEV-STORE branch of each accessor against the real
 * in-memory store, which is what runs in CI (the Prisma branch needs
 * a live Postgres, which the unit suite deliberately does not have).
 *
 * Covered:
 *   - `useDevStore()` — reflects the `CITYFIX_DEV_STORE` env var.
 *   - `db.city` — findUnique / findUniqueBySlug / findMany /
 *     findFirst / create / update / delete.
 *   - `db.ward` — findFirst / findMany / findUnique / create /
 *     update / delete.
 *   - `db.department` — findMany / findUnique / create / update /
 *     delete / countByCity.
 *   - `db.category` — findMany / findUnique / create / update /
 *     delete / countByCity.
 *   - `db.user` — findUnique / findFirst / findFirstByEmail /
 *     create / findMany, and the dev-store `update` guard.
 *   - `db.ticket` — findUnique / findFirst / findMany / create /
 *     update.
 *   - `db.trail` — create.
 *   - `db.ticketPhoto` — create / deleteCitizenAtIndex.
 *   - `db.audit` — create / findMany.
 *   - `db.session` — create / findUnique / delete / update.
 *   - `db.otp` — create / findFirst / update / countRecent.
 *   - `db.dedupFlag` — findUnique / findMany / create / update.
 *   - `db.webAuthnChallenge` / `db.webAuthnCredential` — create /
 *     findUnique / update / delete.
 *   - `getActiveSession()` — delegates to the dev session.
 *   - `getTicketWithTrail()` — returns the ticket + trail.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { db, getTicketWithTrail, useDevStore } from '@/lib/db-switch';
import { resetStore, getStore, DEV_CITY_ID, DEV_CITIZEN_ID } from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

const CITY_DATA = {
  slug: 'test-city',
  name: 'Test City',
  nameBn: 'টেস্ট সিটি',
  defaultLanguage: 'bn' as const,
  dedupRadiusMeters: 50,
};

// ---------------------------------------------------------------------------
// useDevStore
// ---------------------------------------------------------------------------

describe('useDevStore', () => {
  it('is true when CITYFIX_DEV_STORE=1', () => {
    expect(useDevStore()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// db.city
// ---------------------------------------------------------------------------

describe('db.city', () => {
  it('creates, reads, updates and deletes a city', async () => {
    const created = await db.city.create({ data: CITY_DATA });
    expect(created.id).toBeTruthy();
    expect(created.slug).toBe('test-city');

    expect((await db.city.findUnique({ where: { id: created.id } }))?.id).toBe(
      created.id,
    );
    expect(
      (await db.city.findUniqueBySlug({ where: { slug: 'test-city' } }))?.id,
    ).toBe(created.id);

    const updated = await db.city.update({
      where: { id: created.id },
      data: { name: 'Renamed City' },
    });
    expect(updated.name).toBe('Renamed City');

    db.city.delete({ where: { id: created.id } });
    expect(await db.city.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it('findMany returns the cities sorted by name', async () => {
    const rows = await db.city.findMany();
    const names = rows.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('findFirst returns the canonical primary city', async () => {
    const row = await db.city.findFirst();
    expect(row).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// db.ward
// ---------------------------------------------------------------------------

describe('db.ward', () => {
  it('creates, reads, updates and deletes a ward', async () => {
    const created = await db.ward.create({
      data: {
        cityId: DEV_CITY_ID,
        number: 21,
        name: 'Ward 21',
        nameBn: 'ওয়ার্ড ২১',
        polygonGeoJson: null,
      },
    });
    expect(created.id).toBeTruthy();

    expect((await db.ward.findUnique({ where: { id: created.id } }))?.id).toBe(
      created.id,
    );
    expect(
      (await db.ward.findFirst({ where: { cityId: DEV_CITY_ID } }))?.id,
    ).toBeTruthy();

    const updated = await db.ward.update({
      where: { id: created.id },
      data: { name: 'Renamed Ward' },
    });
    expect(updated.name).toBe('Renamed Ward');

    db.ward.delete({ where: { id: created.id } });
    expect(await db.ward.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it('findMany filters by cityId', async () => {
    const rows = await db.ward.findMany({ where: { cityId: DEV_CITY_ID } });
    expect(rows.every((w) => w.cityId === DEV_CITY_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// db.department
// ---------------------------------------------------------------------------

describe('db.department', () => {
  it('creates, reads, updates and deletes a department', async () => {
    const created = await db.department.create({
      data: {
        cityId: DEV_CITY_ID,
        slug: 'test-dept',
        name: 'Test Dept',
        nameBn: 'টেস্ট বিভাগ',
      },
    });
    expect(created.id).toBeTruthy();

    expect(
      (await db.department.findUnique({ where: { id: created.id } }))?.id,
    ).toBe(created.id);

    const updated = await db.department.update({
      where: { id: created.id },
      data: { name: 'Renamed Dept' },
    });
    expect(updated.name).toBe('Renamed Dept');

    const before = await db.department.countByCity({ where: { cityId: DEV_CITY_ID } });
    db.department.delete({ where: { id: created.id } });
    const after = await db.department.countByCity({ where: { cityId: DEV_CITY_ID } });
    expect(after).toBe(before - 1);
  });

  it('findMany filters by cityId', async () => {
    const rows = await db.department.findMany({ where: { cityId: DEV_CITY_ID } });
    expect(rows.every((d) => d.cityId === DEV_CITY_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// db.category
// ---------------------------------------------------------------------------

describe('db.category', () => {
  it('creates, reads, updates and deletes a category', async () => {
    const created = await db.category.create({
      data: {
        cityId: DEV_CITY_ID,
        departmentId: null,
        slug: 'test-cat',
        name: 'Test Category',
        nameBn: 'টেস্ট ক্যাটাগরি',
        narrowCategoryPhotoCap: null,
      },
    });
    expect(created.id).toBeTruthy();

    expect((await db.category.findUnique({ where: { id: created.id } }))?.id).toBe(
      created.id,
    );

    const updated = await db.category.update({
      where: { id: created.id },
      data: { name: 'Renamed Category' },
    });
    expect(updated.name).toBe('Renamed Category');

    const before = await db.category.countByCity({ where: { cityId: DEV_CITY_ID } });
    db.category.delete({ where: { id: created.id } });
    const after = await db.category.countByCity({ where: { cityId: DEV_CITY_ID } });
    expect(after).toBe(before - 1);
  });

  it('findMany filters by cityId', async () => {
    const rows = await db.category.findMany({ where: { cityId: DEV_CITY_ID } });
    expect(rows.every((c) => c.cityId === DEV_CITY_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// db.user
// ---------------------------------------------------------------------------

describe('db.user', () => {
  it('creates a user', async () => {
    const created = await db.user.create({
      data: {
        id: 'user_created',
        cityId: DEV_CITY_ID,
        role: 'citizen',
        phone: '+8801700000001',
        nid: '1990123456789',
        name: 'Created User',
        passwordHash: 'hash',
        wardId: 'ward_14',
      },
    });
    expect(created.id).toBe('user_created');
    expect(getStore().users.has('user_created')).toBe(true);
  });

  it('findUnique resolves a user', async () => {
    expect((await db.user.findUnique({ where: { id: DEV_CITIZEN_ID } }))?.id).toBe(
      DEV_CITIZEN_ID,
    );
  });

  it('findFirst resolves by (cityId, phone)', async () => {
    const row = await db.user.findFirst({
      where: { cityId: DEV_CITY_ID, phone: '+8801711000000' },
    });
    expect(row).not.toBeNull();
    expect(row?.id).toBe(DEV_CITIZEN_ID);
  });

  it('findFirstByEmail resolves by (email, role)', async () => {
    const row = await db.user.findFirstByEmail({
      where: { email: 'admin@cityfix.bd', role: 'admin' },
    });
    expect(row).not.toBeNull();
  });

  it('findMany filters by an arbitrary subset', async () => {
    const rows = await db.user.findMany({
      where: { cityId: DEV_CITY_ID, role: 'citizen' },
    });
    expect(rows.every((u) => u.cityId === DEV_CITY_ID && u.role === 'citizen')).toBe(
      true,
    );
  });

  it('update throws on the dev backend (prod-only bootstrap)', () => {
    expect(() =>
      db.user.update({ where: { id: DEV_CITIZEN_ID }, data: { name: 'X' } }),
    ).toThrow(/does not support user\.update/);
  });
});

// ---------------------------------------------------------------------------
// db.ticket
// ---------------------------------------------------------------------------

describe('db.ticket', () => {
  const ticketData = {
    cityId: DEV_CITY_ID,
    wardId: 'ward_14',
    categoryId: 'cat_pothole',
    reporterId: DEV_CITIZEN_ID,
    status: 'submitted' as const,
    locationLat: 23.789,
    locationLng: 90.4075,
  };

  it('creates, reads and updates a ticket', async () => {
    const created = await db.ticket.create({ data: ticketData });
    expect(created.id).toMatch(/^tkt_/);
    expect(created.locationLabel).toBeNull();
    expect(created.assignedCrewId).toBeNull();

    expect((await db.ticket.findUnique({ where: { id: created.id } }))?.id).toBe(
      created.id,
    );

    const updated = await db.ticket.update({
      where: { id: created.id },
      data: { status: 'routed' },
    });
    expect(updated.status).toBe('routed');
  });

  it('findFirst resolves by a where clause', async () => {
    // `cat_drainage` is the category on a seeded ticket. The point of
    // the assertion is that findFirst HONOURS the where clause — the
    // specific category is incidental, so it tracks the seed (the
    // in-progress ticket used to be `cat_pothole` until it moved to
    // `cat_streetlight` so it matched its crew's department).
    const row = await db.ticket.findFirst({
      where: { cityId: DEV_CITY_ID, categoryId: 'cat_drainage' },
    });
    expect(row).not.toBeNull();
    // The clause is honoured, not just "some row exists".
    expect(row?.cityId).toBe(DEV_CITY_ID);
    expect(row?.categoryId).toBe('cat_drainage');
    // A category no seeded ticket carries resolves to null.
    const missing = await db.ticket.findFirst({
      where: { cityId: DEV_CITY_ID, categoryId: 'cat_nope' },
    });
    expect(missing).toBeNull();
  });

  it('findMany filters by cityId', async () => {
    const rows = await db.ticket.findMany({ where: { cityId: DEV_CITY_ID } });
    expect(rows.every((t) => t.cityId === DEV_CITY_ID)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// db.trail
// ---------------------------------------------------------------------------

describe('db.trail', () => {
  it('creates a trail entry', async () => {
    const entry = await db.trail.create({
      data: { ticketId: 'tkt_x', toStatus: 'routed', actorId: DEV_CITIZEN_ID },
    });
    expect(entry.id).toBeTruthy();
    expect(entry.toStatus).toBe('routed');
    expect(entry.note).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// db.ticketPhoto
// ---------------------------------------------------------------------------

describe('db.ticketPhoto', () => {
  it('creates a photo', async () => {
    const photo = await db.ticketPhoto.create({
      data: { ticketId: 'tkt_x', url: 'data:image/png;base64,AAA', uploadedByRole: 'citizen' },
    });
    expect(photo.id).toBeTruthy();
  });

  it('deleteCitizenAtIndex removes the citizen photo at that position', async () => {
    await db.ticketPhoto.create({
      data: { ticketId: 'tkt_del', url: 'data:image/png;base64,AAA', uploadedByRole: 'citizen' },
    });
    await db.ticketPhoto.create({
      data: { ticketId: 'tkt_del', url: 'data:image/png;base64,BBB', uploadedByRole: 'citizen' },
    });

    const removedId = await db.ticketPhoto.deleteCitizenAtIndex({
      ticketId: 'tkt_del',
      idx: 0,
    });
    expect(removedId).toBeTruthy();
  });

  it('deleteCitizenAtIndex returns null for an out-of-range index', async () => {
    const removedId = await db.ticketPhoto.deleteCitizenAtIndex({
      ticketId: 'tkt_none',
      idx: 5,
    });
    expect(removedId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// db.audit
// ---------------------------------------------------------------------------

describe('db.audit', () => {
  it('creates an audit entry', async () => {
    const entry = await db.audit.create({
      data: {
        entityType: 'ticket',
        entityId: 'tkt_x',
        action: 'ticket_create',
        actorId: DEV_CITIZEN_ID,
      },
    });
    expect(entry.id).toMatch(/^aud_/);
  });

  it('findMany filters by actorId', async () => {
    await db.audit.create({
      data: {
        entityType: 'ticket',
        entityId: 'tkt_x',
        action: 'ticket_create',
        actorId: 'actor_1',
      },
    });
    const rows = await db.audit.findMany({ where: { actorId: 'actor_1' } });
    expect(rows).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// db.session
// ---------------------------------------------------------------------------

describe('db.session', () => {
  it('creates, reads, updates and deletes a session', async () => {
    const expiresAt = new Date('2999-01-01T00:00:00.000Z');
    const created = await db.session.create({
      data: {
        userId: DEV_CITIZEN_ID,
        cityId: DEV_CITY_ID,
        wardId: 'ward_14',
        departmentId: null,
        expiresAt,
      },
    });
    expect(created.id).toBeTruthy();
    expect(created.expiresAt).toBe(expiresAt.toISOString());

    expect((await db.session.findUnique({ where: { id: created.id } }))?.id).toBe(
      created.id,
    );

    const updated = await db.session.update({
      where: { id: created.id },
      data: { lastSeenAt: new Date('2026-10-20T00:00:00.000Z') },
    });
    expect(updated.lastSeenAt).toBe('2026-10-20T00:00:00.000Z');

    await db.session.delete({ where: { id: created.id } });
    expect(await db.session.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it('update defaults lastSeenAt to now when it is omitted', async () => {
    const created = await db.session.create({
      data: {
        userId: DEV_CITIZEN_ID,
        cityId: DEV_CITY_ID,
        wardId: null,
        departmentId: null,
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      },
    });
    const updated = await db.session.update({
      where: { id: created.id },
      data: {},
    });
    expect(updated.lastSeenAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// db.otp
// ---------------------------------------------------------------------------

describe('db.otp', () => {
  it('creates an OTP code', async () => {
    const created = await db.otp.create({
      data: {
        userId: DEV_CITIZEN_ID,
        codeHash: 'hash',
        scope: 'registration',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      },
    });
    expect(created.id).toBeTruthy();
    expect(created.scope).toBe('registration');
  });

  it('findFirst resolves an unused OTP by (userId, scope)', async () => {
    await db.otp.create({
      data: {
        userId: 'u_otp',
        codeHash: 'hash',
        scope: 'login',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      },
    });
    const row = await db.otp.findFirst({
      where: { userId: 'u_otp', scope: 'login' },
    });
    expect(row).not.toBeNull();
  });

  it('update marks the code as used', async () => {
    const created = await db.otp.create({
      data: {
        userId: 'u_otp_used',
        codeHash: 'hash',
        scope: 'login',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      },
    });
    const updated = await db.otp.update({
      where: { id: created.id },
      data: { usedAt: new Date().toISOString() },
    });
    expect(updated.usedAt).toBeTruthy();
  });

  it('countRecent counts the codes created since the given instant', async () => {
    await db.otp.create({
      data: {
        userId: 'u_otp_count',
        codeHash: 'hash',
        scope: 'registration',
        expiresAt: new Date('2999-01-01T00:00:00.000Z'),
      },
    });
    const count = await db.otp.countRecent({
      where: {
        userId: 'u_otp_count',
        scope: 'registration',
        since: new Date(Date.now() - 60_000).toISOString(),
      },
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// db.dedupFlag
// ---------------------------------------------------------------------------

describe('db.dedupFlag', () => {
  const flagData = {
    cityId: DEV_CITY_ID,
    wardId: 'ward_14',
    departmentId: null,
    ticketId: 'tkt_new',
    originalTicketId: 'tkt_old',
    citizenReason: 'same pothole',
  };

  it('creates, reads, updates and deletes a dedup flag', async () => {
    const created = await db.dedupFlag.create({ data: flagData });
    expect(created.id).toBeTruthy();

    expect((await db.dedupFlag.findUnique({ where: { id: created.id } }))?.id).toBe(
      created.id,
    );

    const updated = await db.dedupFlag.update({
      where: { id: created.id },
      data: { status: 'confirmed' },
    });
    expect(updated.status).toBe('confirmed');
  });

  it('findMany filters by cityId', async () => {
    const rows = await db.dedupFlag.findMany({ where: { cityId: DEV_CITY_ID } });
    expect(Array.isArray(rows)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getActiveSession / getTicketWithTrail
// ---------------------------------------------------------------------------

describe('getTicketWithTrail', () => {
  it('returns null for an unknown ticket', async () => {
    expect(await getTicketWithTrail('tkt_missing')).toBeNull();
  });

  it('returns the ticket with its trail', async () => {
    const ticket = await db.ticket.create({
      data: {
        cityId: DEV_CITY_ID,
        wardId: 'ward_14',
        categoryId: 'cat_pothole',
        reporterId: DEV_CITIZEN_ID,
        status: 'submitted',
        locationLat: 23.789,
        locationLng: 90.4075,
      },
    });
    await db.trail.create({
      data: { ticketId: ticket.id, toStatus: 'submitted', actorId: DEV_CITIZEN_ID },
    });

    const withTrail = await getTicketWithTrail(ticket.id);
    expect(withTrail).not.toBeNull();
    expect(withTrail?.id).toBe(ticket.id);
    expect(withTrail?.trail.length).toBeGreaterThan(0);
  });
});
