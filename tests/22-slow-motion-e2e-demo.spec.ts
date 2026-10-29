/**
 * Slow-motion headed Playwright E2E demo (tests/22-slow-motion-e2e-demo.spec.ts).
 *
 * Walks the full CityFix happy path the way a human would — citizen
 * submits → dispatcher assigns crew (Bolt 007-002) + routes → crew
 * progresses + uploads after-photo + resolves → citizen re-views and
 * sees the resolved trail with the after-photo (Intent 007 visibility).
 *
 * Designed to be RUN HEADED in slow motion so a human reviewer can
 * watch the flow play out. Each meaningful state transition pauses
 * briefly (via the `slowMo: 250` launch option) and captures a
 * full-page screenshot into
 * `tests-mockups/audit/22-slow-motion-e2e-demo.spec.ts/<step>.png` so
 * the run can be reviewed afterwards even if the reviewer missed a
 * frame.
 *
 * Headed mode is opt-in via the per-test `test.use` override below —
 * the test stays headless-compatible (e.g. when run in CI by accident
 * it will still pass assertions, just without the visual demo).
 *
 * Run from a shell with a dev:feat server already running on 3100:
 *   PWTEST_REUSE_EXISTING_SERVER=1 \
 *     BASE_URL=http://localhost:3100 \
 *     npx playwright test \
 *       --config=playwright.config.local.ts \
 *       tests/22-slow-motion-e2e-demo.spec.ts \
 *       --headed
 *
 * Port note: the BASE below defaults to 3000 — the port the default
 * `playwright.config.ts` starts its `webServer` on, and the port every
 * other route spec targets. It used to default to 3100 (the port used by
 * the dedicated `playwright.config.local.ts` rig), so when this spec ran
 * as part of the standard suite it aimed at a server nobody was
 * listening on: every request died with `ECONNREFUSED ::1:3100` and the
 * test failed for a reason that had nothing to do with the app. Same
 * class of defect as the live-audit spec's port-3002 bug (#33).
 *
 * Tweak the pacing on the fly with `DEMO_SLOW_MO_MS`:
 *   DEMO_SLOW_MO_MS=1200  # very deliberate (≈ 6 min total)
 *   DEMO_SLOW_MO_MS=400   # brisk but readable
 *   DEMO_SLOW_MO_MS=100   # near real-time (handy for debugging)
 *
 * The browser launches with `--start-fullscreen --kiosk` so the
 * window maximises against the primary display with no chrome;
 * screenshots are captured at 1920×1080 to match. If the OS
 * kiosk mode is undesirable, remove the two flags in `test.use`.
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
// Pacing: each Playwright action is followed by this many ms of
// pause so a human reviewer can read the screen before the next
// action lands. 800ms is "deliberate demo" — slow enough to talk
// over, fast enough to finish in ~3 minutes. Set the env var
// DEMO_SLOW_MO_MS to override at the shell.
const SLOW_MO_MS = Number(process.env.DEMO_SLOW_MO_MS ?? 800);

const AUDIT_DIR = path.resolve(
  __dirname,
  '..',
  'tests-mockups',
  'audit',
  '22-slow-motion-e2e-demo.spec.ts',
);

test.beforeAll(() => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
});

// Per-test override: open a headed Chromium with `slowMo` so each
// user-visible action lands `SLOW_MO_MS` after the previous one. Run
// with `--headed` (or `PWTEST_HEADLESS=0`) to actually see the
// browser. This MUST be at top-level (not inside a describe) —
// Playwright requires `test.use` to live at the file scope or in
// the playwright.config.ts `projects` block.
//
// `--start-fullscreen` and `--kiosk` are chromium launch flags
// that maximise the window (no window chrome, no address bar) so
// the demo can be projected on a wall without a distracting title
// bar. `--no-default-browser-check` and `--no-first-run` suppress
// the "set as default" prompt that Chromium otherwise shows on the
// first headed launch of a fresh profile.
//
// `viewport: { width: 1920, height: 1080 }` ensures the captured
// screenshots match a 1080p canvas, which is what the user sees
// when the window is maximised.
test.use({
  launchOptions: {
    headless: false,
    slowMo: SLOW_MO_MS,
    args: [
      '--start-fullscreen',
      '--kiosk',
      '--no-default-browser-check',
      '--no-first-run',
    ],
  },
  viewport: { width: 1920, height: 1080 },
});

/** 1×1 PNG — used to seed the citizen's photo step (matches the
 * tiny "hole.png" fixture used by 04-e2e-human-tester.spec.ts). */
