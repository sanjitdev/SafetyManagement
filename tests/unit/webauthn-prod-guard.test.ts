/**
 * WebAuthn production-RP guard (Bolt — Vercel deploy hardening).
 *
 * Verifies that `assertWebAuthnProdConfig()` in
 * `lib/auth/webauthn.ts` throws when invoked in production
 * with a missing/non-https `WEBAUTHN_RP_ORIGIN` or a
 * `WEBAUTHN_RP_ID` set to the dev default. The guard is
 * invoked lazily from `rpId()` / `rpOrigin()` on first use
 * (and explicitly from each public WebAuthn function), so
 * the module itself can be loaded in a build process that
 * doesn't have the prod env vars exposed. The first
 * WebAuthn-bearing request in a misconfigured prod then
 * fails loudly with a clear error.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function reloadWebauthnModule(env: {
  NODE_ENV?: string;
  WEBAUTHN_RP_ORIGIN?: string;
  WEBAUTHN_RP_ID?: string;
}) {
  // Reset module cache so the lazy guard re-evaluates against
  // the freshly applied env (its module-level caches are reset
  // by resetModules + re-import).
  vi.resetModules();
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
    expect(() => mod.assertWebAuthnProdConfig()).not.toThrow();
  });

  it('does not throw in production when WEBAUTHN_RP_ORIGIN is https', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ORIGIN: 'https://cityfix.vercel.app',
      WEBAUTHN_RP_ID: 'cityfix.vercel.app',
    });
    expect(() => mod.assertWebAuthnProdConfig()).not.toThrow();
  });

  it('throws in production when WEBAUTHN_RP_ORIGIN is unset', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ORIGIN: undefined,
      WEBAUTHN_RP_ID: 'cityfix.vercel.app',
    });
    expect(() => mod.assertWebAuthnProdConfig()).toThrow(
      /WEBAUTHN_RP_ORIGIN must be set to an https:\/\/ URL/,
    );
  });

  it('throws in production when WEBAUTHN_RP_ORIGIN is http (not https)', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ORIGIN: 'http://cityfix.vercel.app',
      WEBAUTHN_RP_ID: 'cityfix.vercel.app',
    });
    expect(() => mod.assertWebAuthnProdConfig()).toThrow(
      /WEBAUTHN_RP_ORIGIN must be set to an https:\/\/ URL/,
    );
  });

  it('throws in production when WEBAUTHN_RP_ID is the localhost default', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ORIGIN: 'https://cityfix.vercel.app',
      WEBAUTHN_RP_ID: 'localhost',
    });
    expect(() => mod.assertWebAuthnProdConfig()).toThrow(
      /WEBAUTHN_RP_ID must be set to the production hostname/,
    );
  });

  it('throws in production when WEBAUTHN_RP_ID is unset', async () => {
    const mod = await reloadWebauthnModule({
      NODE_ENV: 'production',
      WEBAUTHN_RP_ORIGIN: 'https://cityfix.vercel.app',
      WEBAUTHN_RP_ID: undefined,
    });
    expect(() => mod.assertWebAuthnProdConfig()).toThrow(
      /WEBAUTHN_RP_ID must be set to the production hostname/,
    );
  });
});
