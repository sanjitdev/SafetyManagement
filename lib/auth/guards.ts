/**
 * Role guard (lib/auth/guards.ts).
 *
 * PLAT-REQ-002: dispatcher + crew sessions bind to (city, ward, department).
 * Cross-scope queries denied at API layer.
 */

import type { Role } from '@prisma/client';
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