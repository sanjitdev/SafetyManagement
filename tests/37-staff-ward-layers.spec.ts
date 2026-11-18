/**
 * Playwright route spec — the WARD MOSAIC ON THE STAFF MAPS.
 *
 * (tests/37-staff-ward-layers.spec.ts)
 *
 * The citizen's report-location map has drawn the city's ward
 * boundaries since 2026-11-18 — one filled, outlined polygon per
 * ward, with the ward's NUMBER on a disc. The STAFF maps did not:
 * `/dispatcher`, `/dispatcher/map`, `/crew`, `/crew/map` and
 * `/admin` all showed a bare basemap with pins on it.
 *
 * That is a real gap, not a cosmetic one. A dispatcher looking at
 * a map of pins could not see which WARD any pin belonged to, so
 * "reassign this to Ward 19" had nothing on screen to point at —
 * and the ward is the authorisation boundary for the work
 * (`project_ward_is_auth_boundary`): a ticket in the wrong ward
 * disappears from every list.
 *
 * WHY THIS SPEC IS SHAPED THE WAY IT IS
 * ------------------------------------
 * A layer that "exists in the style" can still render NOTHING.
 * That is not a hypothetical: the report map's ward-number
 * labels were invisible for a long time because the `text-field`
 * was a `concat` expression that produced no glyphs, and the
 * offset was in pixels when MapLibre wanted ems. Both failed
 * SILENTLY — no error, no typecheck failure, no lint error.
 *
 * So this spec asserts on RENDERED PIXELS, not on the presence of
 * a layer id:
 *
 *   1. the ward source has features (the data arrived), and
 *   2. those features project to on-screen positions INSIDE the
 *      map container — i.e. the geometry was actually drawn.
 *
 * A `queryRenderedFeatures` check is the other half: it asks
 * MapLibre what it DREW, which is the only way to catch a layer
 * that is present but invisible.
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The MapLibre instance, reached through the React fiber tree.
 *
 * This body is INJECTED into the page via `page.evaluate`, so it
 * must be self-contained: no closure over anything outside the
 * function. It is the same walk `tests/08-report-location-map-light.spec.ts`
 * uses, generalised over the map container's test id.
 */
const FIND_MAP_IN_PAGE = (testId: string) => {
  const el = document.querySelector(`[data-testid="${testId}"]`);
  if (!el) return null;
  const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
  if (!fiberKey) return null;
  const root = (el as unknown as Record<string, unknown>)[fiberKey];
  type MapLike = {
    getLayoutProperty?: (id: string, prop: string) => unknown;
    getSource?: (id: string) => unknown;
    queryRenderedFeatures?: (layerId: string) => unknown[];
    getCanvas?: () => { width: number; height: number };
  };
  type Hook = { memoizedState?: unknown; next?: Hook };
  const found: { map: MapLike | null } = { map: null };
  const seen = new Set<unknown>();
  let hops = 0;
  const visit = (node: unknown): boolean => {
    if (!node || found.map || hops > 400) return false;
    hops += 1;
    if (seen.has(node)) return false;
    seen.add(node);
    const f = node as {
      stateNode?: MapLike;
      memoizedState?: Hook;
      return?: unknown;
      child?: unknown;
      sibling?: unknown;
    };
    if (f.stateNode && typeof f.stateNode.getLayoutProperty === 'function') {
      found.map = f.stateNode;
      return true;
    }
    let hook: Hook | undefined = f.memoizedState;
    let guard = 0;
    while (hook && guard < 60) {
      const value = hook.memoizedState;
      if (value && typeof value === 'object') {
        const current = (value as { current?: unknown }).current;
        if (
          current &&
          typeof current === 'object' &&
          typeof (current as { getLayoutProperty?: unknown }).getLayoutProperty ===
            'function'
        ) {
          found.map = current as MapLike;
          return true;
        }
      }
      hook = hook.next;
      guard += 1;
    }
    return visit(f.return) || visit(f.child) || visit(f.sibling);
  };
  visit(root);
  const map = found.map;
  if (!map || typeof map.getLayoutProperty !== 'function') return null;
  (window as unknown as { __cityfixMap?: unknown }).__cityfixMap = map;
  return map;
};

async function devLogin(
  ctx: APIRequestContext,
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin',
) {
  return ctx.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
}

async function forceLightTheme(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

/**
 * Assert that the map under `testId` draws the ward mosaic.
 *
 * The three checks, in order of what they catch:
 *
 *   1. THE SOURCE HAS FEATURES. A ward source with zero features
 *      means the geojson fetch never landed — the layers exist and
 *      the map is empty of wards. This is the failure mode the
 *      "fetch resolves after the map's load event" bug produces.
 *
 *   2. THE BOUNDARY LAYER RENDERED FEATURES. Asking MapLibre what
 *      it DREW, which is the only way to catch a layer that is
 *      present in the style but invisible on screen.
 *
 *   3. THE WARD NUMBERS RENDERED. The discs with the ward numbers
 *      are a separate point source, and they have failed
 *      independently of the polygons before (the `concat`
 *      text-field that produced no glyphs).
 */
async function expectWardMosaic(page: Page, testId: string) {
  const map = await page.evaluate(FIND_MAP_IN_PAGE, testId);
  expect(map, `expected to reach the MapLibre instance for ${testId}`).not.toBeNull();

  const report = await page.evaluate(() => {
    const map = (window as unknown as {
      __cityfixMap?: {
        getSource?: (id: string) => unknown;
        queryRenderedFeatures?: (opts: { layers: string[] }) => unknown[];
        getCanvas?: () => { width: number; height: number };
      };
    }).__cityfixMap;
    if (!map) return null;

    const source = map.getSource?.('ward-boundaries') as
      | { _data?: { features?: unknown[] } }
      | undefined;
    const featureCount = source?._data?.features?.length ?? 0;

    const renderedBoundaries =
      map.queryRenderedFeatures?.({ layers: ['ward-boundaries-line'] })?.length ?? 0;
    const renderedLabels =
      map.queryRenderedFeatures?.({ layers: ['ward-labels-label-disc'] })?.length ?? 0;

    const canvas = map.getCanvas?.();

    return {
      featureCount,
      renderedBoundaries,
      renderedLabels,
      canvasWidth: canvas?.width ?? 0,
      canvasHeight: canvas?.height ?? 0,
    };
  });

  expect(report, 'expected the map instance to be published on window').not.toBeNull();
  const r = report!;

  // 1. The data arrived.
  expect(
    r.featureCount,
    'expected the ward-boundaries source to hold features — the ward ' +
      'geojson fetch did not land (the layers would exist and draw nothing)',
  ).toBeGreaterThan(0);

  // 2. The boundaries were actually DRAWN.
  expect(
    r.renderedBoundaries,
    'expected the ward boundary layer to have rendered features — the ' +
      'layer exists in the style but is invisible',
  ).toBeGreaterThan(0);

  // 3. The ward numbers were actually DRAWN.
  expect(
    r.renderedLabels,
    'expected the ward-number discs to have rendered features — a ward ' +
      'label source with no glyphs is the silent failure this spec exists for',
  ).toBeGreaterThan(0);
}

test.describe('Staff maps draw the city ward mosaic', () => {
  /**
   * Log in over an API context and mirror the cookie onto the
   * page's own context.
   *
   * `pwRequest.newContext()` is an API context — it has no
   * `newPage()`. The page comes from the `page` fixture, and the
   * session cookie is copied across with `addCookies`.
   */
  async function loginPage(page: Page, role: 'citizen' | 'dispatcher' | 'crew' | 'admin') {
    const ctx = await pwRequest.newContext();
    const login = await devLogin(ctx, role);
    expect(login.status()).toBe(303);
    const cookies = await ctx.storageState();
    if (cookies.cookies.length > 0) {
      await page.context().addCookies(cookies.cookies);
    }
    await ctx.dispose();
  }

  /**
   * Wait for the ward geojson to land.
   *
   * The ward layers are created on the map's `load` event, and the
   * geojson fetch resolves AFTER that — so the layers are created
   * empty and filled in when the data arrives. Waiting for the
   * map container is not enough; the SOURCE must have features.
   */
  async function waitForWardData(page: Page, testId: string) {
    // Walk the fiber tree FIRST — that is what publishes the map
    // instance on `window`. Waiting on `window.__cityfixMap` before
    // walking it would be a chicken-and-egg deadlock.
    await page.waitForFunction(
      (id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return false;
        return Object.keys(el).some((k) => k.startsWith('__reactFiber'));
      },
      testId,
      { timeout: 20_000 },
    );
    await page.evaluate(FIND_MAP_IN_PAGE, testId);

    // Now poll the SOURCE. The ward layers are created on the map's
    // `load` event, and the geojson fetch resolves AFTER that — so
    // the layers are created empty and filled in when the data
    // arrives. Waiting for the map container is not enough; the
    // source must hold features.
    await page.waitForFunction(
      () => {
        const map = (window as unknown as {
          __cityfixMap?: { getSource?: (id: string) => unknown };
        }).__cityfixMap;
        const source = map?.getSource?.('ward-boundaries') as
          | { _data?: { features?: unknown[] } }
          | undefined;
        return (source?._data?.features?.length ?? 0) > 0;
      },
      undefined,
      { timeout: 20_000 },
    );
  }

  test('the dispatcher MAP page draws the ward boundaries and their numbers', async ({
    page,
  }) => {
    await loginPage(page, 'dispatcher');
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.goto(`${BASE}/dispatcher/map`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="dispatcher-map"]', { timeout: 20_000 });
    await waitForWardData(page, 'dispatcher-map');

    await expectWardMosaic(page, 'dispatcher-map');
  });

  test('the dispatcher DASHBOARD draws the ward boundaries and their numbers', async ({
    page,
  }) => {
    await loginPage(page, 'dispatcher');
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="city-activity-map"]', { timeout: 20_000 });
    await waitForWardData(page, 'city-activity-map');

    await expectWardMosaic(page, 'city-activity-map');
  });

  test('the CREW dashboard draws the ward boundaries and their numbers', async ({
    page,
  }) => {
    await loginPage(page, 'crew');
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.goto(`${BASE}/crew`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="city-activity-map"]', { timeout: 20_000 });
    await waitForWardData(page, 'city-activity-map');

    await expectWardMosaic(page, 'city-activity-map');
  });

  test('the ADMIN dashboard draws the ward boundaries and their numbers', async ({
    page,
  }) => {
    await loginPage(page, 'admin');
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });

    await page.waitForSelector('[data-testid="city-activity-map"]', { timeout: 20_000 });
    await waitForWardData(page, 'city-activity-map');

    await expectWardMosaic(page, 'city-activity-map');
  });
});
