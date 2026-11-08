/**
 * Vitest: the OpenAPI specification must match the live route handlers.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `lib/docs/openapi.ts` is a hand-written document. Its own accuracy
 * rule #1 says every path and method "was read from the corresponding
 * route file" — but nothing *enforced* that. The type checker validates
 * that a `$ref` resolves, not that a documented operation has a handler
 * behind it, so a method could be invented in the spec and the build
 * would stay green.
 *
 * It did. On 2026-11-08 the production-readiness audit reconciled the
 * 61 route files against the spec and found the spec documenting
 * `PATCH` and `DELETE` on `/api/tickets/{id}` — operations that have
 * never existed. `app/api/tickets/[id]/route.ts` exports only `GET`
 * (line 17). The Swagger UI at `/api/docs` therefore told a developer
 * that a citizen can edit or delete their own report; both requests
 * return 405. `tsc --noEmit` cannot catch this class of defect, and no
 * test could catch it either, because the spec and the routes were only
 * ever compared by hand.
 *
 * THIS TEST IS THE DURABLE FIX: it compares the two mechanically, on
 * every unit run, so the next phantom method fails the build instead of
 * shipping.
 *
 * HOW IT WORKS
 * ------------
 * 1. Every `app/api/**\/route.ts` file is read from disk and its
 *    exported HTTP methods are extracted. The route file is the source
 *    of truth — this test never imports a handler, because importing
 *    61 route modules would pull the whole app into the unit process
 *    for no gain. The extraction is a regex over the export statement,
 *    which is the only shape Next.js 14 App Router accepts for a
 *    handler (`export async function GET(...)`), and this file asserts
 *    that every route uses that shape so a future refactor to
 *    `export const GET = ...` fails loudly here rather than silently
 *    dropping a method from the comparison.
 *
 * 2. The live paths are compared against `openapiPaths` in both
 *    directions: every documented operation must have a handler, and
 *    every handler must be documented.
 *
 * 3. Two route groups are excluded by design, not by convenience:
 *    - `/api/dev/**` — dev-only session minting. Documenting them
 *      would advertise a login bypass in the published contract, and
 *      the spec's own test file already asserts no dev route is
 *      documented.
 *    - `/api/docs/**` — the Swagger UI and the spec endpoint
 *      themselves. They serve the document; they are not part of the
 *      documented contract.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { openapiPaths } from '@/lib/docs/openapi';

type JsonObject = Record<string, unknown>;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof METHODS)[number];

const ROOT = resolve(process.cwd());
const API_DIR = join(ROOT, 'app', 'api');

/**
 * The route prefix for the versioned API. Every documented path and
 * every live route file lives under `/api/...`, but the route files
 * sit at `app/api/**` — so the live path is relative to `app/api`
 * (`/v1/tickets`) while the spec path is absolute (`/api/v1/tickets`).
 * Both sides are normalised to the absolute form here.
 */
const API_PREFIX = '/api';

/**
 * Route groups that are deliberately outside the documented contract.
 * Each exclusion is a decision, so each one carries its reason here —
 * an unexplained exclusion is how a spec check quietly stops checking.
 */
const EXCLUDED_PREFIXES: ReadonlyArray<{ prefix: string; reason: string }> = [
  {
    prefix: '/api/dev',
    reason:
      'dev-only session minting; documenting it would advertise a login bypass in the published contract',
  },
  {
    prefix: '/api/docs',
    reason: 'the Swagger UI and the spec endpoint themselves serve the document',
  },
];

function isExcluded(path: string): boolean {
  return EXCLUDED_PREFIXES.some((entry) => path.startsWith(entry.prefix));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

/**
 * `app/api/v1/dispatcher/tickets/[id]/route.ts` → `/api/v1/dispatcher/tickets/{id}`
 */
function livePathFor(file: string): string {
  const relativePath = relative(API_DIR, file).replace(/\\/g, '/');
  const routePath = relativePath
    .replace(/\/route\.ts$/, '')
    .replace(/\[\[?([^\]]+?)\]\]?/g, '{$1}');
  return `${API_PREFIX}/${routePath}`;
}

