/**
 * Light-theme visual baselines for the 3 pre-submit
 * steps of the report flow (tests/07-report-see-and-pick-light.spec.ts).
 *
 * The Bolt 002-003a "see and pick" surface: 1.7 location,
 * 1.8 photo, 1.9 category. Each step renders with no draft
 * (sessionStorage cleared) so the baselines show the
 * first-visit empty state, not a mid-flow draft.
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 *
 * Run: `npx playwright test tests/07-report-see-and-pick-light.spec.ts`
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const VIEWPORT = { width: 1440, height: 900 };

/** Force the light theme + English labels so the baselines are
 *  language-stable across runs (default is Bangla). */
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
  expect(resp.status(), `expected 200 from /api/dev/login, got ${resp.status()}`).toBe(200);
}

/** Clear the sessionStorage draft so the baselines capture
 *  the first-visit empty state (no draft.photoUrls,
 *  no draft.categoryId, no draft.locationLat). */
async function clearDraft(page: Page) {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.removeItem('cityfix.reportDraft.v1');
      window.sessionStorage.removeItem('cityfix.reportDedup.v1');
    } catch {}
  });
}

const STEPS = [
  { name: 'report-location-1440x900', url: '/report/location' },
  { name: 'report-photo-1440x900', url: '/report/photo' },
  { name: 'report-category-1440x900', url: '/report/category' },
];

for (const step of STEPS) {
  test(`${step.name} matches light baseline`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await clearDraft(page);
    await signInAsCitizen(page);
    const resp = await page.goto(BASE + step.url, { waitUntil: 'networkidle' });
    expect(resp, `expected response for ${step.url}`).not.toBeNull();
    expect(resp!.status(), `expected 200 for ${step.url}, got ${resp!.status()}`).toBe(200);
    // Give the bootstrap fetch + first render a tick to settle.
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot(`${step.name}.png`, { fullPage: true });
  });
}