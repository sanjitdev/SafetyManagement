/**
 * The production database guard must be LAZY, not module-load.
 *
 * This file pins the behaviour that broke CI for 18 consecutive runs.
 *
 * THE BUG
 * --------
 * `lib/db.ts` used to call `assertProductionDatabaseConfig()` at module
 * load. Two things went wrong:
 *
 *  1. `next build` imports route modules to collect page data. CI runs
 *     with a LOOPBACK `DATABASE_URL` (it needs no Postgres — the unit
 *     and mockup suites use the in-memory dev store), so the build died
 *     with "Failed to collect page data for /api/dev/list-users".
 *
 *  2. Any unit test that flipped `NODE_ENV=production` and re-imported
 *     a module reaching `lib/db.ts` (via `lib/auth/webauthn.ts` →
 *     `lib/db-switch.ts` → `lib/db.ts`) tripped the guard while testing
 *     something else entirely. `tests/unit/webauthn-prod-guard.test.ts`
 *     failed 5 of its 6 tests.
 *
 * The fix moved the guard onto the Prisma client's first USE. The guard
 * is NOT weakened: in production, the first real query against a
 * loopback `DATABASE_URL` still throws loudly.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

/**
 * `process.env.NODE_ENV` is typed as a readonly literal union by
 * `@types/node`, so a direct assignment is a TS2540 compile error.
 * Writing through a dynamically-keyed index sidesteps that typing —
 * the same approach `tests/unit/platform/db-guard.test.ts` uses.
 */
function setEnv(env: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const LOOPBACK_URL =
  'postgresql://postgres:secret@localhost:5432/cityfix?schema=public';

describe('the production database guard is lazy, not module-load', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL_ENV);
    vi.resetModules();
  });

  it('does NOT throw when lib/db.ts is imported in production', async () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: LOOPBACK_URL });
    vi.resetModules();

    // The import itself must survive. This is what the build does when
    // it collects page data, and what every other unit test does when
    // it flips NODE_ENV.
    await expect(import('@/lib/db')).resolves.toBeDefined();
  });

  it('throws on the FIRST QUERY, not on the import', async () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: LOOPBACK_URL });
    vi.resetModules();

    const { prisma } = await import('@/lib/db');

    // The guard fires on the first real use of the client. Prisma's
    // fluent API means `prisma.city` IS the query — accessing the
    // delegate is the moment the database is touched — so the guard
    // throws SYNCHRONOUSLY here, before any promise exists.
    // A route handler awaiting this still sees a rejected promise,
    // because the throw happens inside an async frame.
    expect(() => prisma.city.findMany()).toThrow(/loopback/i);
  });

  it('keeps throwing on every subsequent query', async () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: LOOPBACK_URL });
    vi.resetModules();

    const { prisma } = await import('@/lib/db');

    expect(() => prisma.city.findMany()).toThrow(/loopback/i);
    // A latched FAILURE would let the second query through and the guard
    // would stop protecting production after one misconfigured request.
    expect(() => prisma.city.findMany()).toThrow(/loopback/i);
  });

  it('rejects rather than throws when awaited inside an async frame', async () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: LOOPBACK_URL });
    vi.resetModules();

    const { prisma } = await import('@/lib/db');

    // This is how a route handler sees it: the synchronous throw inside
    // an async function becomes a rejected promise, so the request 500s
    // with the guard's message instead of crashing the process.
    await expect(
      (async () => {
        await prisma.city.findMany();
      })(),
    ).rejects.toThrow(/loopback/i);
  });

  it('stays silent in development (the local database is the point)', async () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: LOOPBACK_URL });
    vi.resetModules();

    const { prisma } = await import('@/lib/db');
    // No throw at import. (The query itself would need a real database,
    // so the assertion stops at the import — that is the behaviour this
    // guard controls.)
    expect(prisma).toBeDefined();
  });

  it('exposes the model delegates intact', async () => {
    setEnv({ NODE_ENV: 'development', DATABASE_URL: LOOPBACK_URL });
    vi.resetModules();

    const { prisma } = await import('@/lib/db');
    // The proxy must not swallow the Prisma model delegates.
    expect(typeof prisma.city.findMany).toBe('function');
    expect(typeof prisma.ticket.findMany).toBe('function');
    expect(typeof prisma.user.findMany).toBe('function');
  });
});
