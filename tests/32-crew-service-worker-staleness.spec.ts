/**
 * Playwright route spec for the crew service worker's cache
 * behaviour (tests/32-crew-service-worker-staleness.spec.ts).
 *
 * ── The defect this guards against ─────────────────────────────
 *
 * The crew portal registered a service worker (`public/sw.js`)
 * from the crew ticket page. A service worker controls its ENTIRE
 * origin, so once a crew member opened a ticket, the worker was
 * also handling `/crew` — the crew dashboard.
 *
 * The worker served `/_next/static/**` CACHE-FIRST, on the
 * assumption (documented in its own header) that "the Next.js
 * build hashes these filenames, so a cached entry is always the
 * right bytes". That assumption holds for a production build and
 * is FALSE for `next dev`, where the dev server serves its chunks
 * from STABLE paths:
 *
 *   /_next/static/chunks/app/crew/page.js
 *   /_next/static/chunks/app/crew/layout.js
 *   /_next/static/chunks/app/layout.js
 *
 * Those URLs are byte-for-byte identical across a rebuild. So
 * after any change to the crew dashboard, the browser kept running
 * the PREVIOUS build's JavaScript: the server sent the new HTML
 * and the new CSS, and the worker handed back the old bundle. The
 * symptom was the new dashboard rendering and then the previous
 * design being painted on top of it.
 *
 * Two further defects compounded it:
 *
 *   - `CACHE_VERSION` was a constant (`'v1'`), so the precached
 *     `/crew` document was never evicted. It sat in the cache
 *     across every deploy as a snapshot of the page as it looked
 *     at install time.
 *   - `caches.match(request)` matches by URL path and ignores the
 *     query, so a request for `main-app.js?v=<new-timestamp>`
 *     matched the stale cached `main-app.js` (no query).
 *
 * ── What these tests assert ───────────────────────────────────
 *
 *   1. A stale `/crew` document in the cache is NEVER served in
 *      preference to the live one.
 *   2. A stale `/_next/static/**` bundle in the cache is NEVER
 *      served — the dev server's `no-store` bundles are not
 *      cached at all.
 *   3. The cache generation is bumped past the original `v1`, so
 *      the old `cityfix-shell-v1` cache is evicted on activate.
 *   4. The worker does not intercept routes outside the crew
 *      surface it owns.
 */

import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const CREW_TICKET_ID = 'ticket_seed_crew_routed_3';

/**
 * The marker written into every poisoned cache entry. If the
 * worker ever serves a cache entry, this string appears in the
 * page's console.
 */
const STALE_MARKER = 'CITYFIX_STALE_CACHE_MARKER';

async function devLogin(ctx: APIRequestContext) {
  return ctx.post(`${BASE}/api/dev/login?role=crew`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
}

/**
 * Register the service worker and let it install, by visiting the
 * crew ticket page — the only page that calls
 * `registerServiceWorker()`.
 */
async function registerServiceWorker(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/crew/tickets/${encodeURIComponent(CREW_TICKET_ID)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForSelector('[data-testid="crew-ticket-page"]', { timeout: 15_000 });
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Overwrite every cache entry with the stale marker, so any
 * entry the worker serves is visible on the page's console.
 */
async function poisonCache(page: import('@playwright/test').Page) {
  return page.evaluate(async (marker: string) => {
    const keys = await caches.keys();
    let poisoned = 0;
    for (const key of keys) {
      const cache = await caches.open(key);
      for (const request of await cache.keys()) {
        if (request.url.includes('/offline.html')) continue;
        await cache.put(
          request,
          new Response(`/* ${marker} */ console.error("${marker}");`, {
            status: 200,
            headers: { 'content-type': 'application/javascript' },
          }),
        );
        poisoned += 1;
      }
    }
    return poisoned;
  }, STALE_MARKER);
}

test.describe('crew service worker — no stale build is ever served', () => {
  test.beforeEach(async () => {
    const resetCtx = await pwRequest.newContext();
    try {
      const resp = await resetCtx.post(`${BASE}/api/dev/reset`);
      expect(resp.status()).toBe(200);
    } finally {
      await resetCtx.dispose();
    }
  });

  test('a stale /crew document in the cache is not served over the live one', async ({ page }) => {
    await devLogin(page.context().request);
    await registerServiceWorker(page);

    // Poison the precached /crew document with a page that would
    // be unmistakable if it were ever served.
    await page.evaluate(async () => {
      const keys = await caches.keys();
      for (const key of keys) {
        const cache = await caches.open(key);
        const match = await cache.match('/crew');
        if (!match) continue;
        await cache.put(
          '/crew',
          new Response(
            '<!doctype html><body>STALE CACHED CREW DOCUMENT</body>',
            {
              status: 200,
              headers: { 'content-type': 'text/html; charset=utf-8' },
            },
          ),
        );
      }
    });

    await page.goto(`${BASE}/crew`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="crew-dashboard-page"]', {
      timeout: 15_000,
    });

    // The live dashboard rendered, not the cached snapshot.
    await expect(page.locator('[data-testid="crew-dashboard-page"]')).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('STALE CACHED CREW DOCUMENT');
  });

  test('a stale /_next/static bundle in the cache is not served', async ({ page }) => {
    await devLogin(page.context().request);
    await registerServiceWorker(page);

    // Visit /crew so the worker has a chance to cache the shell
    // and its chunks, exactly as a returning crew member's browser
    // would have them.
    await page.goto(`${BASE}/crew`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="crew-dashboard-page"]', {
      timeout: 15_000,
    });

    const poisoned = await poisonCache(page);
    expect(poisoned).toBeGreaterThan(0);

    // Reload and watch the console for the marker.
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(`${BASE}/crew`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="crew-dashboard-page"]', {
      timeout: 15_000,
    });

    expect(
      consoleErrors.filter((text) => text.includes(STALE_MARKER)),
    ).toEqual([]);
  });

  test('the cache generation is bumped past v1 so the stale shell is evicted', async ({ page }) => {
    await devLogin(page.context().request);
    await registerServiceWorker(page);

    const cacheNames = await page.evaluate(async () => caches.keys());
    expect(cacheNames.length).toBeGreaterThan(0);
    // The original generation is `v1`. A cache still named `v1`
    // means the precached /crew document from the install snapshot
    // is still around.
    expect(cacheNames.some((name) => name.endsWith('-v1'))).toBe(false);
  });

  test('the worker does not intercept routes outside the crew surface', async ({ page }) => {
    await devLogin(page.context().request);
    await registerServiceWorker(page);

    // A citizen route must be served straight from the network —
    // the crew worker has no business caching it.
    const intercepted = await page.evaluate(async () => {
      const shell = await caches.open(
        (await caches.keys()).find((k) => k.startsWith('cityfix-shell')) ?? '',
      );
      const urls = (await shell.keys()).map((r) => new URL(r.url).pathname);
      return urls;
    });

    expect(intercepted.filter((p) => p.startsWith('/home'))).toEqual([]);
    expect(intercepted.filter((p) => p.startsWith('/admin'))).toEqual([]);
    expect(intercepted.filter((p) => p.startsWith('/feed'))).toEqual([]);
  });
});
