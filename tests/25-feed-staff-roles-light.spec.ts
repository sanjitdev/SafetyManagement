/**
 * Bolt 008-012 regression: /feed works for every signed-in role.
 *
 * Before Bolt 008-012, the /feed page (1.13 City Activity Feed)
 * called /api/report/bootstrap — a citizen-only endpoint — as part
 * of its data-load chain. Admin / dispatcher / crew sessions
 * received 403 from that endpoint, the page set
 * `error = 'feed.error'`, and the user saw the red
 * "ফিড লোড করা যায়নি" / "Could not load feed" alert.
 *
 * The fix:
 *   - /api/v1/activity/public now reads the session cookie and
 *     defaults to the session's cityId, so any signed-in user
 *     sees tickets from their own city without a query string
 *   - /api/v1/activity/public also returns the city's `categories`
 *     list, so the /feed page no longer needs a second fetch to
 *     /api/report/bootstrap at all
 *
 * This spec walks all four roles and asserts:
 *   1. /feed renders without the "Could not load feed" alert
 *   2. The page contains at least one ticket row (the seeded
 *      Dhaka North tickets are visible)
 *   3. The "Sign in required" empty state is NOT shown
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 *
 * Run: `npx playwright test tests/25-feed-staff-roles-light.spec.ts`
 */

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const ROLES = ['citizen', 'dispatcher', 'crew', 'admin'] as const;
type Role = (typeof ROLES)[number];

async function loginAs(context: import('@playwright/test').BrowserContext, role: Role) {
  const res = await context.request.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status(), `dev login for ${role}`).toBe(303);
}

for (const role of ROLES) {
  test(`feed page renders for ${role} without 'Could not load feed' (Bolt 008-012)`, async ({
    page,
    context,
  }) => {
    await loginAs(context, role);

    page.on('pageerror', (err) => {
      throw new Error(`[${role}] page error: ${err.message}`);
    });

    await page.goto(`${BASE}/feed`, { waitUntil: 'domcontentloaded' });
    // Wait for the first activity row to render. The page polls
    // /api/v1/activity/public, which now works for every role.
    const row = page.locator('a[href^="/reports/"]').first();
    await expect(row, `[${role}] at least one ticket row should render`).toBeVisible({
      timeout: 8000,
    });

    // Bolt 008-012: the "Could not load feed" / "ফিড লোড করা যায়নি"
    // alert must not be present. The page renders the alert via
    // <p role="alert">…</p> when `error` is set; we use a specific
    // text match (the i18n key is "feed.error" → either Bangla
    // "ফিড লোড করা যায়নি" or English "Could not load feed")
    // rather than the generic role selector, because Next.js
    // also renders a hidden route announcer with role=alert.
    const errorAlert = page.locator('p[role="alert"]', {
      hasText: /ফিড লোড|load feed/i,
    });
    await expect(errorAlert, `[${role}] 'Could not load feed' alert must not be visible`).toHaveCount(0);

    // The "Please sign in" empty state must also not be shown.
    const signInRequired = page.getByText(/sign.in required/i);
    await expect(signInRequired, `[${role}] 'Sign in required' must not be visible`).toHaveCount(0);

    // Sanity: the page title block ("City activity" / "শহরের কার্যকলাপ")
    // is present.
    await expect(page.getByRole('heading', { name: /কার্যকলাপ|activity/i }).first()).toBeVisible();
  });
}
