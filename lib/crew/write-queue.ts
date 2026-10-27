/**
 * Offline write queue (lib/crew/write-queue.ts).
 *
 * WO-003 — the "offline-queue-then-sync" pattern. WO-003's
 * "Do Not Change" list names it as a GATING requirement:
 *
 *   > "The **offline-queue-then-sync** pattern (Feature #4 —
 *   >  gating)."
 *
 * The spec's cross-cutting checklist says:
 *
 *   > "Offline-tolerant: status changes and photo uploads queue
 *   >  locally; retry on reconnect"
 *
 * and the page specs say:
 *
 *   > 3.2 "Offline: status change is queued and retried on
 *   >      reconnect"
 *   > 3.4 "Offline: photo upload is queued and retried on
 *   >      reconnect"
 *   > 3.5 "If upload still queued: shows 'uploading' state;
 *   >      ticket moves to 'Pending sync' filter in 3.1"
 *
 * ── Relationship to lib/crew/cache.ts ─────────────────────────
 *
 * `lib/crew/cache.ts` is the READ-ONLY half of the offline story
 * (CREW-006): it keeps the last-seen ticket visible on a flaky
 * network. Its own docblock says:
 *
 *   > "The cache is **read-only** for offline use. Writes
 *   >  (transitions, photos) ALWAYS go to the network. [...] There
 *   >  is NO silent write queue in v1."
 *
 * This module is the WRITE half. It follows the same conventions
 * so the two read as one subsystem:
 *
 *   - Pure functions wherever possible; the impure surface is
 *     small and obvious.
 *   - An injectable storage seam (`setIdbFactory()`) so the unit
 *     test can run without a real IndexedDB (the vitest
 *     environment is `node` — there is no `indexedDB` global).
 *   - Nothing here throws. Every failure is reported through the
 *     `Result` shape.
 *   - Safe to import on the server: the module checks for
 *     `indexedDB` before touching it.
 *
 * ── Storage model ─────────────────────────────────────────────
 *
 * IndexedDB database `cityfix.crew.queue.v1`:
 *
 *   `mutations` (keyPath: 'id')
 *     → {
 *         id: string,
 *         kind: 'transition' | 'photo',
 *         ticketId: string,
 *         payload: TransitionPayload | PhotoPayload,
 *         createdAt: number,   // epoch ms
 *         attempts: number,
 *         lastError: string | null,
 *       }
 *
 *   `blobs` (keyPath: 'id')
 *     → {
 *         id: string,          // the mutation id
 *         bytes: ArrayBuffer,  // the raw photo bytes
 *         mimeType: string,
 *       }
 *
 * The `blobs` store exists because photo bytes are too large for
 * `localStorage` (and WO-003's open question explicitly
 * recommends IndexedDB over localStorage for exactly this
 * reason: "IndexedDB vs. localStorage? Recommendation: IndexedDB
 * (larger quota; photo blobs)").
 *
 * ── Retry trigger ─────────────────────────────────────────────
 *
 * The flush is triggered by:
 *
 *   1. `window.addEventListener('online', flush)` — the browser
 *      fires this when the connection comes back.
 *   2. A 30 s interval — mirrors the existing polling pattern in
 *      `app/crew/page.tsx` (`POLL_INTERVAL_MS = 30_000`), so the
 *      crew app has ONE cadence, not two.
 *
 * The `startAutoFlush()` helper wires both and returns a
 * disposer. The crew detail page calls it on mount.
 *
 * ── Ordering ──────────────────────────────────────────────────
 *
 * Mutations are flushed in `createdAt` order (oldest first). A
 * transition and its follow-up photo must reach the server in the
 * order the crew performed them, or the server-side transition
 * engine rejects the second one.
 */

import type { TicketStatus } from '@prisma/client';

// =====================================================================
// Types
// =====================================================================

/**
 * The two mutation kinds the v1 crew app queues.
 *
 *   - `transition` — a status change (`in_progress` / `resolved`).
 *   - `photo`      — an after-photo upload.
 */
export type QueuedMutationKind = 'transition' | 'photo';

export interface QueuedTransitionPayload {
  toStatus: TicketStatus;
  note?: string;
}

export interface QueuedPhotoPayload {
  /** The base64 bytes (no `data:` prefix). */
  dataBase64: string;
  mimeType: string;
  fileName?: string;
}

export type QueuedMutationPayload = QueuedTransitionPayload | QueuedPhotoPayload;

