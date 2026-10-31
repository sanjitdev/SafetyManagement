/**
 * Login lockout counter (lib/auth/login-lockout.ts).
 *
 * The login route keeps a small in-process map of failed attempts
 * keyed by client IP. After `MAX_ATTEMPTS` failures inside
 * `WINDOW_MS`, the IP is locked for `LOCKOUT_MS` and the route
 * answers 423 instead of 401.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * The counter is module-level state. When it lived inside the route
 * handler, a unit test could not reset it, so the tests were forced
 * to depend on execution ORDER — the Nth test inherited the failures
 * of the N−1 tests and could observe a 423 it did not cause. That is
 * a fragile test, not a fragile feature.
 *
 * Moving the counter here gives the tests an explicit reset seam
 * (`resetLoginAttempts`) and keeps the route handler to its actual
 * job: parse, authenticate, respond.
 *
 * The counter is intentionally in-process for v1 — it does not
 * survive a restart and is not shared across instances. A future
 * Bolt can promote it to the OtpCode-like `attempts` column on User
 * or a dedicated FailedLogin model; the call sites here
 * (`noteFailure` / `noteSuccess` / `isLocked`) are the seam.
 */

export const MAX_ATTEMPTS = 5;
export const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const LOCKOUT_MS = 10 * 60 * 1000;

export interface AttemptRecord {
  failures: number;
  firstFailure: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptRecord>();

/**
 * Record a failed login for `key`.
 *
 * Returns the updated record so the caller can decide whether the
 * IP just crossed the lockout threshold.
 */
export function noteFailure(key: string): AttemptRecord {
  const now = Date.now();
  const cur = attempts.get(key);
  if (!cur || now - cur.firstFailure > WINDOW_MS) {
    const next: AttemptRecord = { failures: 1, firstFailure: now, lockedUntil: 0 };
    attempts.set(key, next);
    return next;
  }
  cur.failures += 1;
  if (cur.failures >= MAX_ATTEMPTS) {
    cur.lockedUntil = now + LOCKOUT_MS;
  }
  attempts.set(key, cur);
  return cur;
}

/**
 * Clear the failure count for `key` — called after a successful
 * login so a legitimate user is never locked out by a typo followed
 * by a correct password.
 */
export function noteSuccess(key: string): void {
  attempts.delete(key);
}

/**
 * Is `key` currently locked out? Returns the milliseconds remaining
 * on the lock, or 0 when it is not locked.
 */
export function lockedForMs(key: string): number {
  const rec = attempts.get(key);
  if (!rec) return 0;
  const remaining = rec.lockedUntil - Date.now();
  return remaining > 0 ? remaining : 0;
}

/**
 * Clear ALL recorded attempts. Test seam — production code never
 * calls this.
 */
export function resetLoginAttempts(): void {
  attempts.clear();
}
