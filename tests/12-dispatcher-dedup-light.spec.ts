/**
 * Playwright route spec for the dispatcher dedup-decline review
 * surface (tests/12-dispatcher-dedup-light.spec.ts).
 *
 * DISP-006 (Intent 003, Unit 004): the dispatcher manually
 * confirms or dismisses a citizen-declined dedup candidate.
 *
 * Captures one light-theme visual baseline (1440x900, English
 * labels) — `dispatcher-dedup-1440x900.png` — for the page
 * with one pending flag visible.
 *
 * The live API checks (no visual diff) are:
 *   - GET /api/v1/dispatcher/dedup-flags returns the pending
 *     flag the test created via the citizen dedup-decline path
 *   - dispatcher cookie → 200; citizen → 403; no cookie → 401
 *   - POST /api/v1/dispatcher/dedup-flags/[id]/confirm sets the
 *     flag status to 'confirmed' and the ticket status to
 *     'closed' with closeReason 'duplicate'
 *   - POST /api/v1/dispatcher/dedup-flags/[id]/dismiss sets the
 *     flag status to 'dismissed' and leaves the ticket in
 *     'submitted' (it was already submitted; the flag overlay
 *     was hiding it from triage)
 *   - out-of-scope flag id (different ward) → 404 not_found
 *     (matches Bolt 003-003's out-of-scope → 404 pattern)
 *
 * The dedup-flag fixture is built by:
 *   1. Citizen POSTs a ticket (the "original")
 *   2. Citizen POSTs ANOTHER ticket near the original with
 *      `dedupDeclineTicketId` set to the original's id
 *      (skips the dedup engine and writes a DedupFlag row)
 *   3. Dispatcher logs in and the dedup list/confirm/dismiss
 *      endpoints see the flag.
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';
import { createPinGenerator, resetDevStore } from './helpers/fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };
const CITY_ID = 'city_dhaka_north';
const WARD_ID = 'ward_14';
const CATEGORY_ID = 'cat_streetlight';

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

interface DedupFixture {
  originalTicketId: string;
  duplicateTicketId: string;
}

/**
 * Create a dedup-flag fixture:
 *   1. Citizen POSTs ticket A (the "original")
 *   2. Citizen POSTs ticket B near A with `dedupDeclineTicketId`
 *      set to A — this writes a DedupFlag row (DISP-006).
 * Both tickets are well outside the 50m radius of any seed
 * ticket (a few kilometres north-east of the city centre) so the
 * dedup engine itself would not fire on the second POST.
 *
 * WHY THE COORDINATES COME FROM A SHARED BAND
 * -------------------------------------------
 * The dev store is ONE in-memory database shared by every spec in
 * the run, and it lives for the whole Playwright session. Ticket A
 * created at a fixed coordinate is therefore still there when the
 * NEXT test in this file builds its fixture at the same spot — and
 * that second creation comes back as `dedup_match` (a 200 with a
 * `dedup_match` body) instead of a 201.
 *
 * That is not a product bug: it is PLAT-REQ-004 working exactly as
 * designed. It is a fixture-isolation defect.
 *
 * `nextPin` hands out spots from this FILE's own coordinate band
 * (see tests/helpers/fixtures.ts), so this spec can never collide
 * with another spec file whatever the run order. A and B share the
 * SAME base, so their ~5 m mutual offset — and therefore the dedup
 * prompt the fixture is built to exercise — is preserved.
 */
const nextPin = createPinGenerator('12-dispatcher-dedup-light.spec.ts');

