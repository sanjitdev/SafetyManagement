/**
 * Unit tests for lib/theme/appearance.ts.
 *
 * The helper is pure data — DOM-touching parts live in the React
 * provider. These tests cover the validators and the
 * system-preference resolver.
 *
 * The `readAppearance` / `writeAppearance` tests install a tiny
 * localStorage polyfill on `globalThis` so they work in vitest's
 * `node` environment.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  APPEARANCES,
  APPEARANCE_DEFAULT,
  isAppearance,
  readAppearance,
  resolveAppearance,
  writeAppearance,
  THEME_CLASS,
  ALL_THEME_CLASSES,
  APPEARANCE_STORAGE_KEY,
} from '@/lib/theme/appearance';

interface FakeStorage {
  store: Map<string, string>;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
  clear(): void;
  key?(i: number): string | null;
  length: number;
}

function installFakeLocalStorage(): FakeStorage {
  const store = new Map<string, string>();
  const fake: FakeStorage = {
    store,
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    setItem: (k, v) => {
      store.set(k, String(v));
      fake.length = store.size;
    },
    removeItem: (k) => {
      store.delete(k);
      fake.length = store.size;
    },
    clear: () => {
      store.clear();
      fake.length = 0;
    },
    length: 0,
  };
  (globalThis as { window?: unknown }).window = { localStorage: fake } as unknown;
  return fake;
}

function uninstallFakeLocalStorage() {
  delete (globalThis as { window?: unknown }).window;
}

describe('appearance helper', () => {
  it('recognises all three valid appearance values', () => {
    for (const a of APPEARANCES) {
      expect(isAppearance(a)).toBe(true);
    }
  });

  it('rejects unknown appearance values', () => {
    expect(isAppearance(null)).toBe(false);
    expect(isAppearance(undefined)).toBe(false);
    expect(isAppearance('auto')).toBe(false);
    expect(isAppearance(42)).toBe(false);
    expect(isAppearance({})).toBe(false);
  });

  it('defaults to system when storage is empty', () => {
    expect(APPEARANCE_DEFAULT).toBe('system');
  });

  it('resolves dark/light to itself', () => {
    expect(resolveAppearance('dark', false)).toBe('dark');
    expect(resolveAppearance('dark', true)).toBe('dark');
    expect(resolveAppearance('light', false)).toBe('light');
    expect(resolveAppearance('light', true)).toBe('light');
  });

  it('resolves system to the system hint', () => {
    expect(resolveAppearance('system', true)).toBe('dark');
    expect(resolveAppearance('system', false)).toBe('light');
  });

  it('exposes the three theme class names exactly once', () => {
    const set = new Set(ALL_THEME_CLASSES);
    expect(set.size).toBe(3);
    expect(THEME_CLASS.light).toBe('theme-light');
    expect(THEME_CLASS.dark).toBe('theme-dark');
    expect(THEME_CLASS.system).toBe('theme-system');
  });
});

describe('appearance helper (with localStorage polyfill)', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = installFakeLocalStorage();
  });

  afterEach(() => {
    uninstallFakeLocalStorage();
  });

  it('round-trips appearance through localStorage when available', () => {
    writeAppearance('dark');
    expect(readAppearance()).toBe('dark');
    writeAppearance('light');
    expect(readAppearance()).toBe('light');
    writeAppearance('system');
    expect(readAppearance()).toBe('system');
  });

  it('returns null from readAppearance for unknown stored values', () => {
    storage.setItem(APPEARANCE_STORAGE_KEY, 'auto');
    expect(readAppearance()).toBeNull();
  });

  it('returns null from readAppearance when storage is empty', () => {
    expect(readAppearance()).toBeNull();
  });

  it('uses the documented storage key', () => {
    writeAppearance('dark');
    expect(storage.store.has(APPEARANCE_STORAGE_KEY)).toBe(true);
  });
});
