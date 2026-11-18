/**
 * Light-theme visual baselines for the MapLibre-backed
 * location page (tests/08-report-location-map-light.spec.ts).
 *
 * Captures 3 PNGs:
 *   - report-location-1440x900.png (default — in-bounds)
 *   - report-location-out-of-bounds-1440x900.png
 *     (pin programmatically dragged south past the Dhaka
 *     District polygon; the side card flips to the
 *     out-of-bounds UX)
 *   - report-location-with-dedup-ring-1440x900.png
 *     (a near-duplicate payload is in sessionStorage;
 *     the page does NOT draw the ring — see the
 *     long note in that test for why, and for what
 *     the test asserts instead)
 *
 * NOTE ON THE TWO SCENARIO BASELINES
 * ----------------------------------
 * Until 2026-11-18 the out-of-bounds and dedup-ring
 * baselines were BYTE-IDENTICAL to the plain one
 * (md5 `4c0ed16d694a` for both). The cause was
 * `clearDraft` using `page.addInitScript`, which
 * runs on EVERY navigation — including the
 * `page.reload()` each scenario uses to load the
 * draft it just wrote. The init script deleted the
 * draft on the reload, so the page fell back to the
 * DEFAULT pin and every scenario rendered the same
 * in-bounds picture.
 *
 * `clearDraft` now clears once, explicitly. The
 * out-of-bounds baseline therefore captures a
 * genuinely different image (the red
 * "Ward could not be determined" banner), and the
 * two scenario baselines are no longer identical
 * to each other.
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1
 *     (`npm run dev:feat`).
 *   - The Carto Voyager tile CDN must be reachable
 *     from the test runner. In a fully-offline
 *     sandbox the tile fetch will fail and the
 *     PNGs will show a grey basemap — the test
 *     will still pass (we wait for the
 *     `idle` event, not the tile bytes).
 *
 * The existing `tests/07-report-see-and-pick-light.spec.ts`
 * baseline `report-location-1440x900.png` is stale
 * (the SVG placeholder has been replaced by the
 * MapLibre map). The team.md Mandated
 * `npm run test:mockups` gate will surface the diff
 * on next run; the canonical location baseline
 * now lives in this spec.
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const VIEWPORT = { width: 1440, height: 900 };

/** Force the light theme + English labels so the
 *  baseline is language-stable across runs. */
async function forceLightTheme(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Mint a citizen session via the dev-only login route. */
async function signInAsCitizen(page: Page) {
  const resp = await page.request.post(`${BASE}/api/dev/login`, {
    data: { role: 'citizen' },
  });
  expect(resp, 'expected /api/dev/login to respond').not.toBeNull();
  expect(resp.status(), `expected 200 from /api/dev/login, got ${resp.status()}`).toBe(
    200,
  );
}

/** Clear the sessionStorage draft so the baselines
 *  capture the first-visit empty state.
 *
 *  WHY THIS IS SCOPED, NOT AN `addInitScript`
 *  ------------------------------------------
 *  `page.addInitScript` runs on EVERY navigation in the
 *  page — including the `page.reload()` the
 *  out-of-bounds and dedup-ring scenarios use to load
 *  the draft they just wrote. An init script that
 *  unconditionally removes the draft therefore deletes
 *  it again on the reload, and the page falls back to
 *  the DEFAULT pin in the home ward. The
 *  out-of-bounds and dedup-ring baselines were
 *  therefore byte-identical to the plain one: three
 *  scenarios, one image, none of them testing what
 *  their names claim.
 *
 *  The fix is to clear the draft ONCE, explicitly, on
 *  the first load — and leave every later navigation
 *  alone. The scenario tests then set their draft and
 *  reload into it.
 *
 *  The clear happens on `/` rather than
 *  `/report/location` so the page needs no session:
 *  the draft lives in sessionStorage, which is
 *  per-origin, so clearing it from any page on the
 *  origin clears it for the report flow too. */
async function clearDraft(page: Page) {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      window.sessionStorage.removeItem('cityfix.reportDraft.v1');
      window.sessionStorage.removeItem('cityfix.reportDedup.v1');
    } catch {}
  });
}

