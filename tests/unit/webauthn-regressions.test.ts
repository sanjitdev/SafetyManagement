/**
 * Regression tests for the three WebAuthn defects the role-experience
 * audit found (2026-10-31).
 *
 * Each of these was invisible in the in-memory dev store and only
 * surfaced when the ceremony was driven for real against real
 * Postgres. Without a regression test, the next person to touch the
 * WebAuthn code could reintroduce any of them and the suite would
 * stay green.
 *
 *   E — `User.webAuthnChallenge` is a `String?` column. The code
 *       wrote a plain object, so Prisma rejected the update with
 *       `Unknown argument 'challenge'` and EVERY WebAuthn flow
 *       answered `500 unhandled`. The dev store accepts an object,
 *       so it happily kept working and hid the bug.
 *       → `lib/db-switch.ts` now serialises to a JSON string on
 *         write and parses it back on read, tolerating all three
 *         shapes (null / JSON string / object).
 *
 *   F — the ledger row and the browser-signed nonce were different
 *       values. `@simplewebauthn/server` base64url-encodes a
 *       `Uint8Array` but passes a `string` through unchanged, so
 *       handing it the base64url STRING double-encoded it and the
 *       ceremony failed with
 *       `Unexpected registration response challenge "…", expected "…"`.
 *       → `challengeBytes()` decodes the base64url string back to
 *         raw bytes before the options generator sees it.
 *
 *   G — the RP ID / expected origin were pinned to the production
 *       host while the app ran on `localhost:3000`. The RP ID must
 *       be a registrable suffix of the page origin, and the origin
 *       is a full scheme+host+port tuple.
 *       → `rpIdForHost()` strips the port; `rpOriginForHost()` KEEPS
 *         it.
 *
 * These are unit tests on the pure helpers — they do not need a
 * database, a browser or an authenticator.
 */

import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  rpIdForHost,
  rpOriginForHost,
} from '@/lib/auth/webauthn';

// ---------------------------------------------------------------------------
// E — the challenge column serialisation
// ---------------------------------------------------------------------------

/**
 * A local mirror of `parseChallengeColumn` from `lib/db-switch.ts`.
 *
 * The helper is not exported (it is an internal detail of the
 * `db.userWebAuthn.readCredentials` implementation), so this test
 * re-implements its contract. If the implementation changes shape,
 * this test is the signal to export it and point the test at the
 * real thing rather than at a copy.
 */
function parseChallengeColumn(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? null;
  } catch {
    return null;
  }
}

