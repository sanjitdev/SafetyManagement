/**
 * Playwright route spec for the dispatcher monitor + performance
 * surfaces (tests/26-dispatcher-monitor-performance.spec.ts).
 *
 * UX specs 2.5 ("Monitor Updates") and 2.7 ("Ward Performance
 * Snapshot") — the two dispatcher pages this Bolt owns.
 *
 * Live API checks (no visual diff):
 *   - GET /api/v1/dispatcher/monitor returns the ward-scoped
 *     watched tickets plus the three chart datasets.
 *   - GET /api/v1/dispatcher/monitor → 401 not_authenticated when
 *     no cookie.
 *   - GET /api/v1/dispatcher/monitor → 403 forbidden_role when the
 *     cookie is a citizen.
 *   - GET /api/v1/dispatcher/monitor → 400 invalid_query for an
 *     unknown filter or an out-of-band limit.
 *   - GET /api/v1/dispatcher/monitor → 403 cross_city_access_denied
 *     when ?cityId= names another city.
 *   - POST /api/v1/dispatcher/monitor/ack happy path: 200 and an
 *     audit row `ticket.monitor_acknowledge` is written.
 *   - POST /api/v1/dispatcher/monitor/ack → 400 invalid_input for a
 *     bad body.
 *   - POST /api/v1/dispatcher/monitor/ack → 404 not_found for an
 *     unknown or out-of-scope ticket.
 *   - GET /api/v1/dispatcher/performance returns the snapshot
 *     envelope (hero, three chart series, crew table, long tail).
 *   - GET /api/v1/dispatcher/performance → 401 / 403 / 400.
 *
 * UI checks:
 *   - /dispatcher/monitor renders the list, the filter chips and
 *     the chart strip; a row expands to reveal the trail; the
 *     acknowledge button POSTs.
 *   - /dispatcher/performance renders the header, the three hero
 *     cards, the three charts (each with its accessible table
 *     sibling), the sortable crew table and the export controls.
 *
 * No visual-regression baseline: both surfaces are live-polling /
 * date-dependent, and the task brief permits a route spec without
 * a baseline. Baselines are left to the mockup suite so a
 * time-dependent snapshot can never gate the merge.
 */

import {
  test,
  expect,
  request as pwRequest,
  APIRequestContext,
  Page,
} from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1280, height: 800 };

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

/**
 * Reset the in-memory dev store between tests so every test sees
 * the same seed fixture set (the store accumulates tickets across
 * tests otherwise).
 */
test.beforeEach(async () => {
  const resetCtx = await pwRequest.newContext();
  try {
    const resp = await resetCtx.post(`${BASE}/api/dev/reset`);
    expect(resp.status()).toBe(200);
  } finally {
    await resetCtx.dispose();
  }
});

// --- GET /api/v1/dispatcher/monitor ---------------------------------------

test('GET monitor returns the ward-scoped watched tickets plus the chart strip', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      rows: Array<{
        id: string;
        wardId: string;
        status: string;
        trail: unknown[];
        latestActivity: { timestamp: string; unread: boolean };
      }>;
      charts: {
        flow: { total: number; segments: unknown[] };
        response: { points: unknown[] };
        crewLoad: unknown[];
      };
      generatedAt: string;
    };

    expect(body.rows.length).toBeGreaterThan(0);
    for (const row of body.rows) {
      expect(row.wardId).toBe('ward_14');
      expect(['submitted', 'routed', 'in_progress', 'resolved']).toContain(
        row.status,
      );
    }
    expect(body.charts.flow.segments.length).toBe(4);
    expect(body.charts.response.points.length).toBe(7);
    expect(Array.isArray(body.charts.crewLoad)).toBe(true);
    expect(Number.isFinite(Date.parse(body.generatedAt))).toBe(true);
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor sorts rows by most-recently-updated first', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`);
    const body = (await resp.json()) as { rows: Array<{ updatedAt: string }> };
    const stamps = body.rows.map((r) => r.updatedAt);
    expect(stamps).toEqual([...stamps].sort().reverse());
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor honours the ?filter= chip', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`, {
      params: { filter: 'my_crews' },
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      rows: Array<{ assignedCrewId: string | null }>;
    };
    for (const row of body.rows) {
      expect(row.assignedCrewId).toBeTruthy();
    }
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor → 401 not_authenticated when no cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor → 403 forbidden_role when the cookie is a citizen', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`);
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor → 400 invalid_query for an unknown filter', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`, {
      params: { filter: 'nonsense' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'invalid_query' });
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor → 400 invalid_query for an out-of-band limit', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`, {
      params: { limit: '9999' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'invalid_query' });
  } finally {
    await ctx.dispose();
  }
});

