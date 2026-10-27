/**
 * Unit tests for the dev-mode session (`lib/dev-session.ts`) and the
 * `getActiveSession` delegate in `lib/db-switch.ts`.
 *
 * `next/headers` is mocked so `cookies()` returns a controllable jar —
 * the real `cookies()` throws outside a Next request scope.
 *
 * Validates:
 *   - devMintCitizenSession produces a cookie value that devDb.session can
 *     resolve back to a citizen SessionContext.
 *   - the cookie value is the session id (no signing in dev mode; the prod
 *     session module signs with HMAC, but the dev module is local-only).
 *   - expired sessions return null.
 *   - `devGetSession` — no cookie, an unknown session id, an expired
 *     session (deleted on read), a valid session, and a session whose
 *     user row has been removed.
 *   - `devMintSession` — one mint per persona role, the persona → user
 *     binding, the scope binding carried on the session row, and the
 *     guard that refuses to mint outside dev-store mode.
 *   - `getActiveSession` — delegates to the dev session.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

let cookieJar = new Map<string, string>();

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
}));

import {
  devGetSession,
  devMintCitizenSession,
  devMintSession,
} from '@/lib/dev-session';
import { getActiveSession } from '@/lib/db-switch';
import { SESSION_COOKIE } from '@/lib/auth/session';
import {
  devDb,
  resetStore,
  getStore,
  DEV_CITIZEN_ID,
  DEV_DISPATCHER_ID,
  DEV_CREW_ID,
  DEV_ADMIN_ID,
  DEV_CITY_ID,
} from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
  cookieJar = new Map();
});

// ---------------------------------------------------------------------------
// devMintCitizenSession
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// devGetSession
// ---------------------------------------------------------------------------

describe('devGetSession', () => {
  it('returns null when there is no cookie', async () => {
    expect(await devGetSession()).toBeNull();
  });

  it('returns null for an unknown session id', async () => {
    cookieJar.set(SESSION_COOKIE, 'ses_ghost');
    expect(await devGetSession()).toBeNull();
  });

  it('returns the session context for a valid cookie', async () => {
    const { cookieValue } = await devMintSession('citizen');
    cookieJar.set(SESSION_COOKIE, cookieValue);

    const ctx = await devGetSession();
    expect(ctx).not.toBeNull();
    expect(ctx?.userId).toBe(DEV_CITIZEN_ID);
    expect(ctx?.cityId).toBe(DEV_CITY_ID);
    expect(ctx?.role).toBe('citizen');
  });

  it('returns null and deletes the row for an EXPIRED session', async () => {
    const { cookieValue } = await devMintSession('citizen');
    // Back-date the expiry.
    const store = getStore();
    const row = store.sessions.get(cookieValue) as unknown as Record<string, unknown>;
    row.expiresAt = '2000-01-01T00:00:00.000Z';
    store.sessions.set(cookieValue, row as never);

    cookieJar.set(SESSION_COOKIE, cookieValue);
    expect(await devGetSession()).toBeNull();
    expect(store.sessions.has(cookieValue)).toBe(false);
  });

  it('returns null when the session user row has been removed', async () => {
    const { cookieValue } = await devMintSession('citizen');
    getStore().users.delete(DEV_CITIZEN_ID);

    cookieJar.set(SESSION_COOKIE, cookieValue);
    expect(await devGetSession()).toBeNull();
  });

  it('updates lastSeenAt on a successful read', async () => {
    const { cookieValue } = await devMintSession('citizen');
    const store = getStore();
    const row = store.sessions.get(cookieValue) as unknown as Record<string, unknown>;
    row.lastSeenAt = '2020-01-01T00:00:00.000Z';
    store.sessions.set(cookieValue, row as never);

    cookieJar.set(SESSION_COOKIE, cookieValue);
    expect(await devGetSession()).not.toBeNull();
    expect(String(store.sessions.get(cookieValue)?.lastSeenAt)).not.toBe(
      '2020-01-01T00:00:00.000Z',
    );
  });
});

// ---------------------------------------------------------------------------
// devMintSession
// ---------------------------------------------------------------------------

describe('devMintSession', () => {
  it('mints a session for each persona role', async () => {
    const cases = [
      ['citizen', DEV_CITIZEN_ID],
      ['dispatcher', DEV_DISPATCHER_ID],
      ['crew', DEV_CREW_ID],
      ['admin', DEV_ADMIN_ID],
    ] as const;

    for (const [role, userId] of cases) {
      const minted = await devMintSession(role);
      expect(minted.role).toBe(role);
      expect(minted.userId).toBe(userId);
      expect(minted.cookieValue).toBeTruthy();
    }
  });

  it('binds the persona scope on the session row', async () => {
    const dispatcher = await devMintSession('dispatcher');
    const row = getStore().sessions.get(dispatcher.cookieValue);
    expect(row?.wardId).toBe('ward_14');
    expect(row?.departmentId).toBeTruthy();
  });

  it('mints a session with a 14-day expiry', async () => {
    const before = Date.now();
    const minted = await devMintSession('citizen');
    const delta = Date.parse(minted.expiresAt) - before;
    expect(delta).toBeGreaterThan(14 * 24 * 60 * 60 * 1000 - 5_000);
    expect(delta).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000 + 5_000);
  });

  it('produces a distinct cookie value per call', async () => {
    const a = await devMintSession('citizen');
    const b = await devMintSession('citizen');
    expect(a.cookieValue).not.toBe(b.cookieValue);
  });

  it('refuses to mint outside dev-store mode', async () => {
    const previous = process.env.CITYFIX_DEV_STORE;
    process.env.CITYFIX_DEV_STORE = '0';
    try {
      await expect(devMintSession('citizen')).rejects.toThrow(
        'devMintSession called outside dev-store mode',
      );
    } finally {
      process.env.CITYFIX_DEV_STORE = previous;
    }
  });
});

// ---------------------------------------------------------------------------
// getActiveSession
// ---------------------------------------------------------------------------

describe('getActiveSession', () => {
  it('resolves to null when there is no cookie', async () => {
    expect(await getActiveSession()).toBeNull();
  });

  it('delegates to the dev session for a valid cookie', async () => {
    const minted = await devMintSession('dispatcher');
    cookieJar.set(SESSION_COOKIE, minted.cookieValue);

    const ctx = await getActiveSession();
    expect(ctx?.userId).toBe(DEV_DISPATCHER_ID);
    expect(ctx?.role).toBe('dispatcher');
  });
});
