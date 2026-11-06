'use client';

/**
 * SessionProvider (components/SessionProvider.tsx).
 *
 * Single owner of the `/api/auth/status` probe.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this provider, every surface that needed to know "is the user
 * signed in?" issued its OWN `fetch('/api/auth/status')`:
 *
 *   - `AppHeader`      — probed on mount to decide whether to render the
 *                        UserMenu or the sign-in / register pair.
 *   - `RoleSidebar`    — probed on mount to learn the session's `role`
 *                        and `cityId` (they drive which nav items render).
 *   - `UserMenu`       — probed on mount (AND on every menu open) to
 *                        render the user's display name and role.
 *   - each page        — probed on mount as its own auth gate.
 *
 * On a role page that meant FOUR concurrent requests for the SAME
 * payload on a single page load (measured: 8 requests per page load
 * under React 18 StrictMode, which double-invokes mount effects).
 *
 * Each of those requests is not cheap. `/api/auth/status` performs up
 * to SIX sequential DB round-trips (`lib/auth/session.ts` → session
 * lookup + last-seen update + user lookup; then the route's own user
 * lookup + optional ward + optional department). So a single page load
 * was costing roughly 4 × 6 = 24 redundant DB round-trips before the
 * page's real data fetch even started. That is what made pages feel
 * slow to load.
 *
 * THE FIX
 * -------
 * One provider, one fetch, many consumers:
 *
 *   - The fetch is issued once per mount and its result is shared via
 *     React context, so every consumer reads the same object.
 *   - The in-flight promise is cached at module scope, so the StrictMode
 *     double-mount (and any consumer that mounts before the first
 *     response lands) joins the SAME request instead of starting a
 *     second one. This is what takes 8 calls down to 1.
 *   - Consumers that already know the answer (a server component that
 *     read the session, or a page that passed `signedIn` down) can
 *     short-circuit the probe entirely via the `signedIn` prop that
 *     `AppShell` / `AppHeader` already expose.
 *
 * The provider deliberately exposes the FULL session payload (not just
 * an `authenticated` boolean) because the sidebar, the user menu and
 * the staff scope bars all need the same fields — which is exactly why
 * they were each fetching it separately.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type SessionRole = 'citizen' | 'dispatcher' | 'crew' | 'admin';

export interface SessionScope {
  sessionId: string;
  userId: string;
  role: SessionRole;
  cityId: string;
  wardId: string | null;
  wardName: string | null;
  wardNameBn: string | null;
  departmentId: string | null;
  departmentName: string | null;
  departmentNameBn: string | null;
  name: string | null;
  nameBn: string | null;
}

export interface SessionPayload {
  authenticated: boolean;
  session: SessionScope | null;
}

interface SessionContextValue {
  /** The resolved session payload, or null while it is still loading. */
  payload: SessionPayload | null;
  /** Convenience: `true` / `false` / `null` (null = still loading). */
  authenticated: boolean | null;
  /** The session scope, or null. */
  session: SessionScope | null;
  /** Re-fetch the session (used after login / logout / profile edits). */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Module-scope in-flight promise. Two effects that mount in the same
 * tick (StrictMode's double-invoke, or a sidebar + header mounting
 * together) share this single request instead of racing two.
 */
let inFlight: Promise<SessionPayload> | null = null;

/**
 * The last settled payload, with the timestamp it settled at.
 *
 * WHY THIS EXISTS
 * ---------------
 * Each route owns its own layout, and each layout mounts its own
 * `AppShell` → its own `SessionProvider`. A CLIENT-SIDE navigation
 * (the splash's `router.replace('/home')`, or any in-app link) unmounts
 * the old layout and mounts the new one. The new provider would then
 * issue a fresh `/api/auth/status` request even though the answer
 * cannot have changed between two navigations seconds apart — that is
 * the second request the splash page was still making.
 *
 * Reusing a recently settled payload for a short window turns that
 * second request back into a cache hit, while still letting a genuine
 * sign-in / sign-out (which calls `refresh()`) invalidate it.
 *
 * The window is deliberately short: long enough to cover a client-side
 * route change, short enough that a user who signs out and back in on a
 * different tab is never shown a stale session.
 */