const TINY_PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Zo8DwoAAAAASUVORK5CYII=',
  'base64',
);

/** Hit a dev-only endpoint with the same retry-on-compile cadence as
 * the 04- spec. The dev route handlers race the cold Next.js dev
 * compiler on first request, so we tolerate transient 5xx with a
 * Next.js overlay body and back off exponentially. */
async function devFetch(
  request: APIRequestContext,
  urlPath: string,
  init: { method?: string; maxRedirects?: number; failOnStatusCode?: boolean; data?: unknown } = {},
): Promise<import('@playwright/test').APIResponse> {
  const expected = init.maxRedirects === 0 ? [200, 303, 201, 204] : [200, 303];
  const MAX_ATTEMPTS = 5;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const res = await request.fetch(`${BASE}${urlPath}`, {
      method: init.method ?? 'POST',
      maxRedirects: init.maxRedirects ?? 0,
      failOnStatusCode: init.failOnStatusCode ?? false,
      data: init.data,
      headers: init.data
        ? { 'content-type': 'application/json' }
        : undefined,
    });
    if (expected.includes(res.status())) return res;
    const body = await res.text().catch(() => '<no body>');
    const looksLikeNextErrorOverlay =
      body.startsWith('<!DOCTYPE html>') &&
      (body.includes('Server Error') ||
        body.includes('Jest worker') ||
        body.includes('Module not found') ||
        body.includes('Application error'));
    const shouldRetry =
      looksLikeNextErrorOverlay ||
      res.status() === 404 ||
      (res.status() >= 500 && res.status() < 600 && !body.startsWith('{'));
    if (!shouldRetry) {
      throw new Error(
        `${init.method ?? 'POST'} ${urlPath} returned ${res.status()}. Body: ${body.slice(0, 200)}`,
      );
    }
    if (attempt === MAX_ATTEMPTS - 1) {
      throw new Error(
        `${init.method ?? 'POST'} ${urlPath} returned ${res.status()} after ${MAX_ATTEMPTS} attempts. Body: ${body.slice(0, 200)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
  }
  throw new Error('unreachable');
}

/** Mint a persona session via the dev-only endpoint. The cookie lands
 * in the BrowserContext's jar (because we use `page.request`), so
 * subsequent `page.goto` calls see the session. */
async function devLogin(
  request: APIRequestContext,
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin',
): Promise<void> {
  await devFetch(request, `/api/dev/login?role=${role}`);
}

/** Wipe the in-memory dev store so the demo always starts from a
 * clean slate (no leftover tickets or sessions). */
async function devReset(request: APIRequestContext): Promise<void> {
  await devFetch(request, '/api/dev/reset');
}

/** Full-size viewport + mirror client-side errors into the test log
 * so dev compile races don't disappear silently. The `viewport` in
 * the top-level `test.use` already sets a 1920x1080 default; this
 * function re-asserts the size in case the kiosk launch args
 * were overridden by the user at the shell. */
async function preparePage(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1920, height: 1080 });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      // eslint-disable-next-line no-console
      console.log(`  [browser:${msg.type()}] ${msg.text().slice(0, 240)}`);
    }
  });
  page.on('pageerror', (err) => {
    // eslint-disable-next-line no-console
    console.log(`  [pageerror] ${err.message.slice(0, 240)}`);
  });
}

/** Wait for the boot loading spinners to settle, then capture a
 * full-page screenshot to the audit dir. */
async function capture(page: Page, stepName: string): Promise<void> {
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('লোড হচ্ছে'),
      { timeout: 10_000 },
    )
    .catch(() => undefined);
  // A short settle for tailwind animations / focus rings to paint.
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(AUDIT_DIR, `${stepName}.png`),
    fullPage: true,
  });
  // eslint-disable-next-line no-console
  console.log(`  [captured] ${stepName}`);
}

/** Walk the citizen submit flow up to the confirmation page and
 * return the newly created ticket id. Mirrors `submitReport` from
 * 04-e2e-human-tester.spec.ts (the team's reuse-by-copy policy —
 * helpers are NOT factored to a shared module). */
async function citizenSubmitReport(
  page: Page,
  note: string,
): Promise<string> {
  await preparePage(page);
  await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 15_000 });
  await page
    .waitForFunction(
      () =>
        document.body.innerText.includes('শহরে কোনো রিপোর্ট নেই') ||
        document.body.innerText.includes('শহরের কার্যকলাপ') ||
        document.querySelectorAll('aside button[role]').length > 0,
      { timeout: 20_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(800);
  await capture(page, '01-citizen-home');

  // Click the top-bar Report CTA. The button text is the i18n key
  // `home.empty.cta` → Bangla "রিপোর্ট করুন" / English "Report".
  const reportCta = page
    .getByRole('button', { name: /রিপোর্ট করুন|Report|New report|নতুন রিপোর্ট/i })
    .first();
  await reportCta.waitFor({ state: 'visible', timeout: 15_000 });
  await reportCta.click();
  await page.waitForURL(/\/report\/location/, {
    timeout: 30_000,
    waitUntil: 'commit',
  });
  await page.waitForSelector('h1', { timeout: 30_000 });
  await capture(page, '02-citizen-report-location');

  // Continue to the category step. (v1.1: location now routes
  // directly to category, not photo — category-before-photo lets
  // the photo cap narrow to the category's rule.)
  await page
    .getByRole('button', { name: /পরবর্তী|Continue/i })
    .first()
    .click();
  await page.waitForURL(/\/report\/category/, {
    waitUntil: 'commit',
    timeout: 30_000,
  });
  await page.waitForSelector('h1', { timeout: 30_000 });
  await capture(page, '03-citizen-report-category');

  // Pick the Streetlight category. (v1.1 redesign: the options
  // are rendered as `role="radio"` inside a `role="radiogroup"`,
  // not as buttons — getByRole('button') would not match.)
  const streetlightOption = page.getByRole('radio', {
    name: /রাস্তার আলো|Broken streetlight|Streetlight/i,
  }).first();
  await streetlightOption.click();
  await capture(page, '04-citizen-report-category-selected');

  await page
    .getByRole('button', { name: /পরবর্তী|Continue/i })
    .first()
    .click();
  await page.waitForURL(/\/report\/photo/, {
    waitUntil: 'commit',
    timeout: 30_000,
  });
  await page.waitForSelector('h1', { timeout: 30_000 });
  await capture(page, '05-citizen-report-photo-empty');

  // Upload a 1×1 PNG via the hidden file input.
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'hole.png',
      mimeType: 'image/png',
      buffer: TINY_PNG_BUFFER,
    });
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        'button[aria-label*="সরান"], button[aria-label*="Remove"]',
      ).length > 0,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(300);
  await capture(page, '06-citizen-report-photo-with-image');

  await page
    .getByRole('button', { name: /পরবর্তী|Continue/i })
    .first()
    .click();
  await page.waitForURL(/\/report\/note/, {
    waitUntil: 'commit',
    timeout: 30_000,
  });
  await page.waitForSelector('textarea', { timeout: 30_000 });
  await page.locator('textarea').first().fill(note);
  await capture(page, '07-citizen-report-note');

  // Submit and capture the new ticket id from the URL.
  const submitPromise = page.waitForURL(/\/report\/[^/]+\/submitted/, {
    waitUntil: 'commit',
    timeout: 30_000,
  });
  await page
    .getByRole('button', { name: /পর্যালোচনা|Review|Submit/i })
    .first()
    .click();
  await submitPromise;
  await page.waitForSelector('h1', { timeout: 30_000 });
  await capture(page, '08-citizen-report-submitted');

  const match = page.url().match(/\/report\/([^/]+)\/submitted/);
  if (!match) throw new Error(`failed to extract ticket id from ${page.url()}`);
  return match[1];
}

test.describe('Slow-motion E2E demo (citizen → dispatcher → crew → citizen)', () => {
  test('full happy path with crew (Bolt 007-002) + after-photo + citizen resolves', async ({
    page,
  }) => {
    // ~50 actions at the configured SLOW_MO_MS plus dev compile
    // time on each first-route POST. 8 minutes is the ceiling
    // even if the operator ramps slowMo to 1500ms.
    test.setTimeout(8 * 60_000);

    const req = page.request;

    // Start from a clean store so the citizen's my-reports at the end
    // reflects only the ticket this demo creates.
    await devReset(req);
    await devLogin(req, 'citizen');

    // ── 1. CITIZEN SUBMITS ───────────────────────────────────────
    const ticketId = await citizenSubmitReport(
      page,
      'Streetlight out on road 7 — 3 nights running.',
    );
    // eslint-disable-next-line no-console
    console.log(`\n  [demo] citizen submitted ticket ${ticketId}\n`);

    // ── 2. DISPATCHER REVIEWS + ASSIGNS CREW + ROUTES ────────────
    await devLogin(req, 'dispatcher');
    await page.goto(`${BASE}/dispatcher/tickets/${ticketId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-testid="dispatcher-ticket-detail"]', {
      timeout: 30_000,
    });
    await page
      .waitForFunction(
        () => !document.body.innerText.includes('লোড হচ্ছে'),
        { timeout: 10_000 },
      )
      .catch(() => undefined);
    await capture(page, '09-dispatcher-ticket-detail');

    // Wait for the crew picker to populate (Bolt 007-002). The fetch
    // is async after the page commits; we anchor on the
    // `user_crew_rashid` option being attached.
    await page
      .locator('[data-testid="dispatcher-assign-crew"]')
      .waitFor({ state: 'visible', timeout: 15_000 });
    await expect(
      page.locator('[data-testid="dispatcher-assign-crew"] option[value="user_crew_rashid"]'),
    ).toBeAttached({ timeout: 5_000 });
    await capture(page, '10-dispatcher-picker-populated');

    // Pick Rashid and save.
    await page
      .locator('[data-testid="dispatcher-assign-crew"]')
      .selectOption('user_crew_rashid');
    await capture(page, '11-dispatcher-picker-rashid-selected');
    await page.locator('[data-testid="dispatcher-assign-save"]').click();
    // The success banner appears once the PATCH/POST commits.
    await expect(
      page.locator('[data-testid="dispatcher-assign-success"]'),
    ).toBeVisible({ timeout: 15_000 });
    await capture(page, '12-dispatcher-assign-saved');

    // Route the ticket. The page POSTs to
    // /api/v1/dispatcher/tickets/[id]/transition then re-renders
    // the ticket detail with status=routed. We anchor on the
    // network response (the dev server's first hit on this route
    // compiles on demand, which can race with `waitForFunction`).
    const [routeResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(
            `/api/v1/dispatcher/tickets/${ticketId}/transition`,
          ) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.locator('[data-testid="dispatcher-transition-routed"]').click(),
    ]);
    expect(routeResponse.status(), 'dispatcher routed status').toBe(200);
    // Brief settle for the re-render to paint the routed pill.
    await page.waitForTimeout(800);
    await capture(page, '13-dispatcher-routed');

    // ── 3. CREW ADVANCES ─────────────────────────────────────────
    await devLogin(req, 'crew');
    await page.goto(`${BASE}/crew/tickets/${ticketId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('[data-testid="crew-ticket-page"]', {
      timeout: 30_000,
    });
    await page
      .waitForFunction(
        () => !document.body.innerText.includes('লোড হচ্ছে'),
        { timeout: 10_000 },
      )
      .catch(() => undefined);
    await capture(page, '14-crew-ticket-routed');

    // Mark in_progress. Anchor on the network response (the dev
    // server compiles the route on the first POST).
    const [inProgressResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(
            `/api/v1/crew/tickets/${ticketId}/transition`,
          ) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.locator('[data-testid="crew-transition-in-progress"]').click(),
    ]);
    expect(inProgressResponse.status(), 'crew in_progress status').toBe(200);
    await page.waitForTimeout(800);
    await capture(page, '15-crew-in-progress');

    // Add an after-photo via the new file picker (Bolt 008-003).
    // The crew photo surface is now `<input type="file">` (the
    // v1 surface), with the URL override collapsed in a
    // `<details>`. We `setInputFiles` with the same 1×1 PNG
    // buffer the citizen side uses, and the page reads it via
    // FileReader, posts the data URL to the API, and the
    // dev store persists it as `photoUrls` (and the after-
    // photo group on the citizen page renders it as a
    // CSS `background-image`).
    await page
      .locator('[data-testid="crew-photo-file"]')
      .setInputFiles({
        name: 'after-light-fixed.png',
        mimeType: 'image/png',
        buffer: TINY_PNG_BUFFER,
      });
    await capture(page, '16-crew-photo-file-selected');
    const [photoResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(
            `/api/v1/crew/tickets/${ticketId}/photos`,
          ) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.locator('[data-testid="crew-photo-submit"]').click(),
    ]);
    expect(photoResponse.status(), 'crew after-photo POST status').toBe(200);
    // After a successful file-picker upload, the form clears its
    // state: the file input is reset and the submit button is
    // disabled again (no source selected). We anchor on the
    // submit button returning to its disabled state so the next
    // capture (17) shows a clean slate.
    await expect(
      page.locator('[data-testid="crew-photo-submit"]'),
    ).toBeDisabled({ timeout: 15_000 });
    await capture(page, '17-crew-photo-uploaded');

    // Fill the resolution note (required for the `resolved`
    // transition) and resolve. Anchor on the network response
    // (the dev server compiles the route on the first POST).
    await page
      .locator('[data-testid="crew-resolution-note"]')
      .fill('Replaced the bulb. Light is back online.');
    await capture(page, '18-crew-resolution-note-typed');
    const [resolvedResponse] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.url().includes(
            `/api/v1/crew/tickets/${ticketId}/transition`,
          ) && r.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      page.locator('[data-testid="crew-transition-resolved"]').click(),
    ]);
    expect(resolvedResponse.status(), 'crew resolved status').toBe(200);
    await page.waitForTimeout(800);
    await capture(page, '19-crew-resolved');

    // ── 4. CITIZEN VERIFIES RESOLUTION (Intent 007 visibility) ──
    await devLogin(req, 'citizen');
    await page.goto(`${BASE}/reports/${ticketId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('h1', { timeout: 30_000 });
    await page.waitForFunction(
      () => {
        const t = document.body.innerText;
        return (
          t.includes('সমাধান') /* Bangla status.resolved */ ||
          t.includes('Resolved')
        );
      },
      { timeout: 15_000 },
    );
    // The after-photo and full trail render in the same view; give
    // the page one frame to commit them.
    await page.waitForTimeout(800);
    await capture(page, '20-citizen-detail-resolved');

    // Sanity-assert: the resolved pill, the after-photo group, and
    // the trail are all on the page. The labels are bilingual
    // (Bangla-first); the regex matches either locale.
    const detailText = await page.locator('body').innerText();
    expect(
      detailText.includes('সমাধান') || detailText.includes('Resolved'),
      'expected resolved status on report detail page',
    ).toBe(true);
    expect(
      // Bolt 008-003: the after-photo is now a data URL (the
      // file branch reads it via FileReader). The text
      // assertion checks for the photo group heading in either
      // locale; the actual photo tile is verified by the
      // `[role="img"]` count below.
      detailText.includes('after') ||
        detailText.includes('আগে') ||
        detailText.includes('পরে'),
      'expected after-photo group rendered on report detail page',
    ).toBe(true);
    // The citizen page renders after-photos as role="img"
    // tiles (see app/reports/[id]/page.tsx); at least one
    // must be present after the crew's file-picker upload.
    const afterImgCount = await page.locator('[role="img"]').count();
    expect(
      afterImgCount,
      'expected at least one role="img" tile for the after-photo',
    ).toBeGreaterThan(0);
    expect(
      detailText.includes('Submitted') ||
        detailText.includes('জমা') ||
        detailText.includes('Routed') ||
        detailText.includes('পাঠানো') ||
        detailText.includes('In progress') ||
        detailText.includes('চলমান'),
      'expected trail entries on report detail page',
    ).toBe(true);

    // Also visit /reports (the list view) to confirm the resolved
    // status surfaces there too.
    await page.goto(`${BASE}/reports`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => !document.body.innerText.includes('লোড হচ্ছে'),
      { timeout: 10_000 },
    );
    await page.waitForFunction(
      () => /সমাধান|Resolved/.test(document.body.innerText),
      { timeout: 15_000 },
    );
    await capture(page, '21-citizen-my-reports-resolved');

    // eslint-disable-next-line no-console
    console.log(
      `\n  [demo] full flow complete — captured 21 screenshots in ${AUDIT_DIR}\n`,
    );
  });
});
