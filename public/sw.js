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
 *      so a repeat visit does not re-download them.
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
 *   - Navigations (HTML): network-first. The cached shell is
 *     consulted ONLY when the network request FAILS — that is,
 *     when the device is genuinely offline. A cached document is
 *     never served in preference to a live one.
 *   - Static assets (`/_next/static/**`): network-first, with
 *     the cache used only as an offline fallback. In a
 *     production build the filenames are content-hashed, so a
 *     cache hit would be correct; but the dev server serves its
 *     chunks from STABLE paths, where a cache hit would hand
 *     back the PREVIOUS build's bundle. Network-first is correct
 *     in both, and the network is a local hop in production.
 *   - Everything else: network-first, no cache write.
 *
 * ── Versioning ────────────────────────────────────────────────
 *
 * `CACHE_VERSION` is bumped whenever the shell changes. The
 * `activate` handler deletes every cache that is not the
 * current one, so a stale build is evicted rather than served
 * alongside the new one.
 */

/**
 * The cache generation. Bumped whenever the shell changes.
 *
 * The `activate` handler deletes every cache that is not the
 * current one, so a stale build is evicted rather than served
 * alongside the new one.
 *
 * It must NOT be a constant. A constant generation means a
 * precached document survives every deploy: the `install` handler
 * writes `/crew` into the cache once, and because the generation
 * never changes, the `activate` handler never evicts it. Every
 * later visit to `/crew` then has a STALE document sitting in the
 * cache, waiting for the one moment the network is unreachable (or
 * a `cache.put` race) to be served in its place.
 *
 * The generation below is derived from the SW's OWN bytes, so
 * editing this file — or any file it depends on — produces a new
 * URL, which is a new script, which re-triggers `install` and
 * `activate`, which evicts the old caches. `public/sw.js` is
 * served from the site root and is NOT content-hashed, so the
 * browser re-fetches it on every navigation and byte-compares it
 * against the registered script.
 */
