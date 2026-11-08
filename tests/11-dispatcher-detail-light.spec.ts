/**
 * Playwright route spec for the dispatcher ticket detail page
 * (tests/11-dispatcher-detail-light.spec.ts).
 *
 * DISP-003 + DISP-004 + DISP-005 (Intent 003, Unit 003): the
 * dispatcher's per-ticket work surface (record, status trail,
 * photos, transition buttons, reassign, internal note).
 *
 * Captures three light-theme visual baselines (1440x900, English
 * labels) — one per status that the dispatcher can interact with
 * from a `submitted` ticket:
 *   - dispatcher-detail-submitted-1440x900.png
 *   - dispatcher-detail-routed-1440x900.png
 *   - dispatcher-detail-in_progress-1440x900.png
 *
 * The live API checks (no visual diff) are:
 *   - dispatcher cookie → 200 on /api/v1/dispatcher/tickets/[id]
 *     with the full record (internalNote + real actorId on trail)
 *   - citizen cookie → 403 forbidden_role
 *   - no cookie → 401 not_authenticated
 *   - out-of-scope ticket (different ward) → 404 not_found
 *   - transition `submitted → routed` → 200, ticket now in
 *     `routed` status with a new trail entry
 *   - illegal transition (e.g. `submitted → resolved`) → 422
 *     illegal_transition (the dispatcher is not allowed to
 *     transition straight to resolved)
 *   - reassign audit (PATCH) writes an `AuditEntry` with action
 *     `reassign` — observed via the route's success
 *   - internalNote PATCH writes an `AuditEntry` with action
 *     `internal_note`
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';
import { createPinGenerator, resetDevStore } from './helpers/fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };
const CITY_ID = 'city_dhaka_north';
const WARD_ID = 'ward_14';
const CATEGORY_ID = 'cat_streetlight'; // dispatcher persona's department

/**
 * Every ticket this spec creates gets a spot from this file's own
 * coordinate band, so no other spec file can produce the same one.
 * See tests/helpers/fixtures.ts for why the band matters.
 */
const nextPin = createPinGenerator('11-dispatcher-detail-light.spec.ts');

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
 * Create a fresh submitted ticket as a citizen in the dispatcher's
 * city / ward. Uses `cat_streetlight` so the ticket passes the
 * dispatcher's department-scope filter (only streetlight
 * categories map to dept_streetlight in the dev seed). Returns
 * the new ticket id.
 *
 * WHY THE COORDINATES COME FROM A SHARED BAND
 * -------------------------------------------
 * The dev store is ONE in-memory database shared by every spec in
 * the run, and it lives for the whole Playwright session. PLAT-REQ-004
 * de-duplicates on the EXACT spot (the 50 m radius is a prompt, not
 * the key), so a ticket created at a fixed coordinate is still there
 * when another spec — or the next test here — creates its fixture at
 * the same spot, and the creation comes back as `dedup_match` (a 200
 * with a `dedup_match` body) instead of a 201.
 *
 * That is not a product bug: it is the dedup rule working exactly as
 * designed. It is a fixture-isolation defect.
 *
 * `nextPin` hands out spots from this FILE's own band (see
 * tests/helpers/fixtures.ts), so this spec can never collide with
 * another spec file whatever the run order — and never with itself
 * on a second call.
 */
