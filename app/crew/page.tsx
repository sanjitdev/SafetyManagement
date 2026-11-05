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
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import {
  formatCachedAge,
  readAssignmentsCache,
  writeAssignmentsCache,
  writeTicketCache,
  type ReadResult,
} from '@/lib/crew/cache';
import type { SerializedTicket } from '@/lib/serializers/ticket';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';

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
  /** The ward's display name ("Ward 14 — Mirpur"), when known. */
  wardName?: string | null;
  wardNameBn?: string | null;
  categoryId: string;
  /** The category's slug ("streetlight") — drives the icon. */
  categorySlug?: string | null;
  /** The category's display name, when known. */
  categoryName?: string | null;
  categoryNameBn?: string | null;
  locationLat: number;
  locationLng: number;
  note: string | null;
  reporterId: string;
  /** The citizen's display name, when known. */
  reporterName?: string | null;
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

/**
 * The card's headline: the ward's display name + the
 * category's display name. Falls back to the raw ids when the
 * join is absent (a city with no ward/category row).
 */
function ticketLabel(ticket: CrewTicket, lang: Language): string {
  const ward = lang === 'bn' ? ticket.wardNameBn : ticket.wardName;
  const category = lang === 'bn' ? ticket.categoryNameBn : ticket.categoryName;
  return `${ward ?? ticket.wardId} · ${category ?? ticket.categoryId}`;
}

/**
 * The scope tag in the sub-header: the crew's ward and
 * department. The scope bar used to be a hardcoded
 * "· Crew · ward_14 · dept_streetlight" string — the raw ids
 * were the only thing the page had. It now reads the session's
 * display names from `/api/auth/status`.
 */
function scopeLabel(
  lang: Language,
  scope: {
    wardName?: string | null;
    wardNameBn?: string | null;
    departmentName?: string | null;
    departmentNameBn?: string | null;
  } | null,
): string {
  const parts: string[] = [t('crew.list.scope', null, lang)];
  const ward = lang === 'bn' ? scope?.wardNameBn : scope?.wardName;
  if (ward) {
    // The ward's display name already carries its own prefix
    // ("Ward 14 — Mirpur" / "ওয়ার্ড ১৪ — মিরপুর"), so wrapping it in
    // the "Ward {ward}" template would render
    // "ওয়ার্ড ওয়ার্ড ১৪ — মিরপুর". Only bare-number wards get the
    // template.
    parts.push(
      /^\s*(ward|ওয়ার্ড)\b/i.test(ward)
        ? ward
        : t('crew.list.scope.ward', { ward }, lang),
    );
  }
  const dept = lang === 'bn' ? scope?.departmentNameBn : scope?.departmentName;
  if (dept) {
    parts.push(t('crew.list.scope.department', { dept }, lang));
  }
  return parts.join(' · ');
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
  // The session's scope labels (ward + department display
  // names) for the scope bar under the header. Null while the
  // auth check is still in flight.
  const [scope, setScope] = useState<{
    wardId?: string | null;
    wardName?: string | null;
    wardNameBn?: string | null;
    departmentId?: string | null;
    departmentName?: string | null;
    departmentNameBn?: string | null;
  } | null>(null);
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
    function syncLang() {
      try {
        const stored = window.localStorage.getItem(LANG_KEY);
        if (stored === 'en' || stored === 'bn') setLang(stored);
      } catch {
        // ignore
      }
    }
    syncLang();
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    const id = window.setInterval(syncLang, 1000);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
      window.clearInterval(id);
    };
  }, []);

  // Fetch the session's userId on mount so the
  // cache keys are scoped correctly. (The page
  // also has a signedIn check; userId is
  // available only after the auth check lands.)
  //
  // The same response carries the session's scope labels
  // (ward / department display names) for the scope bar
  // under the header.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/status', { credentials: 'include' });
        if (cancelled) return;
        const data = (await res.json()) as {
          authenticated: boolean;
          userId?: string;
          session?: {
            wardId?: string | null;
            wardName?: string | null;
            wardNameBn?: string | null;
            departmentId?: string | null;
            departmentName?: string | null;
            departmentNameBn?: string | null;
          };
        };
        if (data.authenticated && data.userId) setUserId(data.userId);
        if (data.session) setScope(data.session);
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
        wardName: t.wardName,
        wardNameBn: t.wardNameBn,
        categoryId: t.categoryId,
        categorySlug: t.categorySlug,
        categoryName: t.categoryName,
        categoryNameBn: t.categoryNameBn,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        note: t.note,
        reporterId: t.reporterId,
        reporterName: t.reporterName,
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
          wardName?: string | null;
          wardNameBn?: string | null;
          categoryId: string;
          categorySlug?: string | null;
          categoryName?: string | null;
          categoryNameBn?: string | null;
          locationLat: number;
          locationLng: number;
          note: string | null;
          photoUrls: string[];
          reporterId: string;
          reporterName?: string | null;
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
        wardName: t.wardName,
        wardNameBn: t.wardNameBn,
        categoryId: t.categoryId,
        categorySlug: t.categorySlug,
        categoryName: t.categoryName,
        categoryNameBn: t.categoryNameBn,
        locationLat: t.locationLat,
        locationLng: t.locationLng,
        note: t.note,
        reporterId: t.reporterId,
        reporterName: t.reporterName,
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
          minHeight: '100%',
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
        minHeight: '100%',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="crew-list-page"
    >
      {/* Sub-header: scope tag. Brand, lang, theme, and user
          menu are rendered by the global AppHeader (AppShell). */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: 'var(--space-1) var(--space-4)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--space-2)',
        }}
      >
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
          {scopeLabel(lang, scope)}
        </span>
      </div>

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
        className="crew-list-items"
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
  /*
   * The assignment thumbnail. The crew needs to recognise the job
   * site at a glance — the citizen's photo is the strongest signal.
   * The stored URL can be an inline `data:image/…` URL (the default),
   * an absolute `https://` URL, or a root-relative `/api/blob/…`
   * path, so `firstRenderablePhotoUrl` picks the first one we can
   * actually render. Without a photo, the row falls back to the
   * category glyph.
   */
  const photoUrl = firstRenderablePhotoUrl(ticket.photoUrls);
  const thumbBackground = thumbnailBackground(photoUrl);
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
      {thumbBackground ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          aria-hidden
          loading="lazy"
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            background: 'var(--color-surface-raised)',
          }}
        />
      ) : (
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
          }}
        >
          <CategoryIcon slug={ticket.categorySlug} size={20} />
        </span>
      )}
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
            {ticketLabel(ticket, lang)}
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
  // `*-soft` background + saturated `*-status` foreground — see the
  // dispatcher queue's StatusPill for why the saturated token must
  // not be used as the background.
  const map: Record<TicketStatus, { bg: string; fg: string; label: string }> = {
    submitted: {
      bg: 'var(--color-status-submitted-soft, #EDF2F7)',
      fg: 'var(--color-status-submitted, #718096)',
      label: 'status.submitted',
    },
    routed: {
      bg: 'var(--color-status-routed-soft, #E6F2EE)',
      fg: 'var(--color-status-routed, #2C5282)',
      label: 'status.routed',
    },
    in_progress: {
      bg: 'var(--color-status-in-progress-soft, #FFFAF0)',
      fg: 'var(--color-status-in-progress, #B7791F)',
      label: 'status.in_progress',
    },
    resolved: {
      bg: 'var(--color-status-resolved-soft, #F0F8F4)',
      fg: 'var(--color-status-resolved, #2F7A4F)',
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