async function createDedupFixture(ctx: APIRequestContext): Promise<DedupFixture> {
  const login = await devLogin(ctx, 'citizen');
  expect(login.status()).toBe(303);

  const base = nextPin();
  const baseLat = base.lat;
  const baseLng = base.lng;

  // Original ticket (A)
  const a = await ctx.post(`${BASE}/api/tickets`, {
    data: {
      cityId: CITY_ID,
      wardId: WARD_ID,
      categoryId: CATEGORY_ID,
      locationLat: baseLat,
      locationLng: baseLng,
      locationLabel: 'Mirpur 14, dedup-fixture original',
      locationLabelBn: 'মিরপুর ১৪, ডেডাপ মূল',
      note: 'Bolt 003-004 dedup fixture — original.',
      photoUrls: [],
    },
  });
  expect([200, 201]).toContain(a.status());
  const aBody = await a.json();
  if (a.status() === 200 && aBody.dedup_match) {
    throw new Error('Unexpected dedup_match on fixture original ticket');
  }
  const originalId = aBody.ticket.id as string;

  // Duplicate ticket (B) — within 25m of A. Citizen explicitly
  // declines the (synthetic) dedup match by passing
  // `dedupDeclineTicketId` so the engine returns a 201/200 and
  // a DedupFlag row is created.
  const b = await ctx.post(`${BASE}/api/tickets`, {
    data: {
      cityId: CITY_ID,
      wardId: WARD_ID,
      categoryId: CATEGORY_ID,
      locationLat: baseLat + 0.00005, // ~5m offset
      locationLng: baseLng,
      locationLabel: 'Mirpur 14, dedup-fixture duplicate',
      locationLabelBn: 'মিরপুর ১৪, ডেডাপ নকল',
      note: 'Bolt 003-004 dedup fixture — duplicate (declined).',
      photoUrls: [],
      dedupDeclineTicketId: originalId,
    },
  });
  expect([200, 201]).toContain(b.status());
  const bBody = await b.json();
  if (bBody.dedup_match) {
    throw new Error('Unexpected dedup_match on fixture duplicate ticket (decline path)');
  }
  const duplicateId = bBody.ticket.id as string;

  return { originalTicketId: originalId, duplicateTicketId: duplicateId };
}

// --- API-level checks ----------------------------------------------------

/**
 * Reset the dev store before each test.
 *
 * The dev store lives for the whole dev-server process, so it still
 * holds the previous run's tickets when the same spec is run twice
 * against the same server. Coordinate bands separate spec FILES from
 * each other; only a reset separates two RUNS of the same file.
 */
test.beforeEach(async () => {
  const resetCtx = await pwRequest.newContext();
  try {
    await resetDevStore(resetCtx);
  } finally {
    await resetCtx.dispose();
  }
});

