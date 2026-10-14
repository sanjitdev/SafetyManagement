/**
 * Playwright route spec for Bolt 007-001 — Citizen Photo & Trail
 * (tests/20-citizen-photo-and-trail-light.spec.ts).
 *
 * Bolt 007-001 (Intent 007 — Citizen Resolution Visibility).
 *
 * Closes two citizen-side gaps in the end-to-end loop:
 *   1. The report-detail page now renders two photo groups:
 *      - Before (citizen-uploaded evidence, with per-photo delete)
 *      - After (crew-uploaded "fix" evidence, read-only, hidden if empty)
 *   2. Trail entries whose `note` matches the marker regex
 *      `^[a-z_]+:` (e.g. `after_photo:<url>`) are rewritten to the
 *      localized "After photo added" string for citizens.
 *
 * The live API checks (no visual diff):
 *   - The citizen API exposes `beforePhotoUrls` + `afterPhotoUrls`
 *     + the legacy `photoUrls` union.
 *   - POSTing a ticket with two citizen photo URLs → detail page
 *     groups them under "Before".
 *   - Crew after-photo POST → detail page groups them under "After".
 *   - Citizen trail entry for the after-photo note is rewritten
 *     (no `after_photo:` marker leaks to the citizen).
 *   - Dispatcher cookie still sees the raw `after_photo:` note
 *     (the filter is citizen-only).
 *
 * Captures two visual baselines (English-light) at the end of the
 * spec:
 *   - citizen-report-detail-after-photo-1280x800.png
 *   - citizen-report-detail-after-photo-390x844.png
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
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

async function devReset(ctx: APIRequestContext) {
  return ctx.post(`${BASE}/api/dev/reset`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
}

/** Seed a ticket owned by the current citizen and return its id. */
async function seedOwnedTicket(
  ctx: APIRequestContext,
  photoUrls: string[] = [],
): Promise<string> {
  const resp = await ctx.post(`${BASE}/api/tickets`, {
    data: {
      cityId: CITY_ID,
      wardId: WARD_ID,
      categoryId: 'cat_streetlight',
      note: 'Light out near pole #14B',
      locationLat: 23.789,
      locationLng: 90.4075,
      locationLabel: 'Mirpur 14',
      locationLabelBn: 'মিরপুর ১৪',
      photoUrls,
    },
  });
  expect(resp.status(), `expected 201, got ${resp.status()}`).toBe(201);
  const body = (await resp.json()) as { ticket: { id: string } };
  return body.ticket.id;
}

/**
 * Create a streetlight ticket owned by the citizen, route it to the
 * streetlight crew, transition to in_progress, and return the id.
 * The crew scope check requires the ticket's department to match
 * the crew's department (streetlight), so we use a streetlight
 * ticket instead of one of the seed tickets (the seed
 * `ticket_seed_inprogress_1` is a pothole → dept_roads).
 *
 * Transitions are driven as `admin` because the dispatcher's
 * `requireScope(..., null)` call (departmentId arg) trips on the
 * `dept_streetlight` mismatch when the ticket is freshly created
 * with no department on the assignment path. The admin role
 * bypasses `requireScope` entirely.
 *
 * The `assignedCrewId` lives on the same transition route — a pure
 * reassign without a status change is admin-only; the combined
 * {toStatus, assignedCrewId} call (used here) is open to any
 * role-allowed write.
 */
async function seedStreetlightTicketForCrew(
  ctx: APIRequestContext,
): Promise<string> {
  // Reset first so we know the starting state.
  await devReset(ctx);
  // Citizen files the ticket.
  await devLogin(ctx, 'citizen');
  const ticketId = await seedOwnedTicket(ctx);
  // Admin drives the routing + assignment + transition. Admin
  // bypasses the dispatcher's `requireScope` department check.
  await devLogin(ctx, 'admin');
  const routeResp = await ctx.post(
    `${BASE}/api/tickets/${ticketId}/transition`,
    {
      data: {
        toStatus: 'routed',
        assignedCrewId: 'user_crew_rashid',
      },
    },
  );
  expect(routeResp.status(), `routed: ${routeResp.status()}`).toBe(200);
  const inProgressResp = await ctx.post(
    `${BASE}/api/tickets/${ticketId}/transition`,
    { data: { toStatus: 'in_progress' } },
  );
  expect(inProgressResp.status(), `in_progress: ${inProgressResp.status()}`).toBe(200);
  return ticketId;
}

