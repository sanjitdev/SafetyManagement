/**
 * Dispatcher map view (/dispatcher/map).
 *
 * DISP-007 (Intent 003, Unit 005): the dispatcher's read-only
 * map surface. A MapLibre canvas centered on the dispatcher's
 * city, showing every in-scope ticket as a circle pin colored
 * by status. Clicking a pin opens a side panel with the ticket
 * summary + a "View ticket" link to
 * `/dispatcher/tickets/[id]`.
 *
 * Layout (3-region desktop work surface, 1440x900):
 *   - Top bar: brand + ward · department badge, dedup pill,
 *     map pill (active here), language toggle, theme toggle.
 *   - Left rail: status filter (All / Submitted / Routed /
 *     In progress) + pin color legend + last-fetched timestamp.
 *   - Center: DispatcherMap (fill-parent).
 *   - Right side panel: opens when a pin is clicked;
 *     absolutely-positioned over the map's right edge.
 *
 * 30 s polling on the pin set, matching the queue cadence.
 *
 * Out of scope (v1): heatmap, time-slider, real-time updates.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import type { MapPin, MapStatus } from '@/components/DispatcherMap';
import { MAP_STATUS_COLORS } from '@/lib/ui/map-colors';
import { useSession } from '@/components/SessionProvider';

// MapLibre is browser-only; load the page's map component on
// the client only. The page's own state (auth gate, filters,
// side panel) renders server-side; the map is the
// dynamic-imported piece.
const DispatcherMap = dynamic(() => import('@/components/DispatcherMap'), {
  ssr: false,
  loading: () => <MapSkeleton />,
});

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;

// Center the map on DHAKA_CENTER; the citizen-side map and the
// dispatcher map both anchor here. (The Dhaka District polygon
// is small enough that this zoom shows all in-scope pins.)
const DHAKA_CENTER = { lat: 23.789, lng: 90.4075 };

type MapFilter = 'all' | MapStatus;

interface QueueDedupBadgeResponse {
  flags?: Array<unknown>;
}

interface PinsResponse {
  pins?: MapPin[];
}

export default function DispatcherMapPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated } = useSession();
  const [pins, setPins] = useState<MapPin[]>([]);
  const [filter, setFilter] = useState<MapFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [dedupPendingCount, setDedupPendingCount] = useState<number>(0);
  const previousIdsRef = useRef<Set<string>>(new Set());

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

  const fetchPins = useCallback(async () => {
    try {
      const statusQs = filter === 'all' ? '' : `status=${filter}`;
      const url =
        '/api/v1/dispatcher/map/tickets' + (statusQs ? `?${statusQs}` : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        setError('dispatcher.map.error');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as PinsResponse;
      const items = data.pins ?? [];
      setPins(items);
      setLastFetchAt(new Date().toISOString());
      setError(null);
      setLoading(false);
      previousIdsRef.current = new Set(items.map((it) => it.id));
      // If the currently-selected pin is no longer in the set
      // (status changed), clear the side panel.
      if (selectedPinRef.current && !items.some((p) => p.id === selectedPinRef.current!.id)) {
        setSelectedPin(null);
      }
    } catch {
      setError('dispatcher.map.error');
      setLoading(false);
    }
  }, [filter]);

  // Mirror `selectedPin` in a ref so the polling callback can
  // read the latest value without re-binding the interval.
  const selectedPinRef = useRef(selectedPin);
  selectedPinRef.current = selectedPin;

  // Auth check — reads the shared session.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    setSignedIn(authenticated);
  }, [authenticated]);

  // Polling
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    void fetchPins();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchPins();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, fetchPins]);

  // Dedup-pending badge (mirrors the queue page).
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    let timer: number | null = null;
    async function fetchCount() {
      try {
        const res = await fetch('/api/v1/dispatcher/dedup-flags?limit=100', {
          credentials: 'include',
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as QueueDedupBadgeResponse;
        if (cancelled) return;
        setDedupPendingCount(data.flags?.length ?? 0);
      } catch {
        // silently fall back to 0
      }
    }
    void fetchCount();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchCount();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn]);

  const visiblePins = useMemo(() => {
    if (filter === 'all') return pins;
    return pins.filter((p) => p.status === filter);
  }, [pins, filter]);

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
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('dispatcher.queue.signin_required', null, lang)}
          </p>
          <Link
            href="/login"
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
      data-testid="dispatcher-map-page"
    >
      {/* Sub-header: scope tag + role nav. Brand, lang, theme,
          user menu are rendered by the global AppHeader (AppShell). */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-2) var(--space-5)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--space-3)',
        }}
      >
        <span
          className="dispatcher-brand-scope"
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink-secondary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          · Dispatcher · ward_14 · dept_streetlight
        </span>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            flexShrink: 0,
          }}
        >
          <Link
            href="/dispatcher"
            lang={lang}
            data-testid="dispatcher-queue-link"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-border)',
            }}
          >
            {t('dispatcher.queue.title', null, lang)}
          </Link>
          <Link
            href="/dispatcher/dedup"
            lang={lang}
            data-testid="dispatcher-dedup-link"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid var(--color-border)',
              background:
                dedupPendingCount > 0
                  ? 'var(--color-warning-soft)'
                  : 'transparent',
            }}
          >
            {t(
              'dispatcher.dedup.link',
              { n: dedupPendingCount },
              lang,
            )}
          </Link>
          <Link
            href="/dispatcher/map"
            lang={lang}
            data-testid="dispatcher-map-link"
            aria-current="page"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-on-primary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-primary)',
            }}
          >
            {t('dispatcher.map.cta', null, lang)}
          </Link>
        </div>
      </div>

      {/* Two-region content: filter rail + map */}
      <div
        className="dispatcher-grid"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '240px 1fr',
          minHeight: 0,
        }}
      >
        {/* Filter rail */}
        <aside
          style={{
            background: 'var(--color-surface-card)',
            borderRight: '1px solid var(--color-border)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            overflowY: 'auto',
          }}
        >
          <div>
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                margin: '0 0 var(--space-3)',
              }}
            >
              {t('dispatcher.queue.filter.heading', null, lang)}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {(
                [
                  ['all', 'dispatcher.queue.filter.all'],
                  ['submitted', 'dispatcher.queue.filter.submitted'],
                  ['routed', 'dispatcher.queue.filter.routed'],
                  ['in_progress', 'status.in_progress'],
                ] as Array<[MapFilter, string]>
              ).map(([f, key]) => (
                <FilterRow
                  key={f}
                  active={filter === f}
                  onClick={() => setFilter(f)}
                  lang={lang}
                  testId={`dispatcher-map-filter-${f}`}
                >
                  {t(key, null, lang)}
                </FilterRow>
              ))}
            </div>
          </div>

          <div>
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                margin: '0 0 var(--space-3)',
              }}
            >
              {t('dispatcher.map.legend.title', null, lang)}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <LegendRow color={MAP_STATUS_COLORS.submitted} label={t('dispatcher.map.legend.submitted', null, lang)} />
              <LegendRow color={MAP_STATUS_COLORS.routed} label={t('dispatcher.map.legend.routed', null, lang)} />
              <LegendRow color={MAP_STATUS_COLORS.in_progress} label={t('dispatcher.map.legend.in_progress', null, lang)} />
            </div>
          </div>

          <div
            style={{
              marginTop: 'auto',
              paddingTop: 'var(--space-5)',
              borderTop: '1px solid var(--color-border)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-tertiary)',
            }}
          >
            {lastFetchAt && (
              <span lang={lang}>
                {lang === 'bn' ? 'সর্বশেষ:' : 'Last:'} {formatAge(lastFetchAt, lang)}
              </span>
            )}
          </div>
        </aside>

        {/* Map canvas + side panel */}
        <main
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            padding: 'var(--space-4)',
            gap: 'var(--space-3)',
          }}
        >
          <div>
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-h1)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-1)',
              }}
            >
              {t('dispatcher.map.title', null, lang)}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink-secondary)',
                margin: 0,
              }}
            >
              {t('dispatcher.map.subtitle', null, lang)}
            </p>
          </div>

          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: 480,
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface-card)',
            }}
          >
            {error ? (
              <p
                lang={lang}
                role="alert"
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-danger)',
                  padding: 'var(--space-4)',
                  textAlign: 'center',
                }}
              >
                {t('dispatcher.map.error', null, lang)}
              </p>
            ) : loading ? (
              <MapSkeleton />
            ) : visiblePins.length === 0 ? (
              <MapEmpty lang={lang} />
            ) : (
              <DispatcherMap
                pins={visiblePins}
                center={DHAKA_CENTER}
                onPinClick={(pin) => setSelectedPin(pin)}
                selectedPinId={selectedPin?.id ?? null}
              />
            )}

            {selectedPin && !error && (
              <SidePanel
                pin={selectedPin}
                lang={lang}
                onClose={() => setSelectedPin(null)}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function FilterRow({
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
        padding: 'var(--space-2) var(--space-3)',
        background: active ? 'var(--color-primary)' : 'transparent',
        color: active ? 'var(--color-on-primary)' : 'var(--color-ink)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        fontSize: 'var(--text-body-sm)',
        fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-regular)',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      {children}
    </button>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        fontSize: 'var(--text-body-sm)',
        color: 'var(--color-ink)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: color,
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px var(--color-border)',
          flexShrink: 0,
        }}
      />
      {label}
    </div>
  );
}

