/**
 * Unit tests for the crew auth + scope guards
 * (lib/auth/guards.ts → requireRole, requireSameCity, requireScope).
 *
 * CREW-001 (Intent 004, Unit 001): the crew's session is bound to
 * (cityId, wardId?, departmentId?) and every crew endpoint must
 * enforce cross-scope denial at the API layer. The platform layer
 * already implements these guards — this test pins the expected
 * behavior so any future refactor that relaxes the denial surfaces a
 * failing test.
 *
 * This file is a near-mirror of `dispatcher-scope.test.ts` with
 * `role: 'crew'` in place of `role: 'dispatcher'`. The cross-scope
 * denial code path is shared between dispatcher and crew (see
 * `lib/auth/guards.ts`); the test pins the crew-specific call sites
 * and the cross-role denial (crew ↔ dispatcher).
 *
 * No mocks are needed: requireRole / requireScope / requireSameCity
 * are pure functions of (session, ...args). They do not touch the
 * database, the cookie, or any external service.
 */

import { describe, expect, it } from 'vitest';
import { requireRole, requireScope, requireSameCity, ApiError } from '@/lib/auth/guards';
import type { SessionContext } from '@/lib/auth/session';

/** Build a session context with the same shape the guards see at runtime. */
function mkSession(overrides: Partial<SessionContext> = {}): SessionContext {
  return {
    sessionId: 'sess_test_1',
    userId: 'user_crew_rashid',
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    departmentId: 'dept_streetlight',
    role: 'crew',
    ...overrides,
  };
}

describe('requireRole (crew)', () => {
  it('throws 401 not_authenticated when the session is null', () => {
    expect(() => requireRole(null, 'crew')).toThrowError(ApiError);
    try {
      requireRole(null, 'crew');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).code).toBe('not_authenticated');
    }
  });

  it('throws 403 forbidden_role when the role is not crew', () => {
    const dispatcher = mkSession({ role: 'dispatcher' });
    expect(() => requireRole(dispatcher, 'crew')).toThrowError(ApiError);
    try {
      requireRole(dispatcher, 'crew');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('forbidden_role');
    }
  });

  it('returns the session when the role is crew', () => {
    const crew = mkSession({ role: 'crew' });
    const out = requireRole(crew, 'crew');
    expect(out).toBe(crew);
  });

  it('returns the session when crew is one of several allowed', () => {
    // The crew shares the dispatcher+crew scope guard; some
    // routes may accept both. The contract is that the crew
    // passes when the allowed list includes 'crew' (even
    // if it also includes 'dispatcher' / 'admin').
    const crew = mkSession({ role: 'crew' });
    const out = requireRole(crew, 'crew', 'admin');
    expect(out).toBe(crew);
  });
});

describe('requireSameCity (crew)', () => {
  it('throws 401 when the session is null', () => {
    expect(() => requireSameCity(null, 'city_dhaka_north')).toThrowError(ApiError);
    try {
      requireSameCity(null, 'city_dhaka_north');
    } catch (err) {
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).code).toBe('not_authenticated');
    }
  });

  it('throws 403 cross_city_access_denied when the cityId differs', () => {
    const session = mkSession({ cityId: 'city_dhaka_north' });
    expect(() => requireSameCity(session, 'city_chittagong')).toThrowError(ApiError);
    try {
      requireSameCity(session, 'city_chittagong');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('cross_city_access_denied');
    }
  });

  it('returns the session when the cityId matches', () => {
    const session = mkSession({ cityId: 'city_dhaka_north' });
    const out = requireSameCity(session, 'city_dhaka_north');
    expect(out).toBe(session);
  });
});