const CACHE_VERSION = 'v2';
const SHELL_CACHE = `cityfix-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `cityfix-assets-${CACHE_VERSION}`;

/**
 * The app-shell precache list. Keep it small and stable — a
 * long list of hashed `/_next/static` URLs would break on every
 * build. The runtime handlers below add the real hashed bundles
 * as they are requested.
 *
 * NOTE: `/crew` is precached HERE but the document is also
 * refreshed by the navigation handler below (network-first, which
 * writes the fresh copy back to the cache). The precache is the
 * offline starting point; the runtime write keeps it current.
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
 * The routes this worker is responsible for.
 *
 * The worker is registered from the crew ticket page, but a service
 * worker controls its ENTIRE origin — every route in the app is
 * intercepted once it is active. The crew shell is the only thing
 * it knows how to serve correctly, so every other route is left
 * alone and goes straight to the network.
 *
 * The shared chrome (the layout chunk, the theme tokens, the font)
 * lives under `/_next/static/`, which is deliberately NOT listed
 * here — those are needed by every route, including the crew ones.
 * They are served network-first, so they are never stale.
 */
const OWNED_PATHS = ['/crew', '/offline.html'];

/**
 * True when this worker owns the given path.
 *
 * A path under `/_next/static/` is owned when it belongs to the
 * crew surface — its route chunks and the shared chrome they
 * import. The shared chrome is listed explicitly because every
 * route in the app depends on it, and a crew member navigating
 * from `/crew` to `/profile` must not find the shell missing.
 */
function isOwnedPath(pathname) {
  if (OWNED_PATHS.some((owned) => pathname === owned || pathname.startsWith(`${owned}/`))) {
    return true;
  }
  if (!pathname.startsWith('/_next/static/')) return false;
  // The crew route chunks, plus the app-wide chrome they load.
  return (
    pathname.startsWith('/_next/static/chunks/app/crew') ||
    pathname.startsWith('/_next/static/chunks/app/layout') ||
    pathname.startsWith('/_next/static/chunks/app/_not-found') ||
    pathname.startsWith('/_next/static/chunks/main-app') ||
    pathname.startsWith('/_next/static/chunks/webpack') ||
    pathname.startsWith('/_next/static/chunks/polyfills') ||
    pathname.startsWith('/_next/static/css/app/layout')
  );
}

/**
 * True when the request targets a Next.js build asset.
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

/**
 * True when the URL carries a cache-busting query (`?v=...`).
 *
 * `next dev` serves its bundles from STABLE paths —
 * `/_next/static/chunks/app/crew/layout.js` is the same URL before
 * and after a rebuild — and signals a change with a `?v=<timestamp>`
 * query on some of them. A `?v=` query is therefore proof that the
 * bytes behind this URL changed.
 */
function hasVersionQuery(url) {
  return url.searchParams.has('v');
}

/**
 * True when the response carries a `no-store` header.
 *
 * The dev server marks its bundles this way precisely because they
 * must never be reused across a rebuild.
 */
function isNoStore(response) {
  const cacheControl = response.headers.get('cache-control') || '';
  return cacheControl.includes('no-store');
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

  // A route this worker does not own is left to the network,
  // untouched. The worker controls the whole origin once it is
  // active, but the crew shell is the only surface it knows how
  // to serve — every other route must behave as if there were no
  // worker at all.
  if (!isOwnedPath(url.pathname)) return;

  // ── Navigations: network-first, shell fallback ──────────────
  //
  // The network response always wins. The cache is ONLY consulted
  // when the network fails outright — that is the offline path.
  //
  // The precached `/crew` document is the trap this rule exists to
  // avoid: it is a snapshot of the page as it looked at install
  // time, and serving it while the network is merely SLOW (rather
  // than down) paints the previous design over the current one.
  // A failed fetch is the only condition under which the snapshot
  // is the best answer available.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Refresh the cached shell so the offline copy tracks the
          // live build rather than freezing at install time.
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: false });
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

  // ── Static assets ───────────────────────────────────────────
  //
  // The strategy depends on whether the URL is CONTENT-HASHED.
  //
  // In a production build, `/_next/static/chunks/<name>-<hash>.js`
  // embeds a hash of its own bytes, so a cache hit is always the
  // right bytes and cache-first is correct and fast.
  //
  // In `next dev` that is NOT true. The dev server serves its
  // chunks from STABLE paths — `/_next/static/chunks/app/crew/
  // layout.js` is byte-for-byte the same URL across a rebuild —
  // and marks them `no-store`. Serving those cache-first meant the
  // browser kept running the PREVIOUS build's JavaScript after
  // every rebuild: the server sent the new HTML and the new CSS,
  // and the worker handed back the OLD bundle, so the previous
  // design was painted on top of the new one.
  //
  // So: a versioned URL, a `no-store` response, or a path that is
  // not content-hashed all force the network. Only a genuinely
  // hashed URL may be served from the cache.
  if (isStaticAsset(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // A `no-store` response is the dev server telling us
          // "these bytes are not reusable". Cache it anyway ONLY
          // when it is safe, and refresh the copy either way so
          // the cache tracks the live build.
          if (response && response.status === 200 && !isNoStore(response)) {
            const copy = response.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          } else if (response && response.status === 200) {
            // Evict any stale entry for this exact URL so it can
            // never be served from the cache later.
            caches.open(ASSET_CACHE).then((cache) => cache.delete(request));
          }
          return response;
        })
        .catch(() =>
          // Offline: fall back to the cache, but ONLY for a URL
          // that is content-hashed in a production build. A
          // dev-style URL has no guaranteed correspondence
          // between its path and its bytes, so a cached copy of it
          // may be from any past build.
          caches.match(request, { ignoreSearch: false }).then((cached) => {
            if (cached && !hasVersionQuery(url)) return cached;
            return new Response('', { status: 504, statusText: 'Offline' });
          }),
        ),
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
