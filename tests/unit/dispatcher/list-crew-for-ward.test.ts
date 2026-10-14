/**
 * Unit tests for the dispatcher list-crew-for-ward service
 * (lib/dispatcher/list-crew-for-ward.ts).
 *
 * Bolt 007-002 (Intent 007 — Citizen Resolution Visibility):
 * the dispatcher crew picker read service. The picker is a hint
 * (the POST endpoint re-validates the chosen crew), so this
 * service's contract is just "return the right list" — but
 * "right" means exactly the (cityId, role='crew', wardId)
 * triple, sorted by name ASC, with no admins or citizens
 * leaking through.
 *
 * Runs against the real in-memory dev store. No mocks: the
 * service goes through `db.user.findMany` end-to-end, and the
 * dev store already seeds the test fixtures
 * (`user_crew_rashid`, `user_crew_karim`, `user_crew_jamal`).
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { resetStore, DEV_CITIZEN_ID } from '@/lib/dev-store';
import { listCrewForWard } from '@/lib/dispatcher/list-crew-for-ward';

beforeEach(() => {
  resetStore();
});

describe('listCrewForWard', () => {
  it('returns the crew users in (city_dhaka_north, ward_14), sorted by name ASC', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });

    // Two crew users in ward_14 from the seed: Rashid and Karim.
    // Sorted by name ASC → Karim, then Rashid.
    expect(rows).toEqual([
      { id: 'user_crew_karim', name: 'Karim' },
      { id: 'user_crew_rashid', name: 'Rashid' },
    ]);
  });

  it('omits crew from a different ward (cross-ward isolation)', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });

    // user_crew_jamal is in ward_other — must not appear here.
    const ids = rows.map((r) => r.id);
    expect(ids).not.toContain('user_crew_jamal');
  });

  it('returns the cross-ward crew when the request scopes to that other ward', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_other',
    });

    expect(rows).toEqual([{ id: 'user_crew_jamal', name: 'Jamal' }]);
  });

  it('omits admins, citizens, and dispatchers (role filter)', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });
    const ids = rows.map((r) => r.id);

    // Citizens: DEV_CITIZEN_ID. Admins: user_admin_anwar. Dispatchers:
    // user_dispatcher_habib. None of these should leak into the
    // picker even if they share the same cityId / wardId.
    expect(ids).not.toContain(DEV_CITIZEN_ID);
    expect(ids).not.toContain('user_admin_anwar');
    expect(ids).not.toContain('user_dispatcher_habib');
  });

  it('returns [] when no crew are seeded for the requested (cityId, wardId) pair', async () => {
    // A non-existent ward has no crew by definition.
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_no_such_ward',
    });
    expect(rows).toEqual([]);
  });

  it('returns [] when the cityId is different (cross-city isolation)', async () => {
    // No crew in city_chittagong.
    const rows = await listCrewForWard({
      cityId: 'city_chittagong',
      wardId: 'ward_14',
    });
    expect(rows).toEqual([]);
  });

  it('returns only { id, name } — no other user fields', async () => {
    const rows = await listCrewForWard({
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
    });
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['id', 'name']);
    }
  });
});
