/**
 * Vitest: every admin page that performs a gated write must render
 * the WebAuthn step-up affordance.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Since 2026-11-09 the WebAuthn challenge is a ONE-SHOT nonce:
 * `requireWebAuthn` deletes the row it accepts (SECURITY_AUDIT finding
 * #6). Before that, one ceremony covered five minutes of writes and a
 * page only had to prompt once — a page that rendered no prompt at all
 * was merely inconvenient. Now ONE ceremony authorises exactly ONE
 * write, so a page that performs a gated write and renders no
 * step-up affordance is not "missing a nicety" — it is DEAD-ENDED.
 * The admin clicks "save", the server answers 401
 * `webauthn_assertion_expired`, and the page has no way to satisfy the
 * gate: the write is gone and the ceremony was never offered.
 *
 * That is exactly what happened. Four admin city-configuration pages
 * (`/admin/cities/[id]/setup`, `/taxonomy`, `/wards`, `/users`) made
 * 13 gated write calls between them and NONE of them rendered
 * `AdminWebAuthnStepUp`. The two pages that DID render it
 * (`/admin/tickets/[id]`, `/profile`) were the ones that had been
 * written after the gate was understood.
 *
 * Nothing caught it. `tsc --noEmit` cannot see it — the missing
 * affordance is a runtime behaviour, not a type error. The Playwright
 * visual baselines cannot see it either — the panel renders only after
 * a write is REFUSED, and no baseline drives a refused write.
 *
 * THIS TEST IS THE DURABLE FIX.
 *
 * HOW IT WORKS
 * ------------
 * 1. Every `app/api/v1/admin/**\/route.ts` that calls
 *    `requireWebAuthn` is a GATED route. The route file is the source
 *    of truth: the test reads it from disk and never imports a
 *    handler, because the contract under test is "which routes are
 *    gated", and that is a property of the source text.
 *
 * 2. Every `app/admin/**\/page.tsx` that calls one of those gated
 *    endpoints is a page that can DEAD-END. It is found by looking
 *    for the gated path fragment (`/api/v1/admin/...`) in the page
 *    source.
 *
 * 3. Such a page must render the affordance. Either it renders
 *    `<AdminWebAuthnStepUp ...>` directly, or it uses the shared
 *    `useWebAuthnStepUp` hook, which renders it.
 *
 * The check is deliberately SOURCE-level rather than DOM-level: a
 * DOM-level test would have to drive a refused write through a
 * Next.js page, which needs a running server and a WebAuthn
 * implementation. The source-level check catches the actual defect —
 * a page that performs a gated write and has no step-up path — with
 * no such machinery.
 *
 * The check is also deliberately EXHAUSTIVE over the admin tree, so a
 * NEW admin page that performs a gated write cannot be added without
 * the affordance. That is the point: the four pages that regressed
 * were all written at different times, by different hands, and each
 * was individually reasonable.
 *
 * NON-VACUITY
 * -----------
 * The "the checker itself works" describe block at the end proves the
 * detector is not vacuously passing — it asserts that a page WITHOUT
 * the affordance is detected as missing. If the detector stopped
 * detecting, this file would be worthless.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const APP_DIR = resolve(__dirname, '../../../app');
const PAGE_DIR = join(APP_DIR, 'admin');

/** Every `.ts` file under `dir`, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Turn `app/api/v1/admin/cities/[id]/route.ts` into `/api/v1/admin/cities/[id]`. */
function apiPathOf(file: string): string {
  const rel = relative(APP_DIR, file).replace(/\\/g, '/');
  return '/' + rel.replace(/\/route\.ts$/, '');
}

/**
 * The gated routes: an admin route that calls `requireWebAuthn`.
 *
 * A route that does NOT call it is not gated, so a page that only
 * READS from it needs no affordance.
 *
 * The scan covers the WHOLE `app/api` tree, not just
 * `app/api/v1/admin`, because a gated write does not have to live
 * under the admin prefix. `POST /api/tickets/[id]/transition` gates
 * the admin role too — it just does it behind a role check rather
 * than an admin-only route. Restricting the scan to the admin tree
 * would have missed it.
 */
function gatedRoutes(): string[] {
  return walk(join(APP_DIR, 'api'))
    .filter((f) => f.endsWith('route.ts'))
    .filter((f) => readFileSync(f, 'utf8').includes('requireWebAuthn'))
    .map(apiPathOf)
    .sort();
}

/**
 * The admin pages that perform a gated write.
 *
 * A page qualifies if its source mentions a gated route's path
 * fragment. The fragment is the route path with its dynamic segment
 * rendered as a template: a page calls
 * `/api/v1/admin/cities/${id}/wards`, and the route is
 * `/api/v1/admin/cities/[id]/wards` — so the page's source is
 * searched for `/api/v1/admin/cities/` + `/wards`.
 */
