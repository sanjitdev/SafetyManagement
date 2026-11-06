/**
 * Vitest: the role→surface redirect is applied at EVERY entry point.
 *
 * The mapping in `lib/role-home.ts` was always correct and always
 * unit-tested. The bug was in the CALL SITES: the site root
 * (`app/page.tsx`) redirected every authenticated user with a
 * hard-coded `redirect('/home')`, so an admin who hit `/` with a live
 * session landed on the citizen feed instead of the admin console.
 *
 * A unit test on the mapping cannot catch that — the mapping was
 * never wrong. So this test reads the SOURCE of the redirect entry
 * points and asserts they route by role.
 *
 * Why a source scan and not a DOM/browser test: a Playwright test can
 * prove the CURRENT behaviour, but it silently stops protecting the
 * code if someone edits the file in a way the test's selectors don't
 * reach. This scan fails on the pattern itself, so any new
 * role-blind redirect is caught at review time rather than at release
 * time. The Playwright companion
 * (`tests/30-role-redirect.spec.ts`) proves the real behaviour
 * end-to-end.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = join(__dirname, '..', '..');

/**
 * The entry points that decide where a signed-in user lands.
 *
 * Each one must route by ROLE. `app/page.tsx` is the site root — the
 * one that was broken. `app/splash/page.tsx` and `app/login/page.tsx`
 * are included so a future regression there is caught too.
 */
const ENTRY_POINTS = [
  'app/page.tsx',
  'app/splash/page.tsx',
  'app/login/page.tsx',
];

/**
 * A call that routes BY ROLE.
 *
 * Two shapes qualify:
 *   - `roleHome(...)` — the direct mapping.
 *   - `resolvePostAuthTarget(...)` — the role-aware resolver, which
 *     routes by role AND refuses a `?next=` deep link the role may not
 *     follow. The login page uses this one because it has a deep link
 *     to honour; the site root does not.
 *
 * A literal path in either position is a role-blind landing.
 */
