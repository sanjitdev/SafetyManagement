/**
 * Playwright route spec for the admin audit-dashboard
 * surface (tests/18-admin-audit-light.spec.ts).
 *
 * Bolt 005-004 (ADM-007, Intent 005, Unit 004): 1 read-only
 * API + 1 read-only page + 2 components + 5 seed
 * AuditEntry rows in the dev store. The spec exercises
 * the route handler's filter + cursor pagination paths
 * end-to-end and captures one visual baseline of the
 * page at 1440x900.
 *
 * API checks (6):
 *   - GET /api/v1/admin/audit with no session → 401
 *   - GET with a citizen session → 403 forbidden
 *   - GET with admin session → 200 (returns 5 entries
 *     + nextCursor: null on the first page)
 *   - GET ?actorId=user_admin_anwar → 200 with 4 entries
 *     (excludes the otp_send_failed row whose actor is
 *     the citizen)
 *   - GET ?action=create → 200 with 3 entries
 *   - GET ?entityType=user → 200 with 1 entry
 *   - GET ?from=<now - 10m>&to=<now> → 200 with 2 entries
 *   - GET ?limit=2 → 200 with 2 entries + nextCursor non-null
 *
 * Visual baseline (1):
 *   - /admin/audit at 1440x900 with the first row open
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';
import { resetDevStore, pinnedEpochMs } from './helpers/fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Reset the dev store before each test.
 *
 * This spec asserts EXACT counts over the audit log (5 seed
 * entries, 4 for one actor, 3 with action=create, 1 with
 * entityType=user). The dev store lives for the whole dev-server
 * process, so any audit entry written by an earlier spec — or by
 * an earlier run of this one — inflates those counts.
 *
 * The reset restores the 5 seed AuditEntry rows and nothing else,
 * which is what the assertions below describe.
 */
test.beforeEach(async () => {
  const resetCtx = await pwRequest.newContext();
  try {
    await resetDevStore(resetCtx);
  } finally {
    await resetCtx.dispose();
  }
});

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

test.describe('ADM-007 — Admin audit dashboard (Bolt 005-004)', () => {
  test('GET /api/v1/admin/audit with no session → 401', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${BASE}/api/v1/admin/audit`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('GET with a citizen session → 403', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'citizen');
    const res = await ctx.get(`${BASE}/api/v1/admin/audit`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('forbidden_role');
  });

  test('GET with admin session → 200 + 5 entries + nextCursor null', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(`${BASE}/api/v1/admin/audit`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ id: string; actorId: string; actorName: string }>;
      nextCursor: string | null;
    };
    expect(body.entries.length).toBe(5);
    expect(body.nextCursor).toBeNull();
    // The first row is the otp_send_failed row (most-recent).
    expect(body.entries[0].id).toBe('aud_seed_otp_fail');
    // The actor of the first row is the citizen (the citizen's
    // OTP delivery failed). The actorName is the citizen's
    // display name + role.
    expect(body.entries[0].actorName).toContain('citizen');
    // The admin's seed actor name + role should appear in the
    // other 4 rows (the admin created the city, ward, category,
    // and updated the dedup radius).
    const adminRows = body.entries.filter(
      (e) => e.actorId === 'user_admin_anwar',
    );
    expect(adminRows.length).toBe(4);
    for (const r of adminRows) {
      expect(r.actorName).toContain('admin');
    }
  });

  test('GET ?actorId=user_admin_anwar → 200 + 4 entries', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/audit?actorId=user_admin_anwar`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ id: string }>;
    };
    expect(body.entries.length).toBe(4);
    // The otp_send_failed row's actor is the citizen, not the admin.
    expect(
      body.entries.find((e) => e.id === 'aud_seed_otp_fail'),
    ).toBeUndefined();
  });

  test('GET ?action=create → 200 + 3 entries', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/audit?action=create`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ action: string }>;
    };
    expect(body.entries.length).toBe(3);
    for (const e of body.entries) {
      expect(e.action).toBe('create');
    }
  });

  test('GET ?entityType=user → 200 + 1 entry (otp_send_failed)', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/audit?entityType=user`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ id: string; entityType: string }>;
    };
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].id).toBe('aud_seed_otp_fail');
    expect(body.entries[0].entityType).toBe('user');
  });

  test('GET ?from=<now-10m>&to=<now> → 200 + 2 entries', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    // The window must be anchored to the SAME clock the server seeded
    // from — not the wall clock. The dev store's audit rows sit at
    // −1m, −5m, −30m, −60m and −24h relative to the PINNED epoch
    // (`CITYFIX_SEED_NOW`). Against a live `new Date()` the window
    // sits in the future, misses every seeded row, and the count
    // comes back 0 instead of 2.
    const now = new Date(pinnedEpochMs());
    const from = new Date(now.getTime() - 10 * 60_000).toISOString();
    const to = now.toISOString();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/audit?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: Array<{ id: string }>;
    };
    // The seed rows in the last 10 minutes are otp_fail (-1m)
    // and ward_create (-5m). The other 3 are at -30m, -60m,
    // -24h — outside the window.
    expect(body.entries.length).toBe(2);
    const ids = body.entries.map((e) => e.id);
    expect(ids).toContain('aud_seed_otp_fail');
    expect(ids).toContain('aud_seed_ward_create');
  });

  test('GET ?limit=2 → 200 + 2 entries + nextCursor non-null', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(`${BASE}/api/v1/admin/audit?limit=2`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      entries: unknown[];
      nextCursor: string | null;
    };
    expect(body.entries.length).toBe(2);
    expect(body.nextCursor).not.toBeNull();
  });

  test('GET ?entityType=garbage → 400 invalid_input', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/audit?entityType=garbage`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('invalid_input');
  });

  test('GET with admin session + visual baseline (1440x900)', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    // Pre-login via API so the page hits a real session cookie.
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const cookies = await ctx.storageState();
    for (const c of cookies.cookies) {
      await page.context().addCookies([
        {
          name: c.name,
          value: c.value,
          domain: c.domain,
          path: c.path,
          expires: c.expires,
          httpOnly: c.httpOnly,
          secure: c.secure,
          sameSite: c.sameSite,
        },
      ]);
    }
    await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' });
    // The page should render the table with at least one entry
    // (the otp_send_failed row).
    await expect(page.locator('text=otp_send_failed')).toBeVisible({
      timeout: 5_000,
    });
    // Open the first row's details (the ▶ chevron in the first data row).
    //
    // Scope the click to the TABLE's expand buttons. A bare
    // `button[aria-expanded]` matches the AppHeader's mobile
    // hamburger first — the header renders above the table, and its
    // burger carries `aria-expanded` too (components/AppHeader.tsx).
    // The old selector clicked the burger, no row expanded, and the
    // `pre` assertion failed for a reason that had nothing to do with
    // the audit page.
    const rowToggle = page
      .locator('table tbody button[aria-expanded]')
      .first();
    await expect(rowToggle).toBeVisible();
    await rowToggle.click();
    // The before/after JSON should be visible.
    await expect(page.locator('pre').first()).toBeVisible();
    await expect(page.locator('text=twilio_api_error')).toBeVisible();
    // Visual baseline.
    await expect(page).toHaveScreenshot(
      'admin-audit-1440x900.png',
      { maxDiffPixelRatio: 0.005 },
    );
  });
});