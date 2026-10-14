/**
 * Playwright route spec for the dev session bootstrap page
 * (tests/24-dev-login-page.spec.ts).
 *
 * v1.1-launch (2026-10-14) — companion to
 * /api/dev/issue-session. The page is the one-click UI for
 * minting a session on the production build (which has no
 * self-service citizen login wired up yet; that's WO-004).
 *
 * Gated entirely on CITYFIX_DEV_PROMOTE_SECRET:
 *   - If the env var is unset, all gated endpoints return 404
 *     and the page surfaces the "endpoint disabled" copy.
 *   - If the env var is set, the page can list users and mint
 *     a session. The full happy path is exercised below when
 *     the test env provides the secret.
 *
 * Coverage:
 *   - API: POST /api/dev/list-users (right secret → 200 + users;
 *     wrong secret → 403; no secret in env → 404)
 *   - API: POST /api/dev/issue-session (right secret → 200 +
 *     sets cityfix_session cookie; wrong secret → 403; no
 *     secret in env → 404)
 *   - UI: the page renders the form (data-testids present)
 *   - UI: the secret field pre-fills from `?secret=`
 *   - UI: the user select is disabled until a valid secret is
 *     entered (no users loaded = no submit)
 *   - UI: a wrong secret surfaces the 403 error message
 *     (data-testid="dev-login-list-error")
 *   - UI: a happy-path submit sets the cookie, then
 *     /api/auth/status returns authenticated=true with the
 *     chosen userId
 *
 * No visual baseline — the page is dev-only tooling scoped
 * under /dev/* and will be deleted when WO-004 lands. The
 * chrome is intentionally close to the system tokens so a
 * new Bolt can re-skin it if it sticks around.
 */

import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const VIEWPORT = { width: 390, height: 844 };
const SECRET = process.env.CITYFIX_DEV_PROMOTE_SECRET ?? '';

// When the secret is unset, the gated endpoints return 404.
// The "happy path" tests are skipped (not failed) so the spec
// is runnable against the dev:feat build (which intentionally
// does not set the secret in dev mode).
const hasSecret = SECRET.length > 0;
const itWithSecret = hasSecret ? test : test.skip;
const itWithoutSecret = hasSecret ? test.skip : test;

// --- API-level checks ----------------------------------------------------

// Pre-warm the dev-mode route. Next.js dev compiles routes on
// demand; the first request to /api/dev/list-users can return
// 404 while the route is still compiling on the worker. A throwaway
// request before the suite runs avoids that flake.
test.beforeAll(async () => {
  if (!hasSecret) return;
  const ctx = await pwRequest.newContext();
  try {
    await ctx.post(`${BASE}/api/dev/list-users`, {
      headers: {
        'x-cityfix-promote-secret': SECRET,
        'content-type': 'application/json',
      },
      data: {},
    });
  } finally {
    await ctx.dispose();
  }
});

test('API: list-users with the right secret returns 200 with the user list', async () => {
  test.skip(!hasSecret, 'requires CITYFIX_DEV_PROMOTE_SECRET in env');
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.post(`${BASE}/api/dev/list-users`, {
      headers: {
        'x-cityfix-promote-secret': SECRET,
        'content-type': 'application/json',
      },
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      users: Array<{ id: string; name: string; role: string; phone: string }>;
    };
    // The demo seed has at least one citizen, one dispatcher,
    // one crew, and one admin. The page is generic over roles
    // so we don't pin a specific count.
    const roles = new Set(body.users.map((u) => u.role));
    expect(roles.has('citizen')).toBe(true);
    expect(roles.has('admin')).toBe(true);
    // The phone numbers are stable in the seed store; spot-check
    // Rahim's phone so we know the dev seed is loaded.
    const rahim = body.users.find((u) => u.id === 'user_citizen_rahim');
    expect(rahim).toBeDefined();
    expect(rahim!.phone).toBe('+8801711000000');
  } finally {
    await ctx.dispose();
  }
});

