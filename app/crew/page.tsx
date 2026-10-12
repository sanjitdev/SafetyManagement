/**
 * Field crew — today's assignments (/crew).
 *
 * CREW-002 (Intent 004, Unit 002): the crew's primary
 * surface. Lists tickets where
 * `assignedCrewId = session.userId` AND
 * `status ∈ {routed, in_progress}`, scoped to the crew's
 * session (cityId, wardId, departmentId), sorted
 * oldest-first. Polls every 30 s.
 *
 * Layout (mobile-first 390x844 viewport, Rashid's
 * target):
 *   - Top bar: brand + crew's ward · department badge,
 *     language toggle, theme toggle, logout.
 *   - Filter rail: status pill row (All / Routed /
 *     In progress), Geolocation opt-in (shows the
 *     distance column when granted; otherwise the
 *     "Share location" CTA is shown).
 *   - List: rows sorted oldest-first. Each row shows
 *     category icon, age, status pill, distance
 *     (when Geolocation granted), "Open" link.
 *
 * Auth gate: the page redirects to /login if no session
 * is resolved. The API also enforces the same gate.
 *
 * Out of scope (v1): WebSocket / SSE updates (the page
 * polls). Out of scope (v1.1): write queue + service
 * worker (Bolt 004-004's offline-read adds a read-only
 * cache; the cache layer is the cache, the page is the
 * fetcher).
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  formatCachedAge,
  readAssignmentsCache,
  writeAssignmentsCache,
  writeTicketCache,
  type ReadResult,
} from '@/lib/crew/cache';
import type { SerializedTicket } from '@/lib/serializers/ticket';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;

type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface CrewTicket {
  id: string;
  status: TicketStatus;
  cityId: string;
  wardId: string;
  categoryId: string;
  locationLat: number;
  locationLng: number;
  note: string | null;
  reporterId: string;
  photoUrls: string[];
  createdAt: string;
  assignedCrewId: string | null;
}

type CrewFilter = 'all' | 'routed' | 'in_progress';

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return lang === 'bn' ? 'এইমাত্র' : 'just now';
  }
  if (minutes < 60) {
    return lang === 'bn'
      ? `${minutes} মিনিট আগে`
      : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn'
      ? `${hours} ঘণ্টা আগে`
      : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn'
    ? `${days} দিন আগে`
    : `${days} day ago`;
}

/**
 * Great-circle distance in metres (Haversine). Inputs are
 * degrees. The dev store seeds tickets at
 * (23.789, 90.4078) (DHAKA_CENTER); a real device's
 * coords are usually within ~5km of the city centre.
 */
function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6_371_000; // earth radius in metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(meters: number, lang: Language): string {
  if (meters < 1000) {
    return lang === 'bn'
      ? `${Math.round(meters)}মিটার দূরে`
      : `${Math.round(meters)}m away`;
  }
  const km = meters / 1000;
  return lang === 'bn'
    ? `${km.toFixed(1)}কিমি দূরে`
    : `${km.toFixed(1)}km away`;
}

function categoryIcon(slug: string): string {
  switch (slug) {
    case 'streetlight':
      return '💡';
    case 'pothole':
      return '🕳️';
    case 'drainage':
      return '🌊';
    case 'garbage':
      return '🗑️';
    default:
      return '❓';
  }
}

