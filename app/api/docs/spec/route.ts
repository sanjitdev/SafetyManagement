/**
 * GET /api/docs/spec — the OpenAPI 3.0.3 specification, as JSON.
 *
 * Publicly accessible and deliberately un-rate-limited: Swagger UI's
 * "Try it out" fetches this document on every page load, and the API's
 * own limiter allows roughly one request per second — behind it, the
 * docs would be unusable.
 *
 * The spec itself lives in `lib/docs/openapi.ts`; this route only
 * serialises it.
 *
 * The URL is `/api/docs/spec` rather than the more conventional
 * `/api/docs/openapi.json` because Next.js 14 reserves the `openapi`
 * route segment for its OpenAPI metadata-route convention: a handler
 * at `app/api/docs/openapi/route.ts` is never registered, and the
 * request 404s. `spec` avoids the reserved name.
 */

import { NextResponse } from 'next/server';
import { openapiSpec } from '@/lib/docs/openapi';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(openapiSpec, {
    headers: {
      // The spec changes whenever a route handler changes; a cached
      // copy would quietly drift from the routes.
      'Cache-Control': 'no-store',
    },
  });
}
