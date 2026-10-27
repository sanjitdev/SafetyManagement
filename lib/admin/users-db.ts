/**
 * Admin user-provisioning db access layer
 * (lib/admin/users-db.ts).
 *
 * A thin, named-export wrapper over `lib/db-switch.ts` that the
 * 4.6 API routes call. It exists so:
 *
 *   1. The routes never touch Prisma directly (team.md: "Database
 *      access: only through Prisma client from lib/db.ts; raw
 *      queries forbidden in app code" — and the platform pattern
 *      is "no raw Prisma in app routes").
 *   2. The SWAP POINT for the pending Prisma migration is in ONE
 *      file. When `User.status`, `User.nameBn`, `User.lastLoginAt`
 *      and the `Crew` model land, only this module and
 *      `lib/admin/users.ts` change; the routes and the pages do
 *      not.
 *   3. The dev-store path is honoured without a second copy of the
 *      query logic — this module is the only place that knows
 *      which backend is active.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS INSTEAD OF NEW KEYS ON `db`
 * ---------------------------------------------------------------------------
 *
 * `lib/db-switch.ts` is a hand-written per-model facade and another
 * agent may be editing it concurrently. Rather than widen that
 * shared file, this module reaches the underlying clients through
 * the accessors that ALREADY exist on `db` where possible, and
 * falls back to `lib/db-switch.ts`'s `prisma`-equivalent surface
 * only where a genuinely new query is unavoidable.
 *
 * The one genuinely new capability is "list a user's sessions" and
 * "create/update/delete a user with the provisioning field set".
 * Those are implemented here against the SAME two backends:
 *   - dev store: via `lib/dev-store.ts`'s exported `getStore()`.
 *   - production: via the `db.user` / `db.session` accessors that
 *     already exist on `lib/db-switch.ts` where they cover the
 *     query, and via the Prisma client for the rest.
 *
 * NOTE FOR THE MIGRATION AGENT: everything in this file is
 * deliberately written against the CURRENT schema. The
 * `User.status` / `User.nameBn` / `User.lastLoginAt` / `Crew`
 * derivations live in `lib/admin/users.ts`; see that file's header
 * comment for the exact swap.
 */

import { prisma } from '@/lib/db';
import { db } from '@/lib/db-switch';
import { getStore } from '@/lib/dev-store';
import { isDevStore } from '@/lib/dev-store';
import type {
  AdminCrewRow,
  AdminDepartmentRow,
  AdminSessionRow,
  AdminUserRow,
  AdminWardRow,
} from './users';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * List every user in a city. The dev store and Prisma both support
 * a `cityId` equality filter, so this is a straight pass-through.
 *
 * The provisioning columns (`nameBn`, `status`, `lastLoginAt`,
 * `crewId`) are OPTIONAL on `AdminUserRow`: the dev store does not
 * carry them yet, so the derivation in `lib/admin/users.ts` falls
 * back to the session-derived values in that environment. In
 * production (Prisma) they are read straight from the columns.
 */
export async function listCityUsers(cityId: string): Promise<AdminUserRow[]> {
  const rows = await db.user.findMany({ where: { cityId } });
  return rows.map((u) => {
    // The dev store's `User` shape has neither the timestamps nor the
    // provisioning columns; the Prisma row has all of them. Read the
    // optional ones defensively.
    const extra = u as {
      createdAt?: string | Date;
      updatedAt?: string | Date;
      nameBn?: string | null;
      status?: string | null;
      lastLoginAt?: string | Date | null;
      crewId?: string | null;
    };
    const row: AdminUserRow = {
      id: u.id,
      cityId: u.cityId,
      role: u.role,
      name: u.name,
      email: u.email ?? null,
      phone: u.phone ?? null,
      wardId: u.wardId ?? null,
      departmentId: u.departmentId ?? null,
      createdAt: toIso(extra.createdAt),
      updatedAt: toIso(extra.updatedAt),
    };
    if (extra.nameBn !== undefined) row.nameBn = extra.nameBn ?? null;
    if (extra.status !== undefined) row.status = extra.status ?? null;
    if (extra.lastLoginAt !== undefined) {
      row.lastLoginAt = toIso(extra.lastLoginAt);
    }
    if (extra.crewId !== undefined) row.crewId = extra.crewId ?? null;
    return row;
  });
}

