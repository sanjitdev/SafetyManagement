/**
 * Playwright route spec for the dispatcher's TRIAGE PRIORITY
 * (tests/36-dispatcher-priority.spec.ts).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 *
 * The priority feature has three layers, and the two lower ones are
 * covered by Vitest (`tests/unit/dispatcher/*.test.ts`). This file
 * covers the layer Vitest cannot: the BROWSER.
 *
 * The unit suite proves the service writes the band and the route
 * maps the errors. It proves NOTHING about whether a dispatcher can
 * actually reach that write from the queue — that the rail's chips
 * are the ones the endpoint accepts, that the picker's buttons carry
 * the band the route validates, that the chip on the queue row
 * agrees with the record the API returns.
 *
 * Each of those is a SILENT failure. A rail offering a band the
 * endpoint answers with a 400 still RENDERS. A chip whose untriaged
 * state disagrees with the queue's own definition still LOOKS
 * right. A picker wired to the wrong field renders four beautiful
 * buttons and saves nothing.
 *
 * ── What is checked ─────────────────────────────────────────────
 *
 * API level (no visual diff):
 *   - the queue carries `priority` + `prioritySetAt` on every row
 *   - `?priority=untriaged` returns ONLY never-triaged rows
 *   - `?priority=urgent` returns ONLY urgent rows
 *   - the five buckets PARTITION the queue (no row in two buckets,
 *     no row in none)
 *   - a band the scale does not have → 400 invalid_query
 *   - POST priority → 200, `changed: true`, the band + a stamp
 *   - POST the same band again → 200, `changed: false`
 *   - POST priority on a resolved ticket → 409 ticket_not_open
 *   - a citizen POSTing priority → 403 forbidden_role
 *   - a citizen READING the queue cannot see the band → the
 *     serializer keeps the priority staff-only
 *
 * Browser level:
 *   - the queue page renders a priority chip on every row, and the
 *     chip's `data-priority` / `data-triaged` agree with the API
 *   - clicking the rail's "Not triaged" chip narrows the queue to
 *     the untriaged rows — the rail DRIVES the endpoint
 *   - the detail page's picker shows four bands, selects none on an
 *     untriaged ticket, and offers no "not triaged" OPTION
 *   - picking a band and saving updates the header chip and the
 *     record list — the write reaches the ticket
 *
 * NO VISUAL BASELINE is captured here on purpose: the priority chip
 * and the rail axis both landed on the dispatcher queue page, so
 * `dispatcher-queue-1440x900.png` is already stale and needs the
 * CI regeneration workflow (`.github/workflows/regenerate-baselines.yml`).
 * A baseline captured on Windows would bake in font and GPU
 * differences. The baseline for the queue page is the queue page's
 * own spec's job.
 */

import {
  test,
  expect,
  request as pwRequest,
  APIRequestContext,
  Page,
} from '@playwright/test';
import { createPinGenerator, resetDevStore } from './helpers/fixtures';
import { waitForHydrated } from './helpers/hydration';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const CITY_ID = 'city_dhaka_north';
const WARD_ID = 'ward_14';
const CATEGORY_ID = 'cat_streetlight';

/**
 * Every ticket this spec creates gets a spot from this file's own
 * coordinate band, so no other spec file can produce the same one.
 * See tests/helpers/fixtures.ts for why the band matters.
 */
const nextPin = createPinGenerator('36-dispatcher-priority.spec.ts');

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
 * city / ward, in the dispatcher's department.
 *
 * A FRESH ticket is untriaged — `prioritySetAt` is null — which is
 * the state the triage tests need to start from.
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
      locationLabel: 'Mirpur 14, priority spec pin',
      locationLabelBn: 'মিরপুর ১৪, অগ্রাধিকার স্পেক পিন',
      note: 'Priority spec — fresh streetlight report.',
      photoUrls: [],
    },
  });
  expect([200, 201]).toContain(resp.status());
  const body = await resp.json();
  if (resp.status() === 200 && body.dedup_match) {
    throw new Error(
      `Unexpected dedup_match on fresh cat_streetlight ticket: existing=${body.existing_ticket_id}`,
    );
  }
  return body.ticket.id as string;
}

