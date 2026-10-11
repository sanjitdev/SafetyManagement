/**
 * Light-theme visual baselines for the home / city activity feed
 * (tests/06-home-feed-light.spec.ts).
 *
 * Complements tests-mockups/baselines/01-mockups.spec.ts/ (the 7
 * design-mockup PNGs), tests/02-live-audit.spec.ts (the
 * survey/audit spec), and tests/05-auth-funnel-light.spec.ts (the 5
 * auth-funnel PNGs). The 5 PNGs in this spec are the v1
 * light-theme per-pill baselines for the home feed plus the
 * empty-state variant. The dark-theme equivalents land in Bolt
 * 002-005 (Gap G5).
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 *   - The dev store has been seeded with 4 demo tickets (one per
 *     pill target: submitted / in_progress / resolved / closed).
 *     The seed lives in `lib/dev-store.ts → seed()` and is loaded
 *     on first dev-server boot via the `getStore()` global; it
 *     does not require a manual reset between runs.
 *
 * Run: `npx playwright test tests/06-home-feed-light.spec.ts`
 *      (or `npm run test:mockups` if/when the baselines are folded
 *      into the wider suite).
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const VIEWPORT = { width: 1440, height: 900 };

/** The home page polls every 15s; we wait for at least one row. */
const ACTIVITY_ROW_SELECTOR = 'a[href^="/reports/"]';
// Pill filter -> human label (English) and the resulting screenshot
// filename. Note: Playwright normalises test names in the
// snapshotPathTemplate, so `in_progress` becomes `in-progress` in
// the file name. We mirror that here so the captured file matches
// the {arg} that `toHaveScreenshot` writes.
const PILL_BY_TEXT: Record<string, { label: string; screenshot: string }> = {
  all: { label: 'All', screenshot: 'home-feed-all-1440x900.png' },
  submitted: { label: 'New', screenshot: 'home-feed-submitted-1440x900.png' },
  in_progress: { label: 'In progress', screenshot: 'home-feed-in-progress-1440x900.png' },
  resolved: { label: 'Resolved', screenshot: 'home-feed-resolved-1440x900.png' },
};

/** Force the light theme + English labels so the pill texts are
 *  stable across runs (default language is Bangla; without this
 *  override the rendered pill labels would be `সব / নতুন / চলমান / সমাধান`
 *  and the snapshot would be Bangla-only). */
async function forceLightTheme(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Mint a citizen session via the dev-only login route (no OTP). */
async function signInAsCitizen(page: Page) {
  // /api/dev/login is dev-store-only and returns 404 when
  // CITYFIX_DEV_STORE !== '1'. The Playwright config sets that
  // env var on `npm run dev:feat`; reuseExistingServer means the
  // running dev server is reused.
  const resp = await page.request.post(`${BASE}/api/dev/login`, {
    data: { role: 'citizen' },
  });
  expect(resp, 'expected /api/dev/login to respond').not.toBeNull();
  expect(resp.status(), `expected 200 from /api/dev/login, got ${resp.status()}`).toBe(200);
}

async function loadHomeAndWaitForFeed(page: Page) {
  await signInAsCitizen(page);
  const resp = await page.goto(BASE + '/home', { waitUntil: 'networkidle' });
  expect(resp, 'expected response for /home').not.toBeNull();
  expect(resp!.status(), `expected 200 for /home, got ${resp!.status()}`).toBe(200);
  // Wait for the polling effect to render the first feed row.
  await page.waitForSelector(ACTIVITY_ROW_SELECTOR, { timeout: 10_000 });
}

async function loadHomeForEmptyState(page: Page) {
  await signInAsCitizen(page);
  const resp = await page.goto(BASE + '/home', { waitUntil: 'networkidle' });
  expect(resp, 'expected response for /home').not.toBeNull();
  expect(resp!.status(), `expected 200 for /home, got ${resp!.status()}`).toBe(200);
  // No rows to wait for (the API stub returns {tickets:[]}); give
  // the polling effect time to settle into the empty state.
  await page.waitForTimeout(1_500);
}

for (const [filter, { label, screenshot }] of Object.entries(PILL_BY_TEXT)) {
  test(`home-feed-${filter}-1440x900 matches light baseline`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await loadHomeAndWaitForFeed(page);
    // Click the target pill (the buttons are rendered in the
    // order: All / New / In progress / Resolved).
    await page.getByRole('button', { name: label, exact: true }).click();
    // Give the filter state a tick to re-render.
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot(screenshot, { fullPage: true });
  });
}

test('home-feed-empty-1440x900 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  // The empty-state baseline needs the home page to render with
  // zero rows. The dev store always seeds 4 demo tickets in
  // Dhaka North (Bolt 002-002 demo seed), so the only way to
  // reach the empty state in this baseline is to intercept the
  // activity API and return an empty payload. The other
  // endpoints (auth, bootstrap) pass through.
  await page.route('**/api/v1/activity**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tickets: [] }),
    });
  });
  await loadHomeForEmptyState(page);
  await expect(page).toHaveScreenshot('home-feed-empty-1440x900.png', {
    fullPage: true,
  });
});
