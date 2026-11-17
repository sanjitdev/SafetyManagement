/**
 * Playwright route spec for the admin Reports surface
 * (tests/19-admin-tickets-light.spec.ts).
 *
 * Bolt admin-tickets (Intent 005, Unit 005): admin /admin/tickets
 * list + /admin/tickets/[id] detail with inline status
 * transitions and crew reassign. The list endpoint
 * (`GET /api/v1/admin/tickets`) and the detail endpoint
 * (`GET /api/v1/admin/tickets/[id]`) are read-only, gated
 * by `requireRole('admin')` only (no `requireWebAuthn`).
 *
 * API checks (8):
 *   - GET /api/v1/admin/tickets with no session → 401
 *   - GET with a citizen session → 403
 *   - GET with admin session → 200 + 5 seed tickets
 *   - GET ?status=submitted → 1 ticket (ticket_seed_submitted_1)
 *   - GET ?status=closed → 1 ticket (ticket_seed_closed_1)
 *   - GET ?q=ticket_seed_routed_1 → 1 ticket (exact-match id)
 *   - GET ?categoryId=cat_streetlight → 1 ticket
 *     (ticket_seed_routed_1; only that seed ticket uses
 *     cat_streetlight)
 *   - GET ?limit=2 → 2 tickets + non-null nextCursor
 *   - GET ?status=garbage → 400 invalid_input
 *
 * Detail checks (3):
 *   - GET /api/v1/admin/tickets/[id] with no session → 401
 *   - GET with citizen session → 403
 *   - GET with admin session → 200 + full payload
 *     (internalNote, assignedCrewId, real actorId on trail)
 *
 * Visual baselines (2):
 *   - /admin/tickets list at 1440x900
 *   - /admin/tickets/[id] detail at 1440x900 (routed ticket;
 *     shows sidebar buttons + reassign input)
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';
import { resetDevStore, pinnedEpochMs } from './helpers/fixtures';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 1440, height: 900 };

/**
 * Reset the dev store before each test.
 *
 * This spec asserts EXACT ticket counts over the city-wide list.
 * The dev store lives for the whole dev-server process, so any
 * ticket created by an earlier spec — or by an earlier run of
 * this one — inflates those counts.
 *
 * The reset restores the 10 seed tickets and nothing else.
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

/**
 * The lower bound of the query window, 30 days before "now".
 *
 * The window is measured against the PINNED clock, not the wall
 * clock. The server's clock is pinned to `CITYFIX_SEED_NOW`
 * (2026-11-06 in CI) and the seed tickets are dated relative to that
 * pin — the oldest, `ticket_seed_closed_1`, is `now - 20d`. The API
 * applies the window against the pinned clock too, so a wall-clock
 * `from` walks away from the pin as the pin ages: by 2026-11-17 a
 * wall-clock 30-day window started 2026-10-18 and the 2026-10-17
 * ticket fell out of it, so the list returned 9 tickets where 10
 * were seeded.
 *
 * `pinnedEpochMs()` returns the pin when there is one and the wall
 * clock when there is not (a developer running the server without
 * the pin), which is what the server is on in that case.
 */
