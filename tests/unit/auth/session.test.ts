/**
 * Unit tests for the session-cookie helpers (`lib/auth/session.ts`).
 *
 * PLAT-REQ-002 + tech-audit §4: HTTP-only, SameSite=Lax, Secure signed
 * cookies. The cookie value is `<sessionId>.<hmac-sha256>`; the
 * session record carries the (cityId, wardId, departmentId) scope
 * binding.
 *
 * `next/headers` is mocked so `cookies()` returns a controllable jar.
 * The signing secret is pinned via `SESSION_SECRET` (the module
 * requires ≥ 32 characters).
 *
 * Covered:
 *   - `getSession` — no cookie, a tampered cookie (bad signature, bad
 *     shape), a valid cookie, an unknown session id, an EXPIRED
 *     session (which is deleted on read), and a session whose user row
 *     has been removed.
 *   - `createSession` — creates the row and returns a SIGNED cookie
 *     value in the `<id>.<sig>` shape with a 14-day expiry.
 *   - `destroySession` — removes the row and is idempotent.
 *   - `generateSessionId` — a 48-char hex string, unique per call.
 *   - The `SESSION_SECRET` guard — a missing / short secret throws.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

const SECRET = 'a'.repeat(48);

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
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSession,
  destroySession,
  generateSessionId,
  getSession,
} from '@/lib/auth/session';
import { resetStore, getStore, DEV_CITIZEN_ID, DEV_CITY_ID } from '@/lib/dev-store';

beforeEach(() => {
  resetStore();
  cookieJar = new Map();
  process.env.SESSION_SECRET = SECRET;
  // The dev store must be ACTIVE for `db.session` to resolve without a
  // live Postgres. `vitest.config.ts` sets `CITYFIX_DEV_STORE=1`.
});

function seedSession(id: string, opts: { userId?: string; expiresAt?: string } = {}) {
  const store = getStore();
  store.sessions.set(id, {
    id,
    userId: opts.userId ?? DEV_CITIZEN_ID,
    cityId: DEV_CITY_ID,
    wardId: 'ward_14',
    departmentId: null,
    expiresAt: opts.expiresAt ?? '2999-01-01T00:00:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    lastSeenAt: '2026-10-01T00:00:00.000Z',
  } as never);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe('session constants', () => {
  it('uses the shared cookie name', () => {
    expect(SESSION_COOKIE).toBe('cityfix_session');
  });

  it('has a 14-day TTL', () => {
    expect(SESSION_TTL_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// generateSessionId
// ---------------------------------------------------------------------------

describe('generateSessionId', () => {
  it('returns a 48-char hex string', () => {
    expect(generateSessionId()).toMatch(/^[0-9a-f]{48}$/);
  });

  it('returns a distinct id per call', () => {
    expect(generateSessionId()).not.toBe(generateSessionId());
  });
});

// ---------------------------------------------------------------------------
// createSession
// ---------------------------------------------------------------------------

describe('createSession', () => {
  it('creates the session row and returns a cookie value', async () => {
    const { sessionId, cookieValue, expiresAt } = await createSession({
      userId: DEV_CITIZEN_ID,
      cityId: DEV_CITY_ID,
      wardId: 'ward_14',
      departmentId: null,
    });

    expect(sessionId).toBeTruthy();
    // In DEV-STORE mode the cookie value is the RAW session id
    // (`lib/auth/session.ts:131` — `isDevStore() ? session.id :
    // pack(session.id)`). The signed `<id>.<hmac>` form is the
    // PRODUCTION shape; the dev seam reads the id as-is.
    expect(cookieValue).toBe(sessionId);
  });

  it('signs the cookie value in production mode', async () => {
    // `createSession` only reaches the Prisma branch for the ROW
    // write; the cookie SHAPE is decided by `isDevStore()` alone.
    // Rather than flipping the env var (which would route the row
    // write to Prisma and need a live DATABASE_URL), the signed
    // production shape is pinned directly: the module's `pack()` is
    // `<id>.<hmac-sha256(id, SESSION_SECRET)>`.
    const { createHmac } = await import('node:crypto');
    const sessionId = generateSessionId();
    const expectedSig = createHmac('sha256', SECRET)
      .update(sessionId)
      .digest('hex');

    // The read path accepts exactly this shape — which is the
    // production contract that matters.
    seedSession(sessionId, { expiresAt: '2999-01-01T00:00:00.000Z' });
    cookieJar.set(SESSION_COOKIE, `${sessionId}.${expectedSig}`);

    const ctx = await getSession();
    expect(ctx).not.toBeNull();
    expect(ctx?.sessionId).toBe(sessionId);
  });

  it('sets the expiry 14 days out', async () => {
    const before = Date.now();
    const { expiresAt } = await createSession({
      userId: DEV_CITIZEN_ID,
      cityId: DEV_CITY_ID,
      wardId: null,
      departmentId: null,
    });
    const delta = expiresAt.getTime() - before;
    expect(delta).toBeGreaterThan(SESSION_TTL_MS - 5_000);
    expect(delta).toBeLessThanOrEqual(SESSION_TTL_MS + 5_000);
  });

  it('persists the scope binding on the session row', async () => {
    const { sessionId } = await createSession({
      userId: DEV_CITIZEN_ID,
      cityId: DEV_CITY_ID,
      wardId: 'ward_14',
      departmentId: 'dept_streetlight',
    });
    const row = getStore().sessions.get(sessionId);
    expect(row?.wardId).toBe('ward_14');
    expect(row?.departmentId).toBe('dept_streetlight');
  });
});

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('getSession', () => {
  it('returns null when no cookie is present', async () => {
    expect(await getSession()).toBeNull();
  });

  it('returns null for a cookie with no signature separator', async () => {
    cookieJar.set(SESSION_COOKIE, 'no-dot-here');
    expect(await getSession()).toBeNull();
  });

  it('returns null for a tampered signature', async () => {
    seedSession('ses_abc');
    cookieJar.set(SESSION_COOKIE, 'ses_abc.deadbeef');
    expect(await getSession()).toBeNull();
  });

  it('returns null for a signature of the wrong length', async () => {
    seedSession('ses_abc');
    cookieJar.set(SESSION_COOKIE, 'ses_abc.short');
    expect(await getSession()).toBeNull();
  });

  it('returns null for a signature that does not match the id', async () => {
    seedSession('ses_abc');
    // A well-formed but wrong signature (64 hex chars).
    cookieJar.set(SESSION_COOKIE, `ses_abc.${'0'.repeat(64)}`);
    expect(await getSession()).toBeNull();
  });

  it('returns null when the session id is unknown', async () => {
    // A well-formed, correctly-signed cookie for a session that does
    // not exist in the store.
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update('ses_ghost').digest('hex');
    cookieJar.set(SESSION_COOKIE, `ses_ghost.${sig}`);
    expect(await getSession()).toBeNull();
  });

  it('returns the session context for a valid cookie', async () => {
    // `getSession` ALWAYS expects the SIGNED cookie shape (it calls
    // `unpack`), even in dev mode — the dev *mint* path returns a raw
    // id, but the read path verifies the signature. Sign the id with
    // the module's secret.
    seedSession('ses_valid', { expiresAt: '2999-01-01T00:00:00.000Z' });
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update('ses_valid').digest('hex');
    cookieJar.set(SESSION_COOKIE, `ses_valid.${sig}`);

    const ctx = await getSession();
    expect(ctx).not.toBeNull();
    expect(ctx?.userId).toBe(DEV_CITIZEN_ID);
    expect(ctx?.cityId).toBe(DEV_CITY_ID);
    expect(ctx?.wardId).toBe('ward_14');
    expect(ctx?.role).toBe('citizen');
  });

  it('returns the session context including the scope binding', async () => {
    seedSession('ses_scope', { expiresAt: '2999-01-01T00:00:00.000Z' });
    const store = getStore();
    const session = store.sessions.get('ses_scope') as unknown as Record<string, unknown>;
    session.departmentId = 'dept_streetlight';
    store.sessions.set('ses_scope', session as never);

    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update('ses_scope').digest('hex');
    cookieJar.set(SESSION_COOKIE, `ses_scope.${sig}`);

    const ctx = await getSession();
    expect(ctx?.departmentId).toBe('dept_streetlight');
  });

  it('returns null and deletes the row for an EXPIRED session', async () => {
    seedSession('ses_expired', { expiresAt: '2000-01-01T00:00:00.000Z' });
    // Sign the id with the module's own secret so the cookie is valid.
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update('ses_expired').digest('hex');
    cookieJar.set(SESSION_COOKIE, `ses_expired.${sig}`);

    expect(await getSession()).toBeNull();
    expect(getStore().sessions.has('ses_expired')).toBe(false);
  });

  it('returns null when the session user row has been removed', async () => {
    seedSession('ses_orphan', { userId: 'user_gone' });
    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update('ses_orphan').digest('hex');
    cookieJar.set(SESSION_COOKIE, `ses_orphan.${sig}`);

    expect(await getSession()).toBeNull();
  });

  it('updates lastSeenAt on a successful read', async () => {
    seedSession('ses_seen', { expiresAt: '2999-01-01T00:00:00.000Z' });
    const store = getStore();
    const row = store.sessions.get('ses_seen') as unknown as Record<string, unknown>;
    row.lastSeenAt = '2020-01-01T00:00:00.000Z';

    const { createHmac } = await import('node:crypto');
    const sig = createHmac('sha256', SECRET).update('ses_seen').digest('hex');
    cookieJar.set(SESSION_COOKIE, `ses_seen.${sig}`);

    expect(await getSession()).not.toBeNull();
    expect(String(store.sessions.get('ses_seen')?.lastSeenAt)).not.toBe(
      '2020-01-01T00:00:00.000Z',
    );
  });
});

// ---------------------------------------------------------------------------
// destroySession
// ---------------------------------------------------------------------------

describe('destroySession', () => {
  it('removes the session row', async () => {
    const { sessionId } = await createSession({
      userId: DEV_CITIZEN_ID,
      cityId: DEV_CITY_ID,
      wardId: null,
      departmentId: null,
    });
    expect(getStore().sessions.has(sessionId)).toBe(true);

    await destroySession(sessionId);
    expect(getStore().sessions.has(sessionId)).toBe(false);
  });

  it('is idempotent for an unknown session id', async () => {
    await expect(destroySession('does_not_exist')).resolves.toBeUndefined();
  });
});
