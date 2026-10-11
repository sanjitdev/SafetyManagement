/**
 * Role guard (lib/auth/guards.ts).
 *
 * PLAT-REQ-002: dispatcher + crew sessions bind to (city, ward, department).
 * Cross-scope queries denied at API layer.
 *
 * Bolt 005-001: adds the `requireWebAuthn` guard (ADR-007) that gates
 * every write under `/api/v1/admin/*`.
 */

import type { Role } from '@prisma/client';
import { db } from '@/lib/db-switch';
import { isDevStore } from '@/lib/dev-store';
import type { SessionContext } from './session';

/**
 * Throws if the session does not match the required role.
 * Use inside route handlers / server actions / API routes.
 */
export function requireRole(
  session: SessionContext | null,
  ...allowed: Role[]
): SessionContext {
  if (!session) {
    throw new ApiError(401, 'not_authenticated');
  }
  if (!allowed.includes(session.role)) {
    throw new ApiError(403, 'forbidden_role');
  }
  return session;
}

/**
 * Throws if the session is for a different city. Per-city isolation.
 */
export function requireSameCity(
  session: SessionContext | null,
  cityId: string,
): SessionContext {
  if (!session) {
    throw new ApiError(401, 'not_authenticated');
  }
  if (session.cityId !== cityId) {
    throw new ApiError(403, 'cross_city_access_denied');
  }
  return session;
}

/**
 * Dispatcher / crew: throw if the requested (wardId, departmentId) is
 * outside their session scope. Admins bypass this check.
 */
export function requireScope(
  session: SessionContext,
  wardId: string | null,
  departmentId: string | null,
): void {
  if (session.role === 'admin') return;
  if (session.role === 'citizen') {
    throw new ApiError(403, 'citizen_cannot_act_as_dispatcher_or_crew');
  }
  if (wardId !== session.wardId) {
    throw new ApiError(403, 'cross_ward_access_denied');
  }
  if (departmentId !== session.departmentId) {
    throw new ApiError(403, 'cross_department_access_denied');
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
    this.name = 'ApiError';
  }
}

/**
 * WebAuthn challenge TTL — 5 minutes. The `requireWebAuthn` guard
 * throws `webauthn_assertion_expired` if the most-recent challenge
 * for the session's user is older than this window. Bolt 005-001.
 */
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * Bolt 005-001 / ADR-007: every write under `/api/v1/admin/*`
 * must pass through this guard. Throws 401 `webauthn_required` if
 * the session's user has no registered WebAuthn credential, or
 * 401 `webauthn_assertion_expired` if the most-recent challenge
 * row is older than `WEBAUTHN_CHALLENGE_TTL_MS`.
 *
 * Dev seam: when `CITYFIX_DEV_STORE=1` AND
 * `DEV_SKIP_WEBAUTHN=1`, the guard short-circuits and returns
 * the session as-is. Production never reads `DEV_SKIP_WEBAUTHN`.
 */
export async function requireWebAuthn(
  session: SessionContext | null,
): Promise<SessionContext> {
  if (isDevStore() && process.env.DEV_SKIP_WEBAUTHN === '1') {
    if (!session) throw new ApiError(401, 'not_authenticated');
    return session;
  }
  if (!session) {
    throw new ApiError(401, 'not_authenticated');
  }
  if (session.role !== 'admin') {
    throw new ApiError(403, 'forbidden_role');
  }
  const { webAuthnCredentials } =
    await db.userWebAuthn.readCredentials(session.userId);
  if (!webAuthnCredentials || webAuthnCredentials.length === 0) {
    throw new ApiError(401, 'webauthn_required');
  }
  const challenge = await db.webAuthnChallenge.findLatest({
    userId: session.userId,
  });
  if (!challenge) {
    throw new ApiError(401, 'webauthn_assertion_expired');
  }
  const expiresAt =
    challenge.expiresAt instanceof Date
      ? challenge.expiresAt
      : new Date(challenge.expiresAt);
  if (expiresAt < new Date()) {
    throw new ApiError(401, 'webauthn_assertion_expired');
  }
  return session;
}