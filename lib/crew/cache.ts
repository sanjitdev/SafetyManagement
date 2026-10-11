/**
 * Read-only localStorage cache for the crew's
 * list + detail responses.
 *
 * CREW-006 (Intent 004, Unit 004): the
 * offline-read cache. The crew app must remain
 * *readable* on a flaky network — between
 * dead zones in a city the connection drops
 * for a few seconds at a time, and the crew
 * member still needs to see which ticket to
 * drive to next.
 *
 * The cache is **read-only** for offline use.
 * Writes (transitions, photos) ALWAYS go to
 * the network. If the network fails, the page
 * shows the error and the user can retry.
 * There is NO silent write queue in v1.
 *
 * Storage model:
 *
 *   `cityfix.crew.cache.v1.<userId>.assignments`
 *     → `{ data: SerializedTicket[], cachedAt: ISO, version: 1 }`
 *
 *   `cityfix.crew.cache.v1.<userId>.ticket.<ticketId>`
 *     → `{ data: SerializedTicket, cachedAt: ISO, version: 1 }`
 *
 * The schema version is in the key prefix
 * (`v1`) so a future schema change can ignore
 * old keys without crashing. The user-id is in
 * the key prefix so two crew members on the
 * same shared device don't see each other's
 * data.
 *
 * The TTL is `CACHE_TTL_MS = 60 * 60 * 1000`
 * (1 hour). Older entries are treated as
 * missing. A v1.1 bolt may tune this.
 *
 * The module is pure JS. It checks `typeof
 * localStorage !== 'undefined'` before
 * touching it so the Vitest test runs in Node
 * with a `localStorage` polyfill (the test
 * file uses a small in-memory stub; no
 * `vitest-environment-jsdom` is needed).
 *
 * The module is **safe to import on the
 * server**. None of the exported functions
 * throws; all of them are no-ops (or
 * return `null`) when `localStorage` is
 * unavailable.
 */

import type { SerializedTicket } from '@/lib/serializers/ticket';

/**
 * The current schema version. Bumping the
 * version (`v1` → `v2`) makes the cache
 * module ignore all `v1.*` keys without
 * crashing — the next page mount simply
 * fetches fresh from the network.
 */
export const CACHE_SCHEMA_VERSION = 'v1';

/** TTL: cached data older than 1h is stale. */
export const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * The shape stored in localStorage. `data`
 * is either the assignments list (an array)
 * or a single ticket (an object). `cachedAt`
 * is the ISO timestamp the entry was
 * written; `version` is the schema version
 * (always `1` for v1 keys).
 */
export interface CrewCacheEntry<T> {
  data: T;
  cachedAt: string;
  version: 1;
}

/**
 * Read-side result. Returns `null` on any
 * failure: missing key, stale entry,
 * corrupted JSON, schema mismatch, or no
 * `localStorage` (e.g. Node SSR).
 */
export interface ReadResult<T> {
  data: T;
  cachedAt: string;
}

/**
 * Storage abstraction. The default impl
 * reads / writes the browser `localStorage`.
 * Tests inject a polyfill via `setStorage`.
 */
interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let storageOverride: StorageLike | null = null;

function getStorage(): StorageLike | null {
  if (storageOverride) return storageOverride;
  if (typeof globalThis === 'undefined') return null;
  const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (!ls) return null;
  return ls;
}

/**
 * Test-only: inject a localStorage polyfill.
 * The polyfill must implement `getItem`,
 * `setItem`, `removeItem`. Pass `null` to
 * reset to the browser's `localStorage`.
 */
export function setStorage(s: StorageLike | null): void {
  storageOverride = s;
}

// --- Key helpers ---------------------------------------------------------

function assignmentsKey(userId: string): string {
  return `cityfix.crew.cache.${CACHE_SCHEMA_VERSION}.${userId}.assignments`;
}

function ticketKey(userId: string, ticketId: string): string {
  return `cityfix.crew.cache.${CACHE_SCHEMA_VERSION}.${userId}.ticket.${ticketId}`;
}

// --- Pure helpers (exported for unit tests) ------------------------------

/**
 * True if `now - entry.cachedAt > TTL_MS`.
 * The check is `> TTL_MS` (not `>= TTL_MS`)
 * so a fresh entry just under the threshold
 * is still considered valid.
 */
export function isStale(
  entry: { cachedAt: string },
  now: number = Date.now(),
): boolean {
  const cachedMs = new Date(entry.cachedAt).getTime();
  if (!Number.isFinite(cachedMs)) return true;
  return now - cachedMs > CACHE_TTL_MS;
}

/**
 * JSON.parse wrapped in a try/catch. Returns
 * `null` on parse error. The corrupted entry
 * is NOT auto-deleted (a v1.1 bolt may add
 * cleanup; v1 is read-only-safe — the page
 * falls through to the network, which fails,
 * and the user sees the error).
 */
export function tryParse<T>(raw: string | null): T | null {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Validate a parsed cache entry. The shape
 * must be `{ data, cachedAt, version: 1 }`.
 * Returns `null` if any required field is
 * missing or wrong-typed. The check is
 * intentionally loose (we don't validate
 * the inner `data` shape) — the page
 * surfaces a "stale" or "missing" state on
 * the next read if the data is malformed,
 * and the worst case is a TypeScript error
 * caught by `tsc --noEmit`.
 */
function isValidEntry(value: unknown): value is CrewCacheEntry<unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (typeof v.cachedAt !== 'string') return false;
  if (v.data === undefined) return false;
  return true;
}

// --- Public API: assignments ---------------------------------------------

export function readAssignmentsCache(
  userId: string,
  now: number = Date.now(),
): ReadResult<SerializedTicket[]> | null {
  const ls = getStorage();
  if (!ls) return null;
  const raw = ls.getItem(assignmentsKey(userId));
  const parsed = tryParse<CrewCacheEntry<SerializedTicket[]>>(raw);
  if (!parsed) return null;
  if (!isValidEntry(parsed)) return null;
  if (isStale(parsed, now)) return null;
  return { data: parsed.data, cachedAt: parsed.cachedAt };
}

export function writeAssignmentsCache(
  userId: string,
  tickets: SerializedTicket[],
  now: number = Date.now(),
): void {
  const ls = getStorage();
  if (!ls) return;
  const entry: CrewCacheEntry<SerializedTicket[]> = {
    data: tickets,
    cachedAt: new Date(now).toISOString(),
    version: 1,
  };
  try {
    ls.setItem(assignmentsKey(userId), JSON.stringify(entry));
  } catch {
    // Quota exceeded, private mode, etc. — the
    // cache write is best-effort. The page
    // continues to work; the next read just
    // hits the network.
  }
}

// --- Public API: per-ticket ----------------------------------------------

export function readTicketCache(
  userId: string,
  ticketId: string,
  now: number = Date.now(),
): ReadResult<SerializedTicket> | null {
  const ls = getStorage();
  if (!ls) return null;
  const raw = ls.getItem(ticketKey(userId, ticketId));
  const parsed = tryParse<CrewCacheEntry<SerializedTicket>>(raw);
  if (!parsed) return null;
  if (!isValidEntry(parsed)) return null;
  if (isStale(parsed, now)) return null;
  return { data: parsed.data, cachedAt: parsed.cachedAt };
}

export function writeTicketCache(
  userId: string,
  ticket: SerializedTicket,
  now: number = Date.now(),
): void {
  const ls = getStorage();
  if (!ls) return;
  const entry: CrewCacheEntry<SerializedTicket> = {
    data: ticket,
    cachedAt: new Date(now).toISOString(),
    version: 1,
  };
  try {
    ls.setItem(ticketKey(userId, ticket.id), JSON.stringify(entry));
  } catch {
    // Best-effort; see `writeAssignmentsCache`.
  }
}

/**
 * Invalidate the per-ticket cache. Called
 * after a successful write (transition /
 * photo append) so the next read of the
 * detail page is fresh. The function is a
 * no-op if the key is missing.
 *
 * (The list cache is NOT invalidated here —
 * the list page re-fetches the assignments
 * on its 30s poll and overwrites the list
 * cache with the fresh data. Invalidation
 * is per-ticket only.)
 */
export function invalidateTicketCache(
  userId: string,
  ticketId: string,
): void {
  const ls = getStorage();
  if (!ls) return;
  ls.removeItem(ticketKey(userId, ticketId));
}

// --- Misc ----------------------------------------------------------------

/**
 * Format a relative-time label for the
 * "Cached, may be stale" banner.
 *
 * - < 60s → "just now"
 * - < 60m → "Xm ago"
 * - < 24h → "Xh ago"
 * - ≥ 24h → "Xd ago" (shouldn't happen — the
 *   cache is stale at 1h — but the formatter
 *   is safe for any positive duration)
 *
 * Pure function: no `Date.now()` is read
 * inside; the caller passes `cachedAt` + `now`.
 * The `language` arg is `'en'` or `'bn'` and
 * matches the page's `Language` type.
 */
export function formatCachedAge(
  cachedAt: string,
  now: number,
  language: 'en' | 'bn',
): string {
  const ms = now - new Date(cachedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return language === 'bn' ? 'এইমাত্র' : 'just now';
  }
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return language === 'bn' ? 'এইমাত্র' : 'just now';
  }
  if (minutes < 60) {
    return language === 'bn' ? `${minutes} মিনিট আগে` : `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return language === 'bn' ? `${hours} ঘন্টা আগে` : `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return language === 'bn' ? `${days} দিন আগে` : `${days}d ago`;
}
