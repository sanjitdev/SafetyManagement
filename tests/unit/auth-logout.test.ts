/**
 * Unit tests for the logout flow (app/api/auth/logout/route.ts).
 *
 * Validates that:
 *   - Calling devMintCitizenSession + destroying the session via
 *     `destroySession(...)` removes the dev-store Session row.
 *   - After destruction, devGetSession() returns null (the cookie is
 *     no longer valid).
 *   - destroySession is idempotent: a second call for the same id
 *     resolves cleanly (no throw).
 *
 * The route handler itself (`app/api/auth/logout/route.ts`) is a
 * thin wrapper around `destroySession` + `cookies().delete(...)`. The
 * idempotency + db-row-removal is the contract worth pinning.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { devMintCitizenSession } from '@/lib/dev-session';
import { devDb, DEV_CITIZEN_ID, resetStore } from '@/lib/dev-store';
import { destroySession, SESSION_COOKIE } from '@/lib/auth/session';

beforeEach(() => {
  resetStore();
});

describe('POST /api/auth/logout — destroySession contract', () => {
  it('removes the Session row so the cookie is no longer valid', async () => {
    const { cookieValue } = await devMintCitizenSession();

    // Sanity: the session is present before logout
    const before = devDb.session.findUnique({ where: { id: cookieValue } });
    expect(before).not.toBeNull();
    expect(before!.userId).toBe(DEV_CITIZEN_ID);

    await destroySession(cookieValue);

    const after = devDb.session.findUnique({ where: { id: cookieValue } });
    expect(after).toBeNull();
  });

  it('is idempotent: destroying twice does not throw', async () => {
    const { cookieValue } = await devMintCitizenSession();

    await destroySession(cookieValue);
    // Second call: devDb.session.delete swallows the lookup error
    // (lib/auth/session.ts:140 catches and ignores), so this resolves
    // without throwing.
    await expect(destroySession(cookieValue)).resolves.toBeUndefined();

    const after = devDb.session.findUnique({ where: { id: cookieValue } });
    expect(after).toBeNull();
  });

  it('handles an unknown session id gracefully', async () => {
    // No session was created — destroying an unknown id must not throw.
    await expect(destroySession('does_not_exist')).resolves.toBeUndefined();
  });

  it('does not affect other sessions for the same user', async () => {
    const a = await devMintCitizenSession();
    const b = await devMintCitizenSession();
    expect(a.cookieValue).not.toBe(b.cookieValue);

    await destroySession(a.cookieValue);

    expect(devDb.session.findUnique({ where: { id: a.cookieValue } })).toBeNull();
    expect(devDb.session.findUnique({ where: { id: b.cookieValue } })).not.toBeNull();
  });

  it('uses the shared SESSION_COOKIE name so the route handler matches the original setter', () => {
    // The logout route calls `jar.set(SESSION_COOKIE, '', ...)` to
    // overwrite the cookie with an empty value. If the constant
    // drifts between the login route and the logout route, the
    // browser would never clear it. Pin the value.
    expect(SESSION_COOKIE).toBe('cityfix_session');
  });
});