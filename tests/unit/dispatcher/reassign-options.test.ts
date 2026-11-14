/**
 * Vitest: `GET /api/v1/dispatcher/reassign-options` — the reference
 * data behind the dispatcher's reassign panel.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 *
 * Wave 4 / bolt 009-005 found that the reassign panel offered its
 * choices from two hard-coded constants in the page:
 *
 *   const WARD_OPTIONS = [
 *     { id: 'ward_14', label: 'Ward 14 — Mirpur' },
 *     { id: 'ward_15', label: 'Ward 15 — Cantonment' },
 *   ];
 *
 * That list is wrong in a way no screenshot could show, because
 * the two ids it names DO exist in the dev store — the list is
 * merely INCOMPLETE and UNSCOPED. It omits every ward the real
 * database has beyond the two the seed creates, and it names
 * wards from the dispatcher's city without the endpoint knowing
 * anything about the dispatcher's scope.
 *
 * So the contract this file defends is:
 *
 *   1. The ward list is read from the STORE, not from a constant.
 *      The reachable set is the intersection of "wards in the
 *      dispatcher's city" and "wards the dispatcher may hold".
 *   2. A ward-BOUND dispatcher gets exactly one ward.
 *   3. The category list is NOT narrowed by the dispatcher's
 *      department — a category belongs to a CITY, and a dispatcher
 *      may reclassify a ticket they hold into any of their city's
 *      categories.
 *   4. The list never contains an option the reassign PATCH
 *      would refuse: every ward offered is in the dispatcher's
 *      city, so none of them can come back as a 403
 *      `cross_city_access_denied`.
 *
 * The dev store is the mirror of the Prisma path, so this file
 * exercises the same branch the dev server runs.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { resetStore, getStore } from '@/lib/dev-store';

/**
 * `next/headers` `cookies()` is a Next.js server-only API that is
 * not available in the Vitest (node) environment. The route reads
 * the session cookie through it, so we stub it with a jar the
 * test controls.
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

const { GET } = await import('@/app/api/v1/dispatcher/reassign-options/route');

/**
 * The seeded dispatcher persona — `user_dispatcher_habib`, bound to
 * `(city_dhaka_north, ward_14, dept_streetlight)`.
 */
async function loginAsDispatcher(): Promise<void> {
  const { devMintSession } = await import('@/lib/dev-session');
  const { cookieValue } = await devMintSession('dispatcher');
  cookieJar.set('cityfix_session', cookieValue);
}

interface OptionsBody {
  wards: Array<{
    id: string;
    number: number;
    name: string | null;
    nameBn: string | null;
  }>;
  categories: Array<{ id: string; name: string; nameBn: string | null }>;
  wardScoped: boolean;
  error?: string;
}

async function getOptions(): Promise<{ status: number; body: OptionsBody }> {
  const res = await GET();
  return { status: res.status, body: (await res.json()) as OptionsBody };
}

beforeEach(() => {
  resetStore();
  cookieJar.clear();
});

describe('GET /api/v1/dispatcher/reassign-options — the ward list', () => {
  it('reads the wards from the store, not from a constant', async () => {
    await loginAsDispatcher();

    const { body } = await getOptions();
    const seededWardIds = [...getStore().wards.keys()].sort();
    // The store seeds more wards than a ward-bound dispatcher can
    // reach, so the list is genuinely narrowed rather than
    // echoed.
    expect(seededWardIds.length).toBeGreaterThan(body.wards.length);
    for (const ward of body.wards) {
      expect(seededWardIds).toContain(ward.id);
    }
  });

  it('offers a ward-bound dispatcher exactly their own ward', async () => {
    await loginAsDispatcher();

    const { body } = await getOptions();
    expect(body.wardScoped).toBe(true);
    expect(body.wards).toHaveLength(1);
    expect(body.wards[0].id).toBe('ward_14');
  });

  it('never offers a ward from another city', async () => {
    await loginAsDispatcher();

    const { body } = await getOptions();
    const sessionCity = getStore().wards.get('ward_14')!.cityId;
    for (const ward of body.wards) {
      expect(getStore().wards.get(ward.id)!.cityId).toBe(sessionCity);
    }
  });

  it('carries the ward number so a nameless ward is still labelable', async () => {
    await loginAsDispatcher();

    const { body } = await getOptions();
    for (const ward of body.wards) {
      // A ward with no name at all is labelled by its number by
      // the page, but the API still has to carry the number.
      expect(ward.number).toBeGreaterThan(0);
    }
  });
});

describe('GET /api/v1/dispatcher/reassign-options — the category list', () => {
  it('offers the city’s categories', async () => {
    await loginAsDispatcher();

    const { body } = await getOptions();
    expect(body.categories.length).toBeGreaterThan(0);
    const seededCategoryIds = [...getStore().categories.keys()].sort();
    for (const category of body.categories) {
      expect(seededCategoryIds).toContain(category.id);
    }
  });

  it('is NOT narrowed by the dispatcher’s department', async () => {
    await loginAsDispatcher();

    // The dispatcher is bound to `dept_streetlight`. The category
    // list still carries every category in the city, because a
    // category is a CITY entity and reclassifying a ticket you
    // hold into any of the city's categories is legitimate.
    //
    // Narrowing this list by department would leave a streetlight
    // dispatcher unable to reclassify a streetlight ticket as
    // "garbage not collected" for the right crew.
    const seededCategories = [...getStore().categories.values()];
    const { body } = await getOptions();
    expect(body.categories.length).toBe(seededCategories.length);
  });

  it('carries a readable name for every category', async () => {
    await loginAsDispatcher();

    const { body } = await getOptions();
    for (const category of body.categories) {
      expect(category.name.length).toBeGreaterThan(0);
    }
  });
});

describe('GET /api/v1/dispatcher/reassign-options — the auth boundary', () => {
  it('rejects a citizen', async () => {
    const { devMintSession } = await import('@/lib/dev-session');
    const { cookieValue } = await devMintSession('citizen');
    cookieJar.set('cityfix_session', cookieValue);

    const { status, body } = await getOptions();
    expect(status).toBe(403);
    expect(body.error).toBe('forbidden_role');
  });

  it('rejects an unauthenticated caller', async () => {
    const { status, body } = await getOptions();
    expect(status).toBe(401);
    expect(body.error).toBe('not_authenticated');
  });
});
