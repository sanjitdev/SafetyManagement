/**
 * Admin route scope — requireRole('admin') + requireWebAuthn(session).
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 * These tests pin the contract that all 8 new admin API routes
 * share: a `citizen`/`dispatcher`/`crew` session must be rejected
 * with 403 `forbidden_role`, and an unauthenticated request must
 * be rejected with 401 `not_authenticated`. The dev seam
 * (`CITYFIX_DEV_STORE=1` + `DEV_SKIP_WEBAUTHN=1`) short-circuits
 * the WebAuthn guard for the admin only.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { requireRole, requireWebAuthn, ApiError } from '@/lib/auth/guards';
import { resetStore, DEV_ADMIN_ID, DEV_CITIZEN_ID } from '@/lib/dev-store';
import type { SessionContext } from '@/lib/auth/session';

function mkSession(overrides: Partial<SessionContext>): SessionContext {
  return {
    sessionId: 'sess_test',
    userId: DEV_ADMIN_ID,
    cityId: 'city_dhaka_north',
    wardId: null,
    departmentId: null,
    role: 'admin',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.CITYFIX_DEV_STORE = '1';
  process.env.DEV_SKIP_WEBAUTHN = '1';
  resetStore();
});

describe('requireRole("admin") (Bolt 005-002)', () => {
  it('throws 401 not_authenticated when session is null', () => {
    expect(() => requireRole(null, 'admin')).toThrow(ApiError);
    try {
      requireRole(null, 'admin');
    } catch (e) {
      expect((e as ApiError).status).toBe(401);
      expect((e as ApiError).code).toBe('not_authenticated');
    }
  });

  it('throws 403 forbidden_role for a citizen session', () => {
    const citizen = mkSession({
      userId: DEV_CITIZEN_ID,
      role: 'citizen',
    });
    expect(() => requireRole(citizen, 'admin')).toThrow(ApiError);
    try {
      requireRole(citizen, 'admin');
    } catch (e) {
      expect((e as ApiError).status).toBe(403);
      expect((e as ApiError).code).toBe('forbidden_role');
    }
  });

  it('returns the session for an admin session', () => {
    const admin = mkSession({ role: 'admin' });
    const result = requireRole(admin, 'admin');
    expect(result).toBe(admin);
  });
});

describe('requireWebAuthn (Bolt 005-002)', () => {
  it('throws 401 not_authenticated when session is null', async () => {
    await expect(requireWebAuthn(null)).rejects.toBeInstanceOf(ApiError);
    try {
      await requireWebAuthn(null);
    } catch (e) {
      expect((e as ApiError).status).toBe(401);
    }
  });

  it('dev seam short-circuits for an admin session', async () => {
    const admin = mkSession({ role: 'admin' });
    const result = await requireWebAuthn(admin);
    expect(result).toBe(admin);
  });
});