describe('requireScope (crew cross-scope denial)', () => {
  it('returns silently when the requested (wardId, departmentId) matches the session', () => {
    const crew = mkSession({
      role: 'crew',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    // Should not throw.
    expect(() => requireScope(crew, 'ward_14', 'dept_streetlight')).not.toThrow();
  });

  it('throws 403 cross_ward_access_denied when the wardId differs', () => {
    const crew = mkSession({
      role: 'crew',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(crew, 'ward_15', 'dept_streetlight')).toThrowError(
      ApiError,
    );
    try {
      requireScope(crew, 'ward_15', 'dept_streetlight');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('cross_ward_access_denied');
    }
  });

  it('throws 403 cross_department_access_denied when the departmentId differs', () => {
    const crew = mkSession({
      role: 'crew',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(crew, 'ward_14', 'dept_water')).toThrowError(ApiError);
    try {
      requireScope(crew, 'ward_14', 'dept_water');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('cross_department_access_denied');
    }
  });

  it('checks wardId BEFORE departmentId (ward mismatch wins even if dept also mismatches)', () => {
    // CREW-001 acceptance: a request that scopes to
    // (city_dhaka_north, ward_15, dept_water) fails with
    // cross_ward_access_denied, not cross_department_access_denied.
    // The guard's short-circuit is part of the contract.
    const crew = mkSession({
      role: 'crew',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    try {
      requireScope(crew, 'ward_15', 'dept_water');
    } catch (err) {
      expect((err as ApiError).code).toBe('cross_ward_access_denied');
    }
  });

  it('citizen sessions are rejected with citizen_cannot_act_as_dispatcher_or_crew', () => {
    // Citizens do not have a crew-scoped session; requireScope is
    // a dispatcher/crew guard, not a citizen guard. The contract is
    // that a citizen calling requireScope fails fast with a specific
    // code so the API layer does not silently treat them as a
    // crew member with null ward/department.
    const citizen = mkSession({
      role: 'citizen',
      wardId: 'ward_14',
      departmentId: null,
    });
    expect(() => requireScope(citizen, 'ward_14', null)).toThrowError(ApiError);
    try {
      requireScope(citizen, 'ward_14', null);
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('citizen_cannot_act_as_dispatcher_or_crew');
    }
  });

  it('admin sessions bypass the ward/department scope check', () => {
    // Admins are city-scoped only — they read across wards. The
    // contract is that requireScope returns silently for an admin
    // session regardless of the requested ward/department.
    const admin = mkSession({
      role: 'admin',
      wardId: null,
      departmentId: null,
    });
    expect(() => requireScope(admin, 'ward_15', 'dept_water')).not.toThrow();
    expect(() => requireScope(admin, 'ward_14', 'dept_streetlight')).not.toThrow();
    expect(() => requireScope(admin, null, null)).not.toThrow();
  });

  it('crew sessions are scoped the same way as dispatchers', () => {
    // The cross-scope denial code path is shared by dispatcher + crew;
    // pin it so a refactor that diverges the two surfaces a test fail.
    // This is the same shape as the dispatcher test, but with
    // role='crew' to make the intent explicit.
    const crew = mkSession({
      role: 'crew',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(crew, 'ward_14', 'dept_streetlight')).not.toThrow();
    expect(() => requireScope(crew, 'ward_15', 'dept_streetlight')).toThrowError(ApiError);
    try {
      requireScope(crew, 'ward_15', 'dept_streetlight');
    } catch (err) {
      expect((err as ApiError).code).toBe('cross_ward_access_denied');
    }
  });
});

describe('cross-role denial (crew ↔ dispatcher)', () => {
  // CREW-001 Acceptance 4: crew and dispatcher are non-overlapping
  // roles. A crew calling a dispatcher-scoped endpoint fails with
  // 403 forbidden_role, and vice versa. Pin the contract so a future
  // refactor that broadens the allowed list surfaces a test fail.
  it('crew session is rejected from a dispatcher-only requireRole', () => {
    const crew = mkSession({ role: 'crew' });
    expect(() => requireRole(crew, 'dispatcher')).toThrowError(ApiError);
    try {
      requireRole(crew, 'dispatcher');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('forbidden_role');
    }
  });

  it('dispatcher session is rejected from a crew-only requireRole', () => {
    const dispatcher = mkSession({ role: 'dispatcher' });
    expect(() => requireRole(dispatcher, 'crew')).toThrowError(ApiError);
    try {
      requireRole(dispatcher, 'crew');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('forbidden_role');
    }
  });

  it('citizen session is rejected from a crew-only requireRole', () => {
    const citizen = mkSession({ role: 'citizen' });
    expect(() => requireRole(citizen, 'crew')).toThrowError(ApiError);
    try {
      requireRole(citizen, 'crew');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('forbidden_role');
    }
  });
});