/**
 * The exported HTTP methods of one route file.
 *
 * Next.js 14 App Router only recognises a handler exported as a
 * named function (`export async function GET`). This regex therefore
 * also serves as a shape assertion: if a route ever moves to
 * `export const GET = ...`, the method disappears from this map and
 * the "every route uses the function-export shape" test below fails
 * with a clear message instead of the parity tests failing on a
 * confusing "missing operation" diff.
 */
function methodsIn(file: string): Set<Method> {
  const source = readFileSync(file, 'utf8');
  const found = new Set<Method>();
  for (const method of METHODS) {
    const pattern = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${method.toUpperCase()}\\s*\\(`,
    );
    if (pattern.test(source)) found.add(method);
  }
  return found;
}

/** The live route surface, keyed by path. */
const liveRoutes = new Map<string, Set<Method>>(
  walk(API_DIR).map((file) => [livePathFor(file), methodsIn(file)]),
);

/** The documented route surface, keyed by path. */
const documentedRoutes = new Map<string, Set<Method>>(
  Object.entries(openapiPaths).map(([path, pathItem]) => [
    path,
    new Set(
      METHODS.filter((method) => (pathItem as JsonObject)[method] !== undefined),
    ),
  ]),
);

describe('the route-handler surface', () => {
  test('every route file was found', () => {
    // 61 as of 2026-11-08. The exact number is asserted because a
    // silent drop to zero (a bad glob, a moved directory) would make
    // every parity test vacuously pass.
    expect(liveRoutes.size).toBe(61);
  });

  test('every route file exports its handlers as named functions', () => {
    const offenders: string[] = [];
    for (const file of walk(API_DIR)) {
      const source = readFileSync(file, 'utf8');
      const shape =
        /export\s+(?:async\s+)?function\s+[A-Z]+\s*\(/.test(source);
      if (!shape) offenders.push(relative(ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  test('every route file exports at least one HTTP method', () => {
    const offenders = [...liveRoutes.entries()]
      .filter(([, methods]) => methods.size === 0)
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});

describe('the OpenAPI spec and the live routes agree', () => {
  test('no documented operation is missing a route handler', () => {
    const phantom: string[] = [];
    for (const [path, methods] of documentedRoutes) {
      const live = liveRoutes.get(path);
      if (!live) {
        phantom.push(`${path} — no route file at all`);
        continue;
      }
      for (const method of methods) {
        if (!live.has(method)) {
          phantom.push(`${method.toUpperCase()} ${path} — documented but no handler exports it`);
        }
      }
    }
    expect(phantom).toEqual([]);
  });

  test('no live route handler is missing from the spec', () => {
    const undocumented: string[] = [];
    for (const [path, methods] of liveRoutes) {
      if (isExcluded(path)) continue;
      const documented = documentedRoutes.get(path);
      if (!documented) {
        undocumented.push(`${path} — implemented but not documented`);
        continue;
      }
      for (const method of methods) {
        if (!documented.has(method)) {
          undocumented.push(`${method.toUpperCase()} ${path} — implemented but not documented`);
        }
      }
    }
    expect(undocumented).toEqual([]);
  });

  test('the excluded route groups are exactly the two declared ones', () => {
    // If a third group is ever excluded from the spec, this test fails
    // and the exclusion has to be declared above with a reason.
    const excludedLive = [...liveRoutes.keys()].filter(isExcluded).sort();
    expect(excludedLive).toEqual([
      '/api/dev/bootstrap-admin',
      '/api/dev/issue-session',
      '/api/dev/list-users',
      '/api/dev/login',
      '/api/dev/promote-admin',
      '/api/dev/reset',
      '/api/docs',
      '/api/docs/spec',
    ]);
  });

  test('no dev or docs route is documented', () => {
    for (const path of documentedRoutes.keys()) {
      expect(isExcluded(path)).toBe(false);
    }
  });
});

describe('the historical defect this file was written for', () => {
  test('PATCH and DELETE on /api/tickets/{id} are not documented', () => {
    // Regression pin for the exact defect the 2026-11-08 audit found:
    // the spec invented two operations that never existed. If a future
    // Bolt implements them for real, this test must be updated in the
    // same commit that adds the handlers — the parity tests above
    // already cover that path.
    const item = openapiPaths['/api/tickets/{id}'] as JsonObject;
    expect(item.patch).toBeUndefined();
    expect(item.delete).toBeUndefined();
    expect(item.get).toBeDefined();
  });
});
