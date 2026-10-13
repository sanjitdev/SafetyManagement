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
import { devDb, isDevStore, getTicketWithTrail as devGetTicketWithTrail, type DevTicketWithTrail } from './dev-store';
import type { Role, TicketStatus } from '@prisma/client';

// Re-export the dev Db as a tagged type so callers can use it via the same
// names. The Prisma client surface is much richer; we only expose the
// minimum dev-store queries through this module.

export const useDevStore = (): boolean => isDevStore();

export const db = {
  city: {
    findUnique: async (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.city.findUnique(args)
        : (await prismaClient.city.findUnique(args)) as Awaited<
            ReturnType<typeof devDb.city.findUnique>
          >,
    findUniqueBySlug: (args: { where: { slug: string } }) =>
      isDevStore()
        ? devDb.city.findUniqueBySlug(args)
        : prismaClient.city.findUnique(args),
    findMany: () =>
      isDevStore()
        ? devDb.city.findMany()
        : prismaClient.city.findMany(),
    findFirst: async (args: { orderBy?: { createdAt: 'asc' | 'desc' } } = {}) => {
      if (isDevStore()) {
        // The dev store keeps a single seeded city; `findMany` already
        // sorts by name, so the first entry is the canonical "primary"
        // city the bootstrap endpoint hands back.
        const rows = devDb.city.findMany();
        return rows[0] ?? null;
      }
      return prismaClient.city.findFirst(args);
    },
    create: async (args: {
      data: {
        slug: string;
        name: string;
        nameBn: string | null;
        defaultLanguage: 'bn' | 'en';
        dedupRadiusMeters: number;
      };
    }) =>
      isDevStore()
        ? devDb.city.create(args)
        : (await prismaClient.city.create({
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.city.create>>,
    update: async (args: {
      where: { id: string };
      data: Partial<{
        name: string;
        nameBn: string | null;
        defaultLanguage: 'bn' | 'en';
        dedupRadiusMeters: number;
      }>;
    }) =>
      isDevStore()
        ? devDb.city.update(args as never)
        : (await prismaClient.city.update({
            where: args.where,
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.city.update>>,
    delete: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.city.delete(args)
        : prismaClient.city.delete(args),
  },
  ward: {
    findFirst: (args: { where: { cityId: string }; orderBy?: { number: 'asc' | 'desc' } }) =>
      isDevStore()
        ? devDb.ward.findFirst(args)
        : prismaClient.ward.findFirst(args),
    findMany: (args: { where: { cityId: string } }) =>
      isDevStore()
        ? devDb.ward.findMany(args)
        : prismaClient.ward.findMany({ where: args.where }),
    findUnique: async (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.ward.findUnique(args)
        : (await prismaClient.ward.findUnique(args)) as Awaited<
            ReturnType<typeof devDb.ward.findUnique>
          >,
    create: async (args: {
      data: {
        cityId: string;
        number: number;
        name: string;
        nameBn: string | null;
        polygonGeoJson: string | null;
      };
    }) =>
      isDevStore()
        ? devDb.ward.create(args)
        : (await prismaClient.ward.create({
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.ward.create>>,
    update: async (args: {
      where: { id: string };
      data: Partial<{
        name: string;
        nameBn: string | null;
        polygonGeoJson: string | null;
      }>;
    }) =>
      isDevStore()
        ? devDb.ward.update(args as never)
        : (await prismaClient.ward.update({
            where: args.where,
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.ward.update>>,
    delete: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.ward.delete(args)
        : prismaClient.ward.delete(args),
  },
  department: {
    findMany: (args: { where: { cityId: string } }) =>
      isDevStore()
        ? devDb.department.findMany(args)
        : prismaClient.department.findMany({ where: args.where }),
    findUnique: async (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.department.findUnique(args)
        : (await prismaClient.department.findUnique(args)) as Awaited<
            ReturnType<typeof devDb.department.findUnique>
          >,
    create: async (args: {
      data: {
        cityId: string;
        slug: string;
        name: string;
        nameBn: string | null;
      };
    }) =>
      isDevStore()
        ? devDb.department.create(args)
        : (await prismaClient.department.create({
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.department.create>>,
    update: async (args: {
      where: { id: string };
      data: Partial<{ name: string; nameBn: string | null; slug: string }>;
    }) =>
      isDevStore()
        ? devDb.department.update(args as never)
        : (await prismaClient.department.update({
            where: args.where,
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.department.update>>,
    delete: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.department.delete(args)
        : prismaClient.department.delete(args),
    countByCity: (args: { where: { cityId: string } }) =>
      isDevStore()
        ? devDb.department.countByCity(args)
        : prismaClient.department.count({ where: args.where }),
  },
  category: {
    findMany: async (args: { where: { cityId: string } }) =>
      isDevStore()
        ? devDb.category.findMany(args)
        : (await prismaClient.category.findMany(args)) as Awaited<
            ReturnType<typeof devDb.category.findMany>
          >,
    findUnique: async (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.category.findUnique(args)
        : (await prismaClient.category.findUnique(args)) as Awaited<
            ReturnType<typeof devDb.category.findUnique>
          >,
    create: async (args: {
      data: {
        cityId: string;
        departmentId: string | null;
        slug: string;
        name: string;
        nameBn: string | null;
        narrowCategoryPhotoCap: number | null;
      };
    }) =>
      isDevStore()
        ? devDb.category.create(args)
        : (await prismaClient.category.create({
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.category.create>>,
    update: async (args: {
      where: { id: string };
      data: Partial<{
        name: string;
        nameBn: string | null;
        departmentId: string | null;
        narrowCategoryPhotoCap: number | null;
      }>;
    }) =>
      isDevStore()
        ? devDb.category.update(args as never)
        : (await prismaClient.category.update({
            where: args.where,
            data: args.data as never,
          })) as Awaited<ReturnType<typeof devDb.category.update>>,
    delete: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.category.delete(args)
        : prismaClient.category.delete(args),
    countByCity: (args: { where: { cityId: string } }) =>
      isDevStore()
        ? devDb.category.countByCity(args)
        : prismaClient.category.count({ where: args.where }),
  },
  user: {
    findUnique: (args: { where: { id: string } }) =>
      isDevStore()
        ? devDb.user.findUnique(args)
        : prismaClient.user.findUnique(args),
    // Bolt 005-002-launch (2026-10-13) — the citizen register route
    // looks up `(cityId, phone)` across ALL roles so a non-citizen row
    // sharing the same phone is also caught (the per-city unique
    // index is `(cityId, phone)`, not `(cityId, phone, role)`).
    // `role` is optional so the call site can omit it; when omitted
    // the query returns the first user that matches the other fields
    // regardless of role.
    findFirst: (args: {
      where: { cityId: string; phone: string; role?: string };
    }) =>
      isDevStore()
        ? devDb.user.findFirst(args)
        : prismaClient.user.findFirst(args as never),
    // Bolt 005-001 — used by the anonymous `/api/auth/webauthn/login`
    // route to resolve the admin's `User` row from the email they
    // typed in the browser. The dev store filters by email + role
    // (no cityId scope at this stage because the admin is a
    // cross-city actor); the Prisma path uses `findFirst` on the
    // same shape.
    findFirstByEmail: (args: { where: { email: string; role: string } }) =>
      isDevStore()
        ? devDb.user.findFirstByEmail(args)
        : prismaClient.user.findFirst({ where: args.where } as never),
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
    // v1.1-launch (2026-10-13) — used by the one-shot
    // /api/dev/promote-admin bootstrap so the live admin
    // pages are reachable for the only signed-in user. The
    // dev store does not have a `user.update` (the persona
    // rows are seed-immutable); the Prisma path is the only
    // branch that runs in production. To be removed once
    // the bootstrap is no longer needed.
    update: (args: { where: { id: string }; data: Record<string, unknown> }) =>
      isDevStore()
        ? (() => {
            throw new Error(
              'dev store does not support user.update — promote-admin is prod-only',
            );
          })()
        : prismaClient.user.update(args as never),
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
    findMany: async (args: {
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
        : ((await prismaClient.ticket.findMany(args as never)) as unknown) as Awaited<
            ReturnType<typeof devDb.ticket.findMany>
          >,
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
    /**
     * Bolt 005-004 — audit dashboard read surface. The dev store's
     * findMany is a thin filter+sort+slice; the Prisma path uses
     * the real `auditEntry.findMany(...)`.
     */
    findMany: async (args: {
      where?: {
        actorId?: string;
        action?: string | { in: string[] };
        entityType?: string | { in: string[] };
        createdAt?: { gte?: string; lte?: string; lt?: string };
      };
      orderBy?: { createdAt: 'asc' | 'desc' };
      take?: number;
    }) => {
      if (isDevStore()) {
        return devDb.audit.findMany(args as never);
      }
      return ((await prismaClient.auditEntry.findMany(
        args as never,
      )) as unknown) as Awaited<
        ReturnType<typeof devDb.audit.findMany>
      >;
    },
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
  /**
   * Bolt 005-001 — WebAuthn (mandatory for admin writes).
   * Server-side challenge ledger + per-user credentials read/write.
   * The dev store mirrors the Prisma surface in-process.
   */
  webAuthnChallenge: {
    create: (args: {
      userId: string;
      challenge: string;
      expiresAt: Date;
    }) => {
      const expiresAtIso = args.expiresAt.toISOString();
      if (isDevStore()) {
        return devDb.webAuthnChallenge.create({
          userId: args.userId,
          challenge: args.challenge,
          expiresAt: expiresAtIso,
        });
      }
      return prismaClient.webAuthnChallenge.create({
        data: {
          userId: args.userId,
          challenge: args.challenge,
          expiresAt: args.expiresAt,
        },
      });
    },
    findLatest: async (args: { userId: string }) => {
      if (isDevStore()) {
        return devDb.webAuthnChallenge.findLatest(args);
      }
      const row = await prismaClient.webAuthnChallenge.findFirst({
        where: { userId: args.userId },
        orderBy: { createdAt: 'desc' },
      });
      if (!row) return null;
      return {
        id: row.id,
        userId: row.userId,
        challenge: row.challenge,
        expiresAt: row.expiresAt,
      };
    },
    findById: async (args: { id: string; userId: string }) => {
      if (isDevStore()) {
        // The dev store's `devDb.webAuthnChallenge.findById`
        // requires both id and userId. The assertion route
        // passes `userId: ''` to mean "id-only lookup"
        // (the id is globally unique — a wbc_<uuid> — so
        // a userId is not necessary for the lookup itself;
        // the domain service uses the row's userId as the
        // authority afterward). We delegate to the lower-
        // level `getStore()` for that one case.
        if (args.userId === '') {
          const { getStore } = await import('./dev-store');
          const row = getStore().webAuthnChallenges.get(args.id);
          if (!row) return null;
          return {
            id: row.id,
            userId: row.userId,
            challenge: row.challenge,
            expiresAt: row.expiresAt,
          };
        }
        return devDb.webAuthnChallenge.findById(args);
      }
      const row = await prismaClient.webAuthnChallenge.findUnique({
        where: { id: args.id },
      });
      if (!row) return null;
      if (args.userId !== '' && row.userId !== args.userId) return null;
      return {
        id: row.id,
        userId: row.userId,
        challenge: row.challenge,
        expiresAt: row.expiresAt,
      };
    },
  },
  userWebAuthn: {
    readCredentials: async (userId: string) => {
      if (isDevStore()) {
        return devDb.user.webAuthn.readCredentials(userId);
      }
      const row = await prismaClient.user.findUnique({
        where: { id: userId },
        select: {
          webAuthnCredentials: true,
          webAuthnChallenge: true,
        },
      });
      if (!row) {
        return { webAuthnCredentials: null, webAuthnChallenge: null };
      }
      return {
        webAuthnCredentials: row.webAuthnCredentials as never,
        webAuthnChallenge: row.webAuthnChallenge as never,
      };
    },
    writeCredentials: async (
      userId: string,
      credentials: unknown,
    ) => {
      if (isDevStore()) {
        devDb.user.webAuthn.writeCredentials(
          userId,
          credentials as never,
        );
        return;
      }
      await prismaClient.user.update({
        where: { id: userId },
        data: { webAuthnCredentials: credentials as never },
      });
    },
    writeChallenge: async (
      userId: string,
      challenge: unknown,
    ) => {
      if (isDevStore()) {
        devDb.user.webAuthn.writeChallenge(
          userId,
          challenge as never,
        );
        return;
      }
      await prismaClient.user.update({
        where: { id: userId },
        data: { webAuthnChallenge: challenge as never },
      });
    },
    bumpCounter: async (
      userId: string,
      credentialId: string,
      newCounter: number,
    ) => {
      if (isDevStore()) {
        devDb.user.webAuthn.bumpCounter(userId, credentialId, newCounter);
        return;
      }
      const row = await prismaClient.user.findUnique({
        where: { id: userId },
        select: { webAuthnCredentials: true },
      });
      const list = (row?.webAuthnCredentials ?? []) as Array<{
        credentialID: string;
        counter: number;
      }>;
      const updated = list.map((c) =>
        c.credentialID === credentialId
          ? { ...c, counter: newCounter }
          : c,
      );
      await prismaClient.user.update({
        where: { id: userId },
        data: { webAuthnCredentials: updated as never },
      });
    },
    revokeCredential: async (
      userId: string,
      credentialId: string,
    ): Promise<{
      removed: {
        credentialID: string;
        credentialPublicKey: Uint8Array;
        counter: number;
        name: string;
        registeredAt: string;
      };
      remaining: number;
    }> => {
      if (isDevStore()) {
        return devDb.user.webAuthn.revokeCredential(userId, credentialId);
      }
      const row = await prismaClient.user.findUnique({
        where: { id: userId },
        select: { webAuthnCredentials: true },
      });
      const list = ((row?.webAuthnCredentials ?? []) as unknown) as Array<{
        credentialID: string;
        credentialPublicKey: Uint8Array;
        counter: number;
        name: string;
        registeredAt: string;
      }>;
      const target = list.find((c) => c.credentialID === credentialId);
      if (!target) {
        throw new Error(`credential ${credentialId} not found`);
      }
      const remaining = list.filter((c) => c.credentialID !== credentialId);
      await prismaClient.user.update({
        where: { id: userId },
        data: { webAuthnCredentials: remaining as never },
      });
      return { removed: target, remaining: remaining.length };
    },
  },
};

export async function getActiveSession() {
  if (isDevStore()) return devGetSession();
  return realGetSession();
}

export type { DevTicketWithTrail };
export { getTicketWithTrail as devGetTicketWithTrail } from './dev-store';

/**
 * Backend-agnostic `getTicketWithTrail`: dev-store
 * delegate in dev, Prisma implementation in prod. Callers
 * (activity, ticket detail, dispatcher, crew, dedup
 * confirmation) `await` this. The shape is the union of
 * the Prisma `Ticket` row + the trail + `departmentId`; the
 * `serializeTicketForRole` consumer in `lib/serializers/ticket.ts`
 * already handles `Date | string` for `createdAt` /
 * `updatedAt` / `resolvedAt` and the trail entry timestamp.
 *
 * v1 launch readiness (2026-10-12): this was a critical
 * gap where the read-side ticket endpoints returned 500 /
 * 404 in production because `getTicketWithTrail` was
 * only implemented for the dev store. The Prisma-side
 * implementation queries the `Ticket` + matching
 * `TicketTrailEntry` rows (ordered by timestamp) + the
 * `Category.departmentId` in a single round trip and
 * returns a `DevTicketWithTrail`-shaped object.
 */
export async function getTicketWithTrail(
  id: string,
): Promise<DevTicketWithTrail | null> {
  if (isDevStore()) return devGetTicketWithTrail(id);
  const t = await prismaClient.ticket.findUnique({
    where: { id },
    include: {
      trail: { orderBy: { timestamp: 'asc' } },
      category: { select: { departmentId: true } },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    cityId: t.cityId,
    wardId: t.wardId,
    categoryId: t.categoryId,
    reporterId: t.reporterId,
    assignedCrewId: t.assignedCrewId,
    status: t.status,
    locationLng: t.locationLng,
    locationLat: t.locationLat,
    locationLabel: t.locationLabel,
    locationLabelBn: t.locationLabelBn,
    note: t.note,
    photoUrls: t.photoUrls,
    internalNote: t.internalNote,
    duplicateOfId: t.duplicateOfId,
    closeReason: t.closeReason,
    // Prisma returns Date objects; DevTicketWithTrail stores
    // ISO strings. The serializer (lib/serializers/ticket.ts)
    // already handles both shapes, so this is a type-only
    // normalisation for the contract.
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
    trail: t.trail.map((e) => ({
      id: e.id,
      ticketId: e.ticketId,
      toStatus: e.toStatus,
      actorId: e.actorId,
      note: e.note,
      timestamp: e.timestamp.toISOString(),
    })),
    departmentId: t.category?.departmentId ?? null,
  };
}

// Re-export common types for callers that don't want to import @prisma/client directly.
export type { Role, TicketStatus };
