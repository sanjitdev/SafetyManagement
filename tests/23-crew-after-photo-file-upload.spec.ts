/**
 * Playwright route spec for the crew after-photo file upload
 * (tests/23-crew-after-photo-file-upload.spec.ts).
 *
 * Bolt 008-003 (Intent 008 — UX polish from slow-motion demo):
 * the crew's "Capture after photo" flow now accepts a real
 * file via `<input type="file">`. The URL input remains
 * available as a `<details>` power-user override.
 *
 * Coverage:
 *   - API: POST a `data:image/png;base64,…` URL the same
 *     way the page does (the route contract is unchanged —
 *     `{ url: string }` JSON; the file is read by the client
 *     via FileReader).
 *   - API: the route still accepts a plain http(s) URL.
 *   - API: an invalid URL → 400 invalid_input.
 *   - UI: the file picker is the primary input
 *     (data-testid="crew-photo-file"); the URL input is
 *     inside a `<details>` disclosure.
 *   - UI: `setInputFiles(...)` on a fixture file + click
 *     submit → the photo appears in the after group + the
 *     citizen's my-reports view sees it on a re-login.
 *   - UI: file picker rejects an unsupported MIME
 *     (`.txt` file) with the `crew.photo.error.invalid_file`
 *     copy.
 *   - UI: URL override: open the disclosure, type a URL,
 *     submit → after-photo appears.
 *   - Visual baseline: `crew-after-photo-uploader-390x844.png`
 *     captures the page with the file picker (the v1 surface)
 *     visible in English, light theme.
 *
 * The visual baseline is the only one — the bolt is a UX
 * change, not a redesign; one screenshot is enough to anchor
 * the chrome.
 */

import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 390, height: 844 };
const CREW_USER_ID = 'user_crew_rashid';
const ROUTED_TICKET_ID = 'ticket_seed_routed_1';
// Tiny 1×1 PNG (transparent), base64-encoded. The route
// accepts any URL that passes `z.string().url()`, so a
// `data:` URL is the simplest portable payload.
const ONE_BY_ONE_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

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

test.beforeEach(async () => {
  const resetCtx = await pwRequest.newContext();
  try {
    const resp = await resetCtx.post(`${BASE}/api/dev/reset`);
    expect(resp.status()).toBe(200);
  } finally {
    await resetCtx.dispose();
  }
});

// --- API-level checks ----------------------------------------------------

test('API: POST after-photo with a data: URL (file branch) → 200, trail entry written', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ROUTED_TICKET_ID}/photos`,
      { data: { url: ONE_BY_ONE_PNG_DATA_URL } },
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticket: {
        id: string;
        afterPhotoUrls: string[];
        photoUrls: string[];
        trail: Array<{ toStatus: string; note: string | null }>;
      };
    };
    expect(body.ticket.afterPhotoUrls).toContain(ONE_BY_ONE_PNG_DATA_URL);
    expect(body.ticket.photoUrls).toContain(ONE_BY_ONE_PNG_DATA_URL);
    const newTrail = body.ticket.trail.find(
      (e) => e.note === `after_photo:${ONE_BY_ONE_PNG_DATA_URL}`,
    );
    expect(newTrail).toBeDefined();
  } finally {
    await ctx.dispose();
  }
});

test('API: POST after-photo with an http(s) URL → 200', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const url = 'https://example.com/after-photo.jpg';
    const resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ROUTED_TICKET_ID}/photos`,
      { data: { url } },
    );
    expect(resp.status()).toBe(200);
    const body = (await resp.json()) as {
      ticket: { afterPhotoUrls: string[] };
    };
    expect(body.ticket.afterPhotoUrls).toContain(url);
  } finally {
    await ctx.dispose();
  }
});

test('API: POST after-photo with an invalid URL → 400', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.post(
      `${BASE}/api/v1/crew/tickets/${ROUTED_TICKET_ID}/photos`,
      { data: { url: 'not a url' } },
    );
    expect(resp.status()).toBe(400);
  } finally {
    await ctx.dispose();
  }
});