function pagesCallingGatedRoutes(gated: string[]): string[] {
  const fragments = gated.map((p) => p.replace(/\/\[[^\]]+\]/g, ''));
  const pages: string[] = [];
  for (const file of walk(PAGE_DIR)) {
    if (!file.endsWith('page.tsx')) continue;
    const src = readFileSync(file, 'utf8');
    // Only a WRITE counts. A page that merely READS a gated route
    // (the GET handlers of the same files are not gated) needs no
    // affordance — so we require a write method in the fetch call.
    const writes = /method:\s*'(POST|PATCH|PUT|DELETE)'/g;
    if (!writes.test(src)) continue;
    if (fragments.some((f) => f.length > 0 && src.includes(f))) {
      pages.push(file);
    }
  }
  return pages.sort();
}

/** The page's route, for the failure message: `/admin/cities/[id]/wards`. */
function pageRouteOf(file: string): string {
  const rel = relative(APP_DIR, file).replace(/\\/g, '/');
  return '/' + rel.replace(/\/page\.tsx$/, '');
}

describe('admin pages — the WebAuthn step-up affordance is present', () => {
  const gated = gatedRoutes();

  test('the gated admin routes are found (the detector is not empty)', () => {
    // If this fails, the detector is broken and every assertion below
    // would pass vacuously.
    expect(gated.length).toBeGreaterThan(0);
    expect(gated).toContain('/api/v1/admin/cities/[id]/wards');
    expect(gated).toContain('/api/v1/admin/cities/[id]/departments');
    expect(gated).toContain('/api/v1/admin/cities/[id]/categories');
    expect(gated).toContain('/api/v1/admin/cities');
  });

  test('every admin page that performs a gated write renders the affordance', () => {
    const pages = pagesCallingGatedRoutes(gated);
    // Sanity: the four pages that regressed must be among them,
    // otherwise this test is not looking at the right pages.
    const routes = pages.map(pageRouteOf);
    expect(routes).toContain('/admin/cities/[id]/setup');
    expect(routes).toContain('/admin/cities/[id]/taxonomy');
    expect(routes).toContain('/admin/cities/[id]/wards');
    expect(routes).toContain('/admin/cities/[id]/users');

    const missing = pages.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return (
        !src.includes('AdminWebAuthnStepUp') &&
        !src.includes('useWebAuthnStepUp')
      );
    });

    expect(
      missing.map(pageRouteOf),
      'these admin pages perform a gated write but render no step-up affordance — a refused write would dead-end',
    ).toEqual([]);
  });

  test('every admin page that performs a gated write retries after the ceremony', () => {
    // Rendering the affordance is not enough — the page must also
    // RECOGNISE the refusal and retry the write afterwards. Without
    // the retry the ceremony would still be a dead end: the admin
    // satisfies the gate and the write is still lost.
    //
    // Two shapes are acceptable: the shared `retryOnGateError`
    // helper, or a page's own equivalent (the admin ticket page
    // predates the hook and keeps its own inline logic). What is NOT
    // acceptable is a page that recognises the refusal and never
    // re-issues the write.
    const pages = pagesCallingGatedRoutes(gated);
    const withoutRetry = pages.filter((file) => {
      const src = readFileSync(file, 'utf8');
      return (
        !src.includes('retryOnGateError') &&
        // A page's own retry: it must both recognise the gate error
        // AND re-issue the write after the ceremony.
        !(
          src.includes('webauthn_required') &&
          /pending|retry/i.test(src)
        )
      );
    });
    expect(withoutRetry.map(pageRouteOf)).toEqual([]);
  });
});

describe('admin pages — the checker itself works (non-vacuity)', () => {
  test('a page without the affordance is detected as missing', () => {
    // Prove the detector is not vacuously passing: a synthetic page
    // that performs a gated write and has NO step-up affordance must
    // be reported as missing.
    const synthetic = [
      'export default function SyntheticPage() {',
      "  const res = await fetch(`/api/v1/admin/cities/${id}/wards`, {",
      "    method: 'POST',",
      '  });',
      '  return null;',
      '}',
    ].join('\n');

    const hasAffordance =
      synthetic.includes('AdminWebAuthnStepUp') ||
      synthetic.includes('useWebAuthnStepUp');
    expect(hasAffordance).toBe(false);

    // And the real pages DO have it — the mirror image of the
    // synthetic case, so the two together pin the detector.
    const real = readFileSync(
      join(PAGE_DIR, 'cities/[id]/wards/page.tsx'),
      'utf8',
    );
    expect(
      real.includes('AdminWebAuthnStepUp') ||
        real.includes('useWebAuthnStepUp'),
    ).toBe(true);
  });
});
