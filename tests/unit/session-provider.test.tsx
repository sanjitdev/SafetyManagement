// @vitest-environment jsdom
/**
 * Vitest: the shared session is fetched ONCE per page load.
 *
 * THE DEFECT THIS GUARDS
 * ----------------------
 * Before `components/SessionProvider.tsx` existed, four independent
 * call sites each issued their own `fetch('/api/auth/status')`:
 * the header, the role sidebar, the user menu, and the page's own
 * auth gate. React 18's StrictMode double-invokes mount effects, so
 * a single page load issued EIGHT identical requests — and each one
 * cost up to six sequential DB round-trips on the server.
 *
 * The provider fixes this by owning the request and sharing the
 * payload through context. This test proves the two properties that
 * actually make it work:
 *
 *   1. CONCURRENT consumers share one request (the in-flight promise).
 *   2. A provider that mounts shortly AFTER another one settled —
 *      which is what a client-side route change does, because every
 *      route owns its own layout and therefore its own provider —
 *      reuses the recently settled payload instead of re-fetching.
 *
 * Property 2 is the subtle one. Without it, the splash page's
 * `router.replace('/home')` mounted a fresh `/home` layout with a
 * fresh provider, and the second request went out — which is
 * exactly what the measurement caught.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import {
  SessionProvider,
  resetSessionCache,
  useSession,
  type SessionPayload,
} from '@/components/SessionProvider';

/** The shape `/api/auth/status` returns for a signed-in citizen. */
const SIGNED_IN: SessionPayload = {
  authenticated: true,
  session: {
    sessionId: 'ses_1',
    userId: 'usr_rahim',
    role: 'citizen',
    cityId: 'city_dhaka',
    wardId: 'ward_14',
    wardName: 'Mirpur',
    wardNameBn: 'মিরপুর',
    departmentId: null,
    departmentName: null,
    departmentNameBn: null,
    name: 'Rahim',
    nameBn: 'রহিম',
  },
};

let fetchMock: ReturnType<typeof vi.fn>;

// React 18's `act` needs to be told that the environment supports it —
// without this, `act(...)` warns on every call.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  // The provider's cache is module-scope, so it survives between cases
  // in this file. Each case starts cold.
  resetSessionCache();
  fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => SIGNED_IN,
  }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A consumer that renders what it read from the shared session. */
function Probe({ label }: { label: string }) {
  const { authenticated, session } = useSession();
  return (
    <div data-testid={label}>
      {authenticated === null ? 'loading' : String(authenticated)}:
      {session?.userId ?? 'none'}
    </div>
  );
}

/**
 * The text a probe rendered, whitespace-normalised.
 *
 * The project has no jest-dom matchers installed, so `textContent` is
 * read directly rather than via `toHaveTextContent`.
 */
function textOf(label: string): string {
  return (screen.getByTestId(label).textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('the shared session is fetched once per page load', () => {
  it('serves several concurrent consumers from a single request', async () => {
    render(
      <SessionProvider>
        <Probe label="header" />
        <Probe label="sidebar" />
        <Probe label="menu" />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(textOf('header')).toBe('true:usr_rahim');
    });

    // All three consumers see the same payload…
    expect(textOf('sidebar')).toBe('true:usr_rahim');
    expect(textOf('menu')).toBe('true:usr_rahim');

    // …and they shared ONE request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('reuses a recently settled payload when a second provider mounts', async () => {
    // First provider: settles the request.
    const first = render(
      <SessionProvider>
        <Probe label="first" />
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(textOf('first')).toBe('true:usr_rahim');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A client-side route change unmounts the old layout and mounts a
    // new one. The new provider must NOT re-fetch — the session cannot
    // have changed between two navigations seconds apart.
    first.unmount();
    render(
      <SessionProvider>
        <Probe label="second" />
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(textOf('second')).toBe('true:usr_rahim');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when the cached payload has gone stale', async () => {
    vi.useFakeTimers();
    try {
      const first = render(
        <SessionProvider>
          <Probe label="first" />
        </SessionProvider>,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      first.unmount();

      // Past the cache window, the session is re-read.
      await act(async () => {
        vi.advanceTimersByTime(6_000);
      });

      render(
        <SessionProvider>
          <Probe label="second" />
        </SessionProvider>,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not probe at all when the provider is disabled', async () => {
    render(
      <SessionProvider enabled={false}>
        <Probe label="off" />
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(textOf('off')).toBe('loading:none');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('skips the probe when the caller already resolved the session', async () => {
    render(
      <SessionProvider initial={SIGNED_IN}>
        <Probe label="initial" />
      </SessionProvider>,
    );
    await waitFor(() => {
      expect(textOf('initial')).toBe('true:usr_rahim');
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
