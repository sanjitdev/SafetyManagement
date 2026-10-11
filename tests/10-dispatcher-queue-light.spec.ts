/**
 * Playwright route spec for the dispatcher triage queue
 * (tests/10-dispatcher-queue-light.spec.ts).
 *
 * DISP-002 (Intent 003, Unit 002): the dispatcher's primary
 * surface. The spec exercises the live API + the page shell.
 *
 * Captures one light-theme visual baseline (1440x900,
 * English labels):
 *   - dispatcher-queue-1440x900.png
 *
 * The live API checks (no visual diff) are:
 *   - dispatcher cookie → 200 on /api/v1/dispatcher/queue
 *     with `{ tickets: SerializedTicket[] }`
 *   - citizen cookie → 403 forbidden_role
 *   - no cookie → 401 not_authenticated
 *   - dispatcher cookie + ?cityId=city_chittagong → 403
 *     cross_city_access_denied
 *   - dispatcher cookie + ?status=submitted filters to
 *     submitted-only tickets
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

// --- API-level checks ----------------------------------------------------

test('dispatcher cookie → 200 on /api/v1/dispatcher/queue', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{
        id: string;
        status: 'submitted' | 'routed';
        internalNote: string | null;
        assignedCrewId: string | null;
        trail: Array<{ actorLabel: string }>;
      }>;
    };
    expect(Array.isArray(body.tickets)).toBe(true);
    // The dispatcher serializer exposes the internal fields:
    for (const t of body.tickets) {
      // `internalNote` may be null but the key MUST be present.
      expect(Object.prototype.hasOwnProperty.call(t, 'internalNote')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(t, 'assignedCrewId')).toBe(true);
      // The trail's actorLabel for the dispatcher is the REAL
      // actorId, not the anonymised "City corporation" string.
      for (const entry of t.trail) {
        expect(entry.actorLabel).not.toBe('City corporation');
      }
    }
  } finally {
    await ctx.dispose();
  }
});

test('citizen cookie → 403 forbidden_role on /api/v1/dispatcher/queue', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue`);
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('no cookie → 401 not_authenticated on /api/v1/dispatcher/queue', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('dispatcher cookie + ?cityId=city_chittagong → 403 cross_city_access_denied', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(
      `${BASE}/api/v1/dispatcher/queue?cityId=city_chittagong`,
    );
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'cross_city_access_denied' });
  } finally {
    await ctx.dispose();
  }
});

test('dispatcher cookie + ?status=submitted filters to submitted-only tickets', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue?status=submitted`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{ status: 'submitted' | 'routed' }>;
    };
    for (const t of body.tickets) {
      expect(t.status).toBe('submitted');
    }
  } finally {
    await ctx.dispose();
  }
});

test('dispatcher cookie + ?status=routed filters to routed-only tickets', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue?status=routed`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      tickets: Array<{ status: 'submitted' | 'routed' }>;
    };
    for (const t of body.tickets) {
      expect(t.status).toBe('routed');
    }
  } finally {
    await ctx.dispose();
  }
});

// --- Visual baseline ------------------------------------------------------

test('dispatcher-queue-1440x900 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  // Sign in as dispatcher via the dev API; cookies are shared
  // between APIRequestContext and the page in the same browser
  // context, so the page picks up the dispatcher session.
  const ctx = page.context();
  const login = await ctx.request.post(`${BASE}/api/dev/login?role=dispatcher`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  expect(login.status()).toBe(303);

  const resp = await page.goto(BASE + '/dispatcher', {
    waitUntil: 'networkidle',
  });
  expect(resp, 'expected response for /dispatcher').not.toBeNull();
  expect(resp!.status(), `expected 200 for /dispatcher, got ${resp!.status()}`).toBe(
    200,
  );
  // Wait for the queue to load.
  await page.waitForSelector('[data-testid="dispatcher-queue-page"]', { timeout: 10_000 });
  await expect(page).toHaveScreenshot('dispatcher-queue-1440x900.png', {
    fullPage: true,
  });
});
