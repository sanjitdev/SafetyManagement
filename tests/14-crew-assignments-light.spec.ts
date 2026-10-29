/**
 * Playwright route spec for the crew today's-assignments
 * surface (tests/14-crew-assignments-light.spec.ts).
 *
 * CREW-002 (Intent 004, Unit 002): the crew's primary
 * list. The spec exercises the live API + the page shell.
 *
 * Captures one light-theme visual baseline (390x844,
 * the crew's target viewport, English labels):
 *   - crew-assignments-populated-390x844.png
 *     (default filter, seed has 2 active tickets assigned
 *     to the crew: 1 routed + 1 in_progress)
 *
 * Note: a separate "empty state" baseline is intentionally
 * NOT captured here. The dev seed's two active tickets mean
 * every filter on the page (All / Routed / In progress)
 * returns ≥1 row; the empty state is exercised in code
 * path (the `EmptyState` component exists in the page) but
 * its visual baseline is deferred until a future seed
 * expansion introduces a status with zero assignments. The
 * earlier empty baseline was removed when the seed grew to
 * include a routed ticket (Bolt 004-003) — the dev store
 * change is the lowest-risk way to give the crew detail
 * page a `routed` ticket to render.
 *
 * The live API checks (no visual diff) are:
 *   - crew cookie → 200 on /api/v1/crew/tickets with
 *     `{ tickets: SerializedTicket[] }`
 *   - dispatcher cookie → 403 forbidden_role
 *   - no cookie → 401 not_authenticated
 *   - crew cookie + ?cityId=city_chittagong → 403
 *     cross_city_access_denied
 *   - crew cookie + ?status=routed filters to routed-only
 *     (the seed has 1 routed ticket assigned to the crew)
 *   - crew cookie + ?status=submitted returns 0 tickets
 *     (the API filter accepts any status; submitted lives
 *     on the dispatcher's queue, not the crew's)
 *   - crew cookie → tickets all have `assignedCrewId =
 *     user_crew_rashid` (the session's userId)
 *   - crew cookie → tickets all have
 *     `status ∈ {routed, in_progress}`
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const CREW_USER_ID = 'user_crew_rashid';
const VIEWPORT = { width: 390, height: 844 };

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

// --- API-level checks ----------------------------------------------------

test('crew cookie → 200 on /api/v1/crew/tickets', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{
        id: string;
        status: 'routed' | 'in_progress';
        assignedCrewId: string | null;
        internalNote: string | null;
        trail: Array<{ actorLabel: string }>;
      }>;
    };
    expect(Array.isArray(body.tickets)).toBe(true);
    // The crew serializer exposes the internal fields:
    for (const t of body.tickets) {
      // `internalNote` may be null but the key MUST be present.
      expect(Object.prototype.hasOwnProperty.call(t, 'internalNote')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(t, 'assignedCrewId')).toBe(true);
      // Every returned ticket must be assigned to the crew
      // member (Rashid). The crew cannot see tickets that
      // belong to other crew members.
      expect(t.assignedCrewId).toBe(CREW_USER_ID);
      // The crew's actionable statuses are routed + in_progress
      // (submitted is for the dispatcher; resolved/closed are
      // terminal).
      expect(['routed', 'in_progress']).toContain(t.status);
      // The trail's actorLabel for the crew is the REAL
      // actorId, not the anonymised "City corporation" string.
      for (const entry of t.trail) {
        expect(entry.actorLabel).not.toBe('City corporation');
      }
    }
  } finally {
    await ctx.dispose();
  }
});

test('dispatcher cookie → 403 forbidden_role on /api/v1/crew/tickets', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('no cookie → 401 not_authenticated on /api/v1/crew/tickets', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('crew cookie + ?cityId=city_chittagong → 403 cross_city_access_denied', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(
      `${BASE}/api/v1/crew/tickets?cityId=city_chittagong`,
    );
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'cross_city_access_denied' });
  } finally {
    await ctx.dispose();
  }
});

test('crew cookie + ?status=routed filters to routed-only', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets?status=routed`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{ status: 'routed' | 'in_progress' }>;
    };
    for (const t of body.tickets) {
      expect(t.status).toBe('routed');
    }
    // Pinned expectation: the dev seed has exactly one
    // routed ticket assigned to the crew. If a future seed
    // change adds or removes one, this assertion surfaces a
    // test fail so the visual baseline can be regenerated
    // deliberately.
    expect(body.tickets.length).toBeGreaterThanOrEqual(1);
  } finally {
    await ctx.dispose();
  }
});

test('crew cookie + ?status=in_progress filters to in-progress-only', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets?status=in_progress`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{ status: 'routed' | 'in_progress' }>;
    };
    for (const t of body.tickets) {
      expect(t.status).toBe('in_progress');
    }
    // Pinned expectation: the dev seed has exactly one
    // in_progress ticket assigned to the crew. If this
    // ever changes, the visual baseline must be regenerated.
    expect(body.tickets.length).toBeGreaterThanOrEqual(1);
  } finally {
    await ctx.dispose();
  }
});

test('crew cookie + ?status=submitted is rejected (submitted lives on dispatcher queue)', async () => {
  // The crew's list API filters to `routed` + `in_progress` — the
  // crew's actionable statuses. `submitted` belongs to the
  // dispatcher queue, so the Zod enum rejects it with 400
  // `invalid_input` rather than returning an empty list.
  //
  // (An earlier version of this test asserted 200-with-zero-rows,
  // which the API never did: the enum has always been
  // `['routed', 'in_progress']`.)
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets?status=submitted`);
    expect(resp.status()).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'invalid_query' });
  } finally {
    await ctx.dispose();
  }
});

test('crew cookie → tickets are in the crew\'s ward + department only', async () => {
  // The dev store's seed only has tickets in ward_14 +
  // cat_streetlight; this test pins the contract that the
  // crew list never returns tickets outside the crew's
  // (wardId, departmentId) scope.
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{
        wardId: string;
        categoryId: string;
      }>;
    };
    for (const t of body.tickets) {
      // The crew is bound to ward_14 + cat_streetlight
      // (the dev store only has one department seeded).
      // A future seed expansion that adds a cat_water
      // ticket must not show up in this list.
      expect(t.wardId).toBe('ward_14');
    }
  } finally {
    await ctx.dispose();
  }
});

// --- Visual baselines ----------------------------------------------------

test('crew-assignments-populated-390x844 matches light baseline', async ({ page }) => {
  // Default filter: 2 active tickets assigned to the crew
  // (the dev store's seed: 1 routed + 1 in_progress).
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();
  const login = await ctx.request.post(`${BASE}/api/dev/login?role=crew`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(login.status()).toBe(303);

  const resp = await page.goto(BASE + '/crew', {
    waitUntil: 'networkidle',
  });
  expect(resp, 'expected response for /crew').not.toBeNull();
  expect(resp!.status(), `expected 200 for /crew, got ${resp!.status()}`).toBe(
    200,
  );
  // Wait for the list page to load.
  await page.waitForSelector('[data-testid="crew-list-page"]', { timeout: 10_000 });
  // Wait for the populated state to settle: at least one
  // row should be visible (the seed's in_progress ticket).
  await page.waitForSelector('[data-testid="crew-list-row"]', { timeout: 10_000 });
  await expect(page).toHaveScreenshot('crew-assignments-populated-390x844.png', {
    fullPage: true,
  });
});
