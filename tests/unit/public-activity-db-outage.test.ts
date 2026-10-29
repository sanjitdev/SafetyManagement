/**
 * Vitest: regression guard for the production 500 on
 * `GET /api/v1/activity/public` when the database is unreachable.
 *
 * ## The bug
 *
 * The public activity feed backs both the marketing landing page (`/`)
 * and the citizen `/feed` page. When Neon became unreachable (an
 * account-level quota failure, surfaced by Postgres as error 53000
 * and masked by Prisma as "Can't reach database server"), every
 * anonymous visitor got a hard HTTP 500 — a backend fault taking down
 * a read-only public surface.
 *
 * The route already had the right instinct: when no cities were
 * seeded it returned an empty feed rather than a 500. But the three
 * DB reads that actually hit the database were unguarded, so a DB
 * outage produced exactly the 500 the "empty feed" branch was
 * written to avoid.
 *
 * ## The fix
 *
 *  1. The default-city lookup degrades to an empty feed.
 *  2. The category + ticket queries degrade to an empty feed.
 *  3. A per-ticket trail-hydration failure falls back to the
 *     un-hydrated row instead of failing the whole feed.
 *
 * These tests mock `db` to reject, then assert the route still
 * answers 200 with an empty feed.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';

const rejectingDb = {
  city: { findFirst: vi.fn().mockRejectedValue(new Error('DB down')) },
  category: { findMany: vi.fn().mockRejectedValue(new Error('DB down')) },
  ticket: { findMany: vi.fn().mockRejectedValue(new Error('DB down')) },
};

vi.mock('@/lib/db-switch', () => ({
  db: rejectingDb,
  getActiveSession: vi.fn().mockResolvedValue(null),
  getTicketWithTrail: vi.fn().mockResolvedValue(null),
}));

function makeRequest(url = 'https://cityfix.test/api/v1/activity/public?limit=5') {
  return new Request(url) as never;
}

describe('GET /api/v1/activity/public — database outage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rejectingDb.city.findFirst.mockRejectedValue(new Error('DB down'));
    rejectingDb.category.findMany.mockRejectedValue(new Error('DB down'));
    rejectingDb.ticket.findMany.mockRejectedValue(new Error('DB down'));
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('returns 200 with an empty feed when the default-city lookup fails', async () => {
    const { GET } = await import('@/app/api/v1/activity/public/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tickets: unknown[]; categories: unknown[] };
    expect(body.tickets).toEqual([]);
    expect(body.categories).toEqual([]);
  });

  test('returns 200 with an empty feed when the category/ticket queries fail', async () => {
    // The city lookup succeeds, so the route proceeds to the ticket
    // query — which is where the outage actually bites.
    rejectingDb.city.findFirst.mockResolvedValue({ id: 'city_dhaka_north' });

    const { GET } = await import('@/app/api/v1/activity/public/route');
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tickets: unknown[]; categories: unknown[] };
    expect(body.tickets).toEqual([]);
    expect(body.categories).toEqual([]);
  });
});

describe('GET /api/v1/activity/public — route source invariants', () => {
  test('the ticket/category queries sit inside a try/catch', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const source = readFileSync(
      path.join(
        process.cwd(),
        'app',
        'api',
        'v1',
        'activity',
        'public',
        'route.ts',
      ),
      'utf8',
    );
    const handler = source.slice(source.indexOf('export async function GET'));
    // A `catch` that returns an empty feed must exist in the handler.
    expect(handler).toMatch(/catch\s*\{[^}]*tickets:\s*\[\][^}]*categories:\s*\[\]/s);
  });
});
