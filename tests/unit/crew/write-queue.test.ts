/**
 * Unit tests for lib/crew/write-queue.ts (WO-003 offline
 * write queue).
 *
 * Coverage:
 *   - Pure helpers: `buildMutationId`, `sortMutations`,
 *     `buildSnapshot`, `endpointForMutation`, `bodyForMutation`,
 *     `isParked`.
 *   - The IndexedDB seam: enqueue → read → markFailed → remove
 *     → clear, against a fake IndexedDB.
 *   - `flushQueue`: success (mutation removed), server
 *     rejection (mutation kept, attempt bumped), network error
 *     (mutation kept), ordering (oldest first), and the
 *     same-ticket blocking rule.
 *   - `startAutoFlush`: the `dispose()` contract.
 *   - The queue-copy fallback (so the "Pending sync" banner
 *     never leaks a raw key to the crew).
 *
 * The vitest environment is `node` (see vitest.config.ts) —
 * there is no `indexedDB` global, so the module's injectable
 * `setIdbFactory()` seam is used with a small in-memory fake.
 * That mirrors how `lib/crew/cache.ts` is tested through its
 * `setStorage()` seam.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  MAX_FLUSH_ATTEMPTS,
  QUEUE_BLOB_STORE,
  QUEUE_DB_NAME,
  QUEUE_DB_VERSION,
  QUEUE_MUTATION_STORE,
  buildMutationId,
  bodyForMutation,
  buildSnapshot,
  clearQueue,
  enqueueMutation,
  endpointForMutation,
  flushQueue,
  isParked,
  markMutationFailed,
  readQueue,
  readQueuedBlob,
  removeMutation,
  setIdbFactory,
  sortMutations,
  startAutoFlush,
  type IdbLike,
  type QueuedMutation,
} from '@/lib/crew/write-queue';

// =====================================================================
// A minimal in-memory fake IndexedDB
// =====================================================================

/**
 * The fake implements only the surface `lib/crew/write-queue.ts`
 * uses: `open`, `transaction`, `objectStoreNames`, and the
 * store methods `get` / `put` / `delete` / `getAll` / `clear`.
 *
 * Every operation resolves asynchronously (via `queueMicrotask`)
 * so the module's request→promise bridge is exercised the same
 * way the real IndexedDB exercises it.
 */
class FakeStore {
  constructor(
    private readonly data: Map<string, unknown>,
    private readonly keyPath: string,
    private readonly tx: FakeTransaction,
  ) {}

  private keyOf(value: unknown, key?: string): string {
    if (key !== undefined) return key;
    return String((value as Record<string, unknown>)[this.keyPath]);
  }

  get(key: string) {
    return this.tx.makeRequest(this.data.get(key));
  }

  put(value: unknown, key?: string) {
    this.data.set(this.keyOf(value, key), value);
    return this.tx.makeRequest(this.keyOf(value, key));
  }

  delete(key: string) {
    this.data.delete(key);
    return this.tx.makeRequest(undefined);
  }

  getAll() {
    return this.tx.makeRequest(Array.from(this.data.values()));
  }

  clear() {
    this.data.clear();
    return this.tx.makeRequest(undefined);
  }

  index() {
    return { getAll: () => this.tx.makeRequest([]) };
  }
}

class FakeTransaction {
  error: unknown = null;
  oncomplete: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onabort: ((ev: unknown) => void) | null = null;
  /** The number of requests still in flight. */
  private pending = 0;
  /** The store views bound to this transaction. */
  private readonly stores = new Map<string, FakeStore>();

  constructor(
    private readonly data: Map<string, Map<string, unknown>>,
    private readonly names: string[],
  ) {}

  objectStore(name: string): FakeStore {
    const existing = this.stores.get(name);
    if (existing) return existing;
    const backing = this.data.get(name);
    if (!backing) throw new Error(`unknown store ${name}`);
    const store = new FakeStore(backing, 'id', this);
    this.stores.set(name, store);
    return store;
  }