test('GET monitor → 403 cross_city_access_denied for another city', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/monitor`, {
      params: { cityId: 'city_chittagong' },
    });
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'cross_city_access_denied' });
  } finally {
    await ctx.dispose();
  }
});

// --- POST /api/v1/dispatcher/monitor/ack ----------------------------------

test('POST monitor ack happy path: 200 and a ticket.monitor_acknowledge audit row', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/dispatcher/monitor/ack`, {
      data: { ticketId: 'ticket_seed_inprogress_1' },
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticketId: string;
      acknowledgedAt: string;
    };
    expect(body.ticketId).toBe('ticket_seed_inprogress_1');
    expect(Number.isFinite(Date.parse(body.acknowledgedAt))).toBe(true);

    // The ack is state-changing, so it must leave an audit trail.
    // Read it back through the admin audit surface (admin-only).
    const adminCtx = await pwRequest.newContext();
    try {
      const aLogin = await devLogin(adminCtx, 'admin');
      expect(aLogin.status()).toBe(303);
      const audit = await adminCtx.get(`${BASE}/api/v1/admin/audit`, {
        params: { action: 'ticket.monitor_acknowledge', limit: '20' },
      });
      expect(audit.status()).toBe(200);
      const auditBody = (await audit.json()) as {
        entries: Array<{
          action: string;
          entityId: string;
          actorId: string | null;
        }>;
      };
      const row = auditBody.entries.find(
        (e) => e.entityId === 'ticket_seed_inprogress_1',
      );
      expect(row).toBeTruthy();
      expect(row?.action).toBe('ticket.monitor_acknowledge');
    } finally {
      await adminCtx.dispose();
    }
  } finally {
    await ctx.dispose();
  }
});

test('POST monitor ack → 401 not_authenticated when no cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.post(`${BASE}/api/v1/dispatcher/monitor/ack`, {
      data: { ticketId: 'ticket_seed_inprogress_1' },
    });
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('POST monitor ack → 403 forbidden_role when the cookie is a citizen', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/dispatcher/monitor/ack`, {
      data: { ticketId: 'ticket_seed_inprogress_1' },
    });
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('POST monitor ack → 400 invalid_input for a bad body', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/dispatcher/monitor/ack`, {
      data: { ticketId: '' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'invalid_input' });
  } finally {
    await ctx.dispose();
  }
});

test('POST monitor ack → 404 not_found for an unknown ticket', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(`${BASE}/api/v1/dispatcher/monitor/ack`, {
      data: { ticketId: 'ticket_does_not_exist' },
    });
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_found' });
  } finally {
    await ctx.dispose();
  }
});

// --- GET /api/v1/dispatcher/performance -----------------------------------