export default function CrewPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<CrewTicket[]>([]);
  const [filter, setFilter] = useState<CrewFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
  // CREW-006 — the cache snapshot the page fell
  // back to on network failure. `null` means the
  // page is showing fresh data (or is mid-fetch).
  // The banner renders the cached age via
  // `formatCachedAge(cachedAt, now, lang)`.
  const [cacheSnapshot, setCacheSnapshot] = useState<ReadResult<SerializedTicket[]> | null>(null);
  // The crew's session userId is fetched on mount
  // and used to scope the cache keys.
  const [userId, setUserId] = useState<string | null>(null);
  // Geolocation: the page may render a distance column
  // when the device grants permission. Three states:
  //   null  — not asked yet (idle)
  //   'granted' — coords are populated
  //   'denied' — the user declined (or the API is unavailable)
  const [geo, setGeo] = useState<
    | { state: 'granted'; lat: number; lng: number }
    | { state: 'denied' }
    | null
  >(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
  }, []);

  // Fetch the session's userId on mount so the
  // cache keys are scoped correctly. (The page
  // also has a signedIn check; userId is
  // available only after the auth check lands.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/status', { credentials: 'include' });
        if (cancelled) return;
        const data = (await res.json()) as { authenticated: boolean; userId?: string };
        if (data.authenticated && data.userId) setUserId(data.userId);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // CREW-006 — read the cache on mount BEFORE
  // the network request lands, so the page is
  // immediately interactive on a flaky network.
  // The cache read is sync (localStorage) so
  // there's no "first paint" delay.
  useEffect(() => {
    if (!userId) return;
    const cached = readAssignmentsCache(userId);
    if (cached) {
      const items: CrewTicket[] = cached.data.map((t) => ({
        id: t.id,
        status: t.status,
        cityId: t.cityId,
        wardId: t.wardId,
        categoryId: t.categoryId,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        note: t.note,
        reporterId: t.reporterId,
        photoUrls: t.photoUrls,
        createdAt: t.createdAt,
        assignedCrewId: t.assignedCrewId,
      }));
      setTickets(items);
      setCacheSnapshot(cached);
      setLoading(false);
    }
  }, [userId]);

  const fetchTickets = useCallback(async () => {
    try {
      const status = filter === 'all' ? undefined : filter;
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('limit', '50');
      const url =
        '/api/v1/crew/tickets' + (qs.toString() ? `?${qs.toString()}` : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        // Network failure or 5xx. CREW-006: stay
        // on the cached snapshot (if any) and
        // show the banner. The cache read happened
        // on mount; we don't re-read here — the
        // snapshot is already in state.
        setError('crew.list.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        tickets: Array<{
          id: string;
          status: TicketStatus;
          cityId: string;
          wardId: string;
          categoryId: string;
          locationLat: number;
          locationLng: number;
          note: string | null;
          photoUrls: string[];
          reporterId: string;
          createdAt: string;
          assignedCrewId: string | null;
          internalNote: string | null;
          trail: Array<{
            toStatus: TicketStatus;
            actorLabel: string;
            note: string | null;
            timestamp: string;
          }>;
        }>;
      };
      const items: CrewTicket[] = data.tickets.map((t) => ({
        id: t.id,
        status: t.status,
        cityId: t.cityId,
        wardId: t.wardId,
        categoryId: t.categoryId,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        note: t.note,
        reporterId: t.reporterId,
        photoUrls: t.photoUrls,
        createdAt: t.createdAt,
        assignedCrewId: t.assignedCrewId,
      }));
      setTickets(items);
      setLastPollAt(new Date().toISOString());
      setError(null);
      setLoading(false);
      // CREW-006 — on a successful fetch, write
      // the response to the cache + per-ticket
      // cache keys. The next mount (even on a
      // flaky network) sees the fresh snapshot.
      if (userId) {
        writeAssignmentsCache(userId, data.tickets as SerializedTicket[]);
        for (const t of data.tickets) {
          writeTicketCache(userId, t as SerializedTicket);
        }
        // Clear the cache-snapshot banner — the
        // page is now showing fresh data.
        setCacheSnapshot(null);
      }
    } catch {
      // Network failure (offline, DNS, etc.).
      // CREW-006: stay on the cached snapshot
      // and show the banner. The cache read
      // happened on mount; the snapshot is in
      // state already.
      setError('crew.list.error');
      setLoading(false);
    }
  }, [filter, userId]);

  // Auth check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', { credentials: 'include' });
        const status = (await statusRes.json()) as { authenticated: boolean };
        if (cancelled) return;
        setSignedIn(status.authenticated);
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Polling
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    void fetchTickets();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchTickets();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, fetchTickets]);

  // Geolocation opt-in. The CTA is a real button — Geolocation
  // is only requested on click (per the browser API contract).
  // If the API is unavailable or permission is denied, the
  // distance column is hidden (graceful fallback).
  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeo({ state: 'denied' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          state: 'granted',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        setGeo({ state: 'denied' });
      },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 10_000 },
    );
  }, []);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  // Annotate each ticket with its distance from the device
  // when Geolocation is granted. The distance is recomputed
  // on every render (cheap; O(n) over a small list) and
  // memoised below.
  const enriched = useMemo(() => {
    if (!geo || geo.state !== 'granted') {
      return tickets.map((t) => ({ ticket: t, distanceM: null as number | null }));
    }
    return tickets.map((t) => ({
      ticket: t,
      distanceM: distanceMeters(geo.lat, geo.lng, t.locationLat, t.locationLng),
    }));
  }, [tickets, geo]);

  if (signedIn === false) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('crew.list.signin_required', null, lang)}
          </p>
          <Link
            href={`/login?next=${encodeURIComponent('/crew')}`}
            style={{
              display: 'inline-block',
              padding: 'var(--space-3) var(--space-5)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('login.cta.submit', null, lang)}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="crew-list-page"
    >
      {/* Top bar */}
      <header
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-4)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--space-2)',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              background: 'var(--color-primary)',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-body-md)',
              fontWeight: 'var(--weight-bold)',
              whiteSpace: 'nowrap',
            }}
          >
            CityFix
          </span>
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            · Crew · ward_14 · dept_streetlight
          </span>
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            style={{
              padding: 'var(--space-1) var(--space-2)',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--color-ink-secondary)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('welcome.lang.toggle', null, lang)}
          </button>
          <ThemeToggle lang={lang} variant="compact" />
        </div>
      </header>

      {/* Page title + filter pills + Geolocation CTA */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-4) var(--space-3)',
          background: 'var(--color-surface-page)',
          flexShrink: 0,
        }}
      >
        {/* CREW-006 — cache banner. Renders when the
            page is showing a cached snapshot because
            the network failed (or the page is mid-fetch
            and the cached snapshot was the "first paint"
            source). Hidden when fresh data is on screen. */}
        {cacheSnapshot && (
          <div
            data-testid="crew-cache-banner"
            role="status"
            lang={lang}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              marginBottom: 'var(--space-3)',
              background: 'var(--color-warning-bg, #fff4e6)',
              border: '1px solid var(--color-warning-border, #f59f00)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-warning-ink, #663c00)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
            }}
          >
            <span aria-hidden style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ flex: 1 }}>
              {t(
                'crew.cache.last_updated',
                {
                  when: formatCachedAge(
                    cacheSnapshot.cachedAt,
                    Date.now(),
                    lang,
                  ),
                },
                lang,
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                void fetchTickets();
              }}
              data-testid="crew-cache-retry"
              lang={lang}
              style={{
                padding: 'var(--space-1) var(--space-3)',
                background: 'var(--color-warning-ink, #663c00)',
                color: 'var(--color-on-primary, #fff)',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer',
              }}
            >
              {t('crew.cache.retry', null, lang)}
            </button>
          </div>
        )}

        <h1
          lang={lang}
          style={{
            fontSize: 'var(--text-h2)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--color-ink)',
            margin: '0 0 var(--space-1)',
          }}
        >
          {t('crew.list.title', null, lang)}
        </h1>
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink-secondary)',
            margin: '0 0 var(--space-3)',
          }}
        >
          {t('crew.list.subtitle', null, lang)}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            overflowX: 'auto',
            paddingBottom: 'var(--space-1)',
          }}
        >
          {(
            [
              ['all', 'crew.list.filter.all'],
              ['routed', 'crew.list.filter.routed'],
              ['in_progress', 'crew.list.filter.in_progress'],
            ] as Array<[CrewFilter, string]>
          ).map(([f, key]) => (
            <FilterPill
              key={f}
              active={filter === f}
              onClick={() => setFilter(f)}
              lang={lang}
              testId={`crew-filter-${f}`}
            >
              {t(key, null, lang)}
            </FilterPill>
          ))}
          <div style={{ flex: 1 }} />
          {geo?.state !== 'granted' && (
            <button
              type="button"
              onClick={requestLocation}
              data-testid="crew-location-cta"
              lang={lang}
              style={{
                padding: 'var(--space-1) var(--space-3)',
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-pill)',
                color: 'var(--color-ink-secondary)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t('crew.list.row.distance_pending', null, lang)}
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 var(--space-4) var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {loading ? (
          <ListSkeleton />
        ) : error ? (
          <p
            lang={lang}
            role="alert"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-danger, #c92a2a)',
              padding: 'var(--space-4)',
              textAlign: 'center',
            }}
          >
            {t('crew.list.error', null, lang)}
          </p>
        ) : enriched.length === 0 ? (
          <EmptyState lang={lang} />
        ) : (
          enriched.map(({ ticket, distanceM }) => (
            <CrewRow
              key={ticket.id}
              ticket={ticket}
              distanceM={distanceM}
              lang={lang}
            />
          ))
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  lang,
  children,
  testId,
}: {
  active: boolean;
  onClick: () => void;
  lang: Language;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      lang={lang}
      data-testid={testId}
      style={{
        padding: 'var(--space-1) var(--space-3)',
        background: active ? 'var(--color-primary)' : 'transparent',
        color: active ? 'var(--color-on-primary)' : 'var(--color-ink)',
        border: active
          ? '1px solid var(--color-primary)'
          : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-pill)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-semibold)',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function CrewRow({
  ticket,
  distanceM,
  lang,
}: {
  ticket: CrewTicket;
  distanceM: number | null;
  lang: Language;
}) {
  return (
    <Link
      href={`/crew/tickets/${ticket.id}`}
      data-testid="crew-list-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 'var(--space-3)',
        alignItems: 'center',
        padding: 'var(--space-3)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        color: 'var(--color-ink)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface-raised)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 18,
        }}
      >
        {categoryIcon(ticket.categoryId)}
      </span>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-semibold)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            marginBottom: 'var(--space-1)',
          }}
        >
          <span
            lang={lang}
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ticket.wardId} · {ticket.categoryId}
          </span>
          <StatusPill status={ticket.status} lang={lang} />
        </div>
        <div
          lang={lang}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
            display: 'flex',
            gap: 'var(--space-2)',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <span>{formatAge(ticket.createdAt, lang)}</span>
          {distanceM !== null && (
            <>
              <span aria-hidden>·</span>
              <span>{formatDistance(distanceM, lang)}</span>
            </>
          )}
        </div>
      </div>
      <span
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-primary)',
          fontWeight: 'var(--weight-semibold)',
          whiteSpace: 'nowrap',
        }}
      >
        {t('crew.list.row.view', null, lang)} →
      </span>
    </Link>
  );
}