  /**
   * Create a request that settles on a microtask.
   *
   * The transaction's `complete` event fires once every request
   * has settled AND on a LATER microtask — mirroring the real
   * IndexedDB ordering, where `complete` is delivered after the
   * last request's success event. The extra microtask is what
   * lets the module's `await` continuation attach its
   * `oncomplete` handler before the event fires.
   */
  makeRequest(result: unknown) {
    const request: {
      result: unknown;
      onsuccess: ((ev: unknown) => void) | null;
      onerror: ((ev: unknown) => void) | null;
    } = {
      result,
      onsuccess: null,
      onerror: null,
    };
    this.pending += 1;
    queueMicrotask(() => {
      request.onsuccess?.({ target: request });
      this.pending -= 1;
      queueMicrotask(() => {
        if (this.pending === 0) this.oncomplete?.({ target: this });
      });
    });
    return request;
  }
}

class FakeDatabase {
  constructor(
    private readonly data: Map<string, Map<string, unknown>>,
    private readonly names: string[],
  ) {}

  transaction(names: string[]) {
    return new FakeTransaction(this.data, names);
  }

  get objectStoreNames() {
    const names = this.names;
    return { contains: (name: string) => names.includes(name) };
  }

  close() {
    /* nothing to release in the fake */
  }
}

/**
 * Build a fake `IdbLike` factory whose database starts with the
 * two queue stores already created (the module's
 * `onupgradeneeded` path creates them, but the fake short-
 * circuits the upgrade so the tests focus on the queue logic).
 */
function makeFakeIdb(): {
  factory: IdbLike;
  mutations: Map<string, unknown>;
  blobs: Map<string, unknown>;
} {
  const mutations = new Map<string, unknown>();
  const blobs = new Map<string, unknown>();
  const data = new Map<string, Map<string, unknown>>([
    [QUEUE_MUTATION_STORE, mutations],
    [QUEUE_BLOB_STORE, blobs],
  ]);
  const names = [QUEUE_MUTATION_STORE, QUEUE_BLOB_STORE];

  const db = new FakeDatabase(data, names);

  const factory: IdbLike = {
    open(name: string, version: number) {
      const request: {
        result: unknown;
        onsuccess: ((ev: unknown) => void) | null;
        onerror: ((ev: unknown) => void) | null;
        onupgradeneeded: ((ev: unknown) => void) | null;
      } = {
        result: db,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => request.onsuccess?.({ target: request }));
      return request;
    },
  };

  return { factory, mutations, blobs };
}

// =====================================================================
// Pure helpers
// =====================================================================