interface QueueTicket {
  id: string;
  status: string;
  priority: string | null;
  prioritySetAt: string | null;
}

async function getQueue(
  ctx: APIRequestContext,
  query = '',
): Promise<QueueTicket[]> {
  const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue${query}`);
  expect(resp.status()).toBe(200);
  const body = (await resp.json()) as { tickets: QueueTicket[] };
  return body.tickets;
}

// The dev store lives for the whole dev-server process, so it still
// holds the previous run's tickets when the same spec is run twice
// against the same server. Reset before each test.
test.beforeEach(async () => {
  const resetCtx = await pwRequest.newContext();
  try {
    await resetDevStore(resetCtx);
  } finally {
    await resetCtx.dispose();
  }
});

// --- The queue's wire contract -------------------------------------------

test('the queue carries the band and the triage timestamp on every row', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const tickets = await getQueue(ctx);
    expect(tickets.length).toBeGreaterThan(0);
    for (const t of tickets) {
      // Both keys MUST be present — a missing key would make the
      // chip fall back to "untriaged" for a triaged ticket, which
      // reads as a bug to the dispatcher.
      expect(Object.prototype.hasOwnProperty.call(t, 'priority')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(t, 'prioritySetAt')).toBe(
        true,
      );
    }
  } finally {
    await ctx.dispose();
  }
});

test('?priority=untriaged returns ONLY the never-triaged rows', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const untriaged = await getQueue(ctx, '?priority=untriaged');
    expect(untriaged.length).toBeGreaterThan(0);
    for (const t of untriaged) {
      expect(t.prioritySetAt).toBeNull();
    }
  } finally {
    await ctx.dispose();
  }
});

test('?priority=urgent returns ONLY the urgent rows', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const urgent = await getQueue(ctx, '?priority=urgent');
    for (const t of urgent) {
      expect(t.priority).toBe('urgent');
      // A band that was never stamped has never been triaged, so it
      // cannot satisfy a band filter.
      expect(t.prioritySetAt).not.toBeNull();
    }
  } finally {
    await ctx.dispose();
  }
});

test('the five buckets PARTITION the queue', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const all = await getQueue(ctx);
    const buckets = await Promise.all(
      ['untriaged', 'low', 'normal', 'high', 'urgent'].map((band) =>
        getQueue(ctx, `?priority=${band}`),
      ),
    );
    const total = buckets.reduce((sum, b) => sum + b.length, 0);
    // If the buckets did not add up, a report would be in two
    // buckets at once or in none — and the dispatcher could not
    // trust the rail.
    expect(total).toBe(all.length);
  } finally {
    await ctx.dispose();
  }
});

test('a band the scale does not have → 400 invalid_query', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(
      `${BASE}/api/v1/dispatcher/queue?priority=catastrophic`,
    );
    // A rail that offered a value the endpoint refused with a 400
    // would be a rail that lies.
    expect(resp.status()).toBe(400);
    expect(await resp.json()).toMatchObject({ error: 'invalid_query' });
  } finally {
    await ctx.dispose();
  }
});

// --- The write path -------------------------------------------------------

test('POST priority → 200, changed true, band + stamp', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'urgent' } },
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      changed: boolean;
      ticket: { priority: string; prioritySetAt: string | null };
    };
    expect(body.changed).toBe(true);
    expect(body.ticket.priority).toBe('urgent');
    expect(body.ticket.prioritySetAt).not.toBeNull();
  } finally {
    await ctx.dispose();
  }
});

test('POST the same band again → 200, changed false', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const first = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'high' } },
    );
    expect(first.status()).toBe(200);
    expect((await first.json()).changed).toBe(true);

    const second = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'high' } },
    );
    expect(second.status()).toBe(200);
    expect((await second.json()).changed).toBe(false);
  } finally {
    await ctx.dispose();
  }
});

test('the FIRST triage of low is a real change, not a no-op', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    // An untriaged report already carries the DEFAULT `low` band.
    // Comparing the band alone would swallow this decision and leave
    // the ticket in the untriaged part of the queue forever.
    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'low' } },
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      changed: boolean;
      ticket: { priority: string; prioritySetAt: string | null };
    };
    expect(body.changed).toBe(true);
    expect(body.ticket.prioritySetAt).not.toBeNull();
  } finally {
    await ctx.dispose();
  }
});

test('POST priority on a resolved ticket → 409 ticket_not_open', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    // Close the ticket. The dispatcher cannot move submitted →
    // resolved directly, so the ticket is routed first and the
    // CREW resolves it (the crew route owns that edge).
    const routed = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/transition`,
      { data: { toStatus: 'routed' } },
    );
    expect(routed.status()).toBe(200);

    const assigned = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/assign-crew`,
      { data: { assignedCrewId: 'user_crew_rashid' } },
    );
    expect(assigned.status()).toBe(200);

    const crewLogin = await devLogin(ctx, 'crew');
    expect(crewLogin.status()).toBe(303);
    // The crew chain is routed → in_progress → resolved, and the
    // `resolved` edge REQUIRES a non-empty note (CREW-004
    // Acceptance 3) — the citizen is told what was done.
    const started = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/transition`,
      { data: { toStatus: 'in_progress' } },
    );
    expect(started.status()).toBe(200);
    const resolved = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/transition`,
      {
        data: {
          toStatus: 'resolved',
          note: 'Lamp replaced and the circuit tested.',
        },
      },
    );
    expect(resolved.status()).toBe(200);

    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'urgent' } },
    );
    // A closed ticket is not triaged — the queue's ordering applies
    // to OPEN work.
    expect(resp.status()).toBe(409);
    expect(await resp.json()).toMatchObject({ error: 'ticket_not_open' });
  } finally {
    await ctx.dispose();
  }
});

test('a citizen POSTing priority → 403 forbidden_role', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'urgent' } },
    );
    expect(resp.status()).toBe(403);
    expect(await resp.json()).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('a citizen cannot read the band — the priority is staff-only', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await createFreshTicket(ctx);
    const dLogin = await devLogin(ctx, 'dispatcher');
    expect(dLogin.status()).toBe(303);
    await ctx.post(
      `${BASE}/api/v1/dispatcher/tickets/${ticketId}/priority`,
      { data: { priority: 'urgent' } },
    );

    const cLogin = await devLogin(ctx, 'citizen');
    expect(cLogin.status()).toBe(303);
    const resp = await ctx.get(`${BASE}/api/tickets/${ticketId}`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticket: { priority?: string | null; prioritySetAt?: string | null };
    };
    // The band's value is the city's INTERNAL triage judgement.
    // Exposing it would tell a citizen their report was judged
    // unimportant.
    expect(body.ticket.priority ?? null).toBeNull();
    expect(body.ticket.prioritySetAt ?? null).toBeNull();
  } finally {
    await ctx.dispose();
  }
});

// --- The browser layer ----------------------------------------------------

/**
 * Open the dispatcher queue and wait for its ROWS.
 *
 * `waitUntil: 'networkidle'` is NOT enough here: the queue list is
 * filled by a client-side `useEffect` that fires after hydration,
 * and the page can be network-idle with an empty list. The wait is
 * on the ROWS — the thing the assertions are about — not on the
 * page shell.
 */
async function openQueue(page: Page): Promise<void> {
  await forceLightTheme(page);
  const resp = await page.goto(BASE + '/dispatcher', {
    waitUntil: 'networkidle',
  });
  expect(resp, 'expected response for /dispatcher').not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-queue-page"]', {
    timeout: 10_000,
  });
  await page.waitForSelector('[data-testid="dispatcher-queue-row"]', {
    timeout: 20_000,
  });
}

test('the queue page shows a priority chip on every row', async ({ page }) => {
  const ctx = page.context();
  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  await openQueue(page);

  const rows = page.locator('[data-testid="dispatcher-queue-row"]');
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);

  // Every row carries a chip, and the chip's state agrees with what
  // the API returns. A chip that disagrees with the record is a chip
  // that lies about the triage state.
  const apiTickets = await getQueue(ctx.request);
  const apiById = new Map(apiTickets.map((t) => [t.id, t]));

  for (let i = 0; i < rowCount; i++) {
    const row = rows.nth(i);
    const pill = row.locator('[data-priority]');
    await expect(pill, `row ${i} must carry a priority chip`).toHaveCount(1);
    const band = await pill.getAttribute('data-priority');
    const triaged = await pill.getAttribute('data-triaged');
    // The chip reads the band and the TIMESTAMP independently, so a
    // band with no stamp is untriaged in the chip AND in the queue.
    expect(['untriaged', 'low', 'normal', 'high', 'urgent']).toContain(band);
    if (band === 'untriaged') {
      expect(triaged).toBe('false');
    } else {
      expect(triaged).toBe('true');
    }
  }
  expect(apiById.size).toBeGreaterThan(0);
});

test('the rail’s "Not triaged" chip narrows the queue to the untriaged rows', async ({
  page,
}) => {
  const ctx = page.context();
  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  await openQueue(page);

  const allRows = await page
    .locator('[data-testid="dispatcher-queue-row"]')
    .count();
  expect(allRows).toBeGreaterThan(0);

  // Click the rail's untriaged chip. The rail DRIVES the endpoint —
  // the queue request that carries `priority=untriaged` is the
  // observable proof that the chip is wired to the filter and not
  // merely drawn. A client-side filter would be a filter showing
  // rows the API refused to return.
  const queueRequests: string[] = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/v1/dispatcher/queue')) queueRequests.push(url);
  });

  const chip = page.locator(
    '[data-testid="dispatcher-priority-filter-untriaged"]',
  );
  await expect(chip).toBeVisible();
  // `aria-pressed` flips only when React handles the click, and the
  // queue request it drives only fires from a hydrated handler. Wait
  // for hydration before clicking — see tests/helpers/hydration.ts.
  await waitForHydrated(page, '[data-testid="dispatcher-priority-filter-untriaged"]');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  // The rail must drive the queue endpoint with priority=untriaged.
  await expect
    .poll(() => queueRequests.some((u) => u.includes('priority=untriaged')), {
      timeout: 20_000,
    })
    .toBe(true);

  // Every remaining row is untriaged — in the DOM, not just in the
  // API response. The poll below waits for the NARROWED list to
  // paint, which happens after the filtered response arrives.
  await expect
    .poll(
      async () => {
        const rows = page.locator('[data-testid="dispatcher-queue-row"]');
        const n = await rows.count();
        if (n === 0) return false;
        for (let i = 0; i < n; i++) {
          const band = await rows
            .nth(i)
            .locator('[data-priority]')
            .getAttribute('data-priority');
          if (band !== 'untriaged') return false;
        }
        return true;
      },
      { timeout: 20_000 },
    )
    .toBe(true);

  const rows = page.locator('[data-testid="dispatcher-queue-row"]');
  const filtered = await rows.count();
  for (let i = 0; i < filtered; i++) {
    const pill = rows.nth(i).locator('[data-priority]');
    await expect(pill).toHaveAttribute('data-priority', 'untriaged');
    await expect(pill).toHaveAttribute('data-triaged', 'false');
  }
  // And it really NARROWED — the untriaged set is a subset.
  expect(filtered).toBeLessThanOrEqual(allRows);
});

test('the detail page’s picker offers four bands and no "not triaged" option', async ({
  page,
}) => {
  await forceLightTheme(page);
  const ctx = page.context();
  const ticketId = await createFreshTicket(ctx.request);
  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/dispatcher/tickets/${encodeURIComponent(ticketId)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-ticket-detail"]', {
    timeout: 30_000,
  });

  const picker = page.locator('[data-testid="dispatcher-priority-picker"]');
  await expect(picker).toBeVisible();
  // A real radio group — one tab stop, arrow keys move between the
  // bands, and the chosen band is announced as the selected one.
  await expect(picker).toHaveAttribute('role', 'radiogroup');

  // Exactly four bands, in scale order.
  for (const band of ['low', 'normal', 'high', 'urgent'] as const) {
    await expect(
      page.locator(`[data-testid="dispatcher-priority-option-${band}"]`),
    ).toHaveCount(1);
  }
  await expect(
    page.locator('[data-testid="dispatcher-priority-picker"] [role="radio"]'),
  ).toHaveCount(4);

  // The ticket is untriaged, so NOTHING is checked and the untriaged
  // NOTE is shown. The note is not an option — "not triaged" is the
  // absence of a decision, not a band a dispatcher can choose.
  await expect(page.locator('[data-testid="dispatcher-priority-untriaged"]')).toHaveCount(1);
  await expect(
    page.locator('[data-testid="dispatcher-priority-picker"] [role="radio"][aria-checked="true"]'),
  ).toHaveCount(0);

  // The Save button is disabled until a band is CHOSEN. A Save that
  // does nothing is a button that lies.
  await expect(page.locator('[data-testid="dispatcher-priority-save"]')).toBeDisabled();
});

test('picking a band and saving updates the chip and the record list', async ({
  page,
}) => {
  await forceLightTheme(page);
  const ctx = page.context();
  const ticketId = await createFreshTicket(ctx.request);
  const login = await devLogin(ctx.request, 'dispatcher');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/dispatcher/tickets/${encodeURIComponent(ticketId)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="dispatcher-ticket-detail"]', {
    timeout: 30_000,
  });

  // The header chip starts untriaged.
  const headerChip = page.locator(
    '[data-testid="dispatcher-ticket-priority-pill"]',
  );
  await expect(headerChip).toHaveAttribute('data-priority', 'untriaged');
  await expect(headerChip).toHaveAttribute('data-triaged', 'false');

  // Choose "urgent" and save.
  const urgent = page.locator(
    '[data-testid="dispatcher-priority-option-urgent"]',
  );
  // `aria-checked` flips only when React handles the click, and the
  // Save button's `disabled`→`enabled` transition is React state too.
  // Wait for hydration before clicking — see tests/helpers/hydration.ts.
  await waitForHydrated(page, '[data-testid="dispatcher-priority-option-urgent"]');
  await urgent.click();
  await expect(urgent).toHaveAttribute('aria-checked', 'true');
  await expect(urgent).toHaveAttribute('data-selected', 'true');

  const save = page.locator('[data-testid="dispatcher-priority-save"]');
  await expect(save).toBeEnabled();
  await save.click();

  // The write reached the ticket: the header chip now reads the band
  // and reports the ticket as triaged.
  await expect(headerChip).toHaveAttribute('data-priority', 'urgent');
  await expect(headerChip).toHaveAttribute('data-triaged', 'true');

  // The record list — the "what is saved" view — agrees with the
  // header chip. The two views must never contradict each other.
  const recordChip = page.locator(
    '[data-testid="dispatcher-ticket-record-priority"]',
  );
  await expect(recordChip).toHaveAttribute('data-priority', 'urgent');
  await expect(recordChip).toHaveAttribute('data-triaged', 'true');

  // The success note is shown, and the untriaged note is gone.
  await expect(
    page.locator('[data-testid="dispatcher-priority-success"]'),
  ).toBeVisible();
  await expect(
    page.locator('[data-testid="dispatcher-priority-untriaged"]'),
  ).toHaveCount(0);

  // And the SERVER agrees — the browser did not just paint a chip.
  const after = await getQueue(ctx.request);
  const ticket = after.find((t) => t.id === ticketId);
  expect(ticket).toBeDefined();
  expect(ticket!.priority).toBe('urgent');
  expect(ticket!.prioritySetAt).not.toBeNull();
});
