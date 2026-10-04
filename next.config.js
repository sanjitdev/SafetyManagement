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
    serverActions: {
      bodySizeLimit: '4mb', // generous for citizen photo upload (max 1600px q80)
    },
    // Maplibre pulls in its own CSS at runtime; we import it inside the
    // client component that uses it. This keeps client bundles reasonable.
    optimizePackageImports: ['maplibre-gl'],
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
        ],
      },
    ];
  },
};

module.exports = nextConfig;