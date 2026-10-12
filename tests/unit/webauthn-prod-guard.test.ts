/**
 * WebAuthn production-RP guard (Bolt — Vercel deploy hardening).
 *
 * Verifies that `lib/auth/webauthn.ts` throws at module load in
 * production if the WebAuthn origin / RP ID is the dev default.
 * The guard prevents accidental prod deploys with localhost
 * defaults (which would silently fail WebAuthn ceremonies).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function reloadWebauthnModule(env: {
  NODE_ENV?: string;
  WEBAUTHN_RP_ORIGIN?: string;
  WEBAUTHN_RP_ID?: string;
}) {
  // Reset module cache so the top-level guard re-evaluates.
  vi.resetModules();
  // Apply env for the next import.
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import('@/lib/auth/webauthn');
}

describe('WebAuthn prod-RP guard (Vercel deploy hardening)', () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  afterEach(() => {
    for (const k of Object.keys(process.env)) delete process.env[k];
    Object.assign(process.env, ORIGINAL_ENV);
  });

  it('does not throw in development with localhost defaults', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'development',
      WEBAUTHN_RP_ORIGIN: 'http://localhost:3000',
      WEBAUTHN_RP_ID: 'localhost',
    });
    expect(mod).toBeDefined();
  });

  it('does not throw in production when WEBAUTHN_RP_ORIGIN is https', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ORIGIN: 'https://cityfix.vercel.app',
      WEBAUTHN_RP_ID: 'cityfix.vercel.app',
    });
    expect(mod).toBeDefined();
  });

  it('throws in production when WEBAUTHN_RP_ORIGIN is unset', async () => {
    await expect(
      reloadWebauthnModule({
        NODE_ENV: 'production',
        WEBAUTHN_RP_ORIGIN: undefined,
        WEBAUTHN_RP_ID: 'cityfix.vercel.app',
      }),
    ).rejects.toThrow(/WEBAUTHN_RP_ORIGIN must be set to an https:\/\/ URL/);
  });

  it('throws in production when WEBAUTHN_RP_ORIGIN is http (not https)', async () => {
    await expect(
      reloadWebauthnModule({
        NODE_ENV: 'production',
        WEBAUTHN_RP_ORIGIN: 'http://cityfix.vercel.app',
        WEBAUTHN_RP_ID: 'cityfix.vercel.app',
      }),
    ).rejects.toThrow(/WEBAUTHN_RP_ORIGIN must be set to an https:\/\/ URL/);
  });

  it('throws in production when WEBAUTHN_RP_ID is the localhost default', async () => {
    await expect(
      reloadWebauthnModule({
        NODE_ENV: 'production',
        WEBAUTHN_RP_ORIGIN: 'https://cityfix.vercel.app',
        WEBAUTHN_RP_ID: 'localhost',
      }),
    ).rejects.toThrow(/WEBAUTHN_RP_ID must be set to the production hostname/);
  });

  it('throws in production when WEBAUTHN_RP_ID is unset', async () => {
    await expect(
      reloadWebauthnModule({
        NODE_ENV: 'production',
        WEBAUTHN_RP_ORIGIN: 'https://cityfix.vercel.app',
        WEBAUTHN_RP_ID: undefined,
      }),
    ).rejects.toThrow(/WEBAUTHN_RP_ID must be set to the production hostname/);
  });
});
