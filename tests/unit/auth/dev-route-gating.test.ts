/**
 * Vitest: the `/api/dev/*` privilege-escalation routes must be
 * unreachable in a PRODUCTION BUILD.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 *
 * Four routes under `app/api/dev/` can grant admin rights:
 *
 *   - `bootstrap-admin` — promotes a citizen to `role='admin'`
 *     AND mints them a real session;
 *   - `issue-session`   — mints a session for ANY userId;
 *   - `promote-admin`   — flips the signed-in user to admin;
 *   - `list-users`      — enumerates every user's id / name /
 *     role / phone, which is the directory an attacker needs to
 *     drive the other three.
 *
 * They were gated on `CITYFIX_DEV_PROMOTE_SECRET` ALONE. That is
 * a single static shared secret, and `_progress/operations/
 * credentials.md:132-141` documents using exactly these endpoints
 * against the deployed Vercel build — so the secret is very likely
 * set in the production environment right now.
 *
 * That matters because of what `lib/db-switch.ts` does: every
 * method branches on `isDevStore()` at CALL time, and the Prisma
 * branch is the one that runs in production. So with a secret set
 * on the deployed environment, these four routes were live against
 * the real database — a leaked shared secret was a complete,
 * unauthenticated privilege escalation (no password, no OTP, no
 * WebAuthn).
 *
 * The fix adds a second, non-negotiable gate: the routes 404
 * whenever `NODE_ENV === 'production'`, whatever the secret
 * happens to be.
 *
 * ── Why the gate is on NODE_ENV and not on isDevStore() ──────
 *
 * These four endpoints are inherently PRODUCTION-shaped:
 *
 *   - `bootstrap-admin` and `promote-admin` perform a ROLE FLIP
 *     via `db.user.update`. The dev store's persona rows are
 *     seed-immutable and `lib/db-switch.ts:368` THROWS
 *     ("dev store does not support user.update — promote-admin is
 *     prod-only"). A dev-store gate would make those two routes
 *     permanently non-functional: 404 in production, a throw in
 *     dev. It would close the leak by breaking the feature.
 *
 *   - `issue-session` and `list-users` do work in the dev store,
 *     but the ids they surface there are the fixed seed personas —
 *     already public. The directory that makes them dangerous only
 *     exists against real Prisma.
 *
 * So `NODE_ENV === 'production'` is the gate that removes exactly
 * the deployment the routes must never run in, while leaving the
 * routes usable everywhere else.
 *
 * ── What is asserted, and why ──────────────────────────────
 *
 * The assertion that pins the fix is the one that is easy to get
 * wrong: **404, not 403, and with the CORRECT secret supplied.**
 *
 *   - A 403 would mean the route reached its secret comparison —
 *     i.e. it exists and is reachable. It must not be.
 *   - Supplying the correct secret matters: without it, the
 *     secret check would return 403 anyway and the test would
 *     pass even with the production gate removed. That is the
 *     vacuous version of this test, and it is the one a careless
 *     test would write.
 *
 * The non-production case is asserted too: the routes must still
 * WORK outside a production build, or the gate has simply broken
 * the demo tooling.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const cookieJar = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
}));

const { POST: bootstrapAdmin } = await import(
  '@/app/api/dev/bootstrap-admin/route'
);
const { POST: issueSession } = await import('@/app/api/dev/issue-session/route');
const { POST: promoteAdmin } = await import('@/app/api/dev/promote-admin/route');
const { POST: listUsers } = await import('@/app/api/dev/list-users/route');

const SECRET = 'test-promote-secret';

const ORIGINAL_ENV = { ...process.env };

/**
 * Set env vars for one test.
 *
 * `process.env.NODE_ENV` is typed as a readonly literal union by
 * `@types/node`, so a direct `process.env.NODE_ENV = 'production'` is
 * a TS2540 compile error ("Cannot assign to 'NODE_ENV' because it is
 * a read-only property"). Writing through a dynamically-keyed index
 * sidesteps that typing — the same approach the sibling
 * `tests/unit/platform/db-guard.test.ts` uses.
 */