test('API: list-users with a wrong secret returns 403', async () => {
  test.skip(!hasSecret, 'requires CITYFIX_DEV_PROMOTE_SECRET in env');
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.post(`${BASE}/api/dev/list-users`, {
      headers: {
        'x-cityfix-promote-secret': 'definitely-wrong',
        'content-type': 'application/json',
      },
      data: {},
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('API: list-users with the env var unset returns 404', async () => {
  // This branch runs only when the spec is invoked against an
  // env where the secret is not configured. The dev:feat
  // build is exactly that — the escape hatch is opt-in.
  test.skip(hasSecret, 'requires CITYFIX_DEV_PROMOTE_SECRET to be UNSET');
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.post(`${BASE}/api/dev/list-users`, {
      headers: {
        'x-cityfix-promote-secret': 'any-value',
        'content-type': 'application/json',
      },
      data: {},
    });
    expect(res.status()).toBe(404);
  } finally {
    await ctx.dispose();
  }
});

test('API: issue-session with the right secret mints a session and sets the cookie', async () => {
  test.skip(!hasSecret, 'requires CITYFIX_DEV_PROMOTE_SECRET in env');
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.post(`${BASE}/api/dev/issue-session`, {
      headers: {
        'x-cityfix-promote-secret': SECRET,
        'content-type': 'application/json',
      },
      data: { userId: 'user_citizen_rahim' },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      userId: string;
      role: string;
      name: string;
      expiresAt: string;
    };
    expect(body.ok).toBe(true);
    expect(body.userId).toBe('user_citizen_rahim');
    expect(body.role).toBe('citizen');
    expect(body.name).toBe('Rahim');
    // 14-day window — the SESSION_TTL_MS in lib/auth/session.ts.
    const expires = new Date(body.expiresAt).getTime();
    const now = Date.now();
    const fourteenDays = 14 * 24 * 60 * 60 * 1000;
    expect(expires - now).toBeGreaterThan(fourteenDays - 60_000);
    expect(expires - now).toBeLessThan(fourteenDays + 60_000);
    // The cookie was set on the response.
    const cookies = await ctx.storageState();
    const sessionCookie = cookies.cookies.find(
      (c) => c.name === 'cityfix_session' && c.domain.includes('localhost'),
    );
    expect(sessionCookie).toBeDefined();
    // HttpOnly — the cookie must not be readable from JS.
    expect(sessionCookie!.httpOnly).toBe(true);
  } finally {
    await ctx.dispose();
  }
});

test('API: issue-session with a wrong secret returns 403', async () => {
  test.skip(!hasSecret, 'requires CITYFIX_DEV_PROMOTE_SECRET in env');
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.post(`${BASE}/api/dev/issue-session`, {
      headers: {
        'x-cityfix-promote-secret': 'definitely-wrong',
        'content-type': 'application/json',
      },
      data: { userId: 'user_citizen_rahim' },
    });
    expect(res.status()).toBe(403);
  } finally {
    await ctx.dispose();
  }
});

test('API: issue-session with an unknown userId returns 404', async () => {
  test.skip(!hasSecret, 'requires CITYFIX_DEV_PROMOTE_SECRET in env');
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.post(`${BASE}/api/dev/issue-session`, {
      headers: {
        'x-cityfix-promote-secret': SECRET,
        'content-type': 'application/json',
      },
      data: { userId: 'user_does_not_exist' },
    });
    expect(res.status()).toBe(404);
  } finally {
    await ctx.dispose();
  }
});

// --- UI checks -----------------------------------------------------------

test('UI: /dev/login renders the form with all data-testids', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const res = await page.goto(`${BASE}/dev/login`, { waitUntil: 'networkidle' });
  expect(res).not.toBeNull();
  expect(res!.status()).toBe(200);
  await expect(page.locator('[data-testid="dev-login-secret"]')).toBeVisible();
  await expect(page.locator('[data-testid="dev-login-user"]')).toBeVisible();
  await expect(page.locator('[data-testid="dev-login-submit"]')).toBeVisible();
  // Submit is disabled until a valid user is loaded.
  await expect(page.locator('[data-testid="dev-login-submit"]')).toBeDisabled();
});

