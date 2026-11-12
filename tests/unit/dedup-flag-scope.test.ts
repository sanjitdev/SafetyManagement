/**
 * Vitest: `GET /api/v1/dispatcher/dedup-flags` — the scope filter.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The dedup-flag list route filters pending flags to the dispatcher's
 * (city, ward, department) scope. The department dimension follows the
 * same rule as `requireScope` (lib/auth/guards.ts): a flag whose
 * ticket's category has NO department (e.g. "Other") is NOT
 * department-scoped, so it stays visible to every dispatcher in the
 * ward. A flag whose department IS set is visible only to a dispatcher
 * bound to that department.
 *
 * Before the fix the filter was a strict equality
 * (`!session.departmentId || f.departmentId === session.departmentId`),
 * so a null-department flag was filtered OUT of the list — the
 * dispatcher could never see it, and `requireScope` then refused the
 * confirm/dismiss too. The flag was invisible AND un-actionable.
 *
 * `tests/unit/dedup-flag.test.ts` covers the dev-store CRUD surface
 * only; nothing covered the route's filter. This file does, by
 * driving the real route handler against the dev store — the contract
 * under test IS the filter's behaviour, so mocking it away would
 * defeat the purpose.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  resetStore,
  devDb,
  DEV_CITY_ID,
  DEV_WARD_ID,
} from '@/lib/dev-store';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is not
 * available in the Vitest (node) environment. The route reads the
 * session cookie through it, so we stub it with a jar the test
 * controls. The jar must be a real Map — the cookie's CONTENTS are
 * what the session lookup reads.
 */
const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { GET } = await import('@/app/api/v1/dispatcher/dedup-flags/route');

/**
 * The seeded dispatcher persona — `user_dispatcher_habib`, bound to
 * `(city_dhaka_north, ward_14, dept_streetlight)`.
 */
async function loginAsDispatcher(): Promise<void> {
  const { devMintSession } = await import('@/lib/dev-session');
  const { cookieValue } = await devMintSession('dispatcher');
  cookieJar.set('cityfix_session', cookieValue);
}

/**
 * Create a pending dedup flag with an explicit scope.
 *
 * The dev store's `dedupFlag.create` mints its own id, so only the
 * scope fields are passed in.
 */
function makeFlag(args: {
  departmentId: string | null;
  wardId?: string;
}): void {
  devDb.dedupFlag.create({
    data: {
      cityId: DEV_CITY_ID,
      wardId: args.wardId ?? DEV_WARD_ID,
      departmentId: args.departmentId,
      ticketId: 'ticket_seed_submitted_1',
      originalTicketId: 'ticket_seed_routed_1',
      citizenReason: null,
    },
  });
}

/**
 * The route reads its query string from `req.nextUrl`, which only a
 * `NextRequest` carries — a plain `Request` has no `nextUrl`.
 */
function buildRequest(): NextRequest {
  return new NextRequest(
    'http://localhost:3000/api/v1/dispatcher/dedup-flags?limit=50',
  );
}

async function listFlags(): Promise<{
  status: number;
  flags: Array<{ departmentId: string | null; wardId: string }>;
}> {
  const res = await GET(buildRequest());
  const body = (await res.json()) as {
    flags?: Array<{ departmentId: string | null; wardId: string }>;
  };
  return { status: res.status, flags: body.flags ?? [] };
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
});

describe('GET /api/v1/dispatcher/dedup-flags — department scope', () => {
  it('lists a flag whose ticket category has no department', async () => {
    // A category with NO department (e.g. "Other") produces a flag
    // that is NOT department-scoped, so every dispatcher in the ward
    // may act on it. The list filter must agree with `requireScope`.
    await loginAsDispatcher();
    makeFlag({ departmentId: null });

    const { status, flags } = await listFlags();
    expect(status).toBe(200);
    expect(flags.length).toBe(1);
    expect(flags[0].departmentId).toBeNull();
  });

  it('lists a flag whose ticket category is in the dispatcher department', async () => {
    await loginAsDispatcher();
    makeFlag({ departmentId: 'dept_streetlight' });

    const { status, flags } = await listFlags();
    expect(status).toBe(200);
    expect(flags.length).toBe(1);
  });

  it('does NOT list a flag whose ticket category is in another department', async () => {
    // The other half of the rule: a flag that IS department-scoped and
    // sits in a different department stays out of this dispatcher's
    // list.
    await loginAsDispatcher();
    makeFlag({ departmentId: 'dept_waste' });

    const { status, flags } = await listFlags();
    expect(status).toBe(200);
    expect(flags.length).toBe(0);
  });

  it('does NOT list a flag from another ward', async () => {
    // The ward dimension is unaffected by the department exemption.
    await loginAsDispatcher();
    makeFlag({ departmentId: null, wardId: 'ward_15' });

    const { status, flags } = await listFlags();
    expect(status).toBe(200);
    expect(flags.length).toBe(0);
  });

  it('rejects a non-dispatcher session', async () => {
    const { devMintSession } = await import('@/lib/dev-session');
    const { cookieValue } = await devMintSession('citizen');
    cookieJar.set('cityfix_session', cookieValue);

    const res = await GET(
      new Request(
        'http://localhost:3000/api/v1/dispatcher/dedup-flags?limit=50',
      ) as never,
    );
    expect(res.status).toBe(403);
  });
});