function thirtyDayWindowStart(): string {
  return new Date(pinnedEpochMs() - 30 * 86_400_000).toISOString();
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
 * Lift the cookies from an authenticated API context into a
 * Playwright `Page` context so the page hits a real session.
 * Same pattern as tests/18-admin-audit-light.spec.ts:215-230.
 */
async function applyApiCookiesToPage(ctx: APIRequestContext, page: Page) {
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
}

test.describe('ADM-008 — Admin Reports (Bolt admin-tickets)', () => {
  test('GET /api/v1/admin/tickets with no session → 401', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get(`${BASE}/api/v1/admin/tickets`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('GET with a citizen session → 403', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'citizen');
    const res = await ctx.get(`${BASE}/api/v1/admin/tickets`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('forbidden_role');
  });

  test('GET with admin session → 200 + 10 seed tickets + nextCursor null', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    // The dev-store seed tickets span -0d to -20d; the API default
    // is now-7d, so we widen the window to 30d to cover all of them.
    const from = thirtyDayWindowStart();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?from=${encodeURIComponent(from)}`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tickets: Array<{ id: string; status: string }>;
      nextCursor: string | null;
    };
    // TEN seed tickets, not five. The seed carries two families:
    //
    //   - the admin/report-lifecycle family (5): submitted, routed,
    //     in_progress, resolved, closed;
    //   - the crew-scenario family (5): three `resolved` and two
    //     `routed` tickets that back the crew surfaces (Rashid's
    //     "done today" / "done earlier" lists and the routed queue).
    //
    // An earlier version of this spec expected 5 — it was written
    // before the crew-scenario seeds were added, and it asserted
    // the count as though the seed had never grown. The admin
    // ticket list is city-wide, so the crew seeds are legitimately
    // visible here.
    expect(body.tickets.length).toBe(10);
    expect(body.nextCursor).toBeNull();
    // Sorted by createdAt desc; the most-recent seed is the crew
    // "done today" ticket (now - 0d), the oldest is `closed` (now - 20d).
    expect(body.tickets[0].id).toBe('ticket_seed_crew_done_today_1');
    expect(body.tickets[0].status).toBe('resolved');
    expect(body.tickets[body.tickets.length - 1].id).toBe('ticket_seed_closed_1');
    expect(body.tickets[body.tickets.length - 1].status).toBe('closed');
  });

  test('GET ?status=submitted → 1 ticket', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const from = thirtyDayWindowStart();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?status=submitted&from=${encodeURIComponent(from)}`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tickets: Array<{ id: string; status: string }>;
    };
    expect(body.tickets.length).toBe(1);
    expect(body.tickets[0].id).toBe('ticket_seed_submitted_1');
    expect(body.tickets[0].status).toBe('submitted');
  });

  test('GET ?status=closed → 1 ticket (covers status.closed i18n key)', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const from = thirtyDayWindowStart();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?status=closed&from=${encodeURIComponent(from)}`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tickets: Array<{ id: string; status: string }>;
    };
    expect(body.tickets.length).toBe(1);
    expect(body.tickets[0].id).toBe('ticket_seed_closed_1');
    expect(body.tickets[0].status).toBe('closed');
  });

  test('GET ?q=ticket_seed_routed_1 → 1 ticket (exact-match id)', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const from = thirtyDayWindowStart();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?q=ticket_seed_routed_1&from=${encodeURIComponent(from)}`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tickets: Array<{ id: string }>;
    };
    expect(body.tickets.length).toBe(1);
    expect(body.tickets[0].id).toBe('ticket_seed_routed_1');
  });

  test('GET ?categoryId=cat_streetlight → 6 tickets', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const from = thirtyDayWindowStart();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?categoryId=cat_streetlight&from=${encodeURIComponent(from)}`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tickets: Array<{ id: string; categoryId: string }>;
    };
    // SIX streetlight tickets, all assigned to Rashid (whose crew
    // persona is bound to `dept_streetlight`): the routed one, the
    // in-progress one, and the four crew-scenario seeds.
    //
    // An earlier version of this spec expected 2 — it counted only
    // the report-lifecycle family and predated the crew-scenario
    // seeds, three of which are streetlight reports too.
    expect(body.tickets.length).toBe(6);
    const ids = body.tickets.map((t) => t.id).sort();
    expect(ids).toEqual([
      'ticket_seed_crew_done_earlier_1',
      'ticket_seed_crew_done_today_1',
      'ticket_seed_crew_done_today_2',
      'ticket_seed_crew_routed_3',
      'ticket_seed_inprogress_1',
      'ticket_seed_routed_1',
    ]);
    for (const t of body.tickets) {
      expect(t.categoryId).toBe('cat_streetlight');
    }
  });

  test('GET ?limit=2 → 2 tickets + non-null nextCursor', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(`${BASE}/api/v1/admin/tickets?limit=2`, {
      failOnStatusCode: false,
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tickets: unknown[];
      nextCursor: string | null;
    };
    expect(body.tickets.length).toBe(2);
    expect(body.nextCursor).not.toBeNull();
  });

  test('GET ?status=garbage → 400 invalid_input', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?status=garbage`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('invalid_input');
  });

  test('GET detail with no session → 401', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets/ticket_seed_routed_1`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('unauthenticated');
  });

  test('GET detail with citizen session → 403', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'citizen');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets/ticket_seed_routed_1`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(403);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('forbidden_role');
  });

  test('GET detail with admin session → 200 + full payload', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets/ticket_seed_routed_1`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      ticket: {
        id: string;
        status: string;
        assignedCrewId: string | null;
        internalNote: string | null;
        trail: Array<{ actorLabel: string; toStatus: string }>;
      };
    };
    expect(body.ticket.id).toBe('ticket_seed_routed_1');
    expect(body.ticket.status).toBe('routed');
    // Admin sees the full record (internalNote, assignedCrewId).
    expect(body.ticket.assignedCrewId).not.toBeNull();
    expect(body.ticket.internalNote).toContain('Crew dispatched');
    // Trail rows surface the actor as `actorLabel`. The serializer's
    // contract is to anonymize ONLY for citizens; for a staff viewer
    // it is the actor's NAME where one is known, falling back to the
    // raw user id — `entry.actorName ?? entry.actorId`
    // (lib/serializers/ticket.ts). So the label is a person, not an
    // id: an earlier version of this spec asserted `/^user_/`,
    // which contradicted the name-first contract the admin trail
    // panel renders.
    expect(body.ticket.trail.length).toBeGreaterThan(0);
    for (const entry of body.ticket.trail) {
      expect(entry.actorLabel).not.toBe('');
      expect(entry.actorLabel).toMatch(/^(user_|Rahim|Habib|Anwar|Rashid|Karim)/);
    }
  });

  test('GET detail unknown id → 404', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets/tkt_does_not_exist`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(404);
  });

  test('GET ?wardId=<bogus> → 400 invalid_ward', async () => {
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    const res = await ctx.get(
      `${BASE}/api/v1/admin/tickets?wardId=ward_bogus`,
      { failOnStatusCode: false },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe('invalid_ward');
  });

  test('admin list page renders + visual baseline (1440x900)', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    await applyApiCookiesToPage(ctx, page);
    // Pass a 30-day from= in the URL so all 5 seed tickets fit
    // (the seed data is at -1d, -2d, -4d, -10d, -20d; the default
    // 7-day window hides the older two).
    const from = thirtyDayWindowStart();
    await page.goto(
      `${BASE}/admin/tickets?from=${encodeURIComponent(from)}`,
      { waitUntil: 'networkidle' },
    );
    // The page should render the table with at least one row.
    await expect(page.locator('[data-testid="admin-tickets-table"]')).toBeVisible(
      { timeout: 5_000 },
    );
    // The first seed ticket id should appear in the table. The
    // table truncates ids to 14 chars + ellipsis (e.g.
    // `ticket_seed_s…`), so we use a row-level locator to confirm
    // at least one row exists.
    await expect(
      page.locator('[data-testid="admin-tickets-row"]').first(),
    ).toBeVisible();
    // The "Load more" button should NOT be visible (5 rows < limit 50).
    await expect(
      page.locator('[data-testid="admin-tickets-load-more"]'),
    ).toHaveCount(0);
    await expect(page).toHaveScreenshot(
      'admin-tickets-1440x900.png',
      { maxDiffPixelRatio: 0.005 },
    );
  });

  test('admin detail page renders + visual baseline (1440x900)', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await forceLightTheme(page);
    const ctx = await pwRequest.newContext();
    await devLogin(ctx, 'admin');
    await applyApiCookiesToPage(ctx, page);
    await page.goto(
      `${BASE}/admin/tickets/ticket_seed_routed_1`,
      { waitUntil: 'networkidle' },
    );
    // The main meta block + the trail should be visible.
    await expect(
      page.locator('[data-testid="admin-tickets-meta"]'),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.locator('[data-testid="admin-tickets-trail"]'),
    ).toBeVisible();
    // The sidebar should show a transition button (routed has
    // "in_progress" and "cancelled" edges in TRANSITIONS_BY_FROM).
    await expect(
      page.locator('[data-testid="admin-tickets-transition-in_progress"]'),
    ).toBeVisible();
    // And the reassign input + button.
    await expect(
      page.locator('[data-testid="admin-tickets-reassign-input"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="admin-tickets-reassign-cta"]'),
    ).toBeVisible();
    await expect(page).toHaveScreenshot(
      'admin-tickets-detail-1440x900.png',
      { maxDiffPixelRatio: 0.005 },
    );
  });
});
