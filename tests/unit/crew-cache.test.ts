/**
 * Unit tests for the crew offline-read cache
 * (lib/crew/cache.ts).
 *
 * CREW-006 (Intent 004, Unit 004): the
 * read-only localStorage cache for the
 * crew's list + detail responses. The cache
 * module is pure JS; this test pins the
 * contract so any future refactor that
 * breaks the schema / TTL / invalidation
 * behavior surfaces a failing test.
 *
 * The test injects an in-memory
 * `localStorage` polyfill via
 * `setStorage(...)` so the suite runs in
 * pure Node — no `vitest-environment-jsdom`
 * is needed.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CACHE_SCHEMA_VERSION,
  CACHE_TTL_MS,
  formatCachedAge,
  isStale,
  readAssignmentsCache,
  readTicketCache,
  setStorage,
  tryParse,
  writeAssignmentsCache,
  writeTicketCache,
  invalidateTicketCache,
  type CrewCacheEntry,
} from '@/lib/crew/cache';
import type { SerializedTicket } from '@/lib/serializers/ticket';

const USER_ID = 'user_crew_rashid';
const NOW = new Date('2026-10-12T12:00:00Z').getTime();

/** Tiny in-memory localStorage polyfill. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function mkTicket(overrides: Partial<SerializedTicket> = {}): SerializedTicket {
  return {
    id: 'tkt_abc',
    cityId: 'city_dhaka_north',
    wardId: 'ward_14',
    // The serializer (lib/serializers/ticket.ts) ships explicit
    // `null` for the denormalised ward names when the join is
    // absent; the cache fixture mirrors that contract.
    wardName: null,
    wardNameBn: null,
    categoryId: 'cat_streetlight',
    locationLat: 23.789,
    locationLng: 90.4075,
    locationLabel: 'Mirpur 14',
    locationLabelBn: 'মিরপুর ১৪',
    note: 'Streetlight out',
    status: 'routed',
    reporterId: 'user_citizen_rahim',
    photoUrls: [],
    createdAt: '2026-10-11T10:00:00Z',
    resolvedAt: null,
    internalNote: null,
    assignedCrewId: USER_ID,
    trail: [],
    ...overrides,
  };
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  setStorage(storage);
});

afterEach(() => {
  setStorage(null);
});

describe('isStale', () => {
  it('returns false for a fresh entry', () => {
    const entry = { cachedAt: new Date(NOW - 1000).toISOString() };
    expect(isStale(entry, NOW)).toBe(false);
  });

  it('returns true for an entry older than the TTL', () => {
    const entry = { cachedAt: new Date(NOW - CACHE_TTL_MS - 1).toISOString() };
    expect(isStale(entry, NOW)).toBe(true);
  });

  it('returns false for an entry exactly at the TTL boundary', () => {
    // `> TTL_MS` is the gate (not `>=`); a fresh entry
    // just under the threshold is still valid.
    const entry = { cachedAt: new Date(NOW - CACHE_TTL_MS).toISOString() };
    expect(isStale(entry, NOW)).toBe(false);
  });

  it('returns true for an unparseable cachedAt', () => {
    const entry = { cachedAt: 'not-a-date' };
    expect(isStale(entry, NOW)).toBe(true);
  });
});

describe('tryParse', () => {
  it('parses valid JSON', () => {
    expect(tryParse<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null on parse error', () => {
    expect(tryParse<unknown>('not-json')).toBeNull();
  });

  it('returns null on null input', () => {
    expect(tryParse<unknown>(null)).toBeNull();
  });
});

describe('assignments cache', () => {
  it('write then read round-trips the data', () => {
    const tickets: SerializedTicket[] = [mkTicket({ id: 'tkt_a' })];
    writeAssignmentsCache(USER_ID, tickets, NOW);
    const out = readAssignmentsCache(USER_ID, NOW);
    expect(out).not.toBeNull();
    expect(out!.data).toEqual(tickets);
    expect(out!.cachedAt).toBe(new Date(NOW).toISOString());
  });

  it('read returns null when the key is missing', () => {
    expect(readAssignmentsCache(USER_ID, NOW)).toBeNull();
  });

  it('read returns null when the JSON is corrupted', () => {
    storage.setItem(
      `cityfix.crew.cache.${CACHE_SCHEMA_VERSION}.${USER_ID}.assignments`,
      'not-json',
    );
    expect(readAssignmentsCache(USER_ID, NOW)).toBeNull();
  });

  it('read returns null when the entry is stale (> 1h old)', () => {
    const tickets: SerializedTicket[] = [mkTicket({ id: 'tkt_a' })];
    writeAssignmentsCache(USER_ID, tickets, NOW - CACHE_TTL_MS - 1);
    expect(readAssignmentsCache(USER_ID, NOW)).toBeNull();
  });

  it('read returns null when the entry shape is invalid (version mismatch)', () => {
    storage.setItem(
      `cityfix.crew.cache.${CACHE_SCHEMA_VERSION}.${USER_ID}.assignments`,
      JSON.stringify({ data: [], cachedAt: new Date(NOW).toISOString(), version: 2 }),
    );
    expect(readAssignmentsCache(USER_ID, NOW)).toBeNull();
  });

  it('read returns null when cachedAt is missing', () => {
    storage.setItem(
      `cityfix.crew.cache.${CACHE_SCHEMA_VERSION}.${USER_ID}.assignments`,
      JSON.stringify({ data: [], version: 1 }),
    );
    expect(readAssignmentsCache(USER_ID, NOW)).toBeNull();
  });

  it('keys are scoped to the userId', () => {
    const tickets: SerializedTicket[] = [mkTicket({ id: 'tkt_a' })];
    writeAssignmentsCache(USER_ID, tickets, NOW);
    // A different userId sees an empty cache.
    expect(readAssignmentsCache('user_crew_other', NOW)).toBeNull();
  });

  it('keys are versioned (v2 entries are ignored)', () => {
    // A v2 key exists alongside the v1 key. The v1
    // reader should ignore the v2 entry and read the
    // v1 entry normally.
    storage.setItem(
      `cityfix.crew.cache.v2.${USER_ID}.assignments`,
      JSON.stringify({ data: [{ id: 'tkt_v2' }], cachedAt: new Date(NOW).toISOString(), version: 1 }),
    );
    const tickets: SerializedTicket[] = [mkTicket({ id: 'tkt_v1' })];
    writeAssignmentsCache(USER_ID, tickets, NOW);
    const out = readAssignmentsCache(USER_ID, NOW);
    expect(out).not.toBeNull();
    expect(out!.data[0].id).toBe('tkt_v1');
  });
});

describe('per-ticket cache', () => {
  it('write then read round-trips the data', () => {
    const ticket = mkTicket({ id: 'tkt_abc' });
    writeTicketCache(USER_ID, ticket, NOW);
    const out = readTicketCache(USER_ID, 'tkt_abc', NOW);
    expect(out).not.toBeNull();
    expect(out!.data).toEqual(ticket);
    expect(out!.cachedAt).toBe(new Date(NOW).toISOString());
  });

  it('read returns null when the key is missing', () => {
    expect(readTicketCache(USER_ID, 'tkt_missing', NOW)).toBeNull();
  });

  it('read returns null when the entry is stale', () => {
    const ticket = mkTicket({ id: 'tkt_abc' });
    writeTicketCache(USER_ID, ticket, NOW - CACHE_TTL_MS - 1);
    expect(readTicketCache(USER_ID, 'tkt_abc', NOW)).toBeNull();
  });

  it('invalidate removes the per-ticket key', () => {
    const ticket = mkTicket({ id: 'tkt_abc' });
    writeTicketCache(USER_ID, ticket, NOW);
    expect(readTicketCache(USER_ID, 'tkt_abc', NOW)).not.toBeNull();
    invalidateTicketCache(USER_ID, 'tkt_abc');
    expect(readTicketCache(USER_ID, 'tkt_abc', NOW)).toBeNull();
  });

  it('invalidate on a missing key is a no-op (no throw)', () => {
    expect(() =>
      invalidateTicketCache(USER_ID, 'tkt_never_written'),
    ).not.toThrow();
  });

  it('keys are scoped to the ticketId', () => {
    const a = mkTicket({ id: 'tkt_a' });
    const b = mkTicket({ id: 'tkt_b' });
    writeTicketCache(USER_ID, a, NOW);
    writeTicketCache(USER_ID, b, NOW);
    expect(readTicketCache(USER_ID, 'tkt_a', NOW)!.data.id).toBe('tkt_a');
    expect(readTicketCache(USER_ID, 'tkt_b', NOW)!.data.id).toBe('tkt_b');
  });

  it('keys are scoped to the userId', () => {
    const ticket = mkTicket({ id: 'tkt_abc' });
    writeTicketCache(USER_ID, ticket, NOW);
    expect(readTicketCache('user_crew_other', 'tkt_abc', NOW)).toBeNull();
  });
});

describe('formatCachedAge', () => {
  it('returns "just now" for an entry < 60s old', () => {
    const cachedAt = new Date(NOW - 30_000).toISOString();
    expect(formatCachedAge(cachedAt, NOW, 'en')).toBe('just now');
    expect(formatCachedAge(cachedAt, NOW, 'bn')).toBe('এইমাত্র');
  });

  it('returns "Xm ago" for an entry < 60m old', () => {
    const cachedAt = new Date(NOW - 5 * 60_000).toISOString();
    expect(formatCachedAge(cachedAt, NOW, 'en')).toBe('5m ago');
    expect(formatCachedAge(cachedAt, NOW, 'bn')).toBe('5 মিনিট আগে');
  });

  it('returns "Xh ago" for an entry < 24h old', () => {
    const cachedAt = new Date(NOW - 3 * 60 * 60_000).toISOString();
    expect(formatCachedAge(cachedAt, NOW, 'en')).toBe('3h ago');
    expect(formatCachedAge(cachedAt, NOW, 'bn')).toBe('3 ঘন্টা আগে');
  });

  it('returns "Xd ago" for an entry >= 24h old', () => {
    const cachedAt = new Date(NOW - 26 * 60 * 60_000).toISOString();
    expect(formatCachedAge(cachedAt, NOW, 'en')).toBe('1d ago');
    expect(formatCachedAge(cachedAt, NOW, 'bn')).toBe('1 দিন আগে');
  });

  it('returns "just now" for an unparseable cachedAt', () => {
    expect(formatCachedAge('not-a-date', NOW, 'en')).toBe('just now');
  });

  it('returns "just now" for a future cachedAt (clock skew)', () => {
    const cachedAt = new Date(NOW + 60_000).toISOString();
    expect(formatCachedAge(cachedAt, NOW, 'en')).toBe('just now');
  });
});

describe('storage absence', () => {
  it('readAssignmentsCache returns null when localStorage is unavailable', () => {
    setStorage(null);
    expect(readAssignmentsCache(USER_ID, NOW)).toBeNull();
  });

  it('writeAssignmentsCache is a no-op when localStorage is unavailable', () => {
    setStorage(null);
    expect(() =>
      writeAssignmentsCache(USER_ID, [mkTicket()], NOW),
    ).not.toThrow();
  });

  it('readTicketCache returns null when localStorage is unavailable', () => {
    setStorage(null);
    expect(readTicketCache(USER_ID, 'tkt_abc', NOW)).toBeNull();
  });

  it('writeTicketCache is a no-op when localStorage is unavailable', () => {
    setStorage(null);
    expect(() =>
      writeTicketCache(USER_ID, mkTicket(), NOW),
    ).not.toThrow();
  });

  it('invalidateTicketCache is a no-op when localStorage is unavailable', () => {
    setStorage(null);
    expect(() => invalidateTicketCache(USER_ID, 'tkt_abc')).not.toThrow();
  });
});

describe('schema stability', () => {
  it('the schema version is the documented v1', () => {
    expect(CACHE_SCHEMA_VERSION).toBe('v1');
  });

  it('the TTL is the documented 1 hour', () => {
    expect(CACHE_TTL_MS).toBe(60 * 60 * 1000);
  });

  it('a written entry round-trips with the right shape', () => {
    const tickets: SerializedTicket[] = [mkTicket({ id: 'tkt_abc' })];
    writeAssignmentsCache(USER_ID, tickets, NOW);
    const raw = storage.getItem(
      `cityfix.crew.cache.${CACHE_SCHEMA_VERSION}.${USER_ID}.assignments`,
    );
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string) as CrewCacheEntry<SerializedTicket[]>;
    expect(parsed.version).toBe(1);
    expect(typeof parsed.cachedAt).toBe('string');
    expect(parsed.data).toEqual(tickets);
  });
});
