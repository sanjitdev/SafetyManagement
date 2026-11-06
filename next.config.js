/**
 * Next.js config — CityFix.
 *
 * Notes:
 * - App Router is the canonical mode (per tech-audit.md §1).
 * - maplibre-gl ships ES modules; the optimizePackageImports hint below
 *   keeps client bundles reasonable.
 * - PWA / service-worker behavior will land as `next-pwa` (or hand-rolled)
 *   once WO-000 / WO-003 reach the offline-queue / PWA scope. Not in v1 scaffold.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  experimental: {
    // Server actions are stable in 14.x but we keep the experimental flag
    // until WO-000 decides on the route-handler vs. server-action split.
    //
    // NOTE: `bodySizeLimit` governs SERVER ACTIONS ONLY. It does not
    // apply to the `app/api/**` route handlers, which are where the
    // citizen photo upload actually goes. Do NOT rely on this as the
    // photo size cap — the real per-photo cap is
    // `MAX_PHOTO_URL_CHARS` in `lib/format/photo-url.ts` (7,000,000
    // chars), and the load-bearing defence is the client-side downscale
    // in `lib/photo/downscale.ts` (1600px long edge, JPEG q80).
    serverActions: {
      bodySizeLimit: '4mb',
    },
    // Maplibre pulls in its own CSS at runtime; we import it inside the
    // client component that uses it. This keeps client bundles reasonable.
    optimizePackageImports: ['maplibre-gl'],
    // Native modules: argon2 ships a prebuilt .node binary; prisma's query
    // engine must run from node_modules at runtime. Webpack would otherwise
    // try to bundle the .node file and crash with "Unexpected character".
    serverComponentsExternalPackages: [
      '@node-rs/argon2',
      '@prisma/client',
      'argon2',
    ],
  },

  // Headers — set sensible defaults for the civic-platform posture.
  // Auth/CSRF/CSP specifics land with WO-000 PRD.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // HSTS — Vercel serves HTTPS by default; tell browsers to
          // never fall back. 1 year, include subdomains, eligible for
          // preload. Skipped in dev so localhost stays on http.
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=31536000; includeSubDomains; preload',
                },
              ]
            : []),
          // Content Security Policy — Vercel-hosted origin. Allows:
          //   - 'self' for scripts + styles (Next.js inlines its own)
          //   - OSM tile servers (the bare `tile.openstreetmap.org` host +
          //     a/b/c.tile.openstreetmap.org subdomains) for the MapLibre
          //     map. The bare host MUST be listed explicitly — `*.tile.…`
          //     matches subdomains only, so without `tile.openstreetmap.org`
          //     every prod tile request is blocked (silent blank map).
          //   - Nominatim for reverse geocoding
          //   - 'unsafe-inline' for styles (Tailwind + tokens.css; the
          //     nonced style approach is a v1.1 hardening)
          //   - Google Fonts (Noto Sans Bengali) — the Bangla-first
          //     typography the design system depends on. The app
          //     loads the stylesheet from fonts.googleapis.com and
          //     the woff2 files from fonts.gstatic.com, so BOTH
          //     hosts must be allowed in style-src + font-src. Without
          //     them the browser silently drops the Bangla webfont on
          //     every page and the UI falls back to a system font
          //     (this was a real, app-wide defect — not a nit).
          //   - data: + blob: + https: for the MapLibre WebGL canvas + photos
          //   - demotiles.maplibre.org in connect-src for the MapLibre
          //     glyph server. MapLibre fetches glyph ranges from it to
          //     draw any `text-field`; without it the numbered map pins
          //     (and cluster counts) render as invisible dots, with
          //     only a CSP console error to show for it.
          //   - unpkg.com for the Swagger UI assets served by /api/docs.
          //     The docs page loads swagger-ui-dist from the CDN, so
          //     BOTH script-src and style-src need the host — without
          //     it the page renders as a blank <div id="swagger-ui"> and
          //     the API reference is silently unusable in the browser
          //     (the JSON spec endpoint still works).
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.openstreetmap.fr https://nominatim.openstreetmap.org https://demotiles.maplibre.org https://*.cityfix.vercel.app https://cityfix.vercel.app",
              "worker-src 'self' blob:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          // Permissions-Policy — disable unused browser features
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), geolocation=(self), microphone=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;