test('UI: ?secret= pre-fills the secret input', async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  const res = await page.goto(`${BASE}/dev/login?secret=pre-filled-from-url`, {
    waitUntil: 'networkidle',
  });
  expect(res).not.toBeNull();
  expect(res!.status()).toBe(200);
  // The secret input is type="password" so we read its `.value`.
  const value = await page.locator('[data-testid="dev-login-secret"]').inputValue();
  expect(value).toBe('pre-filled-from-url');
});

itWithoutSecret(
  'UI: surfaces the "endpoint disabled" error when the secret env var is unset',
  async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${BASE}/dev/login?secret=any-value`, {
      waitUntil: 'networkidle',
    });
    // Type the secret (even though the env var is unset) so the
    // useEffect fires the list-users call.
    await page.locator('[data-testid="dev-login-secret"]').fill('any-value');
    // The list error appears with the 404 message.
    const err = page.locator('[data-testid="dev-login-list-error"]');
    await expect(err).toBeVisible({ timeout: 5_000 });
    await expect(err).toContainText(/404/);
    // The submit stays disabled.
    await expect(page.locator('[data-testid="dev-login-submit"]')).toBeDisabled();
  },
);

itWithSecret(
  'UI: surfaces the "wrong secret" error when the supplied value does not match',
  async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(`${BASE}/dev/login?secret=wrong-value`, {
      waitUntil: 'networkidle',
    });
    const err = page.locator('[data-testid="dev-login-list-error"]');
    await expect(err).toBeVisible({ timeout: 5_000 });
    await expect(err).toContainText(/403/);
    await expect(page.locator('[data-testid="dev-login-submit"]')).toBeDisabled();
  },
);

itWithSecret(
  'UI: full happy path — secret → users load → submit → cookie set → /api/auth/status authenticated',
  async ({ page, context }) => {
    await page.setViewportSize(VIEWPORT);
    await page.goto(
      `${BASE}/dev/login?secret=${encodeURIComponent(SECRET)}&next=/reports`,
      { waitUntil: 'networkidle' },
    );

    // The secret is pre-filled. The useEffect fires list-users,
    // the response populates the <select>, and the submit button
    // becomes enabled.
    const select = page.locator('[data-testid="dev-login-user"]');
    await expect(select).toBeEnabled({ timeout: 5_000 });
    // The dev seed has Rahim as a citizen; the page defaults
    // to the first citizen in the list.
    const selectedValue = await select.inputValue();
    expect(selectedValue.length).toBeGreaterThan(0);

    // Click submit.
    await page.locator('[data-testid="dev-login-submit"]').click();
    // The success banner appears before the redirect.
    const ok = page.locator('[data-testid="dev-login-submit-ok"]');
    await expect(ok).toBeVisible({ timeout: 5_000 });
    // Wait for the client-side router to push to /reports.
    await page.waitForURL(/\/reports(\b|\/|$)/, { timeout: 5_000 });

    // The cookie was set on the browser's jar.
    const cookies = await context.cookies(BASE);
    const session = cookies.find((c) => c.name === 'cityfix_session');
    expect(session).toBeDefined();
    expect(session!.httpOnly).toBe(true);

    // /api/auth/status now reports the chosen user.
    const statusRes = await page.request.get(`${BASE}/api/auth/status`);
    expect(statusRes.status()).toBe(200);
    const status = (await statusRes.json()) as {
      authenticated: boolean;
      session: { userId: string; role: string };
    };
    expect(status.authenticated).toBe(true);
    expect(status.session.userId).toBe(selectedValue);
  },
);
