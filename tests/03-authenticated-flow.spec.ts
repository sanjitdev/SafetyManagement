/**
 * Authenticated-flow audit for the WO-001 surface (tests/03-authenticated-flow.spec.ts).
 *
 * Complements tests/02-live-audit.spec.ts, which only walks unauthenticated
 * routes. Here we mint a citizen session via /api/dev/login, seed at least
 * one ticket so the feed isn't empty, then walk the surfaces that depend on
 * auth state (home, feed, reports, the report flow) in both light and dark
 * themes.
 *
 * Screenshots are written to tests-mockups/audit/03-authenticated-flow.spec.ts/
 * for human review. This is a survey, not a visual-regression baseline.
 *
 * Pre-reqs:
 *   - The dev server must be running with CITYFIX_DEV_STORE=1 (npm run dev:feat).
 *   - BASE_URL must point at it (defaults to http://localhost:3000, matching
 *     the dev server Playwright auto-starts in playwright.config.ts).
 *
 * Run: `npx playwright test tests/03-authenticated-flow.spec.ts`
 */

import { test, expect, Page, APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

const AUDIT_DIR = path.resolve(
  __dirname,
  '..',
  'tests-mockups',
  'audit',
  '03-authenticated-flow.spec.ts',
);

test.beforeAll(() => {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
});

/** Set the localStorage appearance key before the page boots. */
async function setAppearance(
  page: Page,
  pref: 'light' | 'dark' | 'system',
): Promise<void> {
  await page.addInitScript((p) => {
    try {
      window.localStorage.setItem('cityfix.preferred_appearance.v1', p);
    } catch {}
  }, pref);
}

async function setSystemPrefersDark(page: Page, dark: boolean): Promise<void> {
  await page.emulateMedia({ colorScheme: dark ? 'dark' : 'light' });
}

async function waitForThemeClass(
  page: Page,
  expected: 'theme-light' | 'theme-dark',
): Promise<void> {
  await page.waitForFunction(
    (cls) => document.documentElement.classList.contains(cls),
    expected,
    { timeout: 5_000 },
  );
}

/**
 * Mint a citizen session via the dev-only endpoint. The cookie is shared
 * across the test via the storage state on the BrowserContext, so any
 * subsequent page.goto carries the session.
 *
 * Retries on 404 once after a short delay — the very first request to
 * `/api/dev/login` on a cold Next.js dev server can race the route
 * compilation and return 404 (or 500) before the handler is registered.
 * One retry after a 500ms warmup is enough to absorb that.
 */
async function devLogin(request: APIRequestContext): Promise<void> {
  const expected = [200, 303];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await request.post(`${BASE}/api/dev/login`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    if (expected.includes(res.status())) return;
    if (attempt === 1) {
      // Final attempt failed — dump the body to make the failure
      // diagnosable in CI logs.
      const body = await res.text().catch(() => '<no body>');
      throw new Error(
        `devLogin returned ${res.status()} after 2 attempts. Body: ${body.slice(0, 200)}`,
      );
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Seed at least one ticket so /home and /feed have content to render.
 * Jitter the location per call to defeat the 50m dedup radius — every
 * previous seed call was returning 200 dedup_match instead of 201.
 * Time-based jitter ensures uniqueness even when attempt=0.
 */
async function seedOneTicket(
  request: APIRequestContext,
  attempt: number,
): Promise<string> {
  // Spread the seed points across ~1km — outside any 50m dedup radius.
  const baseLat = 23.8069;
  const baseLng = 90.3687;
  // Combine a per-test attempt offset with millisecond-level time jitter
  // so two calls with the same `attempt` still differ.
  const t = Date.now() % 10_000;
  const jitterLat = ((attempt + 1) * 0.003 + t * 0.00001) % 0.02;
  const jitterLng = ((attempt + 1) * 0.005 + t * 0.000013) % 0.02;
  const res = await request.post(`${BASE}/api/tickets`, {
    data: {
      cityId: 'city_dhaka_north',
      wardId: 'ward_14',
      categoryId: 'cat_streetlight',
      locationLat: baseLat + jitterLat,
      locationLng: baseLng + jitterLng,
      locationLabel: `Mirpur DOHS, Road ${6 + attempt}-${t}`,
      locationLabelBn: `মিরপুর ডিওএইচএস, রোড ${6 + attempt}-${t}`,
      note: `Streetlight has been out for three nights (#${attempt}-${t}).`,
      noteBn: `তিন রাত ধরে রাস্তার আলো জ্বলছে না (#${attempt}-${t})।`,
      photoUrls: [],
    },
  });
  expect(res.status(), `seed ticket returned ${res.status()}`).toBe(201);
  const body = (await res.json()) as { id?: string };
  if (!body.id) {
    throw new Error(`seed ticket returned 201 but no id in body: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body.id;
}

async function capture(
  page: Page,
  name: string,
  waitForSelector: string = 'main',
  suffix: string = '',
): Promise<{ status: number; errors: string[] }> {
  const errors: string[] = [];
  const handler = (msg: { type(): string; text(): string }) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  const respHandler = (r: import('@playwright/test').Response) => {
    if (r.url().includes('/api/')) {
      // eslint-disable-next-line no-console
      console.log(`  [response] ${r.status()} ${r.request().method()} ${r.url()}`);
    }
  };
  page.on('console', handler);
  page.on('response', respHandler);
  const resp = await page.goto(`${BASE}/${name}`, { waitUntil: 'networkidle' });
  // The first request to a fresh route triggers Next.js dev compilation,
  // which can take 1–2s. Wait for the main heading to be present so the
  // screenshot doesn't capture a half-rendered page.
  await page
    .waitForSelector(waitForSelector, { timeout: 15_000 })
    .catch(() => undefined);
  // Wait until the loading placeholder is gone (or up to 8s). The /reports
  // and /feed pages render a synchronous loading string while the activity
  // API resolves; we want the post-fetch state for the screenshot.
  await page
    .waitForFunction(
      () => !document.body.innerText.includes('লোড হচ্ছে'),
      { timeout: 8_000 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(1000);
  // Diagnostic: dump the rendered text so a stuck-loading regression
  // is visible in the test output.
  const rendered = await page.evaluate(() => document.body.innerText.slice(0, 400));
  // eslint-disable-next-line no-console
  console.log(`  [rendered /${name}]\n${rendered.replace(/\n/g, ' | ')}`);
  // Strip slashes from the file name so each route gets its own flat PNG
  // rather than a nested directory. Append the test-specific suffix
  // (e.g. "light_1440x900", "dark_390x844") so different themes / viewports
  // don't overwrite each other.
  const base = name.replace(/\//g, '_');
  const file = suffix ? `${base}__${suffix}.png` : `${base}.png`;
  await page.screenshot({
    path: path.join(AUDIT_DIR, file),
    fullPage: true,
  });
  page.off('console', handler);
  page.off('response', respHandler);
  return { status: resp?.status() ?? 0, errors };
}

test.describe('Authenticated surfaces — light theme', () => {
  for (const route of ['home', 'feed', 'reports']) {
    test(`light / ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setAppearance(page, 'light');
      // Use page.request so the session cookie is shared with the browser
      // context that will then visit the page.
      await devLogin(page.request);
      const { status, errors } = await capture(page, route, 'main', 'light_1440x900');
      expect(status).toBeGreaterThanOrEqual(200);
      const real = errors.filter(
        (e) =>
          !/Failed to load resource/i.test(e) &&
          !/favicon/i.test(e) &&
          !/Hydration/i.test(e),
      );
      expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
    });
  }

  test('light / reports/<id> (own report detail)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'light');
    await devLogin(page.request);
    const ticketId = await seedOneTicket(page.request, 0);
    const { status, errors } = await capture(page, `reports/${ticketId}`, 'main', 'light_1440x900');
    expect(status).toBeGreaterThanOrEqual(200);
    const real = errors.filter(
      (e) =>
        !/Failed to load resource/i.test(e) &&
        !/favicon/i.test(e) &&
        !/Hydration/i.test(e),
    );
    expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
  });

  test('light / report/location (start of submit flow)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'light');
    await devLogin(page.request);
    const { status, errors } = await capture(page, 'report/location', 'main', 'light_1440x900');
    expect(status).toBeGreaterThanOrEqual(200);
    const real = errors.filter(
      (e) =>
        !/Failed to load resource/i.test(e) &&
        !/favicon/i.test(e) &&
        !/Hydration/i.test(e),
    );
    expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
  });
});