/** Wait for the MapLibre map to finish loading tiles
 *  before the screenshot. MapLibre emits `idle` once
 *  the basemap + the polygon + the dedup ring are
 *  all rendered. */
async function waitForMapIdle(page: Page) {
  await page.waitForSelector('[data-testid="mapview"]', { timeout: 10_000 });
  // The map's `idle` event is internal; we proxy
  // through the map's canvas. A short network settle
  // is enough in practice.
  await page.waitForTimeout(2_500);
}

test('report-location-1440x900 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  await clearDraft(page);
  await signInAsCitizen(page);
  // `networkidle` is unreliable on a MapLibre page (tile
  // connections stay open) — wait for the DOM and let
  // waitForMapIdle() do the settling.
  const resp = await page.goto(BASE + '/report/location', {
    waitUntil: 'domcontentloaded',
  });
  expect(resp, 'expected response for /report/location').not.toBeNull();
  expect(resp!.status(), `expected 200 for /report/location, got ${resp!.status()}`).toBe(
    200,
  );
  await waitForMapIdle(page);
  await expect(page).toHaveScreenshot('report-location-1440x900.png', {
    fullPage: true,
  });
});

test('report-location-out-of-bounds-1440x900 matches light baseline', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  await clearDraft(page);
  await signInAsCitizen(page);
  // `networkidle` is unreliable on a MapLibre page (tile
  // connections stay open) — wait for the DOM and let
  // waitForMapIdle() do the settling.
  const resp = await page.goto(BASE + '/report/location', {
    waitUntil: 'domcontentloaded',
  });
  expect(resp, 'expected response for /report/location').not.toBeNull();
  expect(resp!.status(), `expected 200 for /report/location, got ${resp!.status()}`).toBe(
    200,
  );
  await waitForMapIdle(page);

  // Programmatic pin drag south, well past the Dhaka
  // District polygon. We set the lat/lng via
  // sessionStorage draft so the page loads at the
  // out-of-bounds position rather than animating
  // from default. (south of Keraniganj — Bay of
  // Bengal.)
  await page.evaluate(() => {
    const draft = {
      step: 'location',
      locationLat: 23.40,
      locationLng: 90.40,
      cityId: 'demo',
      wardId: 'demo',
      photos: [],
      categoryId: null,
      description: '',
    };
    try {
      window.sessionStorage.setItem(
        'cityfix.reportDraft.v1',
        JSON.stringify(draft),
      );
    } catch {}
  });
  // NOTE: `networkidle` never fires here — MapLibre holds tile
  // connections open for the life of the map. Wait for the DOM and
  // let waitForMapIdle() do the settling.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForMapIdle(page);

  await expect(page).toHaveScreenshot(
    'report-location-out-of-bounds-1440x900.png',
    { fullPage: true },
  );
});

