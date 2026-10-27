/* eslint-disable no-restricted-globals */
/**
 * CityFix service worker (public/sw.js).
 *
 * ── Scope (WO-003) ─────────────────────────────────────────────
 *
 * WO-003's "Open Questions / Decisions" says:
 *
 *   > 3. "PWA service worker scope. Recommendation: cache shell
 *   >     + tokens; ticket data is always live (no stale cache)."
 *
 * and its acceptance checklist says:
 *
 *   > "PWA installable (per design log cross-cutting decision)"
 *
 * So the worker does exactly two things:
 *
 *   1. **Shell caching** — the app shell (documents, the
 *      stylesheet, the client JS bundles, the icon set) is
 *      cached so the crew app opens instantly and renders
 *      offline.
 *   2. **Static asset caching** — images and fonts are cached
 *      with a cache-first strategy.
 *
 * What it deliberately does NOT cache:
 *
 *   - **API responses.** `GET /api/**` always goes to the
 *     network. Ticket data is always live — a crew member must
 *     never act on a stale ticket (a transition that another
 *     shift already made). This is the whole reason the write
 *     queue (`lib/crew/write-queue.ts`) exists: the READ path
 *     is live-only, the WRITE path queues.
 *   - **Mutations.** `POST` / `PATCH` / `DELETE` are never
 *     intercepted. The app's own queue decides what to replay.
 *
 * ── Strategy ──────────────────────────────────────────────────
 *
 *   - Navigations (HTML): network-first, falling back to the
 *     cached shell when the network is unreachable. The crew
 *     app's data is fetched client-side after the shell paints,
 *     so a cached shell is a valid offline starting point.
 *   - Static assets (`/_next/static/**`): cache-first. The
 *     Next.js build hashes these filenames, so a cached entry
 *     is always the right bytes.
 *   - Everything else: network-first, no cache write.
 *
 * ── Versioning ────────────────────────────────────────────────
 *
 * `CACHE_VERSION` is bumped whenever the shell changes. The
 * `activate` handler deletes every cache that is not the
 * current one, so a stale build is evicted rather than served
 * alongside the new one.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `cityfix-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `cityfix-assets-${CACHE_VERSION}`;

/**
 * The app-shell precache list. Keep it small and stable — a
 * long list of hashed `/_next/static` URLs would break on every
 * build. The runtime handlers below add the real hashed bundles
 * as they are requested.
 */
const SHELL_URLS = ['/crew', '/offline.html'];

/**
 * The offline fallback document. A tiny standalone HTML page
 * that explains the situation and offers a retry. It is
 * precached so the navigation fallback always has something to
 * serve.
 */
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * True when the request targets the API. API traffic is always
 * live — never cached, never intercepted.
 */
function isApiRequest(url) {
  return (
    url.pathname === '/api' || url.pathname.startsWith('/api/')
  );
}

/**
 * True when the request targets a Next.js build asset. These
 * are content-hashed, so a cache hit is always correct.
 */
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/_next/image') ||
    /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|webp|svg|ico)$/i.test(
      url.pathname,
    )
  );
}

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only GETs are cacheable. Mutating requests (POST /transition,
  // POST /photos) pass straight through to the network — the
  // app's own write queue owns the offline behaviour for them.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin requests are not our business.
  if (url.origin !== self.location.origin) return;

  // API traffic is always live.
  if (isApiRequest(url)) return;

  // ── Navigations: network-first, shell fallback ──────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>CityFix</title>' +
              '<p style="font-family:system-ui;padding:2rem">' +
              'CityFix is offline and this page is not cached yet.' +
              '</p>',
            { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
          );
        }),
    );
    return;
  }

  // ── Static assets: cache-first ──────────────────────────────
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      }),
    );
  }
});

/**
 * Allow the page to request an immediate skipWaiting (e.g. the
 * user tapped "reload to update").
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
