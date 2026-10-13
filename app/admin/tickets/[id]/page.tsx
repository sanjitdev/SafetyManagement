/**
 * /admin/tickets/[id] — the admin's Reports detail.
 *
 * Bolt admin-tickets (Intent 005, Unit 005). 2-column main +
 * 320px sidebar. The main column shows the full ticket record
 * (admin gets `internalNote`, `assignedCrewId`, real
 * `trail[].actorId`). The sidebar surfaces two inline actions:
 *
 *   1. Status transition — one button per edge in
 *      `lib/platform/transitions.ts:22-29`'s
 *      `ALLOWED_BY_FROM[currentStatus]`. POSTs to the SHARED
 *      `POST /api/tickets/:id/transition` route (the same one
 *      the dispatcher's detail page calls); on success, refetches
 *      the ticket and re-renders.
 *
 *   2. Crew reassign — a text input + button. Admin-only.
 *      POSTs `{ assignedCrewId }` (no `toStatus`) to the same
 *      shared route, which the recent widening accepts as a
 *      pure-reassign path. The shared route writes an audit row
 *      with `action: 'reassign.crew'`.
 *
 * The detail does NOT support editing the internal note or
 * reassigning ward/category — those operations live in the
 * dispatcher-only PATCH route (`PATCH /api/v1/dispatcher/tickets/[id]`)
 * and would require a new admin endpoint to be reachable. Tracked
 * as a v1.1 follow-up.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ThemeToggle } from '@/components/ThemeToggle';
import { UserMenu } from '@/components/UserMenu';
import { t, type Language } from '@/lib/i18n/keys';
import type { SerializedTicket } from '@/lib/serializers/ticket';

const LANG_KEY = 'cityfix.preferred_language.v1';

const TRANSITIONS_BY_FROM: Record<string, string[]> = {
  submitted: ['routed', 'cancelled'],
  routed: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  closed: [],
  cancelled: [],
};

export default function AdminTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [ticket, setTicket] = useState<SerializedTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const [reassignId, setReassignId] = useState('');

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LANG_KEY)
        : null;
    if (stored === 'bn' || stored === 'en') setLang(stored);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, lang);
    }
  }, [lang]);

  // Auth + role gate.
  //
  // The API independently enforces `requireRole('admin')` on the
  // tickets detail endpoint, but a non-admin user who lands here
  // directly (e.g. a shared link, a stale bookmark) would otherwise
  // see an empty `http_403` page instead of a clean redirect to
  // their own home. We check the role on the client too and bounce
  // non-admins to `/` (the splash / role-aware router) so the UX
  // matches the dispatcher's and crew's pages.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', {
          credentials: 'include',
        });
        const status = (await statusRes.json()) as {
          authenticated: boolean;
          session?: { role: 'citizen' | 'dispatcher' | 'crew' | 'admin' } | null;
        };
        if (cancelled) return;
        if (!status.authenticated) {
          window.location.href =
            '/login?next=' + encodeURIComponent('/admin/tickets/' + id);
          return;
        }
        if (status.session?.role !== 'admin') {
          window.location.href = '/';
          return;
        }
        setSignedIn(true);
      } catch {
        if (cancelled) return;
        setSignedIn(false);
        window.location.href =
          '/login?next=' + encodeURIComponent('/admin/tickets/' + id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const refetch = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/v1/admin/tickets/${id}`, {
      credentials: 'include',
    });
    if (!res.ok) {
      setError(`http_${res.status}`);
      setTicket(null);
      return;
    }
    const body = (await res.json()) as { ticket: SerializedTicket };
    setTicket(body.ticket);
  }, [id]);

  useEffect(() => {
    if (signedIn !== true || !id) return;
    refetch();
  }, [signedIn, id, refetch]);

  const onTransition = useCallback(
    async (toStatus: string) => {
      if (!id) return;
      const key = `transition:${toStatus}`;
      setActionInFlight(key);
      try {
        const res = await fetch(`/api/tickets/${id}/transition`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ toStatus }),
        });
        if (res.ok) {
          await refetch();
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setError(body.error ?? `http_${res.status}`);
        }
      } finally {
        setActionInFlight(null);
      }
    },
    [id, refetch],
  );

  const onReassign = useCallback(async () => {
    if (!id) return;
    const crewId = reassignId.trim();
    if (!crewId) return;
    setActionInFlight('reassign');
    try {
      const res = await fetch(`/api/tickets/${id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ assignedCrewId: crewId }),
      });
      if (res.ok) {
        setReassignId('');
        await refetch();
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(body.error ?? `http_${res.status}`);
      }
    } finally {
      setActionInFlight(null);
    }
  }, [id, reassignId, refetch]);

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.tickets.title', null, lang)} …
      </div>
    );
  }

  const allowed =
    ticket && TRANSITIONS_BY_FROM[ticket.status]
      ? TRANSITIONS_BY_FROM[ticket.status]
      : [];
  const isTerminal = ticket
    ? ticket.status === 'resolved' ||
      ticket.status === 'closed' ||
      ticket.status === 'cancelled'
    : true;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tickets"
            className="text-xs text-slate-600 hover:underline"
          >
            {t('admin.tickets.detail.back', null, lang)}
          </Link>
          <span className="text-lg font-semibold text-slate-900">
            {t('admin.tickets.title', null, lang)}
          </span>
          {ticket && (
            <span className="text-xs text-slate-500 font-mono">
              {ticket.id}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-slate-600"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
          >
            {lang === 'bn' ? 'EN' : 'বাংলা'}
          </button>
          <ThemeToggle />
          <UserMenu lang={lang} />
        </div>
      </header>

      {error && (
        <div className="px-6 py-2 text-sm" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}

      {!ticket && !error && (
        <div className="p-8 text-sm text-slate-600">
          {t('admin.tickets.loading', null, lang)}
        </div>
      )}

      {ticket && (
        <div className="flex-1 flex" style={{ minHeight: 0 }}>
          <main className="flex-1 overflow-y-auto p-6 space-y-6">
            {ticket.photoUrls.length > 0 && (
              <div
                data-testid="admin-tickets-photos"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, 120px)',
                  gap: 8,
                }}
              >
                {ticket.photoUrls.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    style={{
                      width: 120,
                      height: 120,
                      objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                    }}
                  />
                ))}
              </div>
            )}

            <dl
              data-testid="admin-tickets-meta"
              style={{
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                gap: '4px 12px',
                fontSize: 'var(--text-caption)',
              }}
            >
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('status.submitted', null, lang)}
              </dt>
              <dd>{t(`status.${ticket.status}`, null, lang)}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.category', null, lang)}
              </dt>
              <dd style={{ fontFamily: 'monospace' }}>{ticket.categoryId}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.ward', null, lang)}
              </dt>
              <dd style={{ fontFamily: 'monospace' }}>{ticket.wardId}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.reporter', null, lang)}
              </dt>
              <dd style={{ fontFamily: 'monospace' }}>{ticket.reporterId}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.assigned', null, lang)}
              </dt>
              <dd style={{ fontFamily: 'monospace' }}>
                {ticket.assignedCrewId ?? '—'}
              </dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.created', null, lang)}
              </dt>
              <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
              {ticket.resolvedAt && (
                <>
                  <dt style={{ color: 'var(--color-ink-secondary)' }}>
                    {t('status.resolved', null, lang)}
                  </dt>
                  <dd>{new Date(ticket.resolvedAt).toLocaleString()}</dd>
                </>
              )}
              {ticket.note && (
                <>
                  <dt style={{ color: 'var(--color-ink-secondary)' }}>Note</dt>
                  <dd>{ticket.note}</dd>
                </>
              )}
              {ticket.internalNote && (
                <>
                  <dt style={{ color: 'var(--color-ink-secondary)' }}>
                    {t('admin.tickets.detail.note', null, lang)}
                  </dt>
                  <dd>{ticket.internalNote}</dd>
                </>
              )}
            </dl>

            <section>
              <h2
                style={{
                  fontSize: 'var(--text-body)',
                  fontWeight: 'var(--weight-semibold)',
                  marginBottom: 8,
                }}
              >
                {t('admin.tickets.detail.trail', null, lang)}
              </h2>
              <ol
                data-testid="admin-tickets-trail"
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  fontSize: 'var(--text-caption)',
                }}
              >
                {ticket.trail.map((entry, i) => (
                  <li
                    key={i}
                    style={{
                      padding: '6px 10px',
                      background: 'var(--color-surface-raised)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        marginRight: 8,
                        padding: '1px 6px',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-pill)',
                      }}
                    >
                      {t(`status.${entry.toStatus}`, null, lang)}
                    </span>
                    <code style={{ fontSize: 'var(--text-small)' }}>
                      {entry.actorLabel}
                    </code>
                    <span
                      style={{
                        marginLeft: 8,
                        color: 'var(--color-ink-secondary)',
                      }}
                    >
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    {entry.note && (
                      <div
                        style={{
                          marginTop: 4,
                          color: 'var(--color-ink-secondary)',
                        }}
                      >
                        {entry.note}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <Link
              href={`/admin/audit?entityType=ticket&action=ticket.transition`}
              className="text-xs text-slate-600 hover:underline"
            >
              {t('admin.tickets.detail.meta', null, lang)}
            </Link>
          </main>

          <aside
            className="border-l border-slate-200 bg-white"
            style={{ width: 320, flexShrink: 0, padding: 'var(--space-4)' }}
          >
            <h2
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 'var(--weight-semibold)',
                marginBottom: 8,
              }}
            >
              {t('admin.tickets.transition.cta', null, lang)}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {allowed.length === 0 && (
                <p
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-secondary)',
                  }}
                >
                  —
                </p>
              )}
              {allowed.map((toStatus) => {
                const key = `transition:${toStatus}`;
                const busy = actionInFlight === key;
                return (
                  <button
                    key={toStatus}
                    type="button"
                    data-testid={`admin-tickets-transition-${toStatus}`}
                    disabled={busy}
                    onClick={() => onTransition(toStatus)}
                    style={{
                      minHeight: 36,
                      padding: '0 var(--space-3)',
                      background: 'var(--color-primary)',
                      color: 'var(--color-on-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      fontFamily: 'inherit',
                      cursor: busy ? 'default' : 'pointer',
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    {busy
                      ? t('admin.tickets.loading', null, lang)
                      : t(`status.${toStatus}`, null, lang)}
                  </button>
                );
              })}
            </div>

            <h2
              style={{
                fontSize: 'var(--text-body)',
                fontWeight: 'var(--weight-semibold)',
                marginTop: 24,
                marginBottom: 8,
              }}
            >
              {t('admin.tickets.reassign.cta', null, lang)}
            </h2>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                opacity: isTerminal ? 0.5 : 1,
              }}
            >
              <input
                type="text"
                data-testid="admin-tickets-reassign-input"
                value={reassignId}
                onChange={(e) => setReassignId(e.target.value)}
                disabled={isTerminal}
                placeholder={t('admin.tickets.reassign.placeholder', null, lang)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-ink)',
                  fontSize: 'var(--text-caption)',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                data-testid="admin-tickets-reassign-cta"
                onClick={onReassign}
                disabled={isTerminal || actionInFlight === 'reassign' || !reassignId.trim()}
                style={{
                  minHeight: 36,
                  padding: '0 var(--space-3)',
                  background: 'var(--color-surface-raised)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 'var(--weight-semibold)',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {t('admin.tickets.reassign.cta', null, lang)}
              </button>
              {isTerminal && (
                <p
                  style={{
                    fontSize: 'var(--text-small)',
                    color: 'var(--color-ink-secondary)',
                  }}
                >
                  {t('admin.tickets.detail.note', null, lang)}
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
