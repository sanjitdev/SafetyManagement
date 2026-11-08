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
  } catch (err) {
    // A MALFORMED HASH is a failed verification — the stored credential is
    // unusable, so the login is refused. That is the intended behaviour
    // and it is safe to swallow.
    //
    // A MISSING NATIVE BINDING is NOT that. `@node-rs/argon2` throws
    // "Cannot find native binding" when the platform-specific optional
    // dependency is absent — e.g. a `node_modules` tree installed on
    // Windows and then run on Linux. That is a SERVER MISCONFIGURATION,
    // and swallowing it as "wrong credentials" turns a deployment fault
    // into a lie told to every user: the login page reports a bad
    // password when the server cannot check passwords at all.
    //
    // This was not hypothetical. The route-spec suite run in the Linux
    // Playwright container produced 50 failures, every one of them a
    // login that "timed out" waiting for navigation. The real cause was
    // this catch: the container's `node_modules` carried only
    // `@node-rs/argon2-win32-x64-msvc`, so `verify` threw, the catch
    // returned `false`, and every persona was told its password was
    // wrong. The specs were fine. The environment was broken, and this
    // function was the reason nobody could tell.
    //
    // So: distinguish the two. A malformed hash is a `false`. A missing
    // binding is re-thrown, because it is the operator's problem to fix
    // and no user-facing message should hide it.
    if (isMissingNativeBinding(err)) throw err;
    return false;
  }
}

/**
 * Is this error the "the argon2 native addon is not installed for this
 * platform" failure?
 *
 * `@node-rs/argon2` reports it as "Cannot find native binding. npm has a
 * bug related to optional dependencies ...". Matching on the message is
 * the only signal available — the error carries no error code.
 */
function isMissingNativeBinding(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes('cannot find native binding') ||
    message.includes('failed to load native binding') ||
    message.includes('was compiled against a different node.js version')
  );
}