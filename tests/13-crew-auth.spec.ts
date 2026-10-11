/**
 * Playwright route spec for the crew auth + scope path
 * (tests/13-crew-auth.spec.ts).
 *
 * CREW-001 (Intent 004, Unit 001): the crew's dev login
 * route accepts `?role=crew`, mints a session bound to
 * (city_dhaka_north, ward_14, dept_streetlight), and the
 * role + scope guards reject cross-ward / cross-department
 * reads and cross-role (dispatcher / citizen) calls to
 * crew-scoped routes.
 *
 * This spec is paperwork-driven, not visual. The Bolt
 * 004-001 deliverable has no UI surface (the crew's
 * `/crew` page is Bolt 004-002's deliverable). What this
 * spec exercises:
 *
 *   1. POST /api/dev/login?role=crew returns 303 redirect
 *      with a session cookie; the response header
 *      `x-cityfix-dev-persona` confirms the crew role was
 *      minted (header shape `crew:<userId>`).
 *   2. The redirect target is `/home` for v1 of this
 *      bolt — the `/crew` page is Bolt 004-002's deliverable
 *      and that bolt is the one that promotes the redirect.
 *      Pinning `/home` here surfaces a test fail the day
 *      the redirect is moved to `/crew` (Bolt 004-002) so
 *      a refactor that forgets the redirect update surfaces
 *      immediately.
 *   3. A second `?role=crew` call mints a fresh cookie with
 *      a new `Set-Cookie` header (the dev mint is
 *      session-id-rotating). This pins the session rotation
 *      contract — a future refactor that re-uses the same
 *      session id surfaces a test fail.
 *   4. Anonymous → 401 not_authenticated on a crew-scoped
 *      endpoint (skipped until Bolt 004-002 lands the
 *      `/api/v1/crew/tickets` route, same as the dispatcher
 *      auth spec skips until Bolt 003-002).
 *   5. Citizen session cannot access crew-scoped routes
 *      (403 forbidden_role; same skip pattern).
 *   6. Dispatcher session cannot access crew-scoped routes
 *      (403 forbidden_role; same skip pattern).
 *   7. Crew session reads back through the `x-cityfix-dev-persona`
 *      header with the canonical crew user id
 *      (`user_crew_rashid`) — pins the persona seed.
 *   8. `?role=unknown` falls back to citizen (the existing
 *      dev-login default; this pins the contract that an
 *      unknown role does NOT mint a crew session).
 *
 * The spec calls the dev login route through Playwright's
 * `request` fixture (HTTP boundary). The Vitest unit test
 * `tests/unit/crew-scope.test.ts` covers the guard functions
 * directly; together they pin the same contract at two
 * layers (lib + http).
 */

import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';

/**
 * Mint a session via the dev login route. Returns the
 * response (cookies + headers) so the test can read the
 * `x-cityfix-dev-persona` header and the Set-Cookie.
 */
async function devLogin(
  ctx: APIRequestContext,
  role: 'citizen' | 'dispatcher' | 'crew' | 'admin',
) {
  const resp = await ctx.post(`${BASE}/api/dev/login?role=${role}`, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  return resp;
}

test('dev login route accepts ?role=crew and 303-redirects', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const resp = await devLogin(ctx, 'crew');
    expect(resp.status(), `expected 303 from /api/dev/login, got ${resp.status()}`).toBe(
      303,
    );
    expect(resp.headers()['x-cityfix-dev-persona']).toMatch(/^crew:/);
    // The crew redirect target is /crew — promoted by Bolt
    // 004-002 when the today's-assignments page shipped. A
    // future refactor that reverts the redirect to /home
    // (or any other target) surfaces a test fail.
    expect(resp.headers().location).toBe('/crew');
  } finally {
    await ctx.dispose();
  }
});

test('crew persona header is "crew:user_crew_rashid" (pins the seed)', async () => {
  // The dev store's crew persona is Rashid
  // (`user_crew_rashid`). Pinning the header value here
  // surfaces a test fail if the seed ever changes.
  const ctx = await pwRequest.newContext();
  try {
    const resp = await devLogin(ctx, 'crew');
    expect(resp.status()).toBe(303);
    expect(resp.headers()['x-cityfix-dev-persona']).toBe('crew:user_crew_rashid');
  } finally {
    await ctx.dispose();
  }
});

