/**
 * The platform's PRIMARY city — the one an anonymous visitor sees.
 *
 * ── The defect this pins ───────────────────────────────────────
 *
 * The public activity feed (`app/api/v1/activity/public`) picks the
 * city for an anonymous caller with:
 *
 *   db.city.findFirst({ orderBy: { createdAt: 'asc' } })
 *
 * On the Prisma path that reads the `createdAt` column, and the
 * seed's insert order makes Dhaka North the oldest city.
 *
 * On the dev-store path the call used to ignore `orderBy` entirely
 * and return the first row of `city.findMany()` — which sorts by
 * NAME. "Chattogram City Corporation" sorts before "Dhaka North
 * City Corporation", so the dev path selected **Chattogram**, which
 * is seeded EMPTY. The public landing page at `/` therefore rendered
 * an empty city-activity feed in dev-store mode — the mode the whole
 * Playwright route suite runs in — while the Prisma path showed
 * Dhaka North's reports.
 *
 * The two backends must agree on which city is the platform's
 * primary one. These tests pin that agreement.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { devDb, resetStore, DEV_CITY_ID } from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

describe('the primary city', () => {
  it('is Dhaka North, not the alphabetically-first city', () => {
    // The guard on the fixture itself: Chattogram really does sort
    // first by name, so a name-based lookup would pick it.
    const byName = devDb.city.findMany();
    expect(byName[0].id).not.toBe(DEV_CITY_ID);
    expect(byName[0].id).toBe('city_chittagong');

    // The lookup the public feed actually makes.
    expect(devDb.city.findFirst({ orderBy: { createdAt: 'asc' } })?.id).toBe(
      DEV_CITY_ID,
    );
  });

  it('honours a descending orderBy', () => {
    expect(devDb.city.findFirst({ orderBy: { createdAt: 'desc' } })?.id).toBe(
      'city_chittagong',
    );
  });

  it('defaults to the oldest city when no orderBy is given', () => {
    expect(devDb.city.findFirst()?.id).toBe(DEV_CITY_ID);
  });

  it('orders the seeded cities by their seed order, not their name', () => {
    const cities = [...devDb.city.findMany()];
    const byCreatedAt = [...cities].sort((a, b) => {
      const at = typeof a.createdAt === 'string'
        ? Date.parse(a.createdAt)
        : a.createdAt.getTime();
      const bt = typeof b.createdAt === 'string'
        ? Date.parse(b.createdAt)
        : b.createdAt.getTime();
      return at - bt;
    });
    expect(byCreatedAt.map((c) => c.id)).toEqual([
      'city_dhaka_north',
      'city_dhaka_south',
      'city_chittagong',
    ]);
  });

  it('gives every seeded city a createdAt', () => {
    for (const city of devDb.city.findMany()) {
      expect(city.createdAt, `${city.id} has no createdAt`).toBeTruthy();
    }
  });

  it('puts a runtime-created city AFTER every seeded city', () => {
    // A city created through the admin UI must not displace the
    // platform's primary city — the feed's default would otherwise
    // swing to a brand-new, empty city.
    const created = devDb.city.create({
      data: {
        slug: 'a-new-city',
        name: 'A New City Corporation',
        nameBn: 'নতুন সিটি কর্পোরেশন',
        defaultLanguage: 'bn',
        dedupRadiusMeters: 50,
      },
    });
    expect(created.createdAt).toBeTruthy();
    expect(devDb.city.findFirst({ orderBy: { createdAt: 'asc' } })?.id).toBe(
      DEV_CITY_ID,
    );
  });

  it('preserves createdAt across an update', () => {
    const before = devDb.city.findUnique({ where: { id: DEV_CITY_ID } })!;
    const updated = devDb.city.update({
      where: { id: DEV_CITY_ID },
      data: { name: 'Renamed City Corporation' },
    });
    expect(updated.createdAt).toEqual(before.createdAt);
  });
});
