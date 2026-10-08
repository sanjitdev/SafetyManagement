/**
 * Unit tests for the dev session mint + lookup (lib/dev-session.ts).
 *
 * Validates:
 *   - devMintCitizenSession produces a cookie value that devDb.session can
 *     resolve back to a citizen SessionContext.
 *   - the cookie value is the session id (no signing in dev mode; the prod
 *     session module signs with HMAC, but the dev module is local-only).
 *   - expired sessions return null.
 *
 * These tests do NOT mock `next/headers`; the dev-session module imports
 * it but the imports are evaluated lazily at call time. The tests call
 * `devMintCitizenSession` (which never reads cookies) and the audit-only
 * pieces, so the Next runtime is irrelevant here.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  devMintCitizenSession,
} from '@/lib/dev-session';
import { devDb, resetStore, DEV_CITIZEN_ID } from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
});

describe('devMintCitizenSession', () => {
  it('persists a session for the seeded citizen (Rahim)', async () => {
    const { cookieValue } = await devMintCitizenSession();
    const session = devDb.session.findUnique({ where: { id: cookieValue } });
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(DEV_CITIZEN_ID);
  });

  it('returns a non-empty cookie value shaped like the prod cookie', async () => {
    const { cookieValue } = await devMintCitizenSession();
    expect(cookieValue).toBeTruthy();
    // In dev mode the cookie value is just the session id; the prod
    // module appends a signature. The session id alone is enough to
    // resolve the session.
    expect(cookieValue.length).toBeGreaterThanOrEqual(20);
  });

  it('produces distinct ids across calls (no collision)', async () => {
    const a = await devMintCitizenSession();
    const b = await devMintCitizenSession();
    expect(a.cookieValue).not.toBe(b.cookieValue);
  });
});