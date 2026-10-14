/**
 * Dispatcher triage queue (/dispatcher).
 *
 * DISP-002 (Intent 003, Unit 002): the dispatcher's primary
 * surface. Lists tickets in (submitted, routed) status, scoped
 * to the dispatcher's session (cityId, wardId, departmentId),
 * sorted oldest-first. Polls every 30 s.
 *
 * Layout (3-region desktop work surface, per WO-002 mockup
 * 05 daily-queue-dashboard):
 *   - Top bar: brand + dispatcher's ward · department badge,
 *     language toggle, theme toggle, logout.
 *   - Filter rail: status filter (All / Submitted / Routed),
 *     poll-state indicator, "Possible duplicates" link to
 *     /dispatcher/dedup (N=0 placeholder in v1; Unit 004
 *     wires the count).
 *   - Queue list: rows sorted oldest-first. Each row has
 *     category icon, ward, age, status pill, reporter id
 *     (real, not anonymised — the dispatcher needs it),
 *     "View ticket" link.
 *
 * Auth gate: the page redirects to /login if no session is
 * resolved. The API also enforces the same gate.
 *
 * Out of scope (v1): WebSocket / SSE updates (the page polls).
 * Out of scope (v1.1): map view.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;

type TicketStatus = 'submitted' | 'routed' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';

interface QueueTicket {
  id: string;
  status: TicketStatus;
  cityId: string;
  wardId: string;
  categoryId: string;
  categoryName?: string;
  categoryNameBn?: string;
  wardName?: string;
  wardNameBn?: string;
  locationLat: number;
  locationLng: number;
  note: string | null;
  reporterId: string;
  photoUrls: string[];
  createdAt: string;
}

type QueueFilter = 'all' | 'submitted' | 'routed';

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

function categoryIcon(slug: string): string {
  // Tiny inline glyphs; no SVG sprite dependency.
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

export default function DispatcherPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastPollAt, setLastPollAt] = useState<string | null>(null);
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
    // Listen for cross-component lang changes (the global AppHeader
    // writes the same key on toggle, but `storage` events only fire
    // for OTHER tabs/windows. So we also poll on focus + a small
    // interval, which catches same-tab updates cheaply).
    window.addEventListener('storage', syncLang);
    window.addEventListener('focus', syncLang);
    const id = window.setInterval(syncLang, 1000);
    return () => {
      window.removeEventListener('storage', syncLang);
      window.removeEventListener('focus', syncLang);
      window.clearInterval(id);
    };
  }, []);

  const fetchQueue = useCallback(async () => {
    try {
      const status =
        filter === 'all' ? undefined : filter;
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('limit', '50');
      const url =
        '/api/v1/dispatcher/queue' + (qs.toString() ? `?${qs.toString()}` : '');
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) {
        setError('dispatcher.queue.error');
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
          internalNote: string | null;
          assignedCrewId: string | null;
          trail: Array<{
            toStatus: TicketStatus;
            actorLabel: string;
            note: string | null;
            timestamp: string;
          }>;
        }>;
      };
      const items: QueueTicket[] = data.tickets.map((t) => ({
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
        // Category and ward labels are looked up client-side via the
        // known seed map; full bootstrap comes in a future bolt.
      }));
      setTickets(items);
      setLastPollAt(new Date().toISOString());
      setError(null);
      setLoading(false);
      previousIdsRef.current = new Set(items.map((it) => it.id));
    } catch {
      setError('dispatcher.queue.error');
      setLoading(false);
    }
  }, [filter]);

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
    void fetchQueue();
    timer = window.setInterval(() => {
      if (!cancelled) void fetchQueue();
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [signedIn, fetchQueue]);

  // Unit 004: dedup-pending badge. Polls /api/v1/dispatcher/dedup-flags
  // (the list endpoint scoped to the dispatcher) and reads the
  // length of `flags` as the pending count. The list endpoint
  // is the source of truth — we don't expose a separate count
  // endpoint to keep the API surface small.
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
        const data = (await res.json()) as { flags?: Array<unknown> };
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

  const filteredTickets = useMemo(() => {
    if (filter === 'all') return tickets;
    return tickets.filter((t) => t.status === filter);
  }, [tickets, filter]);

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
            href={`/login?next=${encodeURIComponent('/dispatcher')}`}
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
      data-testid="dispatcher-queue-page"
    >
      {/* Sub-header: scope tag + role-specific nav. Brand, lang,
          theme, and user menu are rendered by the global AppHeader
          (AppShell) so we don't duplicate them here. */}
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
                  ? 'var(--color-warning-soft, #fdf2cf)'
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
            {t('dispatcher.map.cta', null, lang)}
          </Link>
        </div>
      </div>

      {/* Two-region content: filter rail + queue list */}
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
              Status
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
              {(
                [
                  ['all', 'dispatcher.queue.filter.all'],
                  ['submitted', 'dispatcher.queue.filter.submitted'],
                  ['routed', 'dispatcher.queue.filter.routed'],
                ] as Array<[QueueFilter, string]>
              ).map(([f, key]) => (
                <FilterRow
                  key={f}
                  active={filter === f}
                  onClick={() => setFilter(f)}
                  lang={lang}
                  testId={`dispatcher-filter-${f}`}
                >
                  {t(key, null, lang)}
                </FilterRow>
              ))}
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
            {lastPollAt && (
              <span lang={lang}>
                {lang === 'bn' ? 'সর্বশেষ:' : 'Last:'} {formatAge(lastPollAt, lang)}
              </span>
            )}
          </div>
        </aside>

        {/* Queue list */}
        <main
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 'var(--space-4) var(--space-5)',
              borderBottom: '1px solid var(--color-border)',
              flexShrink: 0,
            }}
          >
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-h1)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-1)',
              }}
            >
              {t('dispatcher.queue.title', null, lang)}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink-secondary)',
                margin: 0,
              }}
            >
              {t('dispatcher.queue.subtitle', null, lang)}
            </p>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-4) var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {loading ? (
              <QueueSkeleton />
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
                {t('dispatcher.queue.error', null, lang)}
              </p>
            ) : filteredTickets.length === 0 ? (
              <EmptyState lang={lang} />
            ) : (
              filteredTickets.map((t) => (
                <QueueRow key={t.id} ticket={t} lang={lang} />
              ))
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

function QueueRow({ ticket, lang }: { ticket: QueueTicket; lang: Language }) {
  return (
    <Link
      href={`/dispatcher/tickets/${ticket.id}`}
      data-testid="dispatcher-queue-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 'var(--space-4)',
        alignItems: 'center',
        padding: 'var(--space-3) var(--space-4)',
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
          <span lang={lang} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ticket.wardId} · {ticket.categoryId}
          </span>
          <StatusPill status={ticket.status} lang={lang} />
        </div>
        <div
          lang={lang}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {formatAge(ticket.createdAt, lang)} · reporter:{' '}
          <code style={{ fontSize: 11 }}>{ticket.reporterId}</code>
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
        {t('dispatcher.queue.row.view', null, lang)} →
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
        {t('dispatcher.queue.empty.title', null, lang)}
      </p>
      <p
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink-secondary)',
          margin: 0,
          maxWidth: 360,
        }}
      >
        {t('dispatcher.queue.empty.subtitle', null, lang)}
      </p>
    </div>
  );
}

function QueueSkeleton() {
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
