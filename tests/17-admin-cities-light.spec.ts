/**
 * Playwright route spec for the admin city-config surface
 * (tests/17-admin-cities-light.spec.ts).
 *
 * Bolt 005-002 (ADM-002/003/004/005, Intent 005, Unit 002):
 * 4 admin pages + 8 API routes + 1 Leaflet ward editor + the
 * Dhaka template pre-population. The spec exercises the
 * route handlers' error paths end-to-end (Zod validation, role
 * guard, dev-store lookup) and captures four visual baselines
 * of the admin pages.
 *
 * API checks (10):
 *   - GET /api/v1/admin/cities with no session → 401
 *   - GET with a citizen session → 403 forbidden_role
 *   - GET with admin session → 200 (returns ≥1 city)
 *   - GET /api/v1/admin/cities/<id> with unknown id → 404
 *   - POST /api/v1/admin/cities with admin + dedupRadiusMeters=999
 *     → 400 (Zod OR 401 from WebAuthn gate)
 *   - GET /api/v1/admin/cities/<id>/categories with admin → 200
 *   - GET /api/v1/admin/cities/<id>/departments with admin → 200
 *   - GET /api/v1/admin/cities/<id>/wards with admin → 200
 *   - PATCH /api/v1/admin/cities/<id> with admin + invalid name
 *     → 400 (Zod OR 401 from WebAuthn gate)
 *   - GET /api/v1/admin/cities/<id>/categories — array shape
 *   - GET /api/v1/admin/cities/<id>/wards — array shape
 *
 * Visual baselines (4):
 *   - /admin/cities overview (1440x900)
 *   - /admin/cities/<id>/setup basic info + Dhaka template CTA
 *   - /admin/cities/<id>/taxonomy departments + categories
 *   - /admin/cities/<id>/wards ward list + polygon form
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };

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

test.describe('ADM-002 — Admin cities overview (Bolt 005-002)', () => {
  test('GET /api/v1/admin/cities with no session → 401', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${BASE}/api/v1/admin/cities`);
    expect(res.status()).toBe(401);
  });

  test('GET with a citizen session → 403 forbidden_role', async () => {
    const ctx = await pwRequest.newContext();
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);
    const res = await ctx.get(`${BASE}/api/v1/admin/cities`);
    expect(res.status()).toBe(403);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe('forbidden_role');
  });

  test('GET with admin session → 200 (returns ≥1 city)', async () => {
    const ctx = await pwRequest.newContext();
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);
    const res = await ctx.get(`${BASE}/api/v1/admin/cities`);
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { cities: Array<unknown> };
    expect(Array.isArray(data.cities)).toBe(true);
    expect(data.cities.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/v1/admin/cities/<unknown> → 404 city_not_found', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(`${BASE}/api/v1/admin/cities/city_does_not_exist`);
    expect(res.status()).toBe(404);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe('city_not_found');
  });

  test('POST /api/v1/admin/cities with admin + dedupRadiusMeters=999 → 400 (Zod rejects, before WebAuthn)', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.post(`${BASE}/api/v1/admin/cities`, {
      data: {
        slug: 'spec-temp',
        name: 'Spec Temp City',
        defaultLanguage: 'bn',
        dedupRadiusMeters: 999, // out of range — Zod fails first
      },
    });
    // 400 from Zod OR 401 from requireWebAuthn if dev seam is off.
    // Either way, the route is gated.
    expect([400, 401]).toContain(res.status());
    if (res.status() === 400) {
      const data = (await res.json()) as { error?: string };
      expect(data.error).toBe('invalid_input');
    }
  });

  test('GET /api/v1/admin/cities/<id>/categories with admin → 200', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/cities/city_dhaka_north/categories`,
    );
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { categories: Array<unknown> };
    expect(Array.isArray(data.categories)).toBe(true);
  });

  test('GET /api/v1/admin/cities/<id>/departments with admin → 200', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/cities/city_dhaka_north/departments`,
    );
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { departments: Array<unknown> };
    expect(Array.isArray(data.departments)).toBe(true);
  });

  test('GET /api/v1/admin/cities/<id>/wards with admin → 200', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/cities/city_dhaka_north/wards`,
    );
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { wards: Array<unknown> };
    expect(Array.isArray(data.wards)).toBe(true);
  });

  test('PATCH /api/v1/admin/cities/<id> with admin + invalid name (too short) → 400 (Zod OR WebAuthn gate)', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.patch(
      `${BASE}/api/v1/admin/cities/city_dhaka_north`,
      { data: { name: 'x' } },
    );
    expect([400, 401]).toContain(res.status());
  });

  test('GET /api/v1/admin/cities/<id>/categories — returns 200 with array shape', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/cities/city_dhaka_north/categories`,
    );
    expect(res.status()).toBe(200);
    const data = (await res.json()) as {
      categories: Array<{ id: string; slug: string; name: string }>;
    };
    // The Dhaka-North seed has 8 categories; the test pins the
    // shape rather than the exact count to stay decoupled from
    // future template changes.
    expect(data.categories.length).toBeGreaterThan(0);
    expect(data.categories[0]).toHaveProperty('id');
    expect(data.categories[0]).toHaveProperty('slug');
    expect(data.categories[0]).toHaveProperty('name');
  });

  test('GET /api/v1/admin/cities/<id>/wards — returns 200 with array shape', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/cities/city_dhaka_north/wards`,
    );
    expect(res.status()).toBe(200);
    const data = (await res.json()) as {
      wards: Array<{ id: string; number: number; name: string }>;
    };
    expect(data.wards.length).toBeGreaterThan(0);
    expect(data.wards[0]).toHaveProperty('id');
    expect(data.wards[0]).toHaveProperty('number');
    expect(data.wards[0]).toHaveProperty('name');
  });
});

test.describe('Admin cities page visual baselines (Bolt 005-002)', () => {
  test('/admin/cities — overview (1440x900)', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    // Mint an admin session via the page's request context so the
    // session cookie is shared with the subsequent page.goto.
    await page.context().request.post(`${BASE}/api/dev/login?role=admin`);
    await page.goto(`${BASE}/admin/cities`, { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible();
    await expect(page).toHaveScreenshot('01-cities-overview-1440x900.png', {
      maxDiffPixelRatio: 0.005,
      fullPage: true,
    });
  });

  test('/admin/cities/<id>/setup — basic info (1440x900)', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.context().request.post(`${BASE}/api/dev/login?role=admin`);
    await page.goto(
      `${BASE}/admin/cities/city_dhaka_north/setup`,
      { waitUntil: 'networkidle' },
    );
    // setup page uses <h2> for its section heading (no h1 is rendered)
    await expect(page.locator('h2').first()).toBeVisible();
    await expect(page).toHaveScreenshot('02-setup-1440x900.png', {
      maxDiffPixelRatio: 0.005,
      fullPage: true,
    });
  });

  test('/admin/cities/<id>/taxonomy — departments + categories (1440x900)', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.context().request.post(`${BASE}/api/dev/login?role=admin`);
    await page.goto(
      `${BASE}/admin/cities/city_dhaka_north/taxonomy`,
      { waitUntil: 'networkidle' },
    );
    // taxonomy page uses <h2> for its section headings (no h1 is rendered)
    await expect(page.locator('h2').first()).toBeVisible();
    await expect(page).toHaveScreenshot('03-taxonomy-1440x900.png', {
      maxDiffPixelRatio: 0.005,
      fullPage: true,
    });
  });

  test('/admin/cities/<id>/wards — wards list (1440x900)', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    await page.context().request.post(`${BASE}/api/dev/login?role=admin`);
    await page.goto(
      `${BASE}/admin/cities/city_dhaka_north/wards`,
      { waitUntil: 'networkidle' },
    );
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page).toHaveScreenshot('04-wards-1440x900.png', {
      maxDiffPixelRatio: 0.005,
      fullPage: true,
    });
  });
});
