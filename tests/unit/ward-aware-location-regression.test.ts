/**
 * Vitest: regression guard for the ward-aware report location step.
 *
 * ## The bug
 *
 * `app/report/(create)/location/page.tsx` rendered the Ward row from
 * `boot.ward` — a static value fetched once from
 * `GET /api/report/bootstrap` — and wrote the draft with
 * `wardId: boot.ward?.id ?? ''`. So the Ward row never changed as
 * the citizen moved the pin, and EVERY ticket was filed under the
 * citizen's home ward regardless of where the pin actually was.
 *
 * That is the exact failure `tests/unit/ward-routing-regression.test.ts`
 * documents: a ticket filed under the wrong ward is invisible to the
 * dispatcher and crew meant to handle it, because both list filters
 * require `wardId === session.wardId`.
 *
 * ## What the fix must preserve
 *
 *   1. The Ward row is derived from the PIN, not from the bootstrap.
 *   2. The draft's `wardId` is the RESOLVED ward.
 *   3. A point that resolves to no ward (e.g. Dhaka Cantonment, an
 *      enclave with no ward of its own) is UNRESOLVED — and the
 *      report cannot be filed. It must NOT silently fall back to the
 *      home ward.
 *   4. The map draws the ward boundaries and highlights the active one.
 *   5. The bootstrap fetch stays — other steps and the regression
 *      suite depend on it.
 *
 * These are SOURCE-level assertions on the page and the component,
 * in the same style as `ward-routing-regression.test.ts`: the page is
 * a client component whose behaviour is already covered by the
 * Playwright suite, and the point here is to pin the SHAPE of the
 * fix so it cannot silently regress.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const LOCATION_PAGE = readFileSync(
  path.join(ROOT, 'app', 'report', '(create)', 'location', 'page.tsx'),
  'utf8',
);

const MAP_VIEW = readFileSync(
  path.join(ROOT, 'components', 'MapView.tsx'),
  'utf8',
);

/**
 * The ward LAYER definitions.
 *
 * They used to live inline in `components/MapView.tsx`. They now
 * live in `lib/map/ward-layers.ts` so the citizen's report map and
 * the STAFF maps (`/dispatcher`, `/dispatcher/map`, `/crew`,
 * `/crew/map`, `/admin`, `/home`) build the IDENTICAL mosaic — one
 * copy of the paint properties rather than six, each of which would
 * be a place for the silent rendering failures documented in
 * `feedback_maplibre_client_only_patterns` to creep in.
 */
const WARD_LAYERS = readFileSync(
  path.join(ROOT, 'lib', 'map', 'ward-layers.ts'),
  'utf8',
);

const WARD_LOOKUP = readFileSync(
  path.join(ROOT, 'lib', 'geo', 'ward-lookup.ts'),
  'utf8',
);