async function forceLightThemeEnglish(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', 'light');
      window.localStorage.setItem('cityfix.preferred_language.v1', 'en');
    } catch {}
  });
  await page.emulateMedia({ colorScheme: 'light' });
}

// --- API-level checks ----------------------------------------------------

test('GET /api/tickets/[id] exposes before/after + legacy union for citizens', async () => {
  const ctx = await pwRequest.newContext();
  try {
    await devReset(ctx);
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const ticketId = await seedOwnedTicket(ctx, [
      'https://example.com/citizen-photo-1.png',
      'https://example.com/citizen-photo-2.png',
    ]);

    const resp = await ctx.get(`${BASE}/api/tickets/${ticketId}`);
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticket: {
        id: string;
        photoUrls: string[];
        beforePhotoUrls: string[];
        afterPhotoUrls: string[];
      };
    };
    expect(body.ticket.beforePhotoUrls).toEqual([
      'https://example.com/citizen-photo-1.png',
      'https://example.com/citizen-photo-2.png',
    ]);
    expect(body.ticket.afterPhotoUrls).toEqual([]);
    // The legacy `photoUrls` union keeps working so older UI surfaces
    // that haven't migrated still get a flat list.
    expect(body.ticket.photoUrls).toEqual([
      'https://example.com/citizen-photo-1.png',
      'https://example.com/citizen-photo-2.png',
    ]);
  } finally {
    await ctx.dispose();
  }
});

test('crew after-photo POST moves the citizen-side response into afterPhotoUrls', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await seedStreetlightTicketForCrew(ctx);

    await devLogin(ctx, 'crew');
    const afterUrl = 'https://example.com/crew-after-photo-1.jpg';
    const resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/photos`,
      {
        data: { url: afterUrl },
      },
    );
    expect(resp.status(), `expected 200, got ${resp.status()}`).toBe(200);

    // Now re-fetch as the citizen who owns the ticket.
    await devLogin(ctx, 'citizen');
    const citizenResp = await ctx.get(`${BASE}/api/tickets/${ticketId}`);
    expect(citizenResp.status(), `expected 200, got ${citizenResp.status()}`).toBe(200);
    const body = (await citizenResp.json()) as {
      ticket: {
        beforePhotoUrls: string[];
        afterPhotoUrls: string[];
      };
    };
    expect(body.ticket.afterPhotoUrls).toContain(afterUrl);
  } finally {
    await ctx.dispose();
  }
});

test('citizen trail entry for after-photo note is rewritten (no marker leak)', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await seedStreetlightTicketForCrew(ctx);

    await devLogin(ctx, 'crew');
    const afterUrl = 'https://example.com/crew-trail-rewrite-photo.jpg';
    const resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/photos`,
      {
        data: { url: afterUrl },
      },
    );
    expect(resp.status()).toBe(200);

    // Re-fetch as the citizen.
    await devLogin(ctx, 'citizen');
    const citizenResp = await ctx.get(`${BASE}/api/tickets/${ticketId}`);
    expect(citizenResp.status()).toBe(200);
    const body = (await citizenResp.json()) as {
      ticket: {
        trail: Array<{ toStatus: string; note: string | null; actorLabel: string }>;
      };
    };
    // The whole trail as surfaced to the citizen contains no
    // `after_photo:` prefix anywhere.
    for (const entry of body.ticket.trail) {
      if (entry.note != null) {
        expect(entry.note.startsWith('after_photo:')).toBe(false);
      }
    }
  } finally {
    await ctx.dispose();
  }
});

