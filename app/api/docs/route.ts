/**
 * GET /api/docs — the Swagger UI page for the CityFix API.
 *
 * The Swagger UI assets are loaded from a CDN rather than vendored
 * into the bundle: they are large, versioned upstream, and pulling
 * them in as an npm dependency would add a runtime dependency for a
 * documentation page. The spec itself is served from this app at
 * `/api/docs/spec`, so there is no external data dependency.
 *
 * The spec lives under `/api/docs/spec`, not `/api/docs/openapi.json`:
 * Next.js 14 reserves the `openapi` route segment for its OpenAPI
 * metadata-route convention, and a route handler placed there is never
 * registered — the request falls through to a 404. `spec` is the
 * neutral segment name that works.
 *
 * The page is public — it documents the API's surface, which is not
 * itself sensitive, and the session cookie is what actually protects
 * the endpoints.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The Swagger UI distribution version to pin. */
const SWAGGER_UI_VERSION = '5.17.14';

const CSS_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css`;
const JS_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js`;
const PRESET_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-standalone-preset.js`;

/**
 * A minimal stylesheet so the page reads as part of CityFix rather
 * than as raw Swagger UI. Kept inline — a separate stylesheet would
 * need another route and another cache policy for a single page.
 */
const PAGE_CSS = `
  :root {
    --cf-page: #f1f5f9;
    --cf-card: #ffffff;
    --cf-ink: #0f172a;
    --cf-ink-muted: #64748b;
    --cf-border: #cbd5e1;
    --cf-primary: #1e40af;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cf-page);
    color: var(--cf-ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI",
      Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  .cf-header {
    background: var(--cf-card);
    border-bottom: 1px solid var(--cf-border);
    padding: 16px 24px;
    display: flex;
    align-items: baseline;
    gap: 16px;
    flex-wrap: wrap;
  }
  .cf-header h1 {
    margin: 0;
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }
  .cf-header p {
    margin: 0;
    font-size: 13px;
    color: var(--cf-ink-muted);
  }
  .cf-header a {
    color: var(--cf-primary);
    font-size: 13px;
    text-decoration: none;
  }
  .cf-header a:hover { text-decoration: underline; }
  .cf-wrap {
    max-width: 1180px;
    margin: 0 auto;
    padding: 24px;
  }
  .swagger-ui .info { margin: 0 0 24px; }
  .swagger-ui .info .title { font-size: 22px; }
  .swagger-ui .scheme-container {
    background: var(--cf-card);
    box-shadow: none;
    border: 1px solid var(--cf-border);
    border-radius: 10px;
    padding: 16px 20px;
    margin: 0 0 20px;
  }
  .swagger-ui .opblock-tag {
    font-size: 17px;
    border-bottom-color: var(--cf-border);
  }
  .swagger-ui .opblock {
    border-radius: 10px;
    box-shadow: none;
    border: 1px solid var(--cf-border);
  }
  .swagger-ui .opblock.opblock-get { background: var(--cf-card); }
  .swagger-ui .opblock.opblock-post { background: var(--cf-card); }
  .swagger-ui .opblock.opblock-put { background: var(--cf-card); }
  .swagger-ui .opblock.opblock-patch { background: var(--cf-card); }
  .swagger-ui .opblock.opblock-delete { background: var(--cf-card); }
  .swagger-ui .opblock .opblock-summary-method {
    min-width: 74px;
    border-radius: 8px;
  }
  .swagger-ui .btn.execute {
    background: var(--cf-primary);
    border-color: var(--cf-primary);
    border-radius: 8px;
  }
  .swagger-ui select,
  .swagger-ui input[type=text],
  .swagger-ui textarea {
    border-radius: 8px;
    border-color: var(--cf-border);
  }
  .swagger-ui .model-box,
  .swagger-ui .responses-inner {
    background: var(--cf-card);
  }
  .swagger-ui .markdown code {
    background: #e2e8f0;
    border-radius: 4px;
    padding: 1px 5px;
  }
  .swagger-ui .loading-container { color: var(--cf-ink-muted); }
`;

export async function GET(req: NextRequest) {
  // `nextUrl` carries the deployment's base path, so the spec URL
  // stays correct when the app is mounted under a prefix. A plain
  // `Request` (as the unit tests construct) has no `nextUrl`, so fall
  // back to the request's own URL.
  const origin = req.nextUrl?.origin ?? new URL(req.url).origin;
  const specUrl = new URL('/api/docs/spec', origin).toString();

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CityFix API — Swagger UI</title>
    <link rel="stylesheet" href="${CSS_URL}" />
    <style>${PAGE_CSS}</style>
  </head>
  <body>
    <header class="cf-header">
      <h1>CityFix API</h1>
      <p>Interactive reference for every non-development endpoint.</p>
      <a href="${specUrl}">View the raw specification</a>
    </header>
    <div class="cf-wrap">
      <div id="swagger-ui"></div>
    </div>
    <script src="${JS_URL}" crossorigin></script>
    <script src="${PRESET_URL}" crossorigin></script>
    <script>
      window.addEventListener('load', function () {
        window.ui = SwaggerUIBundle({
          url: ${JSON.stringify(specUrl)},
          dom_id: '#swagger-ui',
          deepLinking: true,
          displayRequestDuration: true,
          docExpansion: 'none',
          filter: true,
          tryItOutEnabled: false,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'StandaloneLayout',
        });
      });
    </script>
  </body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
