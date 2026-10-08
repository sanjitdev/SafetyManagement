/**
 * Dev-mode session (lib/dev-session.ts).
 *
 * Mirrors the cookie-shape and SessionContext of lib/auth/session.ts, but
 * the cookie is a random id resolved against the in-memory dev store.
 * Active when `CITYFIX_DEV_STORE === '1'`. The real session module
 * (lib/auth/session.ts) is unchanged.
 *
 * Used by:
 *   - app/api/dev/login/route.ts (mint a citizen session for demo)
 *   - all dev-mode route handlers (resolve the cookie)
 *
 * The cookie is HttpOnly + SameSite=Lax, same name as the prod cookie so
 * the rest of the stack does not need to know it is dev.
 */

import { cookies } from 'next/headers';
import {
  devDb,
  getStore,
  isDevStore,
  type DevSession,
  DEV_CITIZEN_ID,
  DEV_DISPATCHER_ID,
  DEV_CREW_ID,
  DEV_ADMIN_ID,
  DEV_CITY_ID,
  DEV_WARD_ID,
} from './dev-store';
import { SESSION_COOKIE, type SessionContext } from './auth/session';

export async function devGetSession(): Promise<SessionContext | null> {
  if (!isDevStore()) return null;
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = devDb.session.findUnique({ where: { id: raw } });
  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) {
    devDb.session.delete({ where: { id: raw } });
    return null;
  }

  const user = devDb.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;

  // Fire-and-forget last-seen update
  devDb.session.update({
    where: { id: raw },
    data: { lastSeenAt: new Date().toISOString() },
  });

  return {
    sessionId: session.id,
    userId: user.id,
    cityId: session.cityId,
    wardId: session.wardId,
    departmentId: session.departmentId,
    role: user.role,
  };
}

/**
 * Mint a dev session for the persona identified by `role`. The cookie is
 * HttpOnly + SameSite=Lax (matching the real session module) and is named
 * the same so the rest of the stack does not need to know it is dev.
 *
 * Persona mapping (each persona binds to (city, ward, department) the
 * way production sessions do, so the role guards in `lib/auth/guards.ts`
 * exercise the real cross-scope code paths):
 *   - citizen    → Rahim, (city, ward_14, —)
 *   - dispatcher → Habib, (city, ward_14, dept_streetlight)
 *   - crew       → Rashid, (city, ward_14, dept_streetlight)
 *   - admin      → Anwar, (city, —, —)  // admins bypass ward/dept scope
 *
 * Returns the cookie value to set in the response.
 */
export type DevPersonaRole = 'citizen' | 'dispatcher' | 'crew' | 'admin';

export async function devMintSession(
  role: DevPersonaRole = 'citizen',
): Promise<{
  cookieValue: string;
  expiresAt: string;
  userId: string;
  role: DevPersonaRole;
}> {
  if (!isDevStore()) {
    throw new Error('devMintSession called outside dev-store mode');
  }
  const userId =
    role === 'citizen'
      ? DEV_CITIZEN_ID
      : role === 'dispatcher'
        ? DEV_DISPATCHER_ID
        : role === 'crew'
          ? DEV_CREW_ID
          : DEV_ADMIN_ID;
  const user = devDb.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`dev persona ${role} (${userId}) not seeded`);
  }
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const session = devDb.session.create({
    data: {
      userId: user.id,
      cityId: user.cityId,
      wardId: user.wardId,
      departmentId: user.departmentId,
      expiresAt,
    },
  });
  return { cookieValue: session.id, expiresAt, userId: user.id, role };
}

/**
 * Backwards-compatible shim — keeps the citizen-only mint callable from
 * any code that still imports it. New code should use `devMintSession`.
 */
export async function devMintCitizenSession(): Promise<{
  cookieValue: string;
  expiresAt: string;
}> {
  const { cookieValue, expiresAt } = await devMintSession('citizen');
  return { cookieValue, expiresAt };
}