// --- UI flow -------------------------------------------------------------

test('UI: file picker is the v1 surface; URL is behind a <details> override', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'crew');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/crew/tickets/${encodeURIComponent(ROUTED_TICKET_ID)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="crew-ticket-page"]', { timeout: 10_000 });

  // The file picker is visible by default.
  const fileInput = page.locator('[data-testid="crew-photo-file"]');
  await expect(fileInput).toBeVisible();

  // The URL override is collapsed by default — the input is
  // inside a <details> element so it's not visible until
  // expanded.
  const urlDetails = page.locator('[data-testid="crew-photo-url-details"]');
  await expect(urlDetails).toBeAttached();
  const urlInput = page.locator('[data-testid="crew-photo-url"]');
  await expect(urlInput).toBeHidden();

  // Open the disclosure.
  await urlDetails.locator('summary').click();
  await expect(urlInput).toBeVisible();
});

test('UI: setInputFiles + Submit uploads a fixture file → after-photo appears', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'crew');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/crew/tickets/${encodeURIComponent(ROUTED_TICKET_ID)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="crew-ticket-page"]', { timeout: 10_000 });

  // Use a real fixture file on disk. tests/fixtures/after-photo.png
  // is a 1×1 transparent PNG (committed alongside the spec for
  // determinism).
  const fixturePath = path.resolve(__dirname, 'fixtures/after-photo.png');
  await page.locator('[data-testid="crew-photo-file"]').setInputFiles(fixturePath);

  // The submit button is now enabled.
  const submit = page.locator('[data-testid="crew-photo-submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();

  // Wait for the after-photo group to appear with at least one
  // child image. The data URL is rendered as an <img> inside
  // the after group.
  const afterGroup = page.locator('[data-testid="crew-photo-after-group"]');
  await expect(afterGroup).toBeVisible({ timeout: 10_000 });
  await expect(afterGroup.locator('img')).toHaveCount(1);
});

test('UI: file picker rejects an unsupported MIME (text file) with the invalid_file copy', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'crew');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/crew/tickets/${encodeURIComponent(ROUTED_TICKET_ID)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="crew-ticket-page"]', { timeout: 10_000 });

  // Use a text-file fixture so the MIME is `text/plain`, not on
  // the allow-list. The client-side validator should reject it
  // before any network call happens.
  const fixturePath = path.resolve(__dirname, 'fixtures/not-an-image.txt');
  await page.locator('[data-testid="crew-photo-file"]').setInputFiles(fixturePath);
  await page.locator('[data-testid="crew-photo-submit"]').click();

  // The error message is rendered as a `<p role="alert">` next to
  // the file picker. (Note: Next.js also injects a route-announcer
  // `<div role="alert">` at the page level, so we must scope to
  // the page's own alert, not `getByRole('alert')`.) The i18n
  // key is `crew.photo.error.invalid_file`. The English copy is
  // "Choose a JPEG / PNG / WebP image up to 5 MB".
  const errorMsg = page.locator('p[role="alert"]');
  await expect(errorMsg).toBeVisible({ timeout: 5_000 });
  await expect(errorMsg).toContainText(/JPEG|PNG|WebP/i);
});

test('UI: URL override + Submit uploads a URL → after-photo appears', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'crew');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/crew/tickets/${encodeURIComponent(ROUTED_TICKET_ID)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="crew-ticket-page"]', { timeout: 10_000 });

  // Open the URL override disclosure.
  const urlDetails = page.locator('[data-testid="crew-photo-url-details"]');
  await urlDetails.locator('summary').click();

  // Type a URL into the override input.
  const url = 'https://example.com/url-override-test.png';
  await page.locator('[data-testid="crew-photo-url"]').fill(url);

  // Submit.
  await page.locator('[data-testid="crew-photo-submit"]').click();

  // After-photo group appears with the URL.
  const afterGroup = page.locator('[data-testid="crew-photo-after-group"]');
  await expect(afterGroup).toBeVisible({ timeout: 10_000 });
  const link = afterGroup.locator(`a[href="${url}"]`);
  await expect(link).toHaveCount(1);
});

