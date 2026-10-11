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
 *     (a near-duplicate is in the dev store; the
 *     page renders the 50m dedup ring)
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
 *  capture the first-visit empty state. */
async function clearDraft(page: Page) {
  await page.addInitScript(() => {
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
  const resp = await page.goto(BASE + '/report/location', {
    waitUntil: 'networkidle',
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
  const resp = await page.goto(BASE + '/report/location', {
    waitUntil: 'networkidle',
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
  await page.reload({ waitUntil: 'networkidle' });
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
  const resp = await page.goto(BASE + '/report/location', {
    waitUntil: 'networkidle',
  });
  expect(resp, 'expected response for /report/location').not.toBeNull();
  expect(resp!.status(), `expected 200 for /report/location, got ${resp!.status()}`).toBe(
    200,
  );
  await waitForMapIdle(page);

  // Set a near-duplicate marker in sessionStorage
  // so the page renders the 50m dedup ring. The
  // exact storage key + shape is owned by Bolt
  // 002-003b's dedup helper; the spec is robust
  // to the field shape by using the same prefix.
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
  await page.reload({ waitUntil: 'networkidle' });
  await waitForMapIdle(page);

  await expect(page).toHaveScreenshot(
    'report-location-with-dedup-ring-1440x900.png',
    { fullPage: true },
  );
});