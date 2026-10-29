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

/**
 * Local dev uses the Postgres on this machine; production uses Neon.
 * Before the client ever connects, refuse to run in production against
 * a loopback database — see lib/platform/db-guard.ts for why that
 * matters (it would silently write citizens' data to a laptop).
 */
assertProductionDatabaseConfig();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}