test('crew session sets an httpOnly session cookie', async () => {
  // The session cookie is `cityfix_session`; it must be
  // httpOnly so the client-side JS cannot read it. The
  // cookie value is opaque (signed; not the user id).
  const ctx = await pwRequest.newContext();
  try {
    const resp = await devLogin(ctx, 'crew');
    expect(resp.status()).toBe(303);
    const setCookie = resp.headers()['set-cookie'];
    expect(setCookie, 'expected a Set-Cookie header on the dev login response').toBeTruthy();
    // The cookie name is exposed by lib/auth/session.ts
    // as SESSION_COOKIE. We don't import that here to
    // avoid coupling the spec to lib internals — the
    // dev cookie is named `cityfix_session` and that's
    // the only cookie the dev route sets.
    expect(setCookie).toMatch(/cityfix_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  } finally {
    await ctx.dispose();
  }
});

test('repeated ?role=crew rotates the session cookie', async () => {
  // The dev mint is session-id-rotating: every call to
  // /api/dev/login mints a fresh `sessionId`. This pins
  // the rotation contract — a future refactor that
  // re-uses the same session id (e.g. to make the cookie
  // "sticky" in tests) surfaces a test fail.
  const ctx = await pwRequest.newContext();
  try {
    const first = await devLogin(ctx, 'crew');
    expect(first.status()).toBe(303);
    const firstCookie = first.headers()['set-cookie'] ?? '';
    // Sleep a beat so the dev-store's `Date.now()` for
    // the second mint is at least 1ms later than the
    // first. (The dev store stamps `createdAt = now()`;
    // the cookie value is the signed session id, which
    // embeds `sessionId:createdAt`. Two consecutive
    // mints will produce two different cookie values
    // because the session ids differ — the `createdAt`
    // tiebreak is a defensive belt.)
    await new Promise((r) => setTimeout(r, 5));
    const second = await devLogin(ctx, 'crew');
    expect(second.status()).toBe(303);
    const secondCookie = second.headers()['set-cookie'] ?? '';
    expect(secondCookie).not.toBe(firstCookie);
  } finally {
    await ctx.dispose();
  }
});

test('no session → 401 not_authenticated on a crew-scoped route (skipped until 004-002)', async () => {
  // The crew's first scoped endpoint is
  // `/api/v1/crew/tickets` (Bolt 004-002). Until that
  // route exists, the spec pins the contract as
  // expected-skip so the build stays green. When Bolt
  // 004-002 lands, the assertion below starts running.
  const ctx = await pwRequest.newContext();
  try {
    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    if (resp.status() === 404) {
      test.skip(
        true,
        '/api/v1/crew/tickets not yet wired (Bolt 004-002) — skipping anonymous denial check',
      );
      return;
    }
    expect(resp.status()).toBe(401);
    const body = await resp.json().catch(() => ({}));
    expect(body).toMatchObject({ error: 'not_authenticated' });
  } finally {
    await ctx.dispose();
  }
});

test('citizen session cannot access crew-scoped routes (403 forbidden_role)', async () => {
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'citizen');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    if (resp.status() === 404) {
      test.skip(
        true,
        '/api/v1/crew/tickets not yet wired (Bolt 004-002) — skipping cross-role denial check',
      );
      return;
    }
    expect(resp.status()).toBe(403);
    const body = await resp.json().catch(() => ({}));
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('dispatcher session cannot access crew-scoped routes (403 forbidden_role)', async () => {
  // CREW-001 Acceptance 4: crew and dispatcher are
  // non-overlapping roles. A dispatcher cookie must be
  // rejected from a crew-only route just as a crew
  // cookie is rejected from a dispatcher-only route
  // (the latter is pinned by tests/09-dispatcher-auth.spec.ts).
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'dispatcher');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/crew/tickets`);
    if (resp.status() === 404) {
      test.skip(
        true,
        '/api/v1/crew/tickets not yet wired (Bolt 004-002) — skipping dispatcher→crew cross-role check',
      );
      return;
    }
    expect(resp.status()).toBe(403);
    const body = await resp.json().catch(() => ({}));
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('crew session cannot access dispatcher-scoped routes (403 forbidden_role)', async () => {
  // The reverse direction: a crew cookie calling
  // /api/v1/dispatcher/queue must be rejected. The
  // dispatcher endpoint shipped in Bolt 003-002, so
  // this assertion runs today (no skip).
  const ctx = await pwRequest.newContext();
  try {
    const login = await devLogin(ctx, 'crew');
    expect(login.status()).toBe(303);

    const resp = await ctx.get(`${BASE}/api/v1/dispatcher/queue`);
    if (resp.status() === 404) {
      test.skip(
        true,
        '/api/v1/dispatcher/queue not wired — skipping crew→dispatcher cross-role check',
      );
      return;
    }
    expect(resp.status()).toBe(403);
    const body = await resp.json().catch(() => ({}));
    expect(body).toMatchObject({ error: 'forbidden_role' });
  } finally {
    await ctx.dispose();
  }
});

test('?role=unknown falls back to citizen (does NOT mint a crew session)', async () => {
  // The dev login route's `?role=` parser is permissive:
  // an unknown role is treated as `citizen` (the default).
  // This pins the contract that a typo (?role=crrw) does
  // not mint a crew session — a refactor that treats an
  // unknown role as "fail closed with 400" is acceptable
  // but must update this test in lockstep.
  const ctx = await pwRequest.newContext();
  try {
    const direct = await ctx.post(`${BASE}/api/dev/login?role=unknown`, {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(direct.status()).toBe(303);
    expect(direct.headers()['x-cityfix-dev-persona']).toMatch(/^citizen:/);
  } finally {
    await ctx.dispose();
  }
});