describe('the location step resolves the ward from the pin', () => {
  it('resolves the ward with findWardAt, not from the bootstrap payload', () => {
    // The Ward row must come from the RESOLVED ward.
    expect(LOCATION_PAGE).toMatch(
      /findWardAt\(\s*wards\s*,\s*lat\s*,\s*lng\s*\)/,
    );
    // The old form rendered the bootstrap value UNCONDITIONALLY:
    //   {boot.ward?.nameBn ?? t('report.location.ward_unknown', ...)}
    // Now the RESOLVED ward is the primary source; the bootstrap
    // value survives only as the "boundaries have not loaded yet"
    // fallback, in the last branch of the ternary.
    const rowStart = LOCATION_PAGE.indexOf(
      'data-testid="report-location-ward"',
    );
    const rowEnd = LOCATION_PAGE.indexOf('</dd>', rowStart);
    const wardRow = LOCATION_PAGE.slice(rowStart, rowEnd);
    // The resolved ward is the FIRST branch.
    expect(wardRow).toMatch(
      /\{\s*resolvedWard\s*\n?\s*\?\s*`\$\{resolvedWard\.nameBn/,
    );
    // The unresolved branch comes before the bootstrap fallback.
    expect(wardRow.indexOf('report.location.ward_unresolved')).toBeLessThan(
      wardRow.indexOf('boot.ward?.nameBn'),
    );
    // And the bootstrap fallback only applies when no boundaries
    // have loaded.
    expect(wardRow).toMatch(
      /wards\.length > 0\s*\n?\s*\?\s*t\('report\.location\.ward_unresolved'[^\n]*\n\s*:\s*boot\.ward\?\.nameBn/,
    );
  });

  it('writes the RESOLVED ward into the draft', () => {
    expect(LOCATION_PAGE).toMatch(/wardId:\s*resolvedWard\.id/);
    // The old form wrote the static home ward.
    expect(LOCATION_PAGE).not.toMatch(
      /wardId:\s*boot\.ward\?\.id\s*\?\?\s*''/,
    );
  });

  it('builds the location label from the resolved ward', () => {
    expect(LOCATION_PAGE).toMatch(
      /resolvedWard\.nameBn\s*\?\?\s*resolvedWard\.name/,
    );
  });

  it('keeps the bootstrap fetch — other steps depend on it', () => {
    expect(LOCATION_PAGE).toMatch(/\/api\/report\/bootstrap/);
  });
});

describe('an unresolved ward blocks the report', () => {
  it('marks the unresolved state when the pin is in the city but in no ward', () => {
    expect(LOCATION_PAGE).toMatch(
      /wardUnresolved\s*=\s*!outOfBounds\s*&&\s*resolvedWard\s*===\s*null/,
    );
  });

  it('renders the unresolved notice', () => {
    expect(LOCATION_PAGE).toMatch(/report\.location\.ward_unresolved/);
    expect(LOCATION_PAGE).toMatch(/report\.location\.ward_outside_hint/);
  });

  it('does not file the report without a resolved ward', () => {
    // `handleContinue` must bail when nothing resolved.
    expect(LOCATION_PAGE).toMatch(
      /function handleContinue\(\)\s*\{\s*\n?\s*if \(!boot \|\| !resolvedWard\) return;/,
    );
    // And the Continue button must be disabled in that case.
    expect(LOCATION_PAGE).toMatch(/disabled=\{!resolvedWard\}/);
  });

  it('offers a one-tap recovery back into the home ward', () => {
    expect(LOCATION_PAGE).toMatch(/function handleMoveToHomeWard/);
    expect(LOCATION_PAGE).toMatch(/interiorPoint\(homeWard\)/);
  });
});

describe('the map draws the ward sections', () => {
  it('accepts the ward boundaries and the active ward', () => {
    expect(MAP_VIEW).toMatch(/wardBoundaries\?:\s*WardBoundary\[\]/);
    expect(MAP_VIEW).toMatch(/activeWardId\?:\s*string \| null/);
  });

  it('draws a fill and a line layer for the wards', () => {
    expect(WARD_LAYERS).toMatch(/id:\s*WARD_FILL_LAYER_ID/);
    expect(WARD_LAYERS).toMatch(/id:\s*WARD_LINE_LAYER_ID/);
    expect(WARD_LAYERS).toMatch(/id:\s*WARD_ACTIVE_FILL_LAYER_ID/);
    expect(WARD_LAYERS).toMatch(/id:\s*WARD_ACTIVE_LINE_LAYER_ID/);
  });

  it('highlights the active ward by its id', () => {
    // The highlight is a `filter` on the ward's id property.
    expect(WARD_LAYERS).toMatch(/\['get',\s*'wardId'\]/);
  });

  it('suppresses the district fill while the wards are drawn', () => {
    // Two stacked translucent fills wash the basemap out.
    expect(MAP_VIEW).toMatch(
      /showBoundary\s*&&\s*wardBoundaries\.length\s*===\s*0/,
    );
  });

  it('passes the boundaries and the active ward from the page', () => {
    expect(LOCATION_PAGE).toMatch(/wardBoundaries=\{wards\}/);
    expect(LOCATION_PAGE).toMatch(/activeWardId=\{resolvedWard\?\.id \?\? null\}/);
  });
});

describe('the resolver is the single source of truth', () => {
  it('is a pure module with no server-only imports', () => {
    // The client bundle imports it, so it must not reach for the
    // database, the session, or Node built-ins.
    expect(WARD_LOOKUP).not.toMatch(/from '@\/lib\/db-switch'/);
    expect(WARD_LOOKUP).not.toMatch(/from 'node:/);
    expect(WARD_LOOKUP).not.toMatch(/from 'fs'/);
  });

  it('resolves exactly one ward per point', () => {
    expect(WARD_LOOKUP).toMatch(/export function findWardAt/);
    expect(WARD_LOOKUP).toMatch(/export function findWardByNumber/);
  });
});
