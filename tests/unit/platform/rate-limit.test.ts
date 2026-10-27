/**
 * Unit tests for the in-process rate limiter
 * (`lib/platform/rate-limit.ts`).
 *
 * PLAT-REQ-008: max 1 req/sec per (actor_id, ticket_id); a rejected
 * call carries a `retryAfterMs` so the route can emit a `429` with a
 * `Retry-After` header.
 *
 * The limiter is a module-level token bucket, so the in-process state
 * is shared between calls — `_resetRateLimits()` wipes it between
 * tests.
 *
 * The burst capacity is 4 in non-production (`NODE_ENV !== 'production'`)
 * and 1 in production. The dev burst exists so React strict mode's
 * double-invocation of `useEffect` does not trip a 429 on first page
 * load; the steady-state refill rate (1 token/sec) is unchanged.
 *
 * NOTE: `CAPACITY` is read at MODULE LOAD time, so the production
 * capacity cannot be re-derived by flipping `process.env.NODE_ENV`
 * after the import. These tests therefore assert the behaviour that
 * holds for the loaded environment (the dev burst) and assert the
 * *rate* invariants, which are identical in both modes.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { rateLimit, _resetRateLimits } from '@/lib/platform/rate-limit';

beforeEach(() => {
  _resetRateLimits();
});

describe('rateLimit', () => {
  it('allows the first request on a fresh key', () => {
    const result = rateLimit('actor_1:tkt_1');
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  it('allows requests on different keys independently', () => {
    expect(rateLimit('actor_1:tkt_1').allowed).toBe(true);
    expect(rateLimit('actor_2:tkt_1').allowed).toBe(true);
    expect(rateLimit('actor_1:tkt_2').allowed).toBe(true);
  });

  it('exhausts the bucket and then rejects', () => {
    const key = 'actor_1:tkt_1';
    // The dev burst is 4 tokens; the 5th call in the same instant
    // finds the bucket empty.
    const results = Array.from({ length: 6 }, () => rateLimit(key));
    const allowed = results.filter((r) => r.allowed).length;
    const rejected = results.filter((r) => !r.allowed);

    expect(allowed).toBe(4);
    expect(rejected.length).toBe(2);
    expect(rejected[0].retryAfterMs).toBeGreaterThan(0);
  });

  it('reports a positive retryAfterMs on rejection', () => {
    const key = 'actor_1:tkt_1';
    for (let i = 0; i < 4; i += 1) rateLimit(key);

    const rejected = rateLimit(key);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterMs).toBeGreaterThan(0);
    expect(rejected.retryAfterMs).toBeLessThanOrEqual(1000);
  });

  it('refills the bucket over time and allows the request again', async () => {
    const key = 'actor_1:tkt_1';
    for (let i = 0; i < 4; i += 1) rateLimit(key);
    expect(rateLimit(key).allowed).toBe(false);

    // Wait for at least one refill interval (1 token/sec).
    await new Promise((r) => setTimeout(r, 1100));

    expect(rateLimit(key).allowed).toBe(true);
  });

  it('caps the bucket at the burst capacity when idle', async () => {
    const key = 'actor_1:tkt_1';
    // Long idle → the bucket refills but must NOT exceed capacity.
    await new Promise((r) => setTimeout(r, 1100));

    const results = Array.from({ length: 5 }, () => rateLimit(key));
    expect(results.filter((r) => r.allowed).length).toBe(4);
  });
});

describe('_resetRateLimits', () => {
  it('clears the in-process state so a key starts fresh', () => {
    const key = 'actor_1:tkt_1';
    for (let i = 0; i < 4; i += 1) rateLimit(key);
    expect(rateLimit(key).allowed).toBe(false);

    _resetRateLimits();
    expect(rateLimit(key).allowed).toBe(true);
  });
});