describe('write-queue — pure helpers', () => {
  it('builds a mutation id with an epoch prefix and a random suffix', () => {
    const id = buildMutationId(1_700_000_000_000, 'abcd1234');
    expect(id).toBe(`mq_${(1_700_000_000_000).toString(36)}_abcd1234`);
    expect(id.startsWith('mq_')).toBe(true);
  });

  it('builds distinct ids when the random suffix differs', () => {
    const a = buildMutationId(1_700_000_000_000, 'aaaa');
    const b = buildMutationId(1_700_000_000_000, 'bbbb');
    expect(a).not.toBe(b);
  });

  it('sorts mutations oldest-first, breaking ties by id', () => {
    const list: QueuedMutation[] = [
      {
        id: 'mq_b',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 200,
        attempts: 0,
        lastError: null,
      },
      {
        id: 'mq_a',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 100,
        attempts: 0,
        lastError: null,
      },
      {
        id: 'mq_c',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 100,
        attempts: 0,
        lastError: null,
      },
    ];
    const sorted = sortMutations(list);
    expect(sorted.map((m) => m.id)).toEqual(['mq_a', 'mq_c', 'mq_b']);
  });

  it('does not mutate the input array when sorting', () => {
    const list: QueuedMutation[] = [
      {
        id: 'mq_b',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 2,
        attempts: 0,
        lastError: null,
      },
      {
        id: 'mq_a',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      },
    ];
    sortMutations(list);
    expect(list[0].id).toBe('mq_b');
  });

  it('builds a snapshot with the count and the unique ticket ids', () => {
    const snapshot = buildSnapshot([
      {
        id: 'mq_1',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      },
      {
        id: 'mq_2',
        kind: 'photo',
        ticketId: 't1',
        payload: { dataBase64: 'AA==', mimeType: 'image/jpeg' },
        createdAt: 2,
        attempts: 0,
        lastError: null,
      },
      {
        id: 'mq_3',
        kind: 'transition',
        ticketId: 't2',
        payload: { toStatus: 'in_progress' },
        createdAt: 3,
        attempts: 0,
        lastError: null,
      },
    ]);
    expect(snapshot.count).toBe(3);
    expect(snapshot.ticketIds).toEqual(['t1', 't2']);
  });

  it('maps a transition mutation to the transition endpoint', () => {
    expect(
      endpointForMutation({
        id: 'mq_1',
        kind: 'transition',
        ticketId: 't 1',
        payload: { toStatus: 'resolved' },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      }),
    ).toBe('/api/v1/crew/tickets/t%201/transition');
  });

  it('maps a photo mutation to the photos endpoint', () => {
    expect(
      endpointForMutation({
        id: 'mq_1',
        kind: 'photo',
        ticketId: 't1',
        payload: { dataBase64: 'AA==', mimeType: 'image/jpeg' },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      }),
    ).toBe('/api/v1/crew/tickets/t1/photos');
  });

  it('builds the transition body with the optional note', () => {
    expect(
      bodyForMutation({
        id: 'mq_1',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'resolved', note: 'fixed' },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      }),
    ).toEqual({ toStatus: 'resolved', note: 'fixed' });
  });

  it('omits the note when the transition has none', () => {
    expect(
      bodyForMutation({
        id: 'mq_1',
        kind: 'transition',
        ticketId: 't1',
        payload: { toStatus: 'in_progress' },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      }),
    ).toEqual({ toStatus: 'in_progress' });
  });

  it('builds the photo body with the optional file name', () => {
    expect(
      bodyForMutation({
        id: 'mq_1',
        kind: 'photo',
        ticketId: 't1',
        payload: {
          dataBase64: 'AA==',
          mimeType: 'image/png',
          fileName: 'shot.png',
        },
        createdAt: 1,
        attempts: 0,
        lastError: null,
      }),
    ).toEqual({
      dataBase64: 'AA==',
      mimeType: 'image/png',
      fileName: 'shot.png',
    });
  });

  it('parks a mutation only at the attempt ceiling', () => {
    const base: QueuedMutation = {
      id: 'mq_1',
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      createdAt: 1,
      attempts: 0,
      lastError: null,
    };
    expect(isParked(base)).toBe(false);
    expect(isParked({ ...base, attempts: MAX_FLUSH_ATTEMPTS - 1 })).toBe(false);
    expect(isParked({ ...base, attempts: MAX_FLUSH_ATTEMPTS })).toBe(true);
  });
});

// =====================================================================
// The store
// =====================================================================

