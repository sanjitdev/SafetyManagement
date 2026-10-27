/**
 * Unit tests for the OTP helpers (`lib/auth/otp.ts`).
 *
 * PLAT-REQ-002 acceptance: SMS-based, ≤ 5 min TTL, single-use,
 * retry-cap. The PLAINTEXT code is never stored — only its argon2
 * hash.
 *
 * Covered:
 *   - The constants — a 5-minute TTL, a 5-attempt cap, a 6-digit
 *     code length.
 *   - `generateOtp` — always 6 digits (leading zeros preserved) and
 *     a different code on each call.
 *   - `hashOtp` / `verifyOtp` — the round-trip verifies, a wrong
 *     code does not, and a malformed hash does not throw.
 *
 * The `sendOtp` provider-failure path is covered separately in
 * `tests/unit/otp-provider.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import {
  OTP_LENGTH,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  verifyOtp,
} from '@/lib/auth/otp';

describe('OTP constants', () => {
  it('has a 5-minute TTL', () => {
    expect(OTP_TTL_MS).toBe(5 * 60 * 1000);
  });

  it('allows 5 verification attempts', () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });

  it('uses a 6-digit code', () => {
    expect(OTP_LENGTH).toBe(6);
  });
});

describe('generateOtp', () => {
  it('always produces a 6-digit numeric code', () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      expect(code).toHaveLength(OTP_LENGTH);
    }
  });

  it('preserves leading zeros', () => {
    // The generator pads to 6 digits, so a code that starts with '0'
    // keeps it. Run enough times to be confident the padding path is
    // exercised rather than asserted in theory.
    const codes = Array.from({ length: 200 }, () => generateOtp());
    expect(codes.every((c) => c.length === 6)).toBe(true);
    expect(codes.some((c) => c.startsWith('0'))).toBe(true);
  });

  it('produces a different code on each call', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtp()));
    // 100 draws from 1e6 possibilities — a collision is astronomically
    // unlikely, so the set should be full.
    expect(codes.size).toBe(100);
  });
});

describe('hashOtp / verifyOtp', () => {
  it('verifies the correct code', async () => {
    const hash = await hashOtp('123456');
    expect(await verifyOtp(hash, '123456')).toBe(true);
  });

  it('does not verify a wrong code', async () => {
    const hash = await hashOtp('123456');
    expect(await verifyOtp(hash, '654321')).toBe(false);
  });

  it('returns false (never throws) for a malformed hash', async () => {
    expect(await verifyOtp('not-a-hash', '123456')).toBe(false);
  });

  it('stores a hash, not the plaintext', async () => {
    const hash = await hashOtp('123456');
    expect(hash).not.toBe('123456');
    expect(hash).toMatch(/^\$argon2id\$/);
  });
});