function SidePanel({
  pin,
  lang,
  onClose,
}: {
  pin: MapPin;
  lang: Language;
  onClose: () => void;
}) {
  return (
    <aside
      data-testid="dispatcher-map-side-panel"
      lang={lang}
      style={{
        position: 'absolute',
        top: 'var(--space-3)',
        right: 'var(--space-3)',
        width: 320,
        maxHeight: 'calc(100% - var(--space-5))',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-popover)',
        padding: 'var(--space-4)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        overflowY: 'auto',
        zIndex: 5,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--text-body-lg)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink)',
            margin: 0,
          }}
        >
          {t('dispatcher.map.side.title', null, lang)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close side panel"
          data-testid="dispatcher-map-side-close"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-ink-secondary)',
            fontSize: 18,
            lineHeight: 1,
            padding: 'var(--space-1)',
          }}
        >
          ×
        </button>
      </div>

      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          rowGap: 'var(--space-2)',
          columnGap: 'var(--space-3)',
          fontSize: 'var(--text-body-sm)',
        }}
      >
        <dt
          style={{
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {t('dispatcher.detail.field.category', null, lang)}
        </dt>
        <dd
          style={{
            margin: 0,
            color: 'var(--color-ink)',
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {pin.categoryNameBn || pin.categoryName || pin.categoryId}
        </dd>

        <dt
          style={{
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {t('dispatcher.detail.field.ward', null, lang)}
        </dt>
        <dd
          style={{
            margin: 0,
            color: 'var(--color-ink)',
          }}
        >
          {pin.wardNameBn || pin.wardName || pin.wardId}
        </dd>

        <dt
          style={{
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {t('status.heading', null, lang)}
        </dt>
        <dd
          style={{
            margin: 0,
          }}
        >
          <StatusPill status={pin.status} lang={lang} />
        </dd>

        <dt
          style={{
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {t('dispatcher.detail.field.created', null, lang)}
        </dt>
        <dd
          style={{
            margin: 0,
            color: 'var(--color-ink)',
          }}
        >
          {formatAge(pin.createdAt, lang)}
        </dd>

        <dt
          style={{
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {t('dispatcher.detail.field.location', null, lang)}
        </dt>
        <dd
          style={{
            margin: 0,
            color: 'var(--color-ink-secondary)',
            fontSize: 12,
          }}
        >
          {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
        </dd>
      </dl>

      <Link
        href={`/dispatcher/tickets/${pin.id}`}
        data-testid="dispatcher-map-side-view"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-3) var(--space-4)',
          background: 'var(--color-primary)',
          color: 'var(--color-on-primary)',
          borderRadius: 'var(--radius-md)',
          textDecoration: 'none',
          fontWeight: 'var(--weight-semibold)',
          fontSize: 'var(--text-body-sm)',
        }}
      >
        {t('dispatcher.map.side.view', null, lang)} →
      </Link>
    </aside>
  );
}

function StatusPill({ status, lang }: { status: MapStatus; lang: Language }) {
  // `*-soft` background + saturated `*-status` foreground — see the
  // dispatcher queue's StatusPill for why the saturated token must
  // not be used as the background.
  const map: Record<MapStatus, { bg: string; fg: string; label: string }> = {
    submitted: {
      bg: 'var(--color-status-submitted-soft)',
      fg: 'var(--color-status-submitted)',
      label: 'status.submitted',
    },
    routed: {
      bg: 'var(--color-status-routed-soft)',
      fg: 'var(--color-status-routed)',
      label: 'status.routed',
    },
    in_progress: {
      bg: 'var(--color-status-in-progress-soft)',
      fg: 'var(--color-status-in-progress)',
      label: 'status.in_progress',
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
        display: 'inline-block',
      }}
    >
      {t(c.label, null, lang)}
    </span>
  );
}

function MapSkeleton() {
  return (
    <div
      data-testid="dispatcher-map-skeleton"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--color-surface-raised)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-ink-tertiary)',
        fontSize: 'var(--text-body-sm)',
      }}
    >
      <span>…</span>
    </div>
  );
}

function MapEmpty({ lang }: { lang: Language }) {
  return (
    <div
      lang={lang}
      data-testid="dispatcher-map-empty"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        padding: 'var(--space-7)',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontSize: 'var(--text-h3)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          margin: 0,
        }}
      >
        {t('dispatcher.map.empty', null, lang)}
      </p>
    </div>
  );
}

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) {
    return lang === 'bn' ? 'এইমাত্র' : 'just now';
  }
  if (minutes < 60) {
    return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}