test.describe('Authenticated surfaces — dark theme', () => {
  for (const route of ['home', 'feed', 'reports']) {
    test(`dark / ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await setAppearance(page, 'dark');
      await devLogin(page.request);
      const { status, errors } = await capture(page, route, 'main', 'dark_1440x900');
      expect(status).toBeGreaterThanOrEqual(200);
      const real = errors.filter(
        (e) =>
          !/Failed to load resource/i.test(e) &&
          !/favicon/i.test(e) &&
          !/Hydration/i.test(e),
      );
      expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
    });
  }

  test('dark / reports/<id>', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'dark');
    await devLogin(page.request);
    const ticketId = await seedOneTicket(page.request, 1);
    const { status, errors } = await capture(page, `reports/${ticketId}`, 'main', 'dark_1440x900');
    expect(status).toBeGreaterThanOrEqual(200);
    const real = errors.filter(
      (e) =>
        !/Failed to load resource/i.test(e) &&
        !/favicon/i.test(e) &&
        !/Hydration/i.test(e),
    );
    expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
  });

  test('dark / report/location', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setAppearance(page, 'dark');
    await devLogin(page.request);
    const { status, errors } = await capture(page, 'report/location', 'main', 'dark_1440x900');
    expect(status).toBeGreaterThanOrEqual(200);
    const real = errors.filter(
      (e) =>
        !/Failed to load resource/i.test(e) &&
        !/favicon/i.test(e) &&
        !/Hydration/i.test(e),
    );
    expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
  });
});

test.describe('Authenticated phone (390x844) — dark', () => {
  for (const route of ['home', 'feed']) {
    test(`phone dark / ${route}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await setAppearance(page, 'dark');
      await devLogin(page.request);
      const { status, errors } = await capture(page, route, 'main', 'dark_390x844');
      expect(status).toBeGreaterThanOrEqual(200);
      const real = errors.filter(
        (e) =>
          !/Failed to load resource/i.test(e) &&
          !/favicon/i.test(e) &&
          !/Hydration/i.test(e),
      );
      expect(real, `console errors: ${real.join('; ')}`).toHaveLength(0);
    });
  }
});

test.describe('Theme toggle from an authenticated surface', () => {
  test('toggle on /home flips theme + persists', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await devLogin(page.request);
    await page.goto(BASE + '/home');
    // The toggle on /home lives in the <header>, not <main>.
    const group = page.locator('[role="radiogroup"]').first();
    await expect(group).toBeVisible();
    const options = group.locator('[role="radio"]');
    await expect(options).toHaveCount(3);

    await options.nth(1).click(); // dark
    await waitForThemeClass(page, 'theme-dark');
    expect(
      await page.evaluate(() =>
        localStorage.getItem('cityfix.preferred_appearance.v1'),
      ),
    ).toBe('dark');

    await options.nth(0).click(); // light
    await waitForThemeClass(page, 'theme-light');
    expect(
      await page.evaluate(() =>
        localStorage.getItem('cityfix.preferred_appearance.v1'),
      ),
    ).toBe('light');

    await page.reload();
    await waitForThemeClass(page, 'theme-light');
  });

  test('system + dark OS = dark on /home', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await setSystemPrefersDark(page, true);
    await setAppearance(page, 'system');
    await devLogin(page.request);
    await page.goto(BASE + '/home');
    await waitForThemeClass(page, 'theme-dark');
  });
});