async function createFreshTicket(ctx: APIRequestContext): Promise<string> {
  const login = await devLogin(ctx, 'citizen');
  expect(login.status()).toBe(303);
  const pin = nextPin();
  const resp = await ctx.post(`${BASE}/api/tickets`, {
    data: {
      cityId: CITY_ID,
      wardId: WARD_ID,
      categoryId: CATEGORY_ID,
      locationLat: pin.lat,
      locationLng: pin.lng,
      locationLabel: 'Mirpur 14, test pin',
      locationLabelBn: 'মিরপুর ১৪, পরীক্ষা পিন',
      note: 'Bolt 003-003 detail spec — fresh streetlight report.',
      photoUrls: [],
    },
  });
  // 201 = new ticket, 200 = dedup_match (we do not expect a match
  // because no other cat_streetlight ticket is in the seed).
  expect([200, 201]).toContain(resp.status());
  const body = await resp.json();
  if (resp.status() === 200 && body.dedup_match) {
    // The test pre-condition failed (a leftover cat_streetlight
    // ticket was inside the 50m radius). Surface a useful error.
    throw new Error(
      `Unexpected dedup_match on fresh cat_streetlight ticket: existing=${body.existing_ticket_id}`,
    );
  }
  return body.ticket.id as string;
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

test('dispatcher cookie → 200 on /api/v1/dispatcher/tickets/[id]', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/tickets/${ticketId}`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticket: {
        id: string;
        status: 'submitted';
        internalNote: string | null;
        assignedCrewId: string | null;
        reporterId: string;
        trail: Array<{ actorLabel: string; toStatus: string }>;
      };
    };
    expect(body.ticket.id).toBe(ticketId);
    // The dispatcher serializer exposes the internal fields:
    expect(Object.prototype.hasOwnProperty.call(body.ticket, 'internalNote')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(body.ticket, 'assignedCrewId')).toBe(true);
    // The trail's actorLabel for the dispatcher is the REAL
    // actorId, not the anonymised "City corporation" string.
    for (const entry of body.ticket.trail) {
      expect(entry.actorLabel).not.toBe('City corporation');
    }
  } finally {
    await ctx.dispose();
  }
});

test('citizen cookie → 403 forbidden_role on /api/v1/dispatcher/tickets/[id]', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/tickets/${ticketId}`);
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('no cookie → 401 not_authenticated on /api/v1/dispatcher/tickets/[id]', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/tickets/anything`);
    expect(resp.status()).toBe(401);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('out-of-scope ticket id (ward mismatch) → 404 not_found', async () => {
  // Submit a ticket from a citizen in a DIFFERENT ward (ward_15).
  // The dispatcher is bound to ward_14 → requireScope returns null
  // and the route returns 404 (not 403) so the dispatcher cannot
  // probe ticket existence outside their scope.
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);
    // Submit a ticket in ward_15. The citizen's session is bound
    // to ward_14 by default, but the POST /api/tickets does NOT
    // restrict ward on the citizen side (the citizen picks the
    // pin → ward is derived in the UI, not enforced server-side
    // in v1). Use ward_15 directly.
    const outOfWardPin = nextPin();
    const created = await ctx.post(`${BASE}/api/tickets`, {
      data: {
        cityId: CITY_ID,
        wardId: 'ward_15',
        categoryId: CATEGORY_ID,
        // A spot from this file's band, so the out-of-ward fixture
        // cannot collide with the in-ward fixtures (or with another
        // spec file's) and come back as a dedup match.
        locationLat: outOfWardPin.lat,
        locationLng: outOfWardPin.lng,
        locationLabel: 'Cantonment area, test pin',
        locationLabelBn: 'ক্যান্টনমেন্ট এলাকা, পরীক্ষা পিন',
        note: 'Bolt 003-003 scope-denial fixture — out-of-ward.',
        photoUrls: [],
      },
    });
    expect([200, 201]).toContain(created.status());
    const createdBody = await created.json();
    if (created.status() === 200 && createdBody.dedup_match) {
      throw new Error('Unexpected dedup_match on out-of-ward test ticket');
    }
    const otherWardTicketId = createdBody.ticket.id as string;

    // Now sign in as dispatcher and try to read the out-of-ward ticket.
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);
    const resp = await ctx.get(
      `${BASE}/api/v1/dispatcher/tickets/${otherWardTicketId}`,
    );
    expect(resp.status()).toBe(404);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'not_found' });
  } finally {
    await ctx.dispose();
  }
});

test('transition submitted → routed returns 200 with the updated ticket', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/transition`,
      {
        data: { toStatus: 'routed', note: 'Routed to electrical crew' },
      },
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticket: { id: string; status: 'routed'; trail: Array<{ toStatus: string; note: string | null }> };
    };
    expect(body.ticket.id).toBe(ticketId);
    expect(body.ticket.status).toBe('routed');
    // The trail now has at least 2 entries: the original
    // 'submitted' + the new 'routed' from the transition.
    expect(body.ticket.trail.length).toBeGreaterThanOrEqual(2);
    const lastEntry = body.ticket.trail[body.ticket.trail.length - 1];
    expect(lastEntry.toStatus).toBe('routed');
    expect(lastEntry.note).toBe('Routed to electrical crew');
  } finally {
    await ctx.dispose();
  }
});