describe('write-queue — the IndexedDB seam', () => {
  let fake: ReturnType<typeof makeFakeIdb>;

  beforeEach(() => {
    fake = makeFakeIdb();
    setIdbFactory(fake.factory);
  });

  afterEach(() => {
    setIdbFactory(null);
  });

  it('enqueues a transition and reads it back', async () => {
    const enqueued = await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 1_000,
    });
    expect(enqueued.ok).toBe(true);

    const read = await readQueue();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.count).toBe(1);
    expect(read.value.mutations[0].ticketId).toBe('t1');
    expect(read.value.mutations[0].attempts).toBe(0);
    expect(read.value.mutations[0].lastError).toBeNull();
  });

  it('enqueues a photo with its bytes in the blob store', async () => {
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const enqueued = await enqueueMutation({
      kind: 'photo',
      ticketId: 't1',
      payload: { dataBase64: 'AQID', mimeType: 'image/jpeg' },
      bytes,
      now: 2_000,
    });
    expect(enqueued.ok).toBe(true);
    expect(fake.blobs.size).toBe(1);

    const blob = await readQueuedBlob(enqueued.ok ? enqueued.value.id : '');
    expect(blob.ok).toBe(true);
    if (!blob.ok) return;
    expect(blob.value?.mimeType).toBe('image/jpeg');
  });

  it('bumps the attempt count and records the error on failure', async () => {
    const enqueued = await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 3_000,
    });
    const id = enqueued.ok ? enqueued.value.id : '';

    const marked = await markMutationFailed(id, 'http_400');
    expect(marked.ok).toBe(true);

    const read = await readQueue();
    if (!read.ok) throw new Error('read failed');
    expect(read.value.mutations[0].attempts).toBe(1);
    expect(read.value.mutations[0].lastError).toBe('http_400');
  });

  it('removes a mutation and its blob', async () => {
    const enqueued = await enqueueMutation({
      kind: 'photo',
      ticketId: 't1',
      payload: { dataBase64: 'AQID', mimeType: 'image/jpeg' },
      bytes: new Uint8Array([1]).buffer,
      now: 4_000,
    });
    const id = enqueued.ok ? enqueued.value.id : '';

    const removed = await removeMutation(id);
    expect(removed.ok).toBe(true);

    const read = await readQueue();
    if (!read.ok) throw new Error('read failed');
    expect(read.value.count).toBe(0);
    expect(fake.blobs.size).toBe(0);
  });

  it('clears the whole queue', async () => {
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 5_000,
    });
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't2',
      payload: { toStatus: 'in_progress' },
      now: 6_000,
    });

    const cleared = await clearQueue();
    expect(cleared.ok).toBe(true);

    const read = await readQueue();
    if (!read.ok) throw new Error('read failed');
    expect(read.value.count).toBe(0);
  });

  it('reports an empty queue when IndexedDB is unavailable', async () => {
    setIdbFactory(null);
    // No `indexedDB` global in the node test environment.
    const read = await readQueue();
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.count).toBe(0);
  });

  it('reports an enqueue failure when IndexedDB is unavailable', async () => {
    setIdbFactory(null);
    const enqueued = await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
    });
    expect(enqueued.ok).toBe(false);
  });
});

// =====================================================================
// Flushing
// =====================================================================