const SESSION_CACHE_TTL_MS = 5_000;
let cached: { payload: SessionPayload; at: number } | null = null;

async function fetchSession(): Promise<SessionPayload> {
  try {
    const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
    if (!res.ok) return { authenticated: false, session: null };
    const data = (await res.json()) as SessionPayload;
    return {
      authenticated: Boolean(data?.authenticated),
      session: data?.session ?? null,
    };
  } catch {
    // Treat an unreachable endpoint as "signed out" rather than throwing —
    // the header then renders the sign-in pair, which is the safe default.
    return { authenticated: false, session: null };
  }
}

export function loadSession(): Promise<SessionPayload> {
  if (!inFlight) {
    inFlight = fetchSession()
      .then((payload) => {
        cached = { payload, at: Date.now() };
        return payload;
      })
      .finally(() => {
        // Clear the in-flight handle once settled so a later `refresh()`
        // starts a new request; concurrent callers that joined this
        // promise still get the same payload.
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * The cached payload if it settled recently enough to still be
 * trustworthy, otherwise null.
 */
function freshCache(): SessionPayload | null {
  if (!cached) return null;
  if (Date.now() - cached.at > SESSION_CACHE_TTL_MS) {
    cached = null;
    return null;
  }
  return cached.payload;
}

/**
 * Drop the cached payload and any in-flight request.
 *
 * Exposed for tests, which need each case to start from a cold cache —
 * the module-scope cache otherwise leaks across cases in the same file
 * and silently satisfies a probe that is meant to hit the network.
 * Production code never calls this; a real invalidation goes through
 * `refresh()`, which also re-reads the endpoint.
 */
export function resetSessionCache(): void {
  cached = null;
  inFlight = null;
}

interface SessionProviderProps {
  children: ReactNode;
  /**
   * Pre-resolved session. When the caller already knows whether the
   * user is signed in (a server component that read the session, or a
   * page that resolved it itself), pass it here to skip the probe
   * entirely. `null` means "not known yet" → probe.
   */
  initial?: SessionPayload | null;
  /**
   * When `false`, the provider never probes. Used by surfaces that
   * are explicitly public (the splash / landing pages) where the probe
   * would be wasted work.
   */
  enabled?: boolean;
}

export function SessionProvider({ children, initial = null, enabled = true }: SessionProviderProps) {
  const [payload, setPayload] = useState<SessionPayload | null>(initial);
  const mountedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    // A refresh is an EXPLICIT invalidation (sign-in, sign-out, a profile
    // edit that changes the scope) — it must bypass the short-lived
    // cache and hit the endpoint.
    cached = null;
    const next = await loadSession();
    if (mountedRef.current) setPayload(next);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    // An `initial` payload short-circuits the probe — the caller already
    // paid for the session read on the server.
    if (initial) {
      setPayload(initial);
      return () => {
        mountedRef.current = false;
      };
    }
    // A recently settled payload is reused: this provider may be mounting
    // as part of a client-side navigation from another route's layout,
    // and the answer cannot have changed in between.
    const cachedPayload = freshCache();
    if (cachedPayload) {
      setPayload(cachedPayload);
      return () => {
        mountedRef.current = false;
      };
    }
    void refresh();
    return () => {
      mountedRef.current = false;
    };
    // `initial` is intentionally not a dependency: it is a mount-time
    // hint. Re-probing when it changes would defeat the whole point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      payload,
      authenticated: payload ? payload.authenticated : null,
      session: payload?.session ?? null,
      refresh,
    }),
    [payload, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Read the shared session. Safe to call outside a provider — it returns
 * a benign "unknown" value rather than throwing, so a component can be
 * rendered standalone (e.g. in a unit test or a storybook harness)
 * without being wrapped.
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  const fallback = useMemo<SessionContextValue>(
    () => ({
      payload: null,
      authenticated: null,
      session: null,
      refresh: async () => {},
    }),
    [],
  );
  return ctx ?? fallback;
}