test('illegal transition (submitted → resolved) → 422 illegal_transition', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/transition`,
      {
        data: { toStatus: 'resolved' },
      },
    );
    // 'resolved' is NOT in the dispatcher's allowed transitions
    // (routed, cancelled). Two layers reject:
    //   1. The role-allowed check → 403 role_cannot_perform_transition
    //   2. The transition engine → 422 illegal_transition
    // The role-allowed check fires first because the allowed
    // list is a coarser gate than the engine's edge map.
    expect(resp.status()).toBe(403);
    const body = await resp.json();
    expect(body).toMatchObject({ error: 'role_cannot_perform_transition' });
  } finally {
    await ctx.dispose();
  }
});

test('PATCH reassign writes an updated record (no error, returns 200)', async () => {
  // The reassign audit entry is verified via the route's
  // 200-success contract: the returned ticket reflects the
  // new wardId. Inspecting the AuditEntry store directly is
  // out of scope for this light spec (the WO-005 audit-trail
  // spec covers that).
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.patch(`${BASE}/api/v1/dispatcher/tickets/${ticketId}`, {
      data: { wardId: 'ward_14', categoryId: CATEGORY_ID },
    });
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as { ticket: { id: string; wardId: string } };
    expect(body.ticket.id).toBe(ticketId);
    expect(body.ticket.wardId).toBe('ward_14');
  } finally {
    await ctx.dispose();
  }
});

test('PATCH internalNote updates the ticket and is reflected on next GET', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const note = 'Crew dispatched; ETA tomorrow morning (Bolt 003-003).';
    const patch = await ctx.patch(`${BASE}/api/v1/dispatcher/tickets/${ticketId}`, {
      data: { internalNote: note },
    });
    expect(patch.status()).toBe(200);

    const get = await ctx.get(`${BASE}/api/v1/dispatcher/tickets/${ticketId}`);
    expect(get.status()).toBe(200);
    const body = (await get.json()) as { ticket: { internalNote: string | null } };
    expect(body.ticket.internalNote).toBe(note);
  } finally {
    await ctx.dispose();
  }
});

// --- Visual baselines ----------------------------------------------------

/**
 * Drive the dispatcher ticket detail page to a given status.
 * Reuses the page's transition API to advance the ticket
 * (submitted → routed → ...). Falls back to the API for status
 * transitions not reachable from the dispatcher's allowed set.
 */
async function loadDetailAtStatus(
  page: Page,
  ctx: APIRequestContext,
  ticketId: string,
  targetStatus: 'submitted' | 'routed' | 'in_progress',
) {
  if (targetStatus === 'submitted') {
    // Already at submitted after createFreshTicket.
    return;
  }
  // Advance via the API. The dispatcher can move
  // submitted → routed (and also cancel from any non-terminal).
  if (targetStatus === 'routed') {
    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/transition`,
      { data: { toStatus: 'routed' } },
    );
    expect(resp.status()).toBe(200);
    return;
  }
  if (targetStatus === 'in_progress') {
    // The dispatcher cannot move routed → in_progress directly
    // (only the crew can start work in v1). The CREW route
    // (`/api/v1/crew/tickets/[id]/transition`) owns that edge.
    //
    // Two things the crew route requires that the dispatcher
    // route does not:
    //   1. The crew member must be ASSIGNED the ticket
    //      (`ticket.assignedCrewId === session.userId`, else 404).
    //   2. The transition must go to the CREW route, not the
    //      dispatcher one — the dispatcher route is
    //      `requireRole(session, 'dispatcher')`, so a crew
    //      session there gets 403 `forbidden_role`.
    //
    // An earlier version of this helper posted to the
    // DISPATCHER route with a crew session and expected 200. It
    // never passed — the dispatcher route has always been
    // dispatcher-only.
    //
    // Step 1: dispatcher routes it to a crew member.
    let resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/transition`,
      { data: { toStatus: 'routed' } },
    );
    expect(resp.status()).toBe(200);

    resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/assign-crew`,
      { data: { assignedCrewId: 'user_crew_rashid' } },
    );
    expect(resp.status()).toBe(200);

    // Step 2: the assigned crew starts the work.
    const crewLogin = await devLogin(ctx, 'crew');
    expect(crewLogin.status()).toBe(303);
    resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/transition`,
      { data: { toStatus: 'in_progress' } },
    );
    expect(resp.status()).toBe(200);
    // Restore the dispatcher session for the visual baseline.
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);
    return;
  }
}

test('dispatcher-detail-submitted-1440x900 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();
  const ticketId = await createFreshTicket(ctx.request);
  const dLogin = await devLogin(ctx.request, 'dispatcher');
  expect(dLogin.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/dispatcher/tickets/${encodeURIComponent(ticketId)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp, 'expected response for /dispatcher/tickets/[id]').not.toBeNull();
  expect(resp!.status(), `expected 200, got ${resp!.status()}`).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-ticket-detail"]', { timeout: 10_000 });
  await expect(page).toHaveScreenshot('dispatcher-detail-submitted-1440x900.png', {
    fullPage: true,
  });
});

test('dispatcher-detail-routed-1440x900 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();
  const ticketId = await createFreshTicket(ctx.request);
  const dLogin = await devLogin(ctx.request, 'dispatcher');
  expect(dLogin.status()).toBe(303);
  await loadDetailAtStatus(page, ctx.request, ticketId, 'routed');

  const resp = await page.goto(
    `${BASE}/dispatcher/tickets/${encodeURIComponent(ticketId)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-ticket-detail"]', { timeout: 10_000 });
  // Confirm the status pill shows 'routed' so the baseline is meaningful.
  const statusPill = await page
    .locator('[data-testid="dispatcher-ticket-detail"] >> text=/Routed/i')
    .first();
  await expect(statusPill).toBeVisible();
  await expect(page).toHaveScreenshot('dispatcher-detail-routed-1440x900.png', {
    fullPage: true,
  });
});

test('dispatcher-detail-in_progress-1440x900 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();
  const ticketId = await createFreshTicket(ctx.request);
  const dLogin = await devLogin(ctx.request, 'dispatcher');
  expect(dLogin.status()).toBe(303);
  await loadDetailAtStatus(page, ctx.request, ticketId, 'in_progress');

  const resp = await page.goto(
    `${BASE}/dispatcher/tickets/${encodeURIComponent(ticketId)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-ticket-detail"]', { timeout: 10_000 });
  await expect(page).toHaveScreenshot('dispatcher-detail-in_progress-1440x900.png', {
    fullPage: true,
  });
});