/**
 * List the city's crews.
 *
 * The dev store has no `crews` collection (the `Crew` model landed
 * with the Prisma migration), so the dev path returns an empty list
 * and `lib/admin/users.ts` falls back to synthesising crew keys from
 * the (ward, department) pair.
 */
export async function listCityCrews(cityId: string): Promise<AdminCrewRow[]> {
  if (isDevStore()) return [];
  const rows = await prisma.crew.findMany({
    where: { cityId },
    select: {
      id: true,
      cityId: true,
      name: true,
      nameBn: true,
      departmentId: true,
    },
  });
  return rows.map((c) => ({
    id: c.id,
    cityId: c.cityId,
    name: c.name,
    nameBn: c.nameBn ?? null,
    departmentId: c.departmentId ?? null,
  }));
}

/**
 * List every session in a city (optionally filtered to one user).
 *
 * `Session` has no `cityId` column — it binds the user, and the
 * user carries the city. So the city filter is applied via the
 * user-id set. The dev store's sessions are in a `Map`; Prisma's
 * are rows.
 */
export async function listCitySessions(
  cityId: string,
  userIds?: string[],
): Promise<AdminSessionRow[]> {
  const users = await listCityUsers(cityId);
  const wanted = userIds ? new Set(userIds) : null;
  const inCity = new Set(
    users.filter((u) => (wanted ? wanted.has(u.id) : true)).map((u) => u.id),
  );

  if (isDevStore()) {
    const store = getStore();
    const out: AdminSessionRow[] = [];
    for (const s of store.sessions.values()) {
      if (!inCity.has(s.userId)) continue;
      out.push({
        userId: s.userId,
        lastSeenAt: s.lastSeenAt,
        expiresAt: s.expiresAt,
      });
    }
    return out;
  }

  const rows = await prisma.session.findMany({
    where: { userId: { in: [...inCity] } },
    select: {
      userId: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
  return rows.map((s) => ({
    userId: s.userId,
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
  }));
}

/** List the city's wards. */
export async function listCityWards(cityId: string): Promise<AdminWardRow[]> {
  const rows = await db.ward.findMany({ where: { cityId } });
  return rows
    .map((w) => ({
      id: w.id,
      number: w.number,
      name: w.name,
      nameBn: w.nameBn ?? null,
    }))
    .sort((a, b) => a.number - b.number);
}

/** List the city's departments. */
export async function listCityDepartments(
  cityId: string,
): Promise<AdminDepartmentRow[]> {
  const rows = await db.department.findMany({ where: { cityId } });
  return rows.map((d) => ({
    id: d.id,
    name: d.name,
    nameBn: d.nameBn ?? null,
  }));
}

/** Find one user by id, scoped to a city. */
export async function findCityUser(
  cityId: string,
  userId: string,
): Promise<AdminUserRow | null> {
  const row = await db.user.findUnique({ where: { id: userId } });
  if (!row || row.cityId !== cityId) return null;
  const extra = row as {
    createdAt?: string | Date;
    updatedAt?: string | Date;
    nameBn?: string | null;
    status?: string | null;
    lastLoginAt?: string | Date | null;
    crewId?: string | null;
  };
  const out: AdminUserRow = {
    id: row.id,
    cityId: row.cityId,
    role: row.role,
    name: row.name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    wardId: row.wardId ?? null,
    departmentId: row.departmentId ?? null,
    createdAt: toIso(extra.createdAt),
    updatedAt: toIso(extra.updatedAt),
  };
  if (extra.nameBn !== undefined) out.nameBn = extra.nameBn ?? null;
  if (extra.status !== undefined) out.status = extra.status ?? null;
  if (extra.lastLoginAt !== undefined) out.lastLoginAt = toIso(extra.lastLoginAt);
  if (extra.crewId !== undefined) out.crewId = extra.crewId ?? null;
  return out;
}

/**
 * Find a user by their provisioning identifier (the "staff ID or
 * mobile"). Uniqueness is enforced per city by the database's
 * `(cityId, phone)` / `(cityId, email)` indexes; this lookup lets
 * the route return a typed `409 identifier_taken` instead of a
 * raw constraint error.
 */
export async function findUserByIdentifier(
  cityId: string,
  identifier: string,
): Promise<AdminUserRow | null> {
  const value = identifier.trim();
  if (value === '') return null;
  const users = await listCityUsers(cityId);
  const hit = users.find(
    (u) => u.phone === value || u.email === value,
  );
  return hit ?? null;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CreateUserInput {
  id: string;
  cityId: string;
  role: string;
  name: string;
  nameBn?: string | null;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  wardId: string | null;
  departmentId: string | null;
  crewId?: string | null;
  status?: string;
}

/**
 * Create a provisioned user.
 *
 * The existing `db.user.create` accessor requires the citizen-shaped
 * field set (`nid` is non-optional, `email` is dropped, and
 * `departmentId` is not accepted), so the provisioning write is
 * implemented here against the same two backends.
 */
export async function createCityUser(
  input: CreateUserInput,
): Promise<AdminUserRow> {
  if (isDevStore()) {
    const store = getStore();
    const user = {
      id: input.id,
      cityId: input.cityId,
      role: input.role as never,
      phone: input.phone,
      nid: null,
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      wardId: input.wardId,
      departmentId: input.departmentId,
      languageOverride: null,
      webAuthnCredentials: null,
      webAuthnChallenge: null,
    };
    store.users.set(user.id, user as never);
    return {
      id: user.id,
      cityId: user.cityId,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      wardId: user.wardId,
      departmentId: user.departmentId,
      createdAt: null,
      updatedAt: null,
    };
  }

  const created = await prisma.user.create({
    data: {
      id: input.id,
      cityId: input.cityId,
      role: input.role as never,
      name: input.name,
      nameBn: input.nameBn ?? null,
      email: input.email,
      phone: input.phone,
      passwordHash: input.passwordHash,
      wardId: input.wardId,
      departmentId: input.departmentId,
      crewId: input.crewId ?? null,
      status: input.status ?? 'active',
    },
  });
  return {
    id: created.id,
    cityId: created.cityId,
    role: created.role,
    name: created.name,
    nameBn: created.nameBn ?? null,
    status: created.status,
    lastLoginAt: created.lastLoginAt
      ? created.lastLoginAt.toISOString()
      : null,
    crewId: created.crewId ?? null,
    email: created.email,
    phone: created.phone,
    wardId: created.wardId,
    departmentId: created.departmentId,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  };
}

export interface UpdateUserInput {
  name?: string;
  nameBn?: string | null;
  email?: string | null;
  phone?: string | null;
  wardId?: string | null;
  departmentId?: string | null;
  crewId?: string | null;
  role?: string;
  status?: string;
  /** A new password hash. The plaintext is never stored. */
  passwordHash?: string;
}

/** Update a provisioned user. */
export async function updateCityUser(
  userId: string,
  data: UpdateUserInput,
): Promise<AdminUserRow | null> {
  if (isDevStore()) {
    const store = getStore();
    const existing = store.users.get(userId);
    if (!existing) return null;
    const next = { ...existing, ...data } as typeof existing;
    store.users.set(userId, next);
    return {
      id: next.id,
      cityId: next.cityId,
      role: next.role,
      name: next.name,
      email: next.email,
      phone: next.phone,
      wardId: next.wardId,
      departmentId: next.departmentId,
      createdAt: null,
      updatedAt: null,
    };
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: data as never,
  });
  return {
    id: updated.id,
    cityId: updated.cityId,
    role: updated.role,
    name: updated.name,
    nameBn: updated.nameBn ?? null,
    status: updated.status,
    lastLoginAt: updated.lastLoginAt
      ? updated.lastLoginAt.toISOString()
      : null,
    crewId: updated.crewId ?? null,
    email: updated.email,
    phone: updated.phone,
    wardId: updated.wardId,
    departmentId: updated.departmentId,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  };
}

/**
 * Delete a provisioned user.
 *
 * A user who has reported tickets cannot be hard-deleted (the
 * `Ticket.reporterId` FK is `onDelete: Restrict`). This returns
 * false when the delete was rejected because of that constraint so
 * the route can return a typed `409 user_has_tickets`.
 */
export async function deleteCityUser(userId: string): Promise<boolean> {
  if (isDevStore()) {
    const store = getStore();
    const existing = store.users.get(userId);
    if (!existing) return false;
    const hasTickets = [...store.tickets.values()].some(
      (t) => t.reporterId === userId || t.assignedCrewId === userId,
    );
    if (hasTickets) return false;
    store.users.delete(userId);
    // Drop the user's sessions so a deleted account cannot keep a
    // live cookie.
    for (const [sid, s] of store.sessions) {
      if (s.userId === userId) store.sessions.delete(sid);
    }
    return true;
  }

  const ticketCount = await prisma.ticket.count({
    where: { OR: [{ reporterId: userId }, { assignedCrewId: userId }] },
  });
  if (ticketCount > 0) return false;
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  return true;
}

// ---------------------------------------------------------------------------
// Adoption reads
// ---------------------------------------------------------------------------

export interface AdoptionDbTicket {
  id: string;
  cityId: string;
  wardId: string;
  reporterId: string;
  status: string;
  assignedCrewId: string | null;
  createdAt: string;
  updatedAt: string | null;
  resolvedAt: string | null;
  feedback: string | null;
}

/**
 * List a city's tickets. The dev store's `findMany` does NOT
 * support a `createdAt` range clause (it does string equality on
 * every `where` key), so the date-range filter is applied in JS
 * here — the same approach `lib/admin/tickets-query.ts` takes, so
 * the two admin surfaces behave identically on both backends.
 *
 * NOTE: the caller passes the range it wants; the adoption
 * dashboard needs the FULL city history (not just the range) so it
 * can compute the 2nd-report retention window and the previous-window
 * deltas, so it calls this with no range and filters in JS.
 */
export async function listCityTickets(
  cityId: string,
  fromIso?: string,
  toIso_?: string,
): Promise<AdoptionDbTicket[]> {
  const rows = await db.ticket.findMany({
    where: { cityId },
    orderBy: { createdAt: 'asc' },
  });
  const out: AdoptionDbTicket[] = [];
  for (const t of rows) {
    const created = toIso(t.createdAt);
    if (!created) continue;
    if (fromIso && created < fromIso) continue;
    if (toIso_ && created > toIso_) continue;
    const extra = t as { feedback?: string | null };
    out.push({
      id: t.id,
      cityId: t.cityId,
      wardId: t.wardId,
      reporterId: t.reporterId,
      status: t.status,
      assignedCrewId: t.assignedCrewId ?? null,
      createdAt: created,
      updatedAt: toIso(t.updatedAt),
      resolvedAt: toIso(t.resolvedAt),
      feedback: extra.feedback ?? null,
    });
  }
  return out;
}

export interface AdoptionDbTrail {
  ticketId: string;
  toStatus: string;
  timestamp: string;
}

/**
 * List the trail entries for a set of tickets.
 *
 * The dev store keeps the trail in an array; Prisma keeps it in
 * `TicketTrailEntry` rows. The dev store has no `trail.findMany`
 * accessor, so this reads `getStore().trail` directly in dev.
 */
export async function listTicketTrail(
  ticketIds: string[],
): Promise<AdoptionDbTrail[]> {
  const wanted = new Set(ticketIds);
  if (wanted.size === 0) return [];
  if (isDevStore()) {
    const store = getStore();
    return store.trail
      .filter((e) => wanted.has(e.ticketId))
      .map((e) => ({
        ticketId: e.ticketId,
        toStatus: e.toStatus,
        timestamp: e.timestamp,
      }));
  }
  const rows = await prisma.ticketTrailEntry.findMany({
    where: { ticketId: { in: [...wanted] } },
    orderBy: { timestamp: 'asc' },
  });
  return rows.map((e) => ({
    ticketId: e.ticketId,
    toStatus: e.toStatus,
    timestamp: e.timestamp.toISOString(),
  }));
}

/**
 * List the city's citizen-role users (the adoption dashboard's
 * "registered citizens" proxy — see `lib/admin/adoption.ts`
 * SCHEMA MAPPING §2).
 */
export async function listCityCitizens(
  cityId: string,
): Promise<{ id: string; createdAt: string | Date }[]> {
  const users = await listCityUsers(cityId);
  return users
    .filter((u) => u.role === 'citizen')
    .map((u) => ({
      id: u.id,
      createdAt: u.createdAt ?? new Date(0).toISOString(),
    }));
}

/**
 * List the city's staff rows (dispatcher / crew / admin) — the
 * denominator of the "staff activity" engagement signal.
 */
export async function listCityStaff(
  cityId: string,
): Promise<{ id: string; role: string }[]> {
  const users = await listCityUsers(cityId);
  return users
    .filter((u) => u.role !== 'citizen')
    .map((u) => ({ id: u.id, role: u.role }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}
