/**
 * Prisma client singleton (lib/db.ts).
 *
 * In dev, Next.js hot-reloads modules — creating a new PrismaClient on each
 * reload exhausts connections. The standard pattern is to cache the client
 * on globalThis so it survives HMR.
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}