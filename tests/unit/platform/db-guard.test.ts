/**
 * Unit tests for the production database guard
 * (`lib/platform/db-guard.ts`).
 *
 * The guard exists because local dev and production now point at
 * DIFFERENT databases:
 *
 *   local  → a PostgreSQL server on this machine (`localhost:5432`)
 *   prod   → Neon (hosted)
 *
 * If a local-style `DATABASE_URL` reaches production, the app would work
 * perfectly and write every citizen's name, NID, phone number and photo
 * into a developer's laptop database. Nothing would fail. That is the
 * failure mode this module makes loud.
 *
 * Covered:
 *   - `extractDatabaseHost()` — URL form, libpq keyword form, junk.
 *   - `isLoopbackDatabaseHost()` — every loopback spelling.
 *   - `assertProductionDatabaseConfig()` — throws in production on a
 *     loopback URL; silent in production on a hosted URL; silent in
 *     development on a loopback URL; idempotent.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  assertProductionDatabaseConfig,
  extractDatabaseHost,
  isLoopbackDatabaseHost,
  _resetDbGuard,
} from '@/lib/platform/db-guard';

const ORIGINAL_ENV = { ...process.env };

/**
 * Set env vars for one test.
 *
 * `process.env.NODE_ENV` is typed as a readonly literal union by
 * `@types/node`, so a direct `process.env.NODE_ENV = 'production'` is a
 * TS2540 compile error ("Cannot assign to 'NODE_ENV' because it is a
 * read-only property"). Writing through a dynamically-keyed index
 * sidesteps that typing — the same approach the sibling
 * `tests/unit/webauthn-prod-guard.test.ts` uses.
 */
function setEnv(env: Record<string, string | undefined>): void {
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/**
 * Restore the environment to its pre-test state.
 *
 * `process.env = { ...ORIGINAL_ENV }` (wholesale reassignment) replaces the
 * whole object, which breaks `process.env` identity for anything holding a
 * reference to it (Vitest's own env handling included). Delete-then-assign
 * mutates in place instead.
 */
function restoreEnv(): void {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
}

beforeEach(() => {
  _resetDbGuard();
});

afterEach(() => {
  restoreEnv();
  _resetDbGuard();
});

describe('extractDatabaseHost', () => {
  it('reads the host out of a URL', () => {
    expect(
      extractDatabaseHost('postgresql://user:pass@db.example.com:5432/cityfix'),
    ).toBe('db.example.com');
  });

  it('reads the host out of a Neon URL', () => {
    expect(
      extractDatabaseHost(
        'postgresql://u:p@ep-empty-water-b41dwd0x-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
      ),
    ).toBe('ep-empty-water-b41dwd0x-pooler.c-6.us-east-2.aws.neon.tech');
  });

  it('reads the host out of a loopback URL', () => {
    expect(
      extractDatabaseHost('postgresql://postgres:secret@localhost:5432/cityfix'),
    ).toBe('localhost');
  });

  it('lowercases the host', () => {
    expect(
      extractDatabaseHost('postgresql://u:p@DB.Example.COM:5432/cityfix'),
    ).toBe('db.example.com');
  });

  it('reads the host out of the libpq keyword form', () => {
    expect(
      extractDatabaseHost('host=localhost port=5432 dbname=cityfix user=postgres'),
    ).toBe('localhost');
  });

  it('reads a quoted host out of the libpq keyword form', () => {
    expect(
      extractDatabaseHost("host='db.example.com' port=5432 dbname=cityfix"),
    ).toBe('db.example.com');
  });

  it('returns null for an unset URL', () => {
    expect(extractDatabaseHost(undefined)).toBeNull();
  });

  it('returns null for a string with no host at all', () => {
    expect(extractDatabaseHost('not-a-connection-string')).toBeNull();
  });
});

describe('isLoopbackDatabaseHost', () => {
  it('recognises the loopback spellings', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']) {
      expect(isLoopbackDatabaseHost(host)).toBe(true);
    }
  });

  it('recognises the whole 127.0.0.0/8 range', () => {
    expect(isLoopbackDatabaseHost('127.0.0.2')).toBe(true);
    expect(isLoopbackDatabaseHost('127.1.2.3')).toBe(true);
  });

  it('does not flag a hosted database', () => {
    expect(
      isLoopbackDatabaseHost('ep-empty-water-b41dwd0x-pooler.c-6.us-east-2.aws.neon.tech'),
    ).toBe(false);
  });

  it('does not flag a container-internal hostname', () => {
    // A container-local DB is a legitimate production topology.
    expect(isLoopbackDatabaseHost('db.internal.example.com')).toBe(false);
  });

  it('does not flag a host that merely starts with 127', () => {
    expect(isLoopbackDatabaseHost('127.0.0.1.evil.example.com')).toBe(false);
  });

  it('treats null as not-loopback', () => {
    expect(isLoopbackDatabaseHost(null)).toBe(false);
  });
});

describe('assertProductionDatabaseConfig', () => {
  it('throws in production when DATABASE_URL is a loopback database', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://postgres:secret@localhost:5432/cityfix?schema=public',
    });
    expect(() => assertProductionDatabaseConfig()).toThrow(/loopback/i);
  });

  it('throws in production for 127.0.0.1 too', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://postgres:secret@127.0.0.1:5432/cityfix?schema=public',
    });
    expect(() => assertProductionDatabaseConfig()).toThrow(/loopback/i);
  });

  it('is silent in production when DATABASE_URL is a hosted database', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://u:p@ep-empty-water-b41dwd0x-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require',
    });
    expect(() => assertProductionDatabaseConfig()).not.toThrow();
  });

  it('is silent in development on a loopback database (that is the point)', () => {
    setEnv({
      NODE_ENV: 'development',
      DATABASE_URL:
        'postgresql://postgres:secret@localhost:5432/cityfix?schema=public',
    });
    expect(() => assertProductionDatabaseConfig()).not.toThrow();
  });

  it('is silent when DATABASE_URL is unset', () => {
    setEnv({ NODE_ENV: 'production', DATABASE_URL: undefined });
    expect(() => assertProductionDatabaseConfig()).not.toThrow();
  });

  it('only throws once per process (the latch)', () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL:
        'postgresql://postgres:secret@localhost:5432/cityfix?schema=public',
    });
    expect(() => assertProductionDatabaseConfig()).toThrow();
    // Second call is latched — it does not throw again.
    expect(() => assertProductionDatabaseConfig()).not.toThrow();
  });
});
