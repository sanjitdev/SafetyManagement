/**
 * Unit tests for the dedup engine (lib/platform/dedup.ts).
 *
 * Validates PLAT-REQ-004: when a new report is within the city's
 * dedupRadiusMeters of an existing open ticket of the same category, the
 * engine returns the existing ticket and a distance. The radius is
 * read from the City record (50m default for Dhaka North).
 *
 * These tests use a mocked db-switch so the engine's logic — haversine,
 * bounding-box pre-filter, status filter — runs in isolation.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

const cityFindUnique = vi.fn();
const ticketFindMany = vi.fn();

vi.mock('@/lib/db-switch', () => ({
  db: {
    city: { findUnique: cityFindUnique },
    ticket: { findMany: ticketFindMany },
  },
}));

const { checkDedup } = await import('@/lib/platform/dedup');

describe('dedup engine', () => {
  beforeEach(() => {
    cityFindUnique.mockReset();
    ticketFindMany.mockReset();
  });

  it('returns null when no candidate tickets exist', async () => {
    cityFindUnique.mockResolvedValueOnce({
      id: 'city_dhaka_north',
      dedupRadiusMeters: 50,
    });
    ticketFindMany.mockResolvedValueOnce([]);
    const match = await checkDedup({
      cityId: 'city_dhaka_north',
      categoryId: 'cat_streetlight',
      locationLat: 23.789,
      locationLng: 90.4075,
    });
    expect(match).toBeNull();
  });

  it('returns the closest existing ticket within the radius', async () => {
    cityFindUnique.mockResolvedValueOnce({
      id: 'city_dhaka_north',
      dedupRadiusMeters: 50,
    });
    ticketFindMany.mockResolvedValueOnce([
      {
        id: 'tkt_near',
        status: 'submitted',
        locationLat: 23.78905,
        locationLng: 90.40755,
        createdAt: '2026-10-04T08:00:00.000Z',
      },
      {
        id: 'tkt_far',
        status: 'submitted',
        locationLat: 23.7895,
        locationLng: 90.4085,
        createdAt: '2026-10-04T07:00:00.000Z',
      },
    ]);
    const match = await checkDedup({
      cityId: 'city_dhaka_north',
      categoryId: 'cat_streetlight',
      locationLat: 23.789,
      locationLng: 90.4075,
    });
    expect(match).not.toBeNull();
    // The near one (~7m) wins over the far one (~62m).
    expect(match!.existingTicketId).toBe('tkt_near');
    expect(match!.distanceMeters).toBeLessThan(20);
  });

  it('returns null when the only candidates are outside the radius', async () => {
    cityFindUnique.mockResolvedValueOnce({
      id: 'city_dhaka_north',
      dedupRadiusMeters: 50,
    });
    ticketFindMany.mockResolvedValueOnce([
      {
        id: 'tkt_far',
        status: 'submitted',
        locationLat: 23.79,
        locationLng: 90.41,
        createdAt: '2026-10-04T08:00:00.000Z',
      },
    ]);
    const match = await checkDedup({
      cityId: 'city_dhaka_north',
      categoryId: 'cat_streetlight',
      locationLat: 23.789,
      locationLng: 90.4075,
    });
    expect(match).toBeNull();
  });

  it('falls back to the 50m default when the city record is missing', async () => {
    cityFindUnique.mockResolvedValueOnce(null);
    ticketFindMany.mockResolvedValueOnce([]);
    const match = await checkDedup({
      cityId: 'city_dhaka_north',
      categoryId: 'cat_streetlight',
      locationLat: 23.789,
      locationLng: 90.4075,
    });
    expect(match).toBeNull();
    // The radius is 50m by default — verify the call was made with
    // bounding-box filters sized for 50m around the candidate point.
    const call = ticketFindMany.mock.calls[0][0];
    const latGte = (call.where.locationLat as { gte: number; lte: number }).gte;
    // gte = candidate.lat - radius/111000 = 23.789 - 50/111000
    expect(latGte).toBeCloseTo(23.789 - 50 / 111_000, 6);
  });
});