test('GET performance returns the snapshot envelope', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/performance`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      hero: {
        totalReports: { value: number; delta: number };
        resolutionRate: { value: number; delta: number };
        avgTimeToResolve: { valueMs: number; deltaMs: number };
      };
      submittedVsResolved: Array<{
        date: string;
        submitted: number;
        resolved: number;
      }>;
      categoryBreakdown: Array<{ categoryId: string; count: number }>;
      statusBreakdown: Array<{ status: string; count: number }>;
      crewTable: Array<{ crewId: string; crewName: string }>;
      longTail: Array<{ id: string; ageMs: number }>;
      range: { fromIso: string; toIso: string };
      ward: { wardId: string | null; wardLabel: string | null };
    };

    expect(typeof body.hero.totalReports.value).toBe('number');
    expect(typeof body.hero.resolutionRate.value).toBe('number');
    expect(typeof body.hero.avgTimeToResolve.valueMs).toBe('number');
    expect(body.submittedVsResolved.length).toBeGreaterThan(0);
    expect(Array.isArray(body.categoryBreakdown)).toBe(true);
    expect(body.statusBreakdown.length).toBeGreaterThan(0);
    expect(Array.isArray(body.crewTable)).toBe(true);
    expect(Array.isArray(body.longTail)).toBe(true);
    expect(Number.isFinite(Date.parse(body.range.fromIso))).toBe(true);
    expect(Number.isFinite(Date.parse(body.range.toIso))).toBe(true);
    expect(body.ward.wardId).toBe('ward_14');
  } finally {
    await ctx.dispose();
  }
});

test('GET performance honours ?from= and ?to=', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/performance`, {
      params: {
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T00:00:00.000Z',
      },
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      range: { fromIso: string; toIso: string };
    };
    expect(body.range.fromIso).toBe('2026-09-01T00:00:00.000Z');
    expect(body.range.toIso).toBe('2026-09-30T00:00:00.000Z');
  } finally {
    await ctx.dispose();
  }
});

test('GET performance → 401 not_authenticated when no cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/performance`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('GET performance → 403 forbidden_role when the cookie is a citizen', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/performance`);
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('GET performance → 400 invalid_query for a malformed date', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/performance`, {
      params: { from: 'not-a-date' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'invalid_query' });
  } finally {
    await ctx.dispose();
  }
});

test('GET performance → 400 invalid_query for an out-of-band ?days=', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/performance`, {
      params: { days: '999' },
    });
    expect(resp.status()).toBe(400);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'invalid_query' });
  } finally {
    await ctx.dispose();
  }
});

// --- UI: /dispatcher/monitor ----------------------------------------------

test('UI: /dispatcher/monitor renders the list, filter chips and chart strip', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  const resp = await page.goto(`${BASE}/dispatcher/monitor`, {
    waitUntil: 'networkidle',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(
    page.locator('[data-testid="dispatcher-monitor-header"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="dispatcher-monitor-list"]'),
  ).toBeVisible({ timeout: 10_000 });

  // The three filter chips are present and the first is pressed.
  for (const f of ['all', 'my_ward', 'my_crews']) {
    await expect(
      page.locator(`[data-testid="dispatcher-monitor-filter-${f}"]`),
    ).toBeVisible();
  }
  await expect(
    page.locator('[data-testid="dispatcher-monitor-filter-all"]'),
  ).toHaveAttribute('aria-pressed', 'true');

  // The chart strip renders with its three chart cards and their
  // accessible table siblings.
  await expect(
    page.locator('[data-testid="dispatcher-monitor-chart-strip"]'),
  ).toBeAttached();
  for (const id of [
    'dispatcher-monitor-chart-flow',
    'dispatcher-monitor-chart-response',
    'dispatcher-monitor-chart-crew',
  ]) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeAttached();
  }
  for (const id of [
    'dispatcher-monitor-chart-flow-table',
    'dispatcher-monitor-chart-response-table',
    'dispatcher-monitor-chart-crew-table',
  ]) {
    const table = page.locator(`[data-testid="${id}"]`);
    await expect(table).toBeAttached();
    // Every chart table carries a caption and scoped column headers.
    await expect(table.locator('caption')).toHaveCount(1);
    await expect(table.locator('th[scope="col"]').first()).toBeAttached();
  }
});