const ROLE_ROUTING_CALL = /\b(roleHome|resolvePostAuthTarget)\s*\(/;

/**
 * The dev-only persona switcher. The admin persona used to land on
 * `/home` there on the strength of a comment claiming the admin
 * console was "deferred" — it is not deferred, it exists.
 */
const DEV_ENTRY_POINTS = ['app/api/dev/login/route.ts'];

/**
 * A role-blind SERVER-SIDE redirect: a `redirect(...)` call whose
 * argument is a literal path rather than a call to `roleHome(...)`.
 *
 * Only server-side `redirect()` is scanned, NOT `router.push` /
 * `router.replace`. The difference matters:
 *
 *   - `redirect()` in a server component decides where a SIGNED-IN
 *     user lands. A literal there is a role-blind landing.
 *   - `router.push('/home')` inside a button handler is a user
 *     CHOOSING a destination. `app/report/[id]/submitted/page.tsx`
 *     has one — the "back to home" button on the citizen's
 *     report-submitted confirmation — and it is correct, because
 *     only a citizen can reach that page.
 *
 * Comments are stripped before scanning so that prose describing a
 * past bug (or a docblock quoting the old code) is not mistaken for
 * live code.
 */
const LITERAL_REDIRECT = /redirect\(\s*['"`](\/[^'"`]*)['"`]\s*\)/g;

/** The citizen home — the one literal that is legitimately role-correct. */
const CITIZEN_HOME = '/home';

/**
 * Strip comments so the scan only sees live code.
 *
 * Block comments and line comments are removed; string literals are
 * left alone (a path inside a string is not a comment).
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Read every `.tsx`/`.ts` file under a directory tree.
 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('the role→surface redirect is applied at every entry point', () => {
  it.each(ENTRY_POINTS)('%s routes by role, not by a hard-coded path', (rel) => {
    const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
    expect(
      ROLE_ROUTING_CALL.test(src),
      `${rel} does not route by role (no roleHome() or resolvePostAuthTarget() call) — an authenticated user reaching this route may be sent to the wrong surface for their role.`,
    ).toBe(true);
  });

  it('app/page.tsx redirects by session role, not to a literal /home', () => {
    // Comments are stripped: the docblock quotes the OLD
    // `redirect('/home')` when explaining the bug, and that prose
    // must not read as live code.
    const src = stripComments(
      readFileSync(join(REPO_ROOT, 'app/page.tsx'), 'utf8'),
    );
    // The specific defect: `redirect('/home')` on a session.
    expect(
      /redirect\(\s*['"`]\/home['"`]\s*\)/.test(src),
      'app/page.tsx still redirects every authenticated user to /home. It must call roleHome(session.role) so a dispatcher, crew member or admin lands on their own surface.',
    ).toBe(false);
    expect(
      /redirect\(\s*roleHome\(/.test(src),
      'app/page.tsx must redirect with roleHome(session.role).',
    ).toBe(true);
  });

  it('app/login/page.tsx routes by the role the API returned', () => {
    const src = readFileSync(join(REPO_ROOT, 'app/login/page.tsx'), 'utf8');
    // The login page has a `?next=` deep link to honour, so it uses the
    // role-aware resolver rather than the bare mapping. Either shape is
    // acceptable as long as the API's role is what drives the routing.
    expect(src).toMatch(
      /(roleHome|resolvePostAuthTarget)\(\s*data\?\.role/,
    );
  });

  it('app/login/page.tsx refuses a deep link the role may not follow', () => {
    // The deep link must go through the RESOLVER, not be used
    // directly. `router.replace(explicitNext ? nextPath : ...)` is the
    // role-blind shape that sent an admin who signed in from the
    // public landing onto the citizen's report form.
    const src = stripComments(
      readFileSync(join(REPO_ROOT, 'app/login/page.tsx'), 'utf8'),
    );
    expect(
      /router\.replace\(\s*explicitNext\s*\?/.test(src),
      'app/login/page.tsx must not use a raw `?next=` value as the redirect target. It must pass the deep link through resolvePostAuthTarget() so the role can refuse it.',
    ).toBe(false);
    expect(
      /resolvePostAuthTarget\(/.test(src),
      'app/login/page.tsx must route the post-auth target through resolvePostAuthTarget().',
    ).toBe(true);
  });

  it('app/splash/page.tsx routes by the session role', () => {
    const src = readFileSync(join(REPO_ROOT, 'app/splash/page.tsx'), 'utf8');
    // The splash reads the role from the shared `SessionProvider`
    // (`session?.role`) rather than from its own `/api/auth/status`
    // response body (`data.session?.role`) — one shared request for
    // the whole page instead of one per call site.
    expect(src).toMatch(/roleHome\(\s*session\?\.role\s*\)/);
  });

  it.each(DEV_ENTRY_POINTS)('%s sends each staff persona to its own surface', (rel) => {
    const src = readFileSync(join(REPO_ROOT, rel), 'utf8');
    // No staff persona may land on the citizen home.
    for (const role of ['dispatcher', 'crew', 'admin']) {
      const re = new RegExp(`${role}:\\s*['"\`]\\/home['"\`]`, 'g');
      expect(
        re.test(src),
        `${rel} sends the ${role} persona to /home. The staff personas must use the shared ROLE_HOME mapping.`,
      ).toBe(false);
    }
  });

  it('no app route hard-codes a server-side redirect to the citizen home', () => {
    // Sweep every page under app/ for a literal server-side
    // `redirect('/home')`. A server-side redirect is what decides
    // where a SIGNED-IN user lands, so a literal there is a
    // role-blind landing.
    const offenders: string[] = [];
    for (const file of collectSourceFiles(join(REPO_ROOT, 'app'))) {
      const rel = relative(REPO_ROOT, file);
      if (rel.startsWith('app/api/')) continue; // API routes never redirect
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const match of src.matchAll(LITERAL_REDIRECT)) {
        const target = match[1] ?? match[2];
        if (target === CITIZEN_HOME) {
          offenders.push(`${rel}: literal redirect to ${target}`);
        }
      }
    }
    expect(
      offenders,
      `These routes redirect to the citizen home with a literal path, so a staff user who lands on them is dumped on the citizen feed:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
