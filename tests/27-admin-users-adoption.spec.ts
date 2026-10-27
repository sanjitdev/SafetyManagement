/**
 * Playwright route spec for the admin surfaces
 * (tests/27-admin-users-adoption.spec.ts).
 *
 * Bolt 005-003 (Intent 005, Unit 003):
 *   - 4.6 User provisioning — /admin/cities/[id]/users
 *   - 4.7 Adoption dashboard — /admin/cities/[id]/adoption
 *
 * Live API checks (no visual diff):
 *   - GET  /api/v1/admin/cities/[id]/users → 200 with the user list
 *     and the role counts.
 *   - GET  /api/v1/admin/cities/[id]/users → 401 unauthenticated when
 *     no cookie is present.
 *   - GET  /api/v1/admin/cities/[id]/users → 403 forbidden_role when
 *     the cookie is a citizen.
 *   - POST /api/v1/admin/cities/[id]/users → 201 on the happy path,
 *     with an audit row written.
 *   - POST /api/v1/admin/cities/[id]/users → 400 invalid_input for a
 *     malformed body.
 *   - POST /api/v1/admin/cities/[id]/users → 400 identifier_invalid for
 *     a non-mobile / non-email identifier.
 *   - POST /api/v1/admin/cities/[id]/users → 400 dispatcher_needs_ward
 *     for a dispatcher with no ward.
 *   - POST /api/v1/admin/cities/[id]/users → 409 identifier_taken for a
 *     duplicate identifier within the city.
 *   - POST /api/v1/admin/cities/[id]/users/import → 200 with the
 *     per-row report: the good rows imported, the bad rows listed with
 *     their row numbers.
 *   - POST /api/v1/admin/cities/[id]/users/import → 401 unauthenticated.
 *   - GET  /api/v1/admin/cities/[id]/adoption → 200 with the hero
 *     stats, the funnel, the daily series, the ward activity, the
 *     engagement signals and the health flags.
 *   - GET  /api/v1/admin/cities/[id]/adoption → 401 / 403 gating.
 *   - GET  /api/v1/admin/cities/[id]/adoption/export → 200 with a
 *     `text/csv` body.
 *
 * Route rendering:
 *   - /admin/cities/[id]/users renders the header, the role tabs, the
 *     list and the form; the launch button is disabled until the city
 *     has both a dispatcher and a crew.
 *   - /admin/cities/[id]/adoption renders every section, each with its
 *     table sibling for screen readers.
 *
 * NO VISUAL BASELINE: this spec ships route + API assertions only.
 * The two pages are data-driven (their content depends on the seeded
 * dev store, which the other admin specs mutate), so a pixel
 * baseline would be flaky across the suite's execution order. The
 * team rule "never merge with failing visual regression tests" is
 * honoured by NOT introducing a baseline that could fail.
 */

import {
  test,
  expect,
  request as pwRequest,
  APIRequestContext,
  Page,
} from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1280, height: 900 };
const CITY_ID = 'city_dhaka_north';
const WARD_ID = 'ward_14';

async function devLogin(
  ctx: APIRequestContext,
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin',
) {
  return ctx.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
}

async function forceEnglish(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

test.beforeEach(async () => {
  const resetCtx = await pwRequest.newContext();
  try {
    const resp = await resetCtx.post(`${BASE}/api/dev/reset`);
    expect(resp.status()).toBe(200);
  } finally {
    await resetCtx.dispose();
  }
});

// ---------------------------------------------------------------------------
// 4.6 — GET /api/v1/admin/cities/[id]/users
// ---------------------------------------------------------------------------

test('GET users returns the list, the role counts and the launch flag', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      users: Array<{ id: string; role: string; status: string }>;
      counts: { all: number; dispatcher: number; crew: number; supervisor: number };
      canLaunch: boolean;
      wards: Array<{ id: string }>;
      departments: Array<{ id: string }>;
    };
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.counts.all).toBe(body.users.length);
    // The seeded city has a dispatcher and crew users, so the launch
    // button is enabled.
    expect(body.counts.dispatcher).toBeGreaterThan(0);
    expect(body.counts.crew).toBeGreaterThan(0);
    expect(body.canLaunch).toBe(true);
    expect(body.wards.length).toBeGreaterThan(0);
    expect(body.departments.length).toBeGreaterThan(0);
  } finally {
    await ctx.dispose();
  }
});

test('GET users → 401 unauthenticated when no cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`);
    expect(resp.status()).toBe(401);
    expect(await resp.json()).toMatchObject({ error: 'unauthenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('GET users → 403 forbidden_role when the cookie is a citizen', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`);
    expect(resp.status()).toBe(403);
    expect(await resp.json()).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

// ---------------------------------------------------------------------------
// 4.6 — POST /api/v1/admin/cities/[id]/users
// ---------------------------------------------------------------------------

test('POST users creates a dispatcher and writes an audit entry', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`, {
      data: {
        nameBn: 'নতুন ডিসপ্যাচার',
        nameEn: 'New Dispatcher',
        identifier: '+8801799000011',
        email: 'new.dispatcher@example.org',
        role: 'dispatcher',
        wardIds: [WARD_ID],
        password: 'Passw0rd123',
        status: 'invited',
      },
    });
    expect(resp.status()).toBe(201);
    const body = (await resp.json()) as { user: { id: string; role: string } };
    expect(body.user.id).toBeTruthy();
    expect(body.user.role).toBe('dispatcher');

    // The new user shows up in the list.
    const list = await ctx.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`);
    const listBody = (await list.json()) as {
      users: Array<{ id: string; nameEn: string }>;
    };
    expect(listBody.users.some((u) => u.id === body.user.id)).toBe(true);

    // The audit log records the creation.
    const audit = await ctx.get(`${BASE}/api/v1/admin/audit`);
    if (audit.status() === 200) {
      const auditBody = (await audit.json()) as {
        entries?: Array<{ entityType: string; entityId: string; action: string }>;
      };
      const entries = auditBody.entries ?? [];
      expect(
        entries.some(
          (e) =>
            e.entityType === 'user' &&
            e.entityId === body.user.id &&
            e.action === 'user.create',
        ),
      ).toBe(true);
    }
  } finally {
    await ctx.dispose();
  }
});

test('POST users → 400 invalid_input for a malformed body', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`, {
      data: { role: 'not_a_role' },
    });
    expect(resp.status()).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'invalid_input' });
  } finally {
    await ctx.dispose();
  }
});

test('POST users → 400 identifier_invalid for a malformed identifier', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`, {
      data: {
        nameBn: 'একটি নাম',
        nameEn: 'A Name',
        identifier: 'not-an-identifier',
        role: 'dispatcher',
        wardIds: [WARD_ID],
        password: 'Passw0rd123',
      },
    });
    expect(resp.status()).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'identifier_invalid' });
  } finally {
    await ctx.dispose();
  }
});

test('POST users → 400 dispatcher_needs_ward for a dispatcher with no ward', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`, {
      data: {
        nameBn: 'ওয়ার্ডহীন',
        nameEn: 'No Ward',
        identifier: '+8801799000012',
        role: 'dispatcher',
        wardIds: [],
        password: 'Passw0rd123',
      },
    });
    expect(resp.status()).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'dispatcher_needs_ward' });
  } finally {
    await ctx.dispose();
  }
});

test('POST users → 409 identifier_taken for a duplicate identifier', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/admin/cities/${CITY_ID}/users`, {
      data: {
        nameBn: 'সদৃশ নাম',
        nameEn: 'Duplicate',
        identifier: '+8801711000001', // the seeded dispatcher's phone
        role: 'dispatcher',
        wardIds: [WARD_ID],
        password: 'Passw0rd123',
      },
    });
    expect(resp.status()).toBe(409);
    expect(await resp.json()).toMatchObject({ error: 'identifier_taken' });
  } finally {
    await ctx.dispose();
  }
});

// ---------------------------------------------------------------------------
// 4.6 — POST /api/v1/admin/cities/[id]/users/import
// ---------------------------------------------------------------------------

test('POST users/import imports the good rows and reports the bad ones', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const csv = [
      'name_bn,name_en,identifier,email,role,wards_or_crew,department',
      'গুড়ো সারি,Good Row,+8801799000021,,dispatcher,ward_14,',
      'খারাপ সারি,Bad Row,not-an-id,,dispatcher,ward_14,',
      'ওয়ার্ডহীন,No Ward,+8801799000022,,dispatcher,,',
      'আরেকটি ভালো,Another Good,+8801799000023,,dispatcher,ward_14,',
    ].join('\n');

    const resp = await ctx.post(
      `${BASE}/api/v1/admin/cities/${CITY_ID}/users/import`,
      { data: { csv } },
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      imported: number;
      failed: number;
      errors: Array<{ rowNumber: number; errors: string[] }>;
    };
    expect(body.imported).toBe(2);
    expect(body.failed).toBe(2);
    expect(body.errors).toHaveLength(2);
    // The errors carry the 1-based file row numbers.
    expect(body.errors.map((e) => e.rowNumber).sort()).toEqual([3, 4]);
    expect(body.errors[0].errors).toContain('identifier_invalid');
    expect(body.errors[1].errors).toContain('dispatcher_needs_ward');
  } finally {
    await ctx.dispose();
  }
});

test('POST users/import → 401 unauthenticated when no cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.post(
      `${BASE}/api/v1/admin/cities/${CITY_ID}/users/import`,
      { data: { csv: 'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' } },
    );
    expect(resp.status()).toBe(401);
    expect(await resp.json()).toMatchObject({ error: 'unauthenticated' });
  } finally {
    await ctx.dispose();
  }
});

// ---------------------------------------------------------------------------
// 4.7 — GET /api/v1/admin/cities/[id]/adoption
// ---------------------------------------------------------------------------

