/**
 * The role rail must be a DIFFERENT surface in each theme.
 *
 * ## The bug
 *
 * The left navigation rail was the same deep navy in light mode and in
 * dark mode — `--color-rail` was `#111C34` in `:root` and `#0B1428` in
 * `.theme-dark`, i.e. two shades of the same navy. A user who switched
 * the app to light mode still saw a dark slab down the left edge, so
 * the "light theme" was not really light.
 *
 * The rail was entirely token-driven (`.role-sidebar` reads
 * `--color-rail` / `--color-rail-ink` and nothing else), so the fix
 * was to define a light off-white rail in `:root` and keep the navy
 * for the dark theme.
 *
 * ## Why the active pill needs its own ink token
 *
 * The active nav item is a FILLED civic-blue pill. Its text used to
 * be `--color-rail-ink`, which is fine while the ink is near-white on
 * a dark rail — but the light rail's ink is near-black, and near-black
 * on the blue fill is unreadable. `--color-rail-ink-active` was added
 * so the pill stays white-on-blue in BOTH themes.
 *
 * ## What this spec asserts
 *
 *   1. The rail's own background is DECISIVELY different between the
 *      two themes (light rail much lighter than dark rail).
 *   2. The rail's ink contrasts AA against its own surface, in both
 *      themes — including the muted nav label.
 *   3. The active pill's text is white-on-blue in both themes.
 *   4. The same rules hold for the ADMIN console's sidebar, which
 *      shares the rail tokens.
 *
 * Pre-reqs:
 *   - Dev server running with CITYFIX_DEV_STORE=1 (`npm run dev:feat`).
 *   - BASE_URL points at it (default http://localhost:3000).
 */

import { test, expect, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/** WCAG relative luminance of a computed `rgb(...)` string. */
function luminance(rgb: string): number {
  const parts = (rgb.match(/\d+/g) ?? []).map(Number);
  const [r = 0, g = 0, b = 0] = parts.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two computed `rgb(...)` strings. */
function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function devLogin(ctx: APIRequestContext, role: string): Promise<void> {
  const res = await ctx.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(res.status(), `dev login for ${role}`).toBe(303);
}

/** Apply the appearance preference the way a real user would. */
async function setAppearance(page: Page, pref: 'light' | 'dark') {
  await page.addInitScript((p) => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', p);
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  }, pref);
  await page.emulateMedia({ colorScheme: 'light' });
}

/** The rail's own colours, read off the rendered DOM. */
async function readRail(page: Page, selector: string) {
  return page.locator(selector).evaluate((el) => {
    const rail = getComputedStyle(el);
    const active = el.querySelector(
      '.role-sidebar-link.is-active, .admin-side-link.is-active',
    );
    const muted = el.querySelector(
      '.role-sidebar-link:not(.is-active), .admin-side-link:not(.is-active)',
    );
    return {
      bg: rail.backgroundColor,
      ink: rail.color,
      activeBg: active ? getComputedStyle(active).backgroundColor : null,
      activeInk: active ? getComputedStyle(active).color : null,
      mutedInk: muted ? getComputedStyle(muted).color : null,
    };
  });
}

test.describe('the role rail is themed, not hardcoded', () => {
  test('the light rail is a light surface and the dark rail is a dark one', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');

    await setAppearance(page, 'light');
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#role-sidebar')).toBeVisible({ timeout: 15_000 });
    const light = await readRail(page, '#role-sidebar');

    await setAppearance(page, 'dark');
    await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#role-sidebar')).toBeVisible({ timeout: 15_000 });
    const dark = await readRail(page, '#role-sidebar');

    // The light rail must be decisively lighter than the dark one.
    // The threshold is on RELATIVE LUMINANCE, not on a literal hex:
    // the exact values may be tuned, but the two themes must not look
    // the same.
    expect(luminance(light.bg)).toBeGreaterThan(luminance(dark.bg) + 0.2);

    // And the light rail is actually light — not merely "different".
    expect(luminance(light.bg)).toBeGreaterThan(0.5);
    expect(luminance(dark.bg)).toBeLessThan(0.1);
  });

  test('the rail ink is readable against its own surface in both themes', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');

    for (const theme of ['light', 'dark'] as const) {
      await setAppearance(page, theme);
      await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#role-sidebar')).toBeVisible({ timeout: 15_000 });
      const rail = await readRail(page, '#role-sidebar');

      expect(contrast(rail.ink, rail.bg), `${theme} rail ink`).toBeGreaterThan(4.5);
      expect(
        contrast(rail.mutedInk!, rail.bg),
        `${theme} rail muted label`,
      ).toBeGreaterThan(4.5);
    }
  });

  test('the active pill stays white-on-blue in both themes', async ({
    page,
    context,
  }) => {
    await devLogin(context.request, 'dispatcher');

    for (const theme of ['light', 'dark'] as const) {
      await setAppearance(page, theme);
      await page.goto(`${BASE}/dispatcher`, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#role-sidebar')).toBeVisible({ timeout: 15_000 });
      const rail = await readRail(page, '#role-sidebar');

      expect(rail.activeBg, `${theme} active pill fill`).toBeTruthy();
      expect(
        contrast(rail.activeInk!, rail.activeBg!),
        `${theme} active pill ink`,
      ).toBeGreaterThan(4.5);
    }
  });

  test('the admin console sidebar follows the same rules', async ({ page, context }) => {
    await devLogin(context.request, 'admin');

    await setAppearance(page, 'light');
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.admin-dashboard-sidebar')).toBeVisible({
      timeout: 15_000,
    });
    const light = await readRail(page, '.admin-dashboard-sidebar');

    await setAppearance(page, 'dark');
    await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.admin-dashboard-sidebar')).toBeVisible({
      timeout: 15_000,
    });
    const dark = await readRail(page, '.admin-dashboard-sidebar');

    expect(luminance(light.bg)).toBeGreaterThan(luminance(dark.bg) + 0.2);
    expect(contrast(light.ink, light.bg)).toBeGreaterThan(4.5);
    expect(contrast(dark.ink, dark.bg)).toBeGreaterThan(4.5);
    expect(contrast(light.activeInk!, light.activeBg!)).toBeGreaterThan(4.5);
    expect(contrast(dark.activeInk!, dark.activeBg!)).toBeGreaterThan(4.5);
  });
});