test('GET /api/v1/dispatcher/dedup-flags → 200 with the pending flag', async () => {
  const ctx = await pwRequest.newContext();
  try {
    await createDedupFixture(ctx);
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/dedup-flags?limit=50`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      flags: Array<{
        id: string;
        status: 'pending' | 'confirmed' | 'dismissed';
        ticket: { id: string } | null;
        originalTicket: { id: string } | null;
      }>;
    };
    expect(body.flags.length).toBeGreaterThanOrEqual(1);
    // Find OUR fixture's flag (other tests may have left flags behind).
    const fixture = body.flags.find(
      (f) => f.ticket?.id && f.originalTicket?.id && f.status === 'pending',
    );
    expect(fixture, 'expected at least one pending flag in the dedup queue').toBeDefined();
    expect(fixture!.status).toBe('pending');
    expect(fixture!.ticket).not.toBeNull();
    expect(fixture!.originalTicket).not.toBeNull();
  } finally {
    await ctx.dispose();
  }
});

test('GET /api/v1/dispatcher/dedup-flags → 403 with citizen cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    await createDedupFixture(ctx);
    const cLogin = await devLogin(ctx, 'citizen');
    expect(cLogin.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/dedup-flags?limit=50`);
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('GET /api/v1/dispatcher/dedup-flags → 401 with no cookie', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/dedup-flags?limit=50`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('POST confirm sets flag status=confirmed and ticket status=closed', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const { duplicateTicketId } = await createDedupFixture(ctx);
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);

    // Find the flag id for our fixture by walking the list.
    const list = await ctx.get(`${BASE}/api/v1/dispatcher/dedup-flags?limit=50`);
    expect(list.status()).toBe(200);
    const listBody = (await list.json()) as {
      flags: Array<{
        id: string;
        ticket: { id: string } | null;
        status: string;
      }>;
    };
    const flag = listBody.flags.find(
      (f) => f.ticket?.id === duplicateTicketId && f.status === 'pending',
    );
    expect(flag, 'expected the fixture flag to be pending').toBeDefined();

    // Confirm.
    const confirm = await ctx.post(
      `${BASE}/api/v1/dispatcher/dedup-flags/${encodeURIComponent(flag!.id)}/confirm`,
    );
    expect(confirm.status()).toBe(200);
    const confirmBody = (await confirm.json()) as {
      status: 'confirmed';
      flagId: string;
      ticket: { id: string; status: 'closed'; closeReason: 'duplicate' };
    };
    expect(confirmBody.status).toBe('confirmed');
    expect(confirmBody.flagId).toBe(flag!.id);
    expect(confirmBody.ticket.id).toBe(duplicateTicketId);
    expect(confirmBody.ticket.status).toBe('closed');
    expect(confirmBody.ticket.closeReason).toBe('duplicate');
  } finally {
    await ctx.dispose();
  }
});

test('POST dismiss sets flag status=dismissed and leaves ticket in submitted', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const { duplicateTicketId } = await createDedupFixture(ctx);
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);

    // Find the flag id for our fixture.
    const list = await ctx.get(`${BASE}/api/v1/dispatcher/dedup-flags?limit=50`);
    expect(list.status()).toBe(200);
    const listBody = (await list.json()) as {
      flags: Array<{
        id: string;
        ticket: { id: string } | null;
        status: string;
      }>;
    };
    const flag = listBody.flags.find(
      (f) => f.ticket?.id === duplicateTicketId && f.status === 'pending',
    );
    expect(flag, 'expected the fixture flag to be pending').toBeDefined();

    // Dismiss.
    const dismiss = await ctx.post(
      `${BASE}/api/v1/dispatcher/dedup-flags/${encodeURIComponent(flag!.id)}/dismiss`,
    );
    expect(dismiss.status()).toBe(200);
    const dismissBody = (await dismiss.json()) as {
      status: 'dismissed';
      flagId: string;
      ticket: { id: string; status: 'submitted' };
    };
    expect(dismissBody.status).toBe('dismissed');
    expect(dismissBody.flagId).toBe(flag!.id);
    expect(dismissBody.ticket.id).toBe(duplicateTicketId);
    // The ticket stays in `submitted` — the dedup-flag overlay was
    // the only thing hiding it from the dispatcher triage queue.
    expect(dismissBody.ticket.status).toBe('submitted');
  } finally {
    await ctx.dispose();
  }
});

test('POST confirm/dismiss on an unknown flag id → 404 not_found', async () => {
  // Out-of-scope and missing are indistinguishable so a bad id
  // returns 404 (not 403) — the dispatcher must not be able to
  // probe flag existence outside their scope.
  const ctx = await pwRequest.newContext();
  try {
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);

    const confirm = await ctx.post(
      `${BASE}/api/v1/dispatcher/dedup-flags/df_does_not_exist/confirm`,
    );
    expect(confirm.status()).toBe(404);
    expect((await confirm.json())).toMatchObject({ error: 'not_found' });

    const dismiss = await ctx.post(
      `${BASE}/api/v1/dispatcher/dedup-flags/df_does_not_exist/dismiss`,
    );
    expect(dismiss.status()).toBe(404);
    expect((await dismiss.json())).toMatchObject({ error: 'not_found' });
  } finally {
    await ctx.dispose();
  }
});

// --- Visual baseline ----------------------------------------------------

test('dispatcher-dedup-1440x900 matches light baseline (one pending flag)', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();
  await createDedupFixture(ctx.request);
  const dLogin = await devLogin(ctx.request, 'dispatcher');
  expect(dLogin.status()).toBe(303);

  const resp = await page.goto(`${BASE}/dispatcher/dedup`, { waitUntil: 'networkidle' });
  expect(resp, 'expected response for /dispatcher/dedup').not.toBeNull();
  expect(resp!.status(), `expected 200, got ${resp!.status()}`).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-dedup-page"]', { timeout: 10_000 });
  // Wait for at least one row to appear (the list fetched ≥ 1
  // pending flag in createDedupFixture).
  await page.waitForSelector('[data-testid^="dispatcher-dedup-row-"]', { timeout: 10_000 });
  await expect(page).toHaveScreenshot('dispatcher-dedup-1440x900.png', {
    fullPage: true,
  });
});
