/**
 * Light-theme visual baselines for the citizen auth funnel
 * (tests/05-auth-funnel-light.spec.ts).
 *
 * Complements tests-mockups/baselines/01-mockups.spec.ts/ (the 7
 * design-mockup PNGs) and tests/02-live-audit.spec.ts (the
 * survey/audit spec). The 15 PNGs in this spec are the v1
 * light-theme per-route baselines for the auth funnel; the
 * dark-theme equivalents land in Bolt 002-005 (Gap G5).
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 *
 * Run: `npx playwright test tests/05-auth-funnel-light.spec.ts`
 *      (or `npm run test:mockups` if/when the baselines are folded
 *      into the wider suite).
 */

import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const ROUTES = [
  { name: 'auth-splash-1440x900', url: '/splash' },
  { name: 'auth-welcome-1440x900', url: '/welcome' },
  { name: 'auth-register-1440x900', url: '/register' },
  { name: 'auth-verify-otp-1440x900', url: '/verify-otp' },
  { name: 'auth-login-1440x900', url: '/login' },
];

const VIEWPORT = { width: 1440, height: 900 };

/** Force the light theme via the localStorage key the boot script reads. */
async function forceLightTheme(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

for (const route of ROUTES) {
  test(`${route.name} matches light baseline`, async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    const resp = await page.goto(BASE + route.url, { waitUntil: 'networkidle' });
    expect(resp, `expected 200 for ${route.url}`).not.toBeNull();
    expect(resp!.status(), `expected 200 for ${route.url}`).toBe(200);
    await expect(page).toHaveScreenshot(`${route.name}.png`, { fullPage: true });
  });
}