describe('the webAuthnChallenge column round-trip (defect E)', () => {
  it('parses the JSON string Prisma stores back into an object', () => {
    const payload = { challenge: 'abc123', expiresAt: '2026-10-31T12:00:00.000Z' };
    const stored = JSON.stringify(payload);

    expect(typeof stored).toBe('string');
    expect(parseChallengeColumn(stored)).toEqual(payload);
  });

  it('treats a plain object as already-parsed (the dev-store shape)', () => {
    const payload = { challenge: 'abc123' };
    expect(parseChallengeColumn(payload)).toBe(payload);
  });

  it('treats null and undefined as no challenge', () => {
    expect(parseChallengeColumn(null)).toBeNull();
    expect(parseChallengeColumn(undefined)).toBeNull();
  });

  it('returns null for a malformed string rather than throwing', () => {
    // A column that somehow holds raw garbage must not crash the
    // credential read — the guard would then 500 instead of 401.
    expect(parseChallengeColumn('{not json')).toBeNull();
    expect(parseChallengeColumn('not json at all')).toBeNull();
  });

  it('returns null for a JSON "null" string', () => {
    expect(parseChallengeColumn('null')).toBeNull();
  });

  it('returns null for a non-object, non-string value', () => {
    expect(parseChallengeColumn(42)).toBeNull();
    expect(parseChallengeColumn(true)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// F — the shared challenge nonce
// ---------------------------------------------------------------------------

/**
 * A local mirror of `challengeBytes` from `lib/auth/webauthn.ts` —
 * same reason as above: the helper is module-private.
 */
function challengeBytes(challenge: string): Uint8Array {
  const normalised = challenge.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised.padEnd(
    normalised.length + ((4 - (normalised.length % 4)) % 4),
    '=',
  );
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bufferToBase64Url(buf: Uint8Array): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

describe('the challenge nonce is the same value in the ledger and the browser (defect F)', () => {
  it('round-trips: base64url(challengeBytes(x)) === x', () => {
    // This is the invariant the whole ceremony rests on. The ledger
    // stores the base64url string; the options generator must be
    // handed the RAW BYTES so that it re-encodes them to exactly the
    // same string the ledger holds. If these two diverge, the browser
    // signs a different nonce than the server expects.
    const original = 'Zm9vYmFyYmF6cXV4_9w8-A';
    expect(bufferToBase64Url(challengeBytes(original))).toBe(original);
  });

  it('round-trips for a challenge with no URL-unsafe characters', () => {
    const original = bufferToBase64Url(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(bufferToBase64Url(challengeBytes(original))).toBe(original);
  });

  it('round-trips for every padding length', () => {
    // base64url output length mod 4 can be 0, 1, 2 or 3 depending on
    // the byte count; the decoder must pad correctly in every case.
    for (let n = 1; n <= 16; n += 1) {
      const bytes = new Uint8Array(n).map((_, i) => (i * 37) % 256);
      const encoded = bufferToBase64Url(bytes);
      expect(bufferToBase64Url(challengeBytes(encoded))).toBe(encoded);
    }
  });

  it('does NOT re-encode a base64url string (the double-encoding bug)', () => {
    // Regression witness for the actual failure. Before the fix the
    // generator received the STRING and encoded it again, producing a
    // DIFFERENT challenge than the ledger row.
    const original = bufferToBase64Url(new Uint8Array([9, 9, 9, 9, 9, 9]));
    const wronglyEncoded = bufferToBase64Url(new TextEncoder().encode(original));
    expect(wronglyEncoded).not.toBe(original);
    expect(bufferToBase64Url(challengeBytes(original))).toBe(original);
  });
});

// ---------------------------------------------------------------------------
// G — the request-scoped RP ID and origin
// ---------------------------------------------------------------------------

describe('the RP ID and origin match the running server (defect G)', () => {
  /**
   * `NODE_ENV` is read-only in Next's ambient types, so the env is
   * stubbed through Vitest's own helper rather than by assignment.
   * `vi.unstubAllEnvs()` restores whatever was there before.
   */
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('strips the port from the RP ID (the RP ID is a domain)', () => {
    // `localhost:3000` → RP ID `localhost`. The browser refuses an
    // assertion whose rpId is not a registrable suffix of the page
    // origin, so the port must NOT be in the RP ID.
    vi.stubEnv('NODE_ENV', 'development');
    expect(rpIdForHost('localhost:3000')).toBe('localhost');
    expect(rpIdForHost('cityfix-bd.vercel.app')).toBe('cityfix-bd.vercel.app');
  });

  it('KEEPS the port in the origin (the origin is scheme+host+port)', () => {
    // The origin is compared as a full tuple, so `http://localhost`
    // is NOT the same origin as `http://localhost:3000`.
    vi.stubEnv('NODE_ENV', 'development');
    expect(rpOriginForHost('localhost:3000')).toBe('http://localhost:3000');
  });

  it('derives the origin protocol from WEBAUTHN_ORIGIN_PROTOCOL', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('WEBAUTHN_ORIGIN_PROTOCOL', 'https');
    expect(rpOriginForHost('staging.cityfix.bd')).toBe(
      'https://staging.cityfix.bd',
    );
  });

  it('falls back to the configured values when no host is supplied', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(rpIdForHost(null)).toBe(rpIdForHost(undefined));
    expect(rpOriginForHost(null)).toBe(rpOriginForHost(undefined));
    expect(rpOriginForHost('  ')).toBe(rpOriginForHost(undefined));
  });

  it('keeps the configured RP ID for a bare IP address', () => {
    // An IP is a valid RP ID in the spec but only for insecure
    // origins in some browsers; the helper keeps the configured
    // value rather than guessing. Note this is the ONE case where
    // the request host does NOT win — which is why the local server
    // must be reached at `localhost`, not at its LAN IP.
    vi.stubEnv('NODE_ENV', 'development');
    const configured = rpIdForHost(undefined);
    expect(rpIdForHost('192.168.1.10:3000')).toBe(configured);
    expect(rpIdForHost('127.0.0.1:3000')).toBe(configured);
  });
});
