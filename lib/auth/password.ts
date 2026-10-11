/**
 * Password hashing (lib/auth/password.ts).
 *
 * Tech-audit §4: argon2 via @node-rs/argon2 (Node-native binding, faster than
 * the pure-JS `argon2` package).
 *
 * Tune for civic-platform posture: moderate cost is fine — we don't run at
 * 100k logins/sec. OWASP 2024 recommendations: m=19 MiB, t=2, p=1.
 *
 * The password-policy guard (≥ 8 chars, ≥1 digit) is enforced at this
 * module's public boundary so the service layer is the source of truth.
 * OTPs and other short secrets use `hashSecret` directly to bypass the
 * password policy while reusing the same argon2 primitive.
 */

import { hash, verify } from '@node-rs/argon2';

// @node-rs/argon2 accepts the algorithm as a numeric literal or string.
// `2` is Argon2id (per the package's enum). We avoid importing the
// ambient `Algorithm` const enum because Next's TS config uses
// `isolatedModules`, which forbids const-enum access.
const ARGON2_OPTIONS = {
  algorithm: 2 as const,
  memoryCost: 19 * 1024, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  // Per UX spec 1.3-registration: minimum 8 chars, ≥1 digit. The 12-char
  // floor the platform layer initially proposed was overruled by the
  // citizen UX posture — the spec is the source of truth for v1.
  if (plaintext.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  if (!/\d/.test(plaintext)) {
    throw new Error('Password must contain at least one digit');
  }
  return hash(plaintext, ARGON2_OPTIONS);
}

/**
 * Hash a short secret (OTP, magic-link token, etc.) using the same
 * argon2 primitive. Bypasses the password policy guard.
 */
export async function hashSecret(plaintext: string): Promise<string> {
  return hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(
  hashStr: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(hashStr, plaintext, ARGON2_OPTIONS);
  } catch {
    // argon2 throws on a malformed hash; treat as a failed verification
    return false;
  }
}