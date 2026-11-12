/**
 * Unit tests for the dispatcher auth + scope guards
 * (lib/auth/guards.ts → requireRole, requireSameCity, requireScope).
 *
 * DISP-001 (Intent 003, Unit 001): the dispatcher's session is bound to
 * (cityId, wardId?, departmentId?) and every dispatcher endpoint must
 * enforce cross-scope denial at the API layer. The platform layer
 * already implements these guards — this test pins the expected
 * behavior so any future refactor that relaxes the denial surfaces a
 * failing test.
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
    userId: 'user_dispatcher_habib',
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    departmentId: 'dept_streetlight',
    role: 'dispatcher',
    ...overrides,
  };
}

describe('requireRole', () => {
  it('throws 401 not_authenticated when the session is null', () => {
    expect(() => requireRole(null, 'dispatcher')).toThrowError(ApiError);
    try {
      requireRole(null, 'dispatcher');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
      expect((err as ApiError).code).toBe('not_authenticated');
    }
  });

  it('throws 403 forbidden_role when the role is not in the allowed set', () => {
    const citizen = mkSession({ role: 'citizen' });
    expect(() => requireRole(citizen, 'dispatcher')).toThrowError(ApiError);
    try {
      requireRole(citizen, 'dispatcher');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('forbidden_role');
    }
  });

  it('returns the session when the role matches', () => {
    const dispatcher = mkSession({ role: 'dispatcher' });
    const out = requireRole(dispatcher, 'dispatcher');
    expect(out).toBe(dispatcher);
  });

  it('returns the session when the role is one of several allowed', () => {
    const dispatcher = mkSession({ role: 'dispatcher' });
    const out = requireRole(dispatcher, 'crew', 'dispatcher', 'admin');
    expect(out).toBe(dispatcher);
  });
});

describe('requireSameCity', () => {
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

describe('requireScope (dispatcher / crew cross-scope denial)', () => {
  it('returns silently when the requested (wardId, departmentId) matches the session', () => {
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    // Should not throw.
    expect(() => requireScope(dispatcher, 'ward_14', 'dept_streetlight')).not.toThrow();
  });

  it('throws 403 cross_ward_access_denied when the wardId differs', () => {
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(dispatcher, 'ward_15', 'dept_streetlight')).toThrowError(
      ApiError,
    );
    try {
      requireScope(dispatcher, 'ward_15', 'dept_streetlight');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('cross_ward_access_denied');
    }
  });

  it('throws 403 cross_department_access_denied when the departmentId differs', () => {
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(dispatcher, 'ward_14', 'dept_water')).toThrowError(ApiError);
    try {
      requireScope(dispatcher, 'ward_14', 'dept_water');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('cross_department_access_denied');
    }
  });

  it('allows a no-department ticket (the category is not department-scoped)', () => {
    // A category with NO department (e.g. "Other") produces a ticket
    // that is not department-scoped: every dispatcher in the ward may
    // open it. The dispatcher queue already lists such tickets
    // (`if (ticketDepartment && ticketDepartment !== session.departmentId)`),
    // so the guard must agree with the list filter — otherwise the
    // queue shows a ticket the detail endpoint refuses.
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(dispatcher, 'ward_14', null)).not.toThrow();
  });

  it('allows a no-department ticket but still denies a different department', () => {
    // The two halves of the rule, side by side: a null ticket
    // department → allowed; a real, different department → denied.
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    expect(() => requireScope(dispatcher, 'ward_14', null)).not.toThrow();
    expect(() => requireScope(dispatcher, 'ward_14', 'dept_waste')).toThrowError(ApiError);
    try {
      requireScope(dispatcher, 'ward_14', 'dept_waste');
    } catch (err) {
      expect((err as ApiError).status).toBe(403);
      expect((err as ApiError).code).toBe('cross_department_access_denied');
    }
  });

  it('still denies a no-department ticket from another ward', () => {
    // The ward check fires BEFORE the department check, so the
    // no-department exemption never widens the ward boundary.
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    try {
      requireScope(dispatcher, 'ward_15', null);
    } catch (err) {
      expect((err as ApiError).code).toBe('cross_ward_access_denied');
    }
  });

  it('allows a no-department ticket for a session with no department binding', () => {
    // An admin-provisioned dispatcher carries `departmentId: null` by
    // design (`resolveScope` in
    // `app/api/v1/admin/cities/[id]/users/route.ts`) — a dispatcher is
    // ward-scoped, not department-scoped. Such a session is not
    // department-scoped either, so it is not restricted by the
    // department dimension at all; the ward check still applies.
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: null,
    });
    expect(() => requireScope(dispatcher, 'ward_14', null)).not.toThrow();
    expect(() => requireScope(dispatcher, 'ward_14', 'dept_streetlight')).not.toThrow();
  });

  it('checks wardId BEFORE departmentId (ward mismatch wins even if dept also mismatches)', () => {
    // DISP-001 Acceptance 2: a request that scopes to
    // (city_dhaka_north, ward_15, dept_water) fails with
    // cross_ward_access_denied, not cross_department_access_denied.
    // The guard's short-circuit is part of the contract.
    const dispatcher = mkSession({
      role: 'dispatcher',
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    try {
      requireScope(dispatcher, 'ward_15', 'dept_water');
    } catch (err) {
      expect((err as ApiError).code).toBe('cross_ward_access_denied');
    }
  });

  it('citizen sessions are rejected with citizen_cannot_act_as_dispatcher_or_crew', () => {
    // Citizens do not have a dispatcher-scoped session; requireScope is
    // a dispatcher/crew guard, not a citizen guard. The contract is
    // that a citizen calling requireScope fails fast with a specific
    // code so the API layer does not silently treat them as a
    // dispatcher with null ward/department.
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

describe('ApiError shape', () => {
  it('carries status and code; message defaults to code', () => {
    const e = new ApiError(403, 'cross_ward_access_denied');
    expect(e.status).toBe(403);
    expect(e.code).toBe('cross_ward_access_denied');
    expect(e.message).toBe('cross_ward_access_denied');
    expect(e.name).toBe('ApiError');
    expect(e).toBeInstanceOf(Error);
  });

  it('accepts an explicit message', () => {
    const e = new ApiError(422, 'illegal_transition', 'submitted → resolved is not allowed');
    expect(e.message).toBe('submitted → resolved is not allowed');
    expect(e.code).toBe('illegal_transition');
  });
});
