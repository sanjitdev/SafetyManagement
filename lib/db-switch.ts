/**
 * Backend switcher (lib/db-switch.ts).
 *
 * Picks between Prisma + Postgres (production) and the in-memory dev store
 * based on `process.env.CITYFIX_DEV_STORE === '1'`. Keeps the route
 * handlers readable — they import `db` and `getActiveSession` from here
 * and never branch on the env themselves.
 *
 * The Prisma client (lib/db.ts) is untouched.
 */

import { prisma as prismaClient } from './db';
import { getSession as realGetSession } from './auth/session';
import { devGetSession } from './dev-session';
import { devDb, isDevStore, getTicketWithTrail, type DevTicketWithTrail } from './dev-store';
import type { Role, TicketStatus } from '@prisma/client';

// Re-export the dev Db as a tagged type so callers can use it via the same
// names. The Prisma client surface is much richer; we only expose the
// minimum dev-store queries through this module.

export const useDevStore = (): boolean => isDevStore();

export const db = {
  city: {
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.city.findUnique(args)
        : prismaClient.city.findUnique(args),
    findUniqueBySlug: (args: { where: { slug: string } }) =>
      isDevStore()
        ? devDb.city.findUniqueBySlug(args)
        : prismaClient.city.findUnique(args),
  },
  ward: {
    findFirst: (args: { where: { cityId: string }; orderBy?: { number: 'asc' | 'desc' } }) =>
      isDevStore()
        ? devDb.ward.findFirst(args)
        : prismaClient.ward.findFirst(args),
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.ward.findUnique(args)
        : prismaClient.ward.findUnique(args),
  },
  category: {
    findMany: (args: { where: { cityId: string } }) =>
      isDevStore()
        ? devDb.category.findMany(args)
        : prismaClient.category.findMany(args),
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.category.findUnique(args)
        : prismaClient.category.findUnique(args),
  },
  user: {
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.user.findUnique(args)
        : prismaClient.user.findUnique(args),
    findFirst: (args: {
      where: { cityId: string; phone: string; role: string };
    }) =>
      isDevStore()
        ? devDb.user.findFirst(args)
        : prismaClient.user.findFirst(args as never),
    create: (args: {
      data: {
        id: string;
        cityId: string;
        role: Role;
        phone: string;
        nid: string;
        name: string;
        passwordHash: string;
        wardId: string;
      };
    }) =>
      isDevStore()
        ? devDb.user.create({ data: args.data })
        : prismaClient.user.create({ data: args.data as never }),
  },
  ticket: {
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.ticket.findUnique(args)
        : prismaClient.ticket.findUnique(args),
    findFirst: (args: {
      where: Partial<{ cityId: string; categoryId: string; status: { in: TicketStatus[] } }>;
    }) =>
      isDevStore()
        ? devDb.ticket.findFirst(args as never)
        : prismaClient.ticket.findFirst(args as never),
    findMany: (args: {
      where?: Partial<{
        cityId: string;
        categoryId: string;
        status: { in: TicketStatus[] };
        locationLat: { gte: number; lte: number };
        locationLng: { gte: number; lte: number };
      }>;
      reporterId?: string;
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }) =>
      isDevStore()
        ? devDb.ticket.findMany(args as never)
        : prismaClient.ticket.findMany(args as never),
    create: (args: {
      data: {
        cityId: string;
        wardId: string;
        categoryId: string;
        reporterId: string;
        status: TicketStatus;
        locationLat: number;
        locationLng: number;
        locationLabel?: string | null;
        locationLabelBn?: string | null;
        note?: string | null;
        photoUrls: string[];
      };
    }) =>
      isDevStore()
        ? devDb.ticket.create({
            data: {
              ...args.data,
              locationLabel: args.data.locationLabel ?? null,
              locationLabelBn: args.data.locationLabelBn ?? null,
              note: args.data.note ?? null,
              assignedCrewId: null,
              internalNote: null,
            },
          })
        : prismaClient.ticket.create({ data: args.data }),
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      isDevStore()
        ? devDb.ticket.update(args as never)
        : prismaClient.ticket.update(args as never),
  },
  trail: {
    create: (args: {
      data: { ticketId: string; toStatus: TicketStatus; actorId: string; note?: string | null };
    }) =>
      isDevStore()
        ? devDb.trail.create({ data: { ...args.data, note: args.data.note ?? null } })
        : prismaClient.ticketTrailEntry.create({ data: args.data }),
  },
  audit: {
    create: (args: {
      data: {
        entityType: string;
        entityId: string;
        action: string;
        actorId: string;
        beforeValue?: Record<string, unknown> | null;
        afterValue?: Record<string, unknown> | null;
      };
    }) =>
      isDevStore()
        ? devDb.audit.create({
            data: {
              entityType: args.data.entityType as never,
              entityId: args.data.entityId,
              action: args.data.action,
              actorId: args.data.actorId,
              beforeValue: args.data.beforeValue ?? null,
              afterValue: args.data.afterValue ?? null,
            },
          })
        : prismaClient.auditEntry.create({ data: args.data as never }),
  },
  session: {
    create: (args: {
      data: {
        userId: string;
        cityId: string;
        wardId: string | null;
        departmentId: string | null;
        expiresAt: Date;
      };
    }) =>
      isDevStore()
        ? devDb.session.create({
            data: {
              userId: args.data.userId,
              cityId: args.data.cityId,
              wardId: args.data.wardId,
              departmentId: args.data.departmentId,
              expiresAt: args.data.expiresAt.toISOString(),
            },
          })
        : prismaClient.session.create({ data: args.data }),
    findUnique: async (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.session.findUnique(args)
        : prismaClient.session.findUnique(args),
    delete: async (args: { where: { id: string } }) => {
      if (isDevStore()) devDb.session.delete(args);
      else await prismaClient.session.delete(args);
    },
    update: async (args: {
      where: { id: string };
      data: Partial<{ lastSeenAt: Date }>;
    }) => {
      if (isDevStore()) {
        return devDb.session.update({
          where: args.where,
          data: {
            lastSeenAt: args.data.lastSeenAt
              ? args.data.lastSeenAt.toISOString()
              : new Date().toISOString(),
          },
        });
      }
      return prismaClient.session.update({ where: args.where, data: args.data });
    },
  },
  otp: {
    create: (args: {
      data: {
        userId: string;
        codeHash: string;
        scope: 'registration' | 'login' | 'password-reset';
        expiresAt: Date;
      };
    }) =>
      isDevStore()
        ? devDb.otp.create({
            data: {
              userId: args.data.userId,
              codeHash: args.data.codeHash,
              scope: args.data.scope,
              expiresAt: args.data.expiresAt.toISOString(),
            },
          })
        : prismaClient.otpCode.create({
            data: {
              userId: args.data.userId,
              codeHash: args.data.codeHash,
              scope: args.data.scope,
              expiresAt: args.data.expiresAt,
            },
          }),
    findFirst: (args: {
      where: { userId: string; scope: string };
      orderBy?: { createdAt: 'asc' | 'desc' };
    }) =>
      isDevStore()
        ? devDb.otp.findFirst({
            where: { ...args.where, usedAt: null },
            orderBy: args.orderBy,
          })
        : prismaClient.otpCode.findFirst({
            where: { userId: args.where.userId, scope: args.where.scope, usedAt: null },
            orderBy: args.orderBy,
          }),
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) =>
      isDevStore()
        ? devDb.otp.update(args as never)
        : prismaClient.otpCode.update(args as never),
    countRecent: (args: {
      where: { userId: string; scope: string; since: string };
    }) =>
      isDevStore()
        ? devDb.otp.countRecent(args)
        : prismaClient.otpCode.count({
            where: {
              userId: args.where.userId,
              scope: args.where.scope,
              createdAt: { gte: new Date(args.where.since) },
            },
          }),
  },
  dedupFlag: {
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.dedupFlag.findUnique(args)
        : prismaClient.dedupFlag.findUnique(args),
    findMany: (args: {
      where?: { cityId?: string; status?: string };
      orderBy?: { flaggedAt: 'asc' | 'desc' };
    }) =>
      isDevStore()
        ? devDb.dedupFlag.findMany(args as never)
        : prismaClient.dedupFlag.findMany(args as never),
    create: (args: {
      data: {
        cityId: string;
        wardId: string;
        departmentId: string | null;
        ticketId: string;
        originalTicketId: string;
        citizenReason: string | null;
      };
    }) =>
      isDevStore()
        ? devDb.dedupFlag.create({ data: args.data })
        : prismaClient.dedupFlag.create({ data: args.data as never }),
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      isDevStore()
        ? devDb.dedupFlag.update(args as never)
        : prismaClient.dedupFlag.update(args as never),
  },
};

export async function getActiveSession() {
  if (isDevStore()) return devGetSession();
  return realGetSession();
}

export type { DevTicketWithTrail };
export { getTicketWithTrail };

// Re-export common types for callers that don't want to import @prisma/client directly.
export type { Role, TicketStatus };
