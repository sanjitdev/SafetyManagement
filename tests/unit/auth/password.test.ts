/**
 * Unit tests for password hashing (`lib/auth/password.ts`).
 *
 * Covers:
 *   - The password POLICY guard at the public boundary: ≥ 8 chars
 *     and ≥ 1 digit. Both are enforced by `hashPassword` and NOT by
 *     `hashSecret` (the OTP / magic-link path bypasses the policy).
 *   - `hashPassword` produces a verifiable argon2id hash.
 *   - `verifyPassword` returns true for the right plaintext and
 *     false for the wrong one.
 *   - `verifyPassword` returns false (never throws) for a MALFORMED
 *     hash string — argon2 throws on a bad hash and the module swallows
 *     it into `false`.
 *   - `hashSecret` accepts a short secret with no digit.
 *   - Two hashes of the same plaintext differ (argon2 salts).
 *
 * Argon2 is deliberately slow (m=19 MiB, t=2), so each hash costs
 * ~50-200 ms. The suite is small on purpose.
 */

import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  hashSecret,
  verifyPassword,
} from '@/lib/auth/password';

describe('hashPassword', () => {
  it('accepts a policy-compliant password', async () => {
    const hash = await hashPassword('cityfix123');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('rejects a password shorter than 8 characters', async () => {
    await expect(hashPassword('short12')).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });

  it('rejects a password with no digit', async () => {
    await expect(hashPassword('abcdefghij')).rejects.toThrow(
      'Password must contain at least one digit',
    );
  });

  it('checks the length BEFORE the digit rule', async () => {
    // 'abc' fails both rules; the length error is the one surfaced.
    await expect(hashPassword('abc')).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });
});

describe('hashSecret', () => {
  it('accepts a short secret with no digit (bypasses the policy)', async () => {
    const hash = await hashSecret('123456');
    expect(hash).toMatch(/^\$argon2id\$/);
  });

  it('produces a hash that verifies against the same secret', async () => {
    const hash = await hashSecret('otp-123456');
    expect(await verifyPassword(hash, 'otp-123456')).toBe(true);
  });
});

describe('verifyPassword', () => {
  it('returns true for the correct plaintext', async () => {
    const hash = await hashPassword('cityfix123');
    expect(await verifyPassword(hash, 'cityfix123')).toBe(true);
  });

  it('returns false for the wrong plaintext', async () => {
    const hash = await hashPassword('cityfix123');
    expect(await verifyPassword(hash, 'cityfix999')).toBe(false);
  });

  it('returns false (never throws) for a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'cityfix123')).toBe(false);
  });

  it('returns false for an empty hash string', async () => {
    expect(await verifyPassword('', 'cityfix123')).toBe(false);
  });

  it('produces a different salt for each hash of the same plaintext', async () => {
    const a = await hashPassword('cityfix123');
    const b = await hashPassword('cityfix123');
    expect(a).not.toBe(b);
    // Both still verify.
    expect(await verifyPassword(a, 'cityfix123')).toBe(true);
    expect(await verifyPassword(b, 'cityfix123')).toBe(true);
  });
});
