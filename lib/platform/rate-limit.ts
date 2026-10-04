/**
 * Rate limiting (lib/platform/rate-limit.ts).
 *
 * PLAT-REQ-008: max 1 req/sec per (actor_id, ticket_id); 429 with retry-after.
 *
 * v1 implementation: in-process token bucket keyed by (actor, ticket). This
 * is sufficient for single-instance Next.js. v1.1 swap to a Postgres-backed
 * or Redis-backed limiter if multi-instance deployment shows cross-instance
 * drift.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const RATE = 1; // tokens per second
const CAPACITY = 1; // burst capacity

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function rateLimit(key: string): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(key, bucket);
  } else {
    const elapsed = (now - bucket.lastRefill) / 1000;
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * RATE);
    bucket.lastRefill = now;
  }
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return { allowed: true, retryAfterMs: 0 };
  }
  const retryAfterMs = Math.ceil(((1 - bucket.tokens) / RATE) * 1000);
  return { allowed: false, retryAfterMs };
}

/** Test helper — wipes the in-process state. */
export function _resetRateLimits(): void {
  buckets.clear();
}