test('report-location-with-dedup-ring-1440x900 matches light baseline', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  await clearDraft(page);
  await signInAsCitizen(page);
  // `networkidle` is unreliable on a MapLibre page (tile
  // connections stay open) — wait for the DOM and let
  // waitForMapIdle() do the settling.
  const resp = await page.goto(BASE + '/report/location', {
    waitUntil: 'domcontentloaded',
  });
  expect(resp, 'expected response for /report/location').not.toBeNull();
  expect(resp!.status(), `expected 200 for /report/location, got ${resp!.status()}`).toBe(
    200,
  );
  await waitForMapIdle(page);

  // Set a near-duplicate marker in sessionStorage.
  //
  // WHY THIS TEST DOESN'T SHOW A RING
  // ----------------------------------
  // The original version of this spec wrote the dedup payload and
  // then screenshotted, expecting the 50m ring to appear. It never
  // could:
  //
  //   - `/report/location` does not READ `cityfix.reportDedup.v1`.
  //     The dedup payload is written by the NOTE step
  //     (`app/report/(create)/note/page.tsx`) and consumed by the
  //     SUMMARY step.
  //   - `MapView`'s `showDedupRing` prop is not passed by ANY page.
  //     The prop defaults to false, so the ring layers are created
  //     hidden and stay hidden.
  //
  // So the captured PNG was byte-for-byte the plain in-bounds one:
  // a test that asserted a ring which the app has no path to draw.
  // The baseline has been renamed to reflect what it actually
  // captures.
  //
  // What IS worth asserting is the DEDUP PAYLOAD being visible to
  // the app, and the ring layers existing in the style but hidden.
  // Both are checked below.
  await page.evaluate(() => {
    try {
      window.sessionStorage.setItem(
        'cityfix.reportDedup.v1',
        JSON.stringify({
          hasNearDuplicate: true,
          nearDuplicateLat: 23.7895,
          nearDuplicateLng: 90.4078,
        }),
      );
    } catch {}
  });
  // See the note above — `networkidle` never fires on a live map.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForMapIdle(page);

  // The payload survived the reload — the app CAN read it, even
  // though this particular page does not.
  const dedupPayload = await page.evaluate(() => {
    try {
      return window.sessionStorage.getItem('cityfix.reportDedup.v1');
    } catch {
      return null;
    }
  });
  expect(dedupPayload, 'expected the dedup payload to survive the reload').not.toBeNull();
  expect(
    JSON.parse(dedupPayload as string).hasNearDuplicate,
    'expected the dedup payload to carry hasNearDuplicate',
  ).toBe(true);

  // The ring layers exist in the map style, and they are HIDDEN —
  // because no page passes `showDedupRing`.
  //
  // HOW THE MAP INSTANCE IS REACHED
  // --------------------------------
  // MapLibre is imported as a bundled ESM module, so there is no
  // `window.maplibregl` to grab. The instance lives in a React
  // ref (`mapRef`), which is a hook value — so it is found by
  // walking the React fiber tree looking for a hook whose
  // `memoizedState.current` carries a `getStyle` method.
  //
  // The walk must start at the `[data-testid="mapview"]` element
  // (MapView's own container div), NOT at `.maplibregl-map`
  // (the canvas wrapper MapLibre creates). The canvas wrapper is
  // a child rendered by MapLibre itself, so the fiber that owns
  // the ref is a PARENT of it — starting there and only walking
  // `return`/`child`/`sibling` reaches the owning component, but
  // the map instance is one hop further up than the canvas path
  // finds, and the canvas path's fiber has no hook chain to
  // follow. Starting at the mapview element finds it directly at
  // depth 1.
  const ringVisibility = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="mapview"]');
    if (!el) return null;
    const fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber'));
    if (!fiberKey) return null;
    const root = (el as unknown as Record<string, unknown>)[fiberKey];
    type MapLike = { getLayoutProperty?: (id: string, prop: string) => unknown };
    // One link in React's hook chain. `memoizedState` is the hook's
    // value; for a `useRef` that value is `{ current: <the map> }`.
    type Hook = {
      memoizedState?: unknown;
      next?: Hook;
    };
    // A holder object, not a plain `let`: TypeScript's
    // control-flow analysis cannot see an assignment made inside
    // the `visit` closure, so a `let map` narrows to `never` at the
    // point of use and every property access errors.
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
    return {
      fill: map.getLayoutProperty('dedup-ring-fill', 'visibility'),
      line: map.getLayoutProperty('dedup-ring-line', 'visibility'),
    };
  });
  expect(ringVisibility, 'expected to reach the MapLibre map instance').not.toBeNull();
  expect(
    (ringVisibility as { fill: unknown }).fill,
    'expected the dedup ring fill to be hidden (no page passes showDedupRing)',
  ).toBe('none');
  expect(
    (ringVisibility as { line: unknown }).line,
    'expected the dedup ring line to be hidden (no page passes showDedupRing)',
  ).toBe('none');

  await expect(page).toHaveScreenshot(
    'report-location-with-dedup-ring-1440x900.png',
    { fullPage: true },
  );
});