test('UI: a monitor row expands to reveal the trail and acknowledges', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  await page.goto(`${BASE}/dispatcher/monitor`, { waitUntil: 'networkidle' });
  await expect(
    page.locator('[data-testid="dispatcher-monitor-list"]'),
  ).toBeVisible({ timeout: 10_000 });

  const firstRow = page
    .locator('[data-testid^="dispatcher-monitor-row-"]')
    .first();
  await expect(firstRow).toBeVisible();
  const rowId = (await firstRow.getAttribute('data-testid'))!.replace(
    'dispatcher-monitor-row-',
    '',
  );

  // Expand → the trail panel appears with its steps.
  await page.locator(`[data-testid="dispatcher-monitor-toggle-${rowId}"]`).click();
  await expect(
    page.locator(`[data-testid="dispatcher-monitor-expanded-${rowId}"]`),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="dispatcher-monitor-trail-step"]').first(),
  ).toBeAttached();

  // Acknowledge → the audit row is written.
  const ack = page.locator(
    `[data-testid="dispatcher-monitor-acknowledge-${rowId}"]`,
  );
  await expect(ack).toBeVisible();
  await ack.click();

  const adminCtx = await pwRequest.newContext();
  try {
    const aLogin = await devLogin(adminCtx, 'admin');
    expect(aLogin.status()).toBe(303);
    const audit = await adminCtx.get(`${BASE}/api/v1/admin/audit`, {
      params: { action: 'ticket.monitor_acknowledge', limit: '20' },
    });
    expect(audit.status()).toBe(200);
    const auditBody = (await audit.json()) as {
      entries: Array<{ entityId: string }>;
    };
    expect(auditBody.entries.some((e) => e.entityId === rowId)).toBe(true);
  } finally {
    await adminCtx.dispose();
  }
});

// --- UI: /dispatcher/performance ------------------------------------------

test('UI: /dispatcher/performance renders the header, hero cards, charts and tables', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  const resp = await page.goto(`${BASE}/dispatcher/performance`, {
    waitUntil: 'networkidle',
  });
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);

  await expect(
    page.locator('[data-testid="dispatcher-performance-header"]'),
  ).toBeVisible();

  // The header names the ward: "Ward 14 · Performance snapshot".
  // The ward label is the bare number — the template supplies the
  // "Ward" word, so the page must NOT read "Ward Ward 14".
  const heading = page.locator(
    '[data-testid="dispatcher-performance-header"] h1',
  );
  await expect(heading).toContainText('Ward 14');
  await expect(heading).toContainText('Performance snapshot');
  await expect(heading).not.toContainText('Ward Ward');

  // Three hero stat cards.
  for (const id of [
    'dispatcher-performance-hero-total',
    'dispatcher-performance-hero-resolution',
    'dispatcher-performance-hero-avg-time',
  ]) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeVisible({
      timeout: 10_000,
    });
  }

  // Three charts, each with its accessible table sibling.
  for (const id of [
    'dispatcher-performance-chart-submitted',
    'dispatcher-performance-chart-category',
    'dispatcher-performance-chart-status',
  ]) {
    await expect(page.locator(`[data-testid="${id}"]`)).toBeAttached();
  }
  for (const id of [
    'dispatcher-performance-chart-submitted-table',
    'dispatcher-performance-chart-category-table',
    'dispatcher-performance-chart-status-table',
  ]) {
    const table = page.locator(`[data-testid="${id}"]`);
    await expect(table).toBeAttached();
    await expect(table.locator('caption')).toHaveCount(1);
    await expect(table.locator('th[scope="col"]').first()).toBeAttached();
  }

  // The crew table and the long-tail section.
  await expect(
    page.locator('[data-testid="dispatcher-performance-crew-table"]'),
  ).toBeAttached();
  await expect(
    page.locator('[data-testid="dispatcher-performance-long-tail"]'),
  ).toBeAttached();

  // The export controls.
  await expect(
    page.locator('[data-testid="dispatcher-performance-export-pdf"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="dispatcher-performance-export-csv"]'),
  ).toBeVisible();
});

test('UI: the crew table sorts on a header click', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  await page.goto(`${BASE}/dispatcher/performance`, { waitUntil: 'networkidle' });
  await expect(
    page.locator('[data-testid="dispatcher-performance-crew-table"]'),
  ).toBeAttached({ timeout: 10_000 });

  const header = page.locator(
    '[data-testid="dispatcher-performance-sort-crewName"]',
  );
  await expect(header).toBeAttached();
  await header.click();

  // The clicked column now carries an aria-sort of ascending or
  // descending (the first click flips the default descending sort).
  const th = page.locator(
    '[data-testid="dispatcher-performance-crew-table"] th[scope="col"]',
  );
  const sorts = await th.evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-sort')),
  );
  expect(sorts.some((s) => s === 'ascending' || s === 'descending')).toBe(true);
});