describe('write-queue — flushQueue', () => {
  let fake: ReturnType<typeof makeFakeIdb>;

  beforeEach(() => {
    fake = makeFakeIdb();
    setIdbFactory(fake.factory);
  });

  afterEach(() => {
    setIdbFactory(null);
  });

  it('replays a mutation and removes it on success', async () => {
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 1_000,
    });

    const calls: Array<{ url: string; body: string }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return {
        ok: true,
        status: 200,
        json: async () => ({ ticket: { id: 't1' } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await flushQueue(fetcher);
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(calls[0].url).toBe('/api/v1/crew/tickets/t1/transition');
    expect(JSON.parse(calls[0].body)).toEqual({ toStatus: 'in_progress' });

    const read = await readQueue();
    if (!read.ok) throw new Error('read failed');
    expect(read.value.count).toBe(0);
  });

  it('keeps a mutation queued when the server rejects it', async () => {
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'resolved' },
      now: 1_000,
    });

    const fetcher = vi.fn(async () => {
      return {
        ok: false,
        status: 400,
        json: async () => ({ error: 'invalid_input' }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await flushQueue(fetcher);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toBe('invalid_input');

    const read = await readQueue();
    if (!read.ok) throw new Error('read failed');
    expect(read.value.count).toBe(1);
    expect(read.value.mutations[0].attempts).toBe(1);
    expect(read.value.mutations[0].lastError).toBe('invalid_input');
  });

  it('keeps a mutation queued when the network fails', async () => {
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 1_000,
    });

    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;

    const result = await flushQueue(fetcher);
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toBe('network_TypeError');

    const read = await readQueue();
    if (!read.ok) throw new Error('read failed');
    expect(read.value.count).toBe(1);
  });

  it('replays the mutations oldest-first', async () => {
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 3_000,
    });
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't2',
      payload: { toStatus: 'in_progress' },
      now: 1_000,
    });
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't3',
      payload: { toStatus: 'in_progress' },
      now: 2_000,
    });

    const seen: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      seen.push(String(url));
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await flushQueue(fetcher);
    expect(seen).toEqual([
      '/api/v1/crew/tickets/t2/transition',
      '/api/v1/crew/tickets/t3/transition',
      '/api/v1/crew/tickets/t1/transition',
    ]);
  });

  it('skips later mutations for a ticket whose earlier one failed', async () => {
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 1_000,
    });
    await enqueueMutation({
      kind: 'photo',
      ticketId: 't1',
      payload: { dataBase64: 'AQID', mimeType: 'image/jpeg' },
      now: 2_000,
    });
    await enqueueMutation({
      kind: 'transition',
      ticketId: 't2',
      payload: { toStatus: 'in_progress' },
      now: 3_000,
    });

    const seen: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      seen.push(String(url));
      if (String(url).includes('/t1/')) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'illegal_transition' }),
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await flushQueue(fetcher);
    // t1/transition fails, t1/photos is blocked, t2 succeeds.
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(2);
    expect(seen).not.toContain('/api/v1/crew/tickets/t1/photos');
    expect(seen).toContain('/api/v1/crew/tickets/t2/transition');
  });

  it('does not replay a parked mutation', async () => {
    const enqueued = await enqueueMutation({
      kind: 'transition',
      ticketId: 't1',
      payload: { toStatus: 'in_progress' },
      now: 1_000,
    });
    const id = enqueued.ok ? enqueued.value.id : '';
    for (let i = 0; i < MAX_FLUSH_ATTEMPTS; i += 1) {
      await markMutationFailed(id, 'network_Error');
    }

    const fetcher = vi.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await flushQueue(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toBe('network_Error');
  });

  it('is a no-op on an empty queue', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const result = await flushQueue(fetcher);
    expect(result).toEqual({ synced: 0, failed: 0, errors: [] });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

// =====================================================================
// Auto-flush
// =====================================================================

describe('write-queue — startAutoFlush', () => {
  beforeEach(() => {
    setIdbFactory(makeFakeIdb().factory);
  });

  afterEach(() => {
    setIdbFactory(null);
  });

  it('exposes a dispose() that is safe to call twice', () => {
    const controller = startAutoFlush();
    expect(() => {
      controller.dispose();
      controller.dispose();
    }).not.toThrow();
  });

  it('runs a flush on demand and reports the result', async () => {
    const controller = startAutoFlush();
    const result = await controller.flush();
    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
    controller.dispose();
  });

  it('calls the onFlushed callback after a flush', async () => {
    const onFlushed = vi.fn();
    const controller = startAutoFlush({ onFlushed });
    await controller.flush();
    expect(onFlushed).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});

// =====================================================================
// The queue copy
// =====================================================================

describe('crew queue copy', () => {
  it('never leaks the raw i18n key to the user', async () => {
    const { pendingSyncLabel, PENDING_SYNC_KEY } = await import(
      '@/lib/crew/queue-copy'
    );
    const bn = pendingSyncLabel(2, 'bn');
    const en = pendingSyncLabel(2, 'en');
    expect(bn).not.toBe(PENDING_SYNC_KEY);
    expect(en).not.toBe(PENDING_SYNC_KEY);
    expect(bn).toContain('2');
    expect(en).toContain('2');
  });
});

// =====================================================================
// Constants
// =====================================================================

describe('write-queue — constants', () => {
  it('uses the documented database name and stores', () => {
    expect(QUEUE_DB_NAME).toBe('cityfix.crew.queue.v1');
    expect(QUEUE_DB_VERSION).toBe(1);
    expect(QUEUE_MUTATION_STORE).toBe('mutations');
    expect(QUEUE_BLOB_STORE).toBe('blobs');
  });
});