// --- Citizen-side visibility check ---------------------------------------

test('UI: after a file upload, the citizen sees the after-photo on their report view', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  // Step 1: crew uploads the fixture file via the API directly
  // (the UI flow is covered above; here we want to assert the
  // citizen sees the photo, not re-test the upload UI).
  {
    const crewCtx = await pwRequest.newContext();
    try {
      const login = await devLogin(crewCtx, 'crew');
      expect(login.status()).toBe(303);
      const fixturePath = path.resolve(__dirname, 'fixtures/after-photo.png');
      // Use the same data-URL form the page would post so the
      // server writes the same row the file branch would.
      const resp = await crewCtx.post(
        `${BASE}/api/v1/crew/tickets/${ROUTED_TICKET_ID}/photos`,
        { data: { url: ONE_BY_ONE_PNG_DATA_URL } },
      );
      expect(resp.status()).toBe(200);
      // Confirm the file is on disk (sanity check that the
      // fixture exists; useful when running in CI).
      expect(require('node:fs').existsSync(fixturePath)).toBe(true);
    } finally {
      await crewCtx.dispose();
    }
  }

  // Step 2: re-login as the citizen and open the report. The
  // canonical citizen-side URL is `/reports/[id]` (see
  // app/reports/[id]/page.tsx) — the route is intentionally
  // not nested under `/citizen/` so the report link is shareable.
  const cLogin = await devLogin(ctx.request, 'citizen');
  expect(cLogin.status()).toBe(303);

  const cResp = await page.goto(
    `${BASE}/reports/${encodeURIComponent(ROUTED_TICKET_ID)}`,
    { waitUntil: 'networkidle' },
  );
  expect(cResp).not.toBeNull();
  expect(cResp!.status()).toBe(200);
  // The citizen report page has no data-testids; the canonical
  // wait target is the `<h1>` rendered with the ticket title
  // (see tests/20-citizen-photo-and-trail-light.spec.ts).
  await page.waitForSelector('h1', { timeout: 10_000 });
  // The citizen report page renders after-photos as
  // `role="img"` <div>s with a CSS `background-image`, not
  // `<img>` tags (see app/reports/[id]/page.tsx around
  // line 508). The div is the photo tile; the data URL is
  // baked into `background: url(${url})` so no separate
  // image load is needed. We wait for that role="img"
  // div to appear in the photo grid; the page hydrates
  // the JSON state and mounts the div in a tick after the
  // heading renders.
  await expect
    .poll(
      async () => page.locator('[role="img"]').count(),
      {
        timeout: 20_000,
        message: 'expected role="img" tile on the citizen report page',
        intervals: [100, 250, 500],
      },
    )
    .toBeGreaterThan(0);
});

// --- Visual baseline -----------------------------------------------------

test('crew-after-photo-uploader-390x844 matches light baseline', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await forceLightTheme(page);
  const ctx = page.context();

  const login = await devLogin(ctx.request, 'crew');
  expect(login.status()).toBe(303);

  const resp = await page.goto(
    `${BASE}/crew/tickets/${encodeURIComponent(ROUTED_TICKET_ID)}`,
    { waitUntil: 'networkidle' },
  );
  expect(resp).not.toBeNull();
  expect(resp!.status()).toBe(200);
  await page.waitForSelector('[data-testid="crew-ticket-page"]', { timeout: 10_000 });
  // Wait for the photos section to render with its file picker
  // visible (it's at the bottom of the page; full-page
  // screenshots scroll).
  await expect(
    page.locator('[data-testid="crew-photo-file"]'),
  ).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveScreenshot(
    'crew-after-photo-uploader-390x844.png',
    { fullPage: true },
  );
});