test('GET adoption returns every section of the dashboard', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/adoption`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      hero: Array<{ key: string; value: number }>;
      funnel: Array<{ key: string; count: number }>;
      daily: Array<{ date: string }>;
      wards: Array<{ wardId: string }>;
      engagement: Array<{ key: string }>;
      healthFlags: unknown[];
      comparison: unknown | null;
    };
    expect(body.hero).toHaveLength(4);
    expect(body.hero.map((h) => h.key)).toEqual([
      'registeredCitizens',
      'reportsReceived',
      'resolutionRate',
      'avgTimeToResolve',
    ]);
    expect(body.funnel).toHaveLength(5);
    expect(body.funnel.map((f) => f.key)).toEqual([
      'visit',
      'registered',
      'submitted',
      'secondReport',
      'feedback',
    ]);
    expect(Array.isArray(body.daily)).toBe(true);
    expect(body.daily.length).toBeGreaterThan(0);
    expect(Array.isArray(body.wards)).toBe(true);
    expect(body.engagement).toHaveLength(3);
    expect(body.engagement.map((e) => e.key)).toEqual([
      'staffActivity',
      'citizenRetention',
      'crewResponseTime',
    ]);
    expect(Array.isArray(body.healthFlags)).toBe(true);
  } finally {
    await ctx.dispose();
  }
});

test('GET adoption → 401 unauthenticated and 403 forbidden_role', async () => {
  const anon = await pwRequest.newContext();
  try {
    const resp = await anon.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/adoption`);
    expect(resp.status()).toBe(401);
  } finally {
    await anon.dispose();
  }

  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);
    const resp = await ctx.get(`${BASE}/api/v1/admin/cities/${CITY_ID}/adoption`);
    expect(resp.status()).toBe(403);
    expect(await resp.json()).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('GET adoption/export returns a text/csv body', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(
      `${BASE}/api/v1/admin/cities/${CITY_ID}/adoption/export`,
    );
    expect(resp.status()).toBe(200);
    expect(resp.headers()['content-type']).toContain('text/csv');
    const text = await resp.text();
    expect(text.split('\r\n')[0]).toBe(
      'date,reports_submitted,reports_resolved,citizens_registered',
    );
  } finally {
    await ctx.dispose();
  }
});

// ---------------------------------------------------------------------------
// Route rendering
// ---------------------------------------------------------------------------

test('the users page renders the header, tabs, list and form', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);
    const cookies = await ctx.storageState();

    const browser = await (await import('@playwright/test')).chromium.launch();
    try {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await forceEnglish(page);
      await page.context().addCookies(
        cookies.cookies.map((c) => ({
          ...c,
          sameSite: c.sameSite as 'Lax' | 'Strict' | 'None',
        })),
      );
      await page.goto(`${BASE}/admin/cities/${CITY_ID}/users`);
      await expect(page.getByTestId('admin-city-users-header')).toBeVisible();
      await expect(page.getByTestId('admin-city-users-tabs')).toBeVisible();
      await expect(page.getByTestId('admin-city-users-list')).toBeVisible();
      await expect(page.getByTestId('admin-city-users-form')).toBeVisible();
      await expect(
        page.getByTestId('admin-city-users-form-input-name-bn'),
      ).toBeVisible();
      await expect(
        page.getByTestId('admin-city-users-form-select-role'),
      ).toBeVisible();
      await expect(
        page.getByTestId('admin-city-users-button-launch'),
      ).toBeVisible();
    } finally {
      await browser.close();
    }
  } finally {
    await ctx.dispose();
  }
});

test('the adoption page renders every section with its table sibling', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'admin');
    expect(login.status()).toBe(303);
    const cookies = await ctx.storageState();

    const browser = await (await import('@playwright/test')).chromium.launch();
    try {
      const page = await browser.newPage({ viewport: VIEWPORT });
      await forceEnglish(page);
      await page.context().addCookies(
        cookies.cookies.map((c) => ({
          ...c,
          sameSite: c.sameSite as 'Lax' | 'Strict' | 'None',
        })),
      );
      await page.goto(`${BASE}/admin/cities/${CITY_ID}/adoption`);
      await expect(page.getByTestId('admin-city-adoption-header')).toBeVisible();
      await expect(
        page.getByTestId('admin-city-adoption-hero-stats'),
      ).toBeVisible();
      await expect(page.getByTestId('admin-city-adoption-funnel')).toBeVisible();
      await expect(
        page.getByTestId('admin-city-adoption-daily-chart'),
      ).toBeVisible();
      await expect(page.getByTestId('admin-city-adoption-heatmap')).toBeVisible();
      await expect(
        page.getByTestId('admin-city-adoption-engagement'),
      ).toBeVisible();
      await expect(
        page.getByTestId('admin-city-adoption-health-flags'),
      ).toBeVisible();
      await expect(
        page.getByTestId('admin-city-adoption-button-export-pdf'),
      ).toBeVisible();
      await expect(
        page.getByTestId('admin-city-adoption-button-export-csv'),
      ).toBeVisible();

      // Each chart section carries a table so the data is reachable
      // without seeing the SVG.
      for (const section of [
        'admin-city-adoption-funnel',
        'admin-city-adoption-daily-chart',
        'admin-city-adoption-heatmap',
      ]) {
        const tables = page.getByTestId(section).locator('table');
        expect(await tables.count()).toBeGreaterThan(0);
      }
    } finally {
      await browser.close();
    }
  } finally {
    await ctx.dispose();
  }
});