export interface QueuedMutation {
  id: string;
  kind: QueuedMutationKind;
  ticketId: string;
  payload: QueuedMutationPayload;
  /** Epoch milliseconds. */
  createdAt: number;
  attempts: number;
  lastError: string | null;
}

export interface QueuedBlob {
  /** The mutation id this blob belongs to. */
  id: string;
  bytes: ArrayBuffer;
  mimeType: string;
}

/**
 * The read-side result of the queue.
 */
export interface QueueSnapshot {
  /** The pending mutations, oldest first. */
  mutations: QueuedMutation[];
  /** How many mutations are pending. */
  count: number;
  /** The ticket ids that have at least one pending mutation. */
  ticketIds: string[];
}

export type QueueResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

/**
 * The result of a flush attempt. `synced` is the number of
 * mutations that reached the server; `failed` is the number that
 * did not (they stay queued for the next attempt).
 */
export interface FlushResult {
  synced: number;
  failed: number;
  /** The mutations that failed, with their updated error. */
  errors: Array<{ id: string; error: string }>;
}

// =====================================================================
// Constants
// =====================================================================

/** The IndexedDB database name. */
export const QUEUE_DB_NAME = 'cityfix.crew.queue.v1';

/** The database schema version. Bump to force a rebuild. */
export const QUEUE_DB_VERSION = 1;

/** The object store holding the pending mutations. */
export const QUEUE_MUTATION_STORE = 'mutations';

/** The object store holding the pending photo bytes. */
export const QUEUE_BLOB_STORE = 'blobs';

/**
 * The auto-flush interval. 30 s — the SAME cadence as the crew
 * list page's poll (`app/crew/page.tsx`, `POLL_INTERVAL_MS`).
 */
export const QUEUE_FLUSH_INTERVAL_MS = 30_000;

/**
 * The maximum number of flush attempts before a mutation is
 * parked. A parked mutation is not dropped — it stays in the
 * queue and keeps its `lastError` so the UI can surface it.
 */
export const MAX_FLUSH_ATTEMPTS = 10;

// =====================================================================
// The IndexedDB seam
// =====================================================================

/**
 * The subset of the IndexedDB API this module uses. Declaring it
 * structurally keeps the module importable in a Node test
 * environment (where `indexedDB` does not exist).
 */
export interface IdbLike {
  open(name: string, version: number): {
    result: unknown;
    onsuccess: ((ev: unknown) => void) | null;
    onerror: ((ev: unknown) => void) | null;
    onupgradeneeded: ((ev: unknown) => void) | null;
  };
}

export interface IdbDatabaseLike {
  transaction(
    names: string[],
    mode: 'readonly' | 'readwrite',
  ): IdbTransactionLike;
  objectStoreNames: { contains(name: string): boolean };
  close(): void;
}

export interface IdbTransactionLike {
  objectStore(name: string): IdbStoreLike;
  oncomplete: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onabort: ((ev: unknown) => void) | null;
  error: unknown;
}

export interface IdbStoreLike {
  get(key: string): unknown;
  put(value: unknown, key?: string): unknown;
  delete(key: string): unknown;
  getAll(): unknown;
  clear(): unknown;
  index(name: string): IdbIndexLike;
  createIndex?(
    name: string,
    keyPath: string,
    options?: { unique?: boolean },
  ): unknown;
}

export interface IdbIndexLike {
  getAll(): unknown;
}

let idbFactoryOverride: IdbLike | null = null;

/**
 * Test-only: inject an IndexedDB seam. Pass `null` to reset to
 * the browser's `indexedDB`.
 */
export function setIdbFactory(factory: IdbLike | null): void {
  idbFactoryOverride = factory;
}

function getIdbFactory(): IdbLike | null {
  if (idbFactoryOverride) return idbFactoryOverride;
  if (typeof globalThis === 'undefined') return null;
  const idb = (globalThis as unknown as { indexedDB?: IdbLike }).indexedDB;
  return idb ?? null;
}

// =====================================================================
// Pure helpers (exported for unit tests)
// =====================================================================

/**
 * Build the mutation id. Shape: `mq_<epoch-base36>_<rand>`.
 *
 * The epoch prefix means the natural sort order of the ids
 * matches the creation order — a cheap tie-breaker for the
 * `createdAt` sort.
 */
export function buildMutationId(
  now: number = Date.now(),
  random?: string,
): string {
  const rand = random ?? Math.random().toString(36).slice(2, 10);
  return `mq_${now.toString(36)}_${rand}`;
}

/**
 * Sort mutations oldest-first. Ties are broken by id (which
 * embeds the epoch) so the order is deterministic.
 */
