/**
 * Prisma client singleton (lib/db.ts).
 *
 * In dev, Next.js hot-reloads modules — creating a new PrismaClient on each
 * reload exhausts connections. The standard pattern is to cache the client
 * on globalThis so it survives HMR.
 */

import { PrismaClient } from '@prisma/client';
import { assertProductionDatabaseConfig } from './platform/db-guard';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const client =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = client;
}

/**
 * The production database guard (`lib/platform/db-guard.ts`).
 *
 * Local dev uses the Postgres on this machine; production uses Neon. If a
 * local-style `DATABASE_URL` ever reached production, the deployed app would
 * work *perfectly* and silently write citizens' real names, NID numbers,
 * phone numbers and photos into a developer's personal Postgres instance.
 * Nothing in the request path would fail. So the guard throws.
 *
 * WHY THIS IS A LAZY PROXY, NOT A MODULE-LOAD CALL
 * -------------------------------------------------
 * The guard used to run at module load. That was wrong in two ways:
 *
 *  1. It broke the build. `next build` imports route modules to collect
 *     page data, and CI (like a developer's machine) can have a loopback
 *     `DATABASE_URL` in the environment. The throw happened before the app
 *     ever served a request — the exact failure the guard's own docstring
 *     says it must avoid ("a module-load throw would fail the build before
 *     the app ever serves a request").
 *
 *  2. It broke unrelated unit tests. Any test that flips
 *     `NODE_ENV=production` and re-imports a module that transitively
 *     imports `lib/db.ts` (e.g. `lib/auth/webauthn.ts` → `lib/db-switch.ts`
 *     → `lib/db.ts`) tripped the guard while testing something else
 *     entirely.
 *
 * So the guard now runs on FIRST USE — the first actual query — and throws
 * there. The behaviour that matters is unchanged: in production, the first
 * request that touches the database fails loudly with a clear message
 * instead of quietly writing citizens' data to a laptop. The build no
 * longer fails, and no unrelated test fails.
 *
 * The proxy is transparent: `prisma.ticket.findMany(...)` still returns
 * exactly what `PrismaClient` returns, and the guard is asserted once per
 * process before the first query reaches the client.
 */
export const prisma: PrismaClient = new Proxy(client, {
  get(target, prop) {
    // Every delegate access (`prisma.ticket`, `prisma.user`, …) is a use
    // of the database. Assert once, lazily, on the way through.
    assertProductionDatabaseConfig();

    // `Reflect.get(target, prop, target)` — the receiver is the REAL
    // client, not the proxy. Prisma's model getters read `this` when
    // they build their delegate, so handing them the proxy would route
    // their internal property reads back through the trap.
    const value = Reflect.get(target, prop, target);
    // Prisma's model delegates are lazy getters that return a fresh
    // object per access; binding them to the real client keeps
    // `this` correct.
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
