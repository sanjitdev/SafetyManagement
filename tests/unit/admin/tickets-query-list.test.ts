/**
 * Vitest: admin tickets-query LIST path.
 *
 * Companion to `tests/unit/tickets-query.test.ts` (which covers the
 * pure `buildWhere` / `clampLimit` helpers). This file exercises the
 * DATABASE-backed half of `lib/admin/tickets-query.ts`:
 *
 *  1. `listTicketsForAdmin` — the city filter, the status filter,
 *     the JS-side date-range filter (the dev store cannot range-filter
 *     on `createdAt`), the cursor filter, the `limit` + `nextCursor`
 *     pagination, and the admin-role serialisation.
 *  2. `getTicketForAdmin` — resolves one ticket with its trail, and
 *     returns `null` for an unknown id.
 *
 * The dev store is used as the backend (`CITYFIX_DEV_STORE=1`).
 */

import { describe, expect, test, beforeEach } from 'vitest';
import { listTicketsForAdmin, getTicketForAdmin } from '@/lib/admin/tickets-query';
import { resetStore, getStore } from '@/lib/dev-store';

const FROM = '2026-10-01T00:00:00.000Z';
const TO = '2026-10-31T00:00:00.000Z';
const MID = '2026-10-20T00:00:00.000Z';

function seedTicket(
  id: string,
  opts: {
    cityId?: string;
    status?: string;
    wardId?: string;
    categoryId?: string;
    createdAt?: string;
  } = {},
) {
  getStore().tickets.set(id, {
    id,
    cityId: opts.cityId ?? 'city_dhaka_north',
    wardId: opts.wardId ?? 'ward_14',
    categoryId: opts.categoryId ?? 'cat_pothole',
    reporterId: 'user_citizen_rahim',
    status: opts.status ?? 'submitted',
    locationLat: 23.789,
    locationLng: 90.4075,
    locationLabel: 'Mirpur',
    locationLabelBn: 'মিরপুর',
    note: null,
    assignedCrewId: null,
    internalNote: null,
    createdAt: opts.createdAt ?? MID,
    updatedAt: opts.createdAt ?? MID,
    resolvedAt: null,
  } as never);
}

beforeEach(() => {
  resetStore();
  getStore().tickets.clear();
  getStore().trail.length = 0;
});

describe('listTicketsForAdmin', () => {
  test('returns the city tickets inside the window', async () => {
    seedTicket('tkt_a');
    seedTicket('tkt_b', { createdAt: '2026-10-21T00:00:00.000Z' });

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
    });
    expect(tickets.map((t) => t.id).sort()).toEqual(['tkt_a', 'tkt_b']);
  });

  test('excludes the other city tickets', async () => {
    seedTicket('tkt_a');
    seedTicket('tkt_b', { cityId: 'city_other' });

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
    });
    expect(tickets.map((t) => t.id)).toEqual(['tkt_a']);
  });

  test('filters by status', async () => {
    seedTicket('tkt_sub', { status: 'submitted' });
    seedTicket('tkt_res', { status: 'resolved' });

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
      status: 'resolved',
    });
    expect(tickets.map((t) => t.id)).toEqual(['tkt_res']);
  });

  test('filters by wardId and categoryId', async () => {
    seedTicket('tkt_a', { wardId: 'ward_14', categoryId: 'cat_pothole' });
    seedTicket('tkt_b', { wardId: 'ward_15', categoryId: 'cat_garbage' });

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
      wardId: 'ward_15',
      categoryId: 'cat_garbage',
    });
    expect(tickets.map((t) => t.id)).toEqual(['tkt_b']);
  });

  test('applies the date range in JS (the dev store cannot range-filter)', async () => {
    seedTicket('tkt_old', { createdAt: '2026-09-01T00:00:00.000Z' });
    seedTicket('tkt_new', { createdAt: '2026-10-20T00:00:00.000Z' });

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
    });
    expect(tickets.map((t) => t.id)).toEqual(['tkt_new']);
  });

  test('applies the cursor filter (rows at or after the cursor are dropped)', async () => {
    seedTicket('tkt_a', { createdAt: '2026-10-20T03:00:00.000Z' });
    seedTicket('tkt_b', { createdAt: '2026-10-20T02:00:00.000Z' });
    seedTicket('tkt_c', { createdAt: '2026-10-20T01:00:00.000Z' });

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
      cursor: '2026-10-20T02:00:00.000Z',
    });
    expect(tickets.map((t) => t.id)).toEqual(['tkt_c']);
  });

  test('applies the limit and sets nextCursor when more rows exist', async () => {
    seedTicket('tkt_a', { createdAt: '2026-10-20T03:00:00.000Z' });
    seedTicket('tkt_b', { createdAt: '2026-10-20T02:00:00.000Z' });
    seedTicket('tkt_c', { createdAt: '2026-10-20T01:00:00.000Z' });

    const { tickets, nextCursor } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
      limit: 2,
    });
    expect(tickets).toHaveLength(2);
    expect(nextCursor).toBe('2026-10-20T02:00:00.000Z');
  });

  test('nextCursor is null when the rows fit inside the limit', async () => {
    seedTicket('tkt_a');

    const { tickets, nextCursor } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
      limit: 10,
    });
    expect(tickets).toHaveLength(1);
    expect(nextCursor).toBeNull();
  });

  test('serialises for the admin role', async () => {
    seedTicket('tkt_a');

    const { tickets } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: FROM,
      to: TO,
    });
    // The admin surface sees the internal fields (the citizen
    // serializer strips them).
    expect(tickets[0].id).toBe('tkt_a');
    expect(tickets[0].status).toBe('submitted');
  });

  test('returns an empty list when nothing matches', async () => {
    const { tickets, nextCursor } = await listTicketsForAdmin({
      cityId: 'city_dhaka_north',
      from: '2020-01-01T00:00:00.000Z',
      to: '2020-02-01T00:00:00.000Z',
    });
    expect(tickets).toEqual([]);
    expect(nextCursor).toBeNull();
  });
});

describe('getTicketForAdmin', () => {
  test('resolves one ticket', async () => {
    seedTicket('tkt_a');

    const ticket = await getTicketForAdmin('tkt_a');
    expect(ticket).not.toBeNull();
    expect(ticket?.id).toBe('tkt_a');
    expect(ticket?.status).toBe('submitted');
  });

  test('returns null for an unknown ticket id', async () => {
    expect(await getTicketForAdmin('tkt_missing')).toBeNull();
  });
});
