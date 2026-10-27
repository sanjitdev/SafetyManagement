/**
 * Unit tests for lib/crew/service-worker.ts (WO-003 PWA).
 *
 * Coverage:
 *   - The service worker path is the SITE ROOT (`/sw.js`) so its
 *     scope covers `/crew/...` — a worker served from
 *     `/crew/sw.js` would only control `/crew/*`.
 *   - `isServiceWorkerSupported()` is false without a
 *     `navigator.serviceWorker` and false outside a secure
 *     context.
 *   - `registerServiceWorker()` never rejects: a missing or
 *     failing registration resolves `false`.
 *   - `unregisterServiceWorker()` unregisters every
 *     registration.
 *
 * The vitest environment is `node` (see vitest.config.ts), so
 * `window` / `navigator` are absent. The tests install minimal
 * globals and restore them afterwards.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  SERVICE_WORKER_PATH,
  isServiceWorkerSupported,
  registerServiceWorker,
  unregisterServiceWorker,
} from '@/lib/crew/service-worker';

type Globals = {
  window?: unknown;
  navigator?: unknown;
};

const original: Globals = {
  window: (globalThis as unknown as Globals).window,
  navigator: (globalThis as unknown as Globals).navigator,
};

/**
 * `navigator` is a getter-only global in Node 20+, so it cannot
 * be assigned. `Object.defineProperty` replaces it for the
 * duration of the test and restores the original descriptor
 * afterwards.
 */
function defineGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

function setGlobals(opts: {
  secureContext: boolean;
  serviceWorker?: unknown;
}): void {
  defineGlobal('window', { isSecureContext: opts.secureContext });
  defineGlobal(
    'navigator',
    opts.serviceWorker ? { serviceWorker: opts.serviceWorker } : {},
  );
}

afterEach(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  if (original.window === undefined) {
    delete g.window;
  } else {
    g.window = original.window;
  }
  defineGlobal('navigator', original.navigator);
});

describe('crew service worker', () => {
  it('serves the worker from the site root so the scope covers /crew', () => {
    expect(SERVICE_WORKER_PATH).toBe('/sw.js');
  });

  it('is unsupported when there is no serviceWorker on navigator', () => {
    setGlobals({ secureContext: true });
    expect(isServiceWorkerSupported()).toBe(false);
  });

  it('is unsupported outside a secure context', () => {
    setGlobals({ secureContext: false, serviceWorker: { register: vi.fn() } });
    expect(isServiceWorkerSupported()).toBe(false);
  });

  it('is supported in a secure context with the API present', () => {
    setGlobals({ secureContext: true, serviceWorker: { register: vi.fn() } });
    expect(isServiceWorkerSupported()).toBe(true);
  });

  it('registers the worker at the root scope', async () => {
    const register = vi.fn(async () => ({ scope: '/' }));
    const ready = Promise.resolve({ scope: '/' });
    setGlobals({
      secureContext: true,
      serviceWorker: { register, ready },
    });
    const ok = await registerServiceWorker();
    expect(ok).toBe(true);
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
  });

  it('resolves false instead of throwing when registration fails', async () => {
    const register = vi.fn(async () => {
      throw new Error('registration blocked');
    });
    setGlobals({
      secureContext: true,
      serviceWorker: { register, ready: Promise.resolve({}) },
    });
    await expect(registerServiceWorker()).resolves.toBe(false);
  });

  it('resolves false when the environment cannot host a worker', async () => {
    setGlobals({ secureContext: false });
    await expect(registerServiceWorker()).resolves.toBe(false);
  });

  it('unregisters every registration', async () => {
    const unregister = vi.fn(async () => true);
    setGlobals({
      secureContext: true,
      serviceWorker: {
        getRegistrations: async () => [{ unregister }, { unregister }],
      },
    });
    await expect(unregisterServiceWorker()).resolves.toBe(true);
    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it('resolves false when there is nothing to unregister', async () => {
    setGlobals({
      secureContext: true,
      serviceWorker: { getRegistrations: async () => [] },
    });
    await expect(unregisterServiceWorker()).resolves.toBe(true);
  });
});