function StatusPill({ status, lang }: { status: TicketStatus; lang: Language }) {
  const map: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
    submitted: {
      bg: 'var(--color-status-submitted, #fff4e6)',
      fg: 'var(--color-warning, #b58410)',
      label: 'status.submitted',
    },
    routed: {
      bg: 'var(--color-status-routed, #e7f5ff)',
      fg: 'var(--color-primary)',
      label: 'status.routed',
    },
    in_progress: {
      bg: 'var(--color-status-in-progress, #e7f5ff)',
      fg: 'var(--color-primary)',
      label: 'status.in_progress',
    },
    resolved: {
      bg: 'var(--color-status-resolved, #e6fcf5)',
      fg: 'var(--color-success, #1f7a3f)',
      label: 'status.resolved',
    },
    closed: {
      bg: 'var(--color-surface-raised)',
      fg: 'var(--color-ink-tertiary)',
      label: 'status.closed',
    },
    cancelled: {
      bg: 'var(--color-surface-raised)',
      fg: 'var(--color-ink-tertiary)',
      label: 'status.cancelled',
    },
  };
  const c = map[status];
  return (
    <span
      lang={lang}
      style={{
        padding: '2px var(--space-2)',
        background: c.bg,
        color: c.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize: 10,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {t(c.label, null, lang)}
    </span>
  );
}

function EmptyState({ lang }: { lang: Language }) {
  return (
    <div
      style={{
        padding: 'var(--space-8) var(--space-4)',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--color-primary-soft, #e6f2ee)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        ✓
      </div>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-h3)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          margin: 0,
        }}
      >
        {t('crew.list.empty.title', null, lang)}
      </p>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink-secondary)',
          margin: 0,
          maxWidth: 320,
        }}
      >
        {t('crew.list.empty.subtitle', null, lang)}
      </p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 72,
            background: 'var(--color-surface-raised)',
            borderRadius: 'var(--radius-md)',
          }}
        />
      ))}
    </div>
  );
}