test('dispatcher cookie still sees the raw after_photo: marker note', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const ticketId = await seedStreetlightTicketForCrew(ctx);

    // Seed a crew after-photo first so the marker note exists.
    await devLogin(ctx, 'crew');
    const afterUrl = 'https://example.com/crew-raw-marker-photo.jpg';
    const resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/photos`,
      {
        data: { url: afterUrl },
      },
    );
    expect(resp.status()).toBe(200);

    // Re-fetch as the dispatcher (uses the dispatcher branch of the
    // serializer — the trail filter is citizen-only).
    await devLogin(ctx, 'dispatcher');
    const dispatcherResp = await ctx.get(`${BASE}/api/tickets/${ticketId}`);
    expect(dispatcherResp.status()).toBe(200);
    const body = (await dispatcherResp.json()) as {
      ticket: {
        trail: Array<{ toStatus: string; note: string | null }>;
        beforePhotoUrls: string[];
        afterPhotoUrls: string[];
      };
    };
    // Dispatcher sees the raw marker note + the actor id on each
    // trail entry. The filter must be a no-op for non-citizens.
    const markerEntry = body.ticket.trail.find(
      (entry) =>
        entry.note != null && entry.note.startsWith('after_photo:'),
    );
    expect(
      markerEntry?.note,
      'dispatcher must still see the raw after_photo: marker',
    ).toBe(`after_photo:${afterUrl}`);
    expect(body.ticket.afterPhotoUrls).toContain(afterUrl);
  } finally {
    await ctx.dispose();
  }
});

// --- Visual baselines ----------------------------------------------------

test('citizen-report-detail-after-photo-1280x800 matches light baseline', async ({ page }) => {
  // Desktop baseline: full-bleed two-column layout with both
  // Before and After photo groups visible.
  await page.setViewportSize({ width: 1280, height: 800 });
  await forceLightThemeEnglish(page);
  const ctx = page.context();
  const reqCtx = await pwRequest.newContext({ baseURL: BASE });
  try {
    const ticketId = await seedStreetlightTicketForCrew(reqCtx);
    // Attach an after-photo.
    await devLogin(reqCtx, 'crew');
    const crewResp = await reqCtx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/photos`,
      {
        data: { url: 'https://example.com/visual-after.png' },
      },
    );
    expect(crewResp.status(), `after-photo: ${crewResp.status()}`).toBe(200);

    // Re-login as citizen in the page's browser context.
    await ctx.request.post(`${BASE}/api/dev/login?role=citizen`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const resp = await page.goto(
      `${BASE}/reports/${ticketId}`,
      { waitUntil: 'networkidle' },
    );
    expect(resp, 'expected response for /reports/[id]').not.toBeNull();
    expect(resp!.status(), `expected 200, got ${resp!.status()}`).toBe(200);
    await page.waitForSelector('h1', { timeout: 10_000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot(
      'citizen-report-detail-after-photo-1280x800.png',
      { fullPage: true },
    );
  } finally {
    await reqCtx.dispose();
  }
});

test('citizen-report-detail-after-photo-390x844 matches light baseline', async ({ page }) => {
  // Mobile baseline: single-column layout (the 1024px breakpoint
  // collapses the two-column grid).
  await page.setViewportSize({ width: 390, height: 844 });
  await forceLightThemeEnglish(page);
  const ctx = page.context();
  const reqCtx = await pwRequest.newContext({ baseURL: BASE });
  try {
    const ticketId = await seedStreetlightTicketForCrew(reqCtx);
    await devLogin(reqCtx, 'crew');
    const crewResp = await reqCtx.post(
      `${BASE}/api/v1/crew/tickets/${ticketId}/photos`,
      {
        data: { url: 'https://example.com/visual-after-mobile.png' },
      },
    );
    expect(crewResp.status(), `after-photo: ${crewResp.status()}`).toBe(200);

    await ctx.request.post(`${BASE}/api/dev/login?role=citizen`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    const resp = await page.goto(
      `${BASE}/reports/${ticketId}`,
      { waitUntil: 'networkidle' },
    );
    expect(resp, 'expected response for /reports/[id]').not.toBeNull();
    expect(resp!.status(), `expected 200, got ${resp!.status()}`).toBe(200);
    await page.waitForSelector('h1', { timeout: 10_000 });
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot(
      'citizen-report-detail-after-photo-390x844.png',
      { fullPage: true },
    );
  } finally {
    await reqCtx.dispose();
  }
});