function setEnv(env: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/**
 * The four gated routes, with a body each one would accept.
 *
 * The bodies are shaped so that a route which reached its handler
 * would NOT 400 on validation: the point of the test is to
 * distinguish "the gate rejected it" (404) from "the handler
 * processed it" (200 / 400 / 404-with-a-different-error).
 */
const ROUTES = [
  {
    name: 'bootstrap-admin',
    handler: bootstrapAdmin,
    body: { phone: '+8801711000000' },
  },
  {
    name: 'issue-session',
    handler: issueSession,
    body: { userId: 'user_citizen_rahim' },
  },
  {
    name: 'promote-admin',
    handler: promoteAdmin,
    body: {},
  },
  {
    name: 'list-users',
    handler: listUsers,
    body: {},
  },
] as const;

function request(
  handler: (req: NextRequest) => Promise<Response>,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return handler(
    new NextRequest('http://localhost/api/dev/whatever', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  cookieJar.clear();
  process.env.CITYFIX_DEV_PROMOTE_SECRET = SECRET;
  process.env.DEV_SKIP_WEBAUTHN = '1';
  // The default for these tests is the PRODUCTION shape: the
  // secret IS set (the dangerous case) but the app IS a
  // production build.
  setEnv({ NODE_ENV: 'production' });
});

afterEach(() => {
  for (const k of Object.keys(process.env)) {
    if (!(k in ORIGINAL_ENV)) delete process.env[k];
  }
  for (const [k, v] of Object.entries(ORIGINAL_ENV)) {
    if (typeof v === 'string') process.env[k] = v;
  }
});

// ===== The gate =======================================

describe('/api/dev/* — the production-build gate', () => {
  it.each(ROUTES)(
    '$name returns 404 in a production build, even with the CORRECT secret',
    async ({ handler, body }) => {
      // The secret is correct. If the route were reachable, the
      // secret comparison would pass and the handler would run —
      // so a 404 here can ONLY come from the production gate.
      const res = await request(handler, body, {
        'x-cityfix-promote-secret': SECRET,
      });

      expect(res.status).toBe(404);
      const json = (await res.json()) as { error?: string };
      expect(json.error).toBe('not_found');
      // 403 would mean the route exists and is reachable — that is
      // the outcome this guard exists to prevent.
      expect(res.status).not.toBe(403);
    },
  );

  it.each(ROUTES)(
    '$name mints no session in a production build',
    async ({ handler, body }) => {
      await request(handler, body, {
        'x-cityfix-promote-secret': SECRET,
      });
      // The dangerous side effect of `bootstrap-admin` and
      // `issue-session` is the session cookie. If the gate failed,
      // this jar would be populated.
      expect(cookieJar.get('cityfix_session')).toBeUndefined();
    },
  );

  it.each(ROUTES)(
    '$name still works outside a production build',
    async ({ handler, body }) => {
      setEnv({ NODE_ENV: 'development' });
      // The gate must not have broken the demo tooling: the route
      // has to get PAST the gate. Anything other than a
      // not_found error proves that.
      //
      // `bootstrap-admin` is the one route that can THROW here
      // rather than answer: the dev store has no `user.update`
      // (the persona rows are seed-immutable by design —
      // `lib/db-switch.ts:365-372`), so the role flip throws
      // from the db layer. That still proves the gate let the
      // request through — the throw happens strictly AFTER the
      // gate. So the assertion is "did not get a gate
      // rejection", not "returned 200".
      const res = await request(handler, body, {
        'x-cityfix-promote-secret': SECRET,
      }).catch((err: unknown): Response | Error =>
        err instanceof Error ? err : new Error(String(err)),
      );
      if (res instanceof Error) {
        // Threw past the gate — assert it is the db-layer
        // limitation, not a gate rejection.
        expect(res.message).not.toMatch(/not_found/);
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      expect(json.error).not.toBe('not_found');
    },
  );

  it.each(ROUTES)(
    '$name returns 403 outside a production build when the secret is WRONG',
    async ({ handler, body }) => {
      setEnv({ NODE_ENV: 'development' });
      const res = await request(handler, body, {
        'x-cityfix-promote-secret': 'definitely-wrong',
      });
      // The secret is still a real second factor — the production
      // gate did not replace it, it was added ON TOP of it.
      expect(res.status).toBe(403);
    },
  );

  it.each(ROUTES)(
    '$name returns 404 when the promote secret is unset, even outside a production build',
    async ({ handler, body }) => {
      setEnv({ NODE_ENV: 'development' });
      delete process.env.CITYFIX_DEV_PROMOTE_SECRET;
      const res = await request(handler, body, {
        'x-cityfix-promote-secret': 'anything',
      });
      expect(res.status).toBe(404);
    },
  );
});