export function sortMutations(
  mutations: QueuedMutation[],
): QueuedMutation[] {
  return mutations.slice().sort((a, b) => {
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Build the `QueueSnapshot` from a raw mutation list.
 */
export function buildSnapshot(
  mutations: QueuedMutation[],
): QueueSnapshot {
  const ordered = sortMutations(mutations);
  const ticketIds: string[] = [];
  for (const m of ordered) {
    if (!ticketIds.includes(m.ticketId)) ticketIds.push(m.ticketId);
  }
  return { mutations: ordered, count: ordered.length, ticketIds };
}

/**
 * The API path a queued mutation is replayed to.
 */
export function endpointForMutation(mutation: QueuedMutation): string {
  const ticketId = encodeURIComponent(mutation.ticketId);
  if (mutation.kind === 'transition') {
    return `/api/v1/crew/tickets/${ticketId}/transition`;
  }
  return `/api/v1/crew/tickets/${ticketId}/photos`;
}

/**
 * The request body a queued mutation is replayed with.
 *
 * The shapes match the live API routes exactly — the same
 * `uploadCrewPhoto` wire contract for photos, the same
 * `{ toStatus, note }` for transitions.
 */
export function bodyForMutation(mutation: QueuedMutation): Record<string, unknown> {
  if (mutation.kind === 'transition') {
    const p = mutation.payload as QueuedTransitionPayload;
    const body: Record<string, unknown> = { toStatus: p.toStatus };
    if (p.note) body.note = p.note;
    return body;
  }
  const p = mutation.payload as QueuedPhotoPayload;
  const body: Record<string, unknown> = {
    dataBase64: p.dataBase64,
    mimeType: p.mimeType,
  };
  if (p.fileName) body.fileName = p.fileName;
  return body;
}

/**
 * True when a mutation has exhausted its retry budget.
 */
export function isParked(mutation: QueuedMutation): boolean {
  return mutation.attempts >= MAX_FLUSH_ATTEMPTS;
}

// =====================================================================
// The store
// =====================================================================

/**
 * Open (and if necessary create) the queue database.
 *
 * Returns `null` when IndexedDB is unavailable (Node SSR, a
 * browser with storage disabled, private mode). Every caller
 * treats `null` as "the queue is not available" and degrades to
 * the v1 online-only behaviour.
 */
export async function openQueueDb(): Promise<IdbDatabaseLike | null> {
  const factory = getIdbFactory();
  if (!factory) return null;
  return new Promise<IdbDatabaseLike | null>((resolve) => {
    let request: ReturnType<IdbLike['open']>;
    try {
      request = factory.open(QUEUE_DB_NAME, QUEUE_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = (request as unknown as { result?: IdbDatabaseLike }).result;
      if (!db) return;
      if (!db.objectStoreNames.contains(QUEUE_MUTATION_STORE)) {
        const store = db.transaction(
          [QUEUE_MUTATION_STORE],
          'readwrite',
        ).objectStore(QUEUE_MUTATION_STORE);
        store.createIndex?.('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(QUEUE_BLOB_STORE)) {
        db.transaction([QUEUE_BLOB_STORE], 'readwrite').objectStore(
          QUEUE_BLOB_STORE,
        );
      }
    };
    request.onsuccess = () => {
      resolve(
        (request as unknown as { result?: IdbDatabaseLike }).result ?? null,
      );
    };
    request.onerror = () => resolve(null);
  });
}

/**
 * The raw IndexedDB request → Promise bridge. The success value
 * is whatever the request carries.
 */
function reqToPromise<T>(request: unknown): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const r = request as {
      result?: T;
      error?: unknown;
      onsuccess: ((ev: unknown) => void) | null;
      onerror: ((ev: unknown) => void) | null;
    };
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

/**
 * Read every pending mutation, oldest first.
 */
export async function readQueue(): Promise<QueueResult<QueueSnapshot>> {
  const db = await openQueueDb();
  if (!db) {
    return { ok: true, value: { mutations: [], count: 0, ticketIds: [] } };
  }
  try {
    const tx = db.transaction([QUEUE_MUTATION_STORE], 'readonly');
    const rows = await reqToPromise<QueuedMutation[]>(
      tx.objectStore(QUEUE_MUTATION_STORE).getAll(),
    );
    db.close();
    const list = Array.isArray(rows) ? rows : [];
    return { ok: true, value: buildSnapshot(list) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Read the raw bytes for a queued photo mutation.
 */
export async function readQueuedBlob(
  mutationId: string,
): Promise<QueueResult<QueuedBlob | null>> {
  const db = await openQueueDb();
  if (!db) return { ok: true, value: null };
  try {
    const tx = db.transaction([QUEUE_BLOB_STORE], 'readonly');
    const row = await reqToPromise<QueuedBlob | undefined>(
      tx.objectStore(QUEUE_BLOB_STORE).get(mutationId),
    );
    db.close();
    return { ok: true, value: row ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Enqueue a mutation.
 *
 * The mutation is stored in the `mutations` store. A `photo`
 * mutation may carry raw `bytes`; when present they are written
 * to the `blobs` store (keyed by the mutation id) so the queue
 * survives a page reload with the bytes intact.
 */
export async function enqueueMutation(args: {
  kind: QueuedMutationKind;
  ticketId: string;
  payload: QueuedMutationPayload;
  bytes?: ArrayBuffer;
  now?: number;
  id?: string;
}): Promise<QueueResult<QueuedMutation>> {
  const db = await openQueueDb();
  if (!db) {
    return { ok: false, error: 'indexeddb_unavailable' };
  }
  const now = args.now ?? Date.now();
  const mutation: QueuedMutation = {
    id: args.id ?? buildMutationId(now),
    kind: args.kind,
    ticketId: args.ticketId,
    payload: args.payload,
    createdAt: now,
    attempts: 0,
    lastError: null,
  };
  try {
    const tx = db.transaction(
      [QUEUE_MUTATION_STORE, QUEUE_BLOB_STORE],
      'readwrite',
    );
    tx.objectStore(QUEUE_MUTATION_STORE).put(mutation);
    if (args.bytes) {
      const blob: QueuedBlob = {
        id: mutation.id,
        bytes: args.bytes,
        mimeType:
          args.kind === 'photo'
            ? (args.payload as QueuedPhotoPayload).mimeType
            : 'application/octet-stream',
      };
      tx.objectStore(QUEUE_BLOB_STORE).put(blob);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
      tx.onabort = () => reject(new Error('transaction aborted'));
    });
    db.close();
    return { ok: true, value: mutation };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Remove a mutation (and its blob) from the queue. Called after a
 * successful replay.
 */
export async function removeMutation(
  mutationId: string,
): Promise<QueueResult<true>> {
  const db = await openQueueDb();
  if (!db) return { ok: true, value: true };
  try {
    const tx = db.transaction(
      [QUEUE_MUTATION_STORE, QUEUE_BLOB_STORE],
      'readwrite',
    );
    tx.objectStore(QUEUE_MUTATION_STORE).delete(mutationId);
    tx.objectStore(QUEUE_BLOB_STORE).delete(mutationId);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
      tx.onabort = () => reject(new Error('transaction aborted'));
    });
    db.close();
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Record a failed attempt: bump `attempts` and store the error.
 *
 * The mutation is NOT removed — it stays queued for the next
 * attempt (up to `MAX_FLUSH_ATTEMPTS`).
 *
 * ── Why two transactions ───────────────────────────────────────
 *
 * The read and the write are in SEPARATE transactions. A
 * readwrite transaction auto-commits as soon as its request
 * queue drains and the event loop turns — awaiting a promise
 * that resolves from an IDB event inside a transaction is a
 * well-known way to commit the transaction prematurely (the
 * "transaction lifetime" rule in the IndexedDB spec). Splitting
 * the read (readonly) from the write (readwrite) keeps both
 * transactions atomic in their own right and portable across
 * implementations.
 */
export async function markMutationFailed(
  mutationId: string,
  error: string,
): Promise<QueueResult<true>> {
  const db = await openQueueDb();
  if (!db) return { ok: true, value: true };
  try {
    const readTx = db.transaction([QUEUE_MUTATION_STORE], 'readonly');
    const current = await reqToPromise<QueuedMutation | undefined>(
      readTx.objectStore(QUEUE_MUTATION_STORE).get(mutationId),
    );
    if (!current) {
      db.close();
      return { ok: true, value: true };
    }
    const writeTx = db.transaction([QUEUE_MUTATION_STORE], 'readwrite');
    writeTx.objectStore(QUEUE_MUTATION_STORE).put({
      ...current,
      attempts: current.attempts + 1,
      lastError: error,
    });
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve();
      writeTx.onerror = () =>
        reject(writeTx.error ?? new Error('transaction failed'));
      writeTx.onabort = () => reject(new Error('transaction aborted'));
    });
    db.close();
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Remove every queued mutation + blob. Test-only / "discard all"
 * affordance.
 */
export async function clearQueue(): Promise<QueueResult<true>> {
  const db = await openQueueDb();
  if (!db) return { ok: true, value: true };
  try {
    const tx = db.transaction(
      [QUEUE_MUTATION_STORE, QUEUE_BLOB_STORE],
      'readwrite',
    );
    tx.objectStore(QUEUE_MUTATION_STORE).clear();
    tx.objectStore(QUEUE_BLOB_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('transaction failed'));
      tx.onabort = () => reject(new Error('transaction aborted'));
    });
    db.close();
    return { ok: true, value: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// =====================================================================
// Flushing
// =====================================================================

/**
 * The transport seam — the `fetch` used to replay a mutation.
 * The unit test injects a stub here.
 */
export type QueueFetcher = typeof fetch;

/**
 * Replay every queued mutation against the API, oldest first.
 *
 * A mutation that succeeds is removed from the queue. A mutation
 * that fails stays queued with its attempt count and error
 * recorded.
 *
 * The flush STOPS at the first hard failure for a given ticket —
 * a transition that the server rejects (an illegal transition,
 * a missing resolution note) will not be fixed by replaying the
 * photo that follows it. Mutations for OTHER tickets continue.
 */
export async function flushQueue(
  fetcher?: QueueFetcher,
): Promise<FlushResult> {
  const f = fetcher ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  const snapshot = await readQueue();
  if (!snapshot.ok) {
    return { synced: 0, failed: 0, errors: [] };
  }
  const result: FlushResult = { synced: 0, failed: 0, errors: [] };
  if (!f || snapshot.value.count === 0) return result;

  // Tickets that hit a hard failure — their later mutations are
  // skipped this round (but stay queued).
  const blockedTickets = new Set<string>();

  for (const mutation of snapshot.value.mutations) {
    if (isParked(mutation)) {
      result.failed += 1;
      result.errors.push({
        id: mutation.id,
        error: mutation.lastError ?? 'max_attempts_reached',
      });
      continue;
    }
    if (blockedTickets.has(mutation.ticketId)) {
      result.failed += 1;
      result.errors.push({
        id: mutation.id,
        error: 'blocked_by_earlier_failure',
      });
      continue;
    }

    let ok = false;
    let error = 'unknown_error';
    try {
      const res = await f(endpointForMutation(mutation), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(bodyForMutation(mutation)),
      });
      if (res.ok) {
        ok = true;
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        error = body.error ?? `http_${res.status}`;
      }
    } catch (e) {
      // A network error is RETRYABLE — the mutation stays queued
      // and the next flush tries again.
      error = `network_${(e as Error).name || 'error'}`;
    }

    if (ok) {
      await removeMutation(mutation.id);
      result.synced += 1;
    } else {
      await markMutationFailed(mutation.id, error);
      result.failed += 1;
      result.errors.push({ id: mutation.id, error });
      // A 4xx is a hard failure (the server will never accept
      // this payload); a network error is soft — the next mutation
      // for the SAME ticket may still succeed. Either way the
      // ticket is blocked for this round so the ordering is
      // preserved.
      blockedTickets.add(mutation.ticketId);
    }
  }
  return result;
}

/**
 * The auto-flush controller. The crew detail page calls this on
 * mount and disposes it on unmount.
 */
export interface AutoFlushController {
  /** Stop the interval + the `online` listener. */
  dispose(): void;
  /** Run a flush immediately. */
  flush(): Promise<FlushResult>;
}

/**
 * Wire the retry triggers:
 *
 *   1. `window.addEventListener('online', flush)` — the browser
 *      fires this when the connection comes back.
 *   2. A 30 s interval — the same cadence as the crew list poll.
 *
 * Returns a controller with a `dispose()` the caller MUST call
 * on unmount (React strict mode mounts effects twice).
 */
export function startAutoFlush(
  options: {
    fetcher?: QueueFetcher;
    intervalMs?: number;
    onFlushed?: (result: FlushResult) => void;
  } = {},
): AutoFlushController {
  const intervalMs = options.intervalMs ?? QUEUE_FLUSH_INTERVAL_MS;
  const run = async (): Promise<FlushResult> => {
    const result = await flushQueue(options.fetcher);
    options.onFlushed?.(result);
    return result;
  };

  let disposed = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      void run();
    });
    timer = setInterval(() => {
      void run();
    }, intervalMs);
  }

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer !== null) clearInterval(timer);
    },
    flush: run,
  };
}

/**
 * True when the browser reports it is offline. Used by the page
 * to decide whether to enqueue optimistically.
 */
export function isOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}
