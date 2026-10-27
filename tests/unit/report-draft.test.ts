/**
 * Unit tests for the report draft store (`lib/report-draft.ts`).
 *
 * The draft lives in `sessionStorage` so a tab refresh does not lose
 * the in-progress report. The module is browser-only in practice, so
 * the tests stub a minimal `window.sessionStorage` on `globalThis`.
 *
 * Covered:
 *   - `emptyDraft` — the default shape, seeded from `DHAKA_CENTER`.
 *   - `loadDraft` — absent key, a valid JSON payload, a malformed
 *     payload (must return `null`, not throw), and the SSR guard
 *     (`typeof window === 'undefined'`).
 *   - `saveDraft` / `clearDraft` — the round-trip and the removal.
 *   - The SSR guard on all three session-storage functions.
 *   - The storage-error guard — a `sessionStorage` that throws must
 *     not propagate out of `saveDraft` / `clearDraft` / `loadDraft`.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  clearDraft,
  emptyDraft,
  loadDraft,
  saveDraft,
  type ReportDraft,
} from '@/lib/report-draft';
import { DHAKA_CENTER } from '@/lib/geo/constants';

const STORAGE_KEY = 'cityfix.reportDraft.v1';

interface FakeStorage {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  store: Map<string, string>;
}

function makeStorage(overrides: Partial<FakeStorage> = {}): FakeStorage {
  const store = new Map<string, string>();
  return {
    store,
    getItem: overrides.getItem ?? ((k) => store.get(k) ?? null),
    setItem: overrides.setItem ?? ((k, v) => void store.set(k, v)),
    removeItem: overrides.removeItem ?? ((k) => void store.delete(k)),
    ...(overrides as object),
  } as FakeStorage;
}

const originalWindow = (globalThis as { window?: unknown }).window;

function installWindow(storage: FakeStorage) {
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
}

function uninstallWindow() {
  (globalThis as { window?: unknown }).window = originalWindow;
}

beforeEach(() => {
  installWindow(makeStorage());
});

afterEach(() => {
  uninstallWindow();
});

describe('emptyDraft', () => {
  it('seeds the Dhaka centre coordinates and the location step', () => {
    const draft = emptyDraft('city_1', 'ward_14');
    expect(draft.cityId).toBe('city_1');
    expect(draft.wardId).toBe('ward_14');
    expect(draft.locationLat).toBe(DHAKA_CENTER.lat);
    expect(draft.locationLng).toBe(DHAKA_CENTER.lng);
    expect(draft.step).toBe('location');
  });

  it('starts with no category, no photos and no note', () => {
    const draft = emptyDraft('city_1', 'ward_14');
    expect(draft.categoryId).toBeNull();
    expect(draft.photoUrls).toEqual([]);
    expect(draft.note).toBe('');
    expect(draft.locationLabel).toBe('Mirpur, ঢাকা');
    expect(draft.locationLabelBn).toBe('মিরপুর, ঢাকা');
  });
});

describe('saveDraft / loadDraft', () => {
  it('round-trips a draft through sessionStorage', () => {
    const draft = emptyDraft('city_1', 'ward_14');
    draft.categoryId = 'cat_pothole';
    draft.note = 'গর্ত খুব গভীর';

    saveDraft(draft);
    const loaded = loadDraft();

    expect(loaded).not.toBeNull();
    expect(loaded?.categoryId).toBe('cat_pothole');
    expect(loaded?.note).toBe('গর্ত খুব গভীর');
    expect(loaded?.cityId).toBe('city_1');
  });

  it('writes under the versioned storage key', () => {
    const storage = makeStorage();
    installWindow(storage);
    saveDraft(emptyDraft('city_1', 'ward_14'));
    expect(storage.store.has(STORAGE_KEY)).toBe(true);
  });

  it('returns null when nothing has been saved', () => {
    expect(loadDraft()).toBeNull();
  });

  it('returns null (not throws) for a malformed payload', () => {
    const storage = makeStorage();
    installWindow(storage);
    storage.store.set(STORAGE_KEY, '{ not json');
    expect(loadDraft()).toBeNull();
  });

  it('returns null when sessionStorage.getItem throws', () => {
    const storage = makeStorage({
      getItem: () => {
        throw new Error('denied');
      },
    });
    installWindow(storage);
    expect(loadDraft()).toBeNull();
  });

  it('swallows a sessionStorage.setItem failure', () => {
    const storage = makeStorage({
      setItem: () => {
        throw new Error('quota exceeded');
      },
    });
    installWindow(storage);
    expect(() => saveDraft(emptyDraft('city_1', 'ward_14'))).not.toThrow();
  });
});

describe('clearDraft', () => {
  it('removes the stored draft', () => {
    const storage = makeStorage();
    installWindow(storage);
    saveDraft(emptyDraft('city_1', 'ward_14'));
    expect(loadDraft()).not.toBeNull();

    clearDraft();
    expect(loadDraft()).toBeNull();
    expect(storage.store.has(STORAGE_KEY)).toBe(false);
  });

  it('swallows a sessionStorage.removeItem failure', () => {
    const storage = makeStorage({
      removeItem: () => {
        throw new Error('denied');
      },
    });
    installWindow(storage);
    expect(() => clearDraft()).not.toThrow();
  });
});

describe('SSR guard', () => {
  it('loadDraft returns null when there is no window', () => {
    uninstallWindow();
    expect(loadDraft()).toBeNull();
  });

  it('saveDraft is a no-op when there is no window', () => {
    uninstallWindow();
    const draft: ReportDraft = emptyDraft('city_1', 'ward_14');
    expect(() => saveDraft(draft)).not.toThrow();
  });

  it('clearDraft is a no-op when there is no window', () => {
    uninstallWindow();
    expect(() => clearDraft()).not.toThrow();
  });
});
