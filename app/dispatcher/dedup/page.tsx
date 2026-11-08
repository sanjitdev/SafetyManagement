/**
 * Dispatcher dedup-decline review (/dispatcher/dedup).
 *
 * DISP-006 (Intent 003, Unit 004): the dispatcher's review
 * surface for citizen-declined dedup candidates.
 *
 * Renders the list of pending `DedupFlag` rows. Each row
 * shows both the citizen's new ticket and the existing
 * ticket it was near, side by side, plus the citizen's
 * optional reason text. Two actions per row:
 *   - Confirm duplicate: closes the citizen's ticket with
 *     reason 'duplicate' + links to the original.
 *   - Dismiss: clears the flag; the ticket proceeds to the
 *     normal triage queue.
 *
 * No polling: the dispatcher re-fetches (reload) to see new
 * flags. v1.1 may add WebSocket / SSE.
 *
 * Out-of-scope id is impossible at the list level; the
 * per-flag actions return 404 for out-of-scope ids.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTicketId } from '@/lib/format/ticket-id';
import { formatTimestampShort as formatTimestamp } from '@/lib/format/datetime';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';

const LANG_KEY = 'cityfix.preferred_language.v1';

type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface TicketSummary {
  id: string;
  status: TicketStatus;
  cityId: string;
  wardId: string;
  categoryId: string;
  locationLat: number;
  locationLng: number;
  locationLabel: string | null;
  reporterId: string;
  createdAt: string;
}

interface DedupFlagRow {
  id: string;
  cityId: string;
  wardId: string;
  departmentId: string | null;
  citizenReason: string | null;
  flaggedAt: string;
  status: 'pending' | 'confirmed' | 'dismissed';
  ticket: TicketSummary | null;
  originalTicket: TicketSummary | null;
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return 6_371_000 * c;
}

function distanceLabel(ticket: TicketSummary, original: TicketSummary, lang: Language): string {
  const m = Math.round(
    haversineMeters(
      { lat: ticket.locationLat, lng: ticket.locationLng },
      { lat: original.locationLat, lng: original.locationLng },
    ),
  );
  return t('dispatcher.dedup.row.distance', { distance: m }, lang);
}

export default function DispatcherDedupReviewPage() {
  const [lang, setLang] = useState<Language>('bn');
  const [flags, setFlags] = useState<DedupFlagRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inFlightFlagId, setInFlightFlagId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

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

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/dispatcher/dedup-flags', {
        credentials: 'include',
      });
      if (res.status === 401) {
        setError('not_authenticated');
        setLoading(false);
        return;
      }
      if (res.status === 403) {
        setError('forbidden_role');
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setError('unknown');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { flags: DedupFlagRow[] };
      setFlags(data.flags);
      setLoading(false);
    } catch {
      setError('unknown');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchFlags();
  }, [fetchFlags]);

  async function onConfirm(flagId: string) {
    setRowError(null);
    setInFlightFlagId(flagId);
    try {
      const res = await fetch(
        `/api/v1/dispatcher/dedup-flags/${encodeURIComponent(flagId)}/confirm`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRowError({
          id: flagId,
          message: body.error ?? t('dispatcher.dedup.row.error', null, lang),
        });
        setInFlightFlagId(null);
        return;
      }
      setFlags((prev) => (prev ?? []).filter((f) => f.id !== flagId));
      setInFlightFlagId(null);
    } catch {
      setRowError({
        id: flagId,
        message: t('dispatcher.dedup.row.error', null, lang),
      });
      setInFlightFlagId(null);
    }
  }

  async function onDismiss(flagId: string) {
    setRowError(null);
    setInFlightFlagId(flagId);
    try {
      const res = await fetch(
        `/api/v1/dispatcher/dedup-flags/${encodeURIComponent(flagId)}/dismiss`,
        { method: 'POST', credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setRowError({
          id: flagId,
          message: body.error ?? t('dispatcher.dedup.row.error', null, lang),
        });
        setInFlightFlagId(null);
        return;
      }
      setFlags((prev) => (prev ?? []).filter((f) => f.id !== flagId));
      setInFlightFlagId(null);
    } catch {
      setRowError({
        id: flagId,
        message: t('dispatcher.dedup.row.error', null, lang),
      });
      setInFlightFlagId(null);
    }
  }

  if (error === 'not_authenticated') {
    return (
      <div
        style={{
          minHeight: '100%',
          background: 'var(--color-surface-page)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-body-lg)',
            color: 'var(--color-ink-secondary)',
            marginBottom: 'var(--space-4)',
          }}
        >
          {t('dispatcher.dedup.signin_required', null, lang)}
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
          {t('auth.back_home', null, lang)}
        </Link>
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
      data-testid="dispatcher-dedup-page"
    >
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
        <Link
          href="/dispatcher"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
            fontSize: 'var(--text-body-sm)',
          }}
        >
          ← {t('dispatcher.queue.title', null, lang)}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
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

      <main
        style={{
          flex: 1,
          padding: 'var(--space-5)',
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
        }}
      >
        <h1
          lang={lang}
          style={{
            fontSize: 'var(--text-h1)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--color-ink)',
            margin: '0 0 var(--space-2)',
          }}
        >
          {t('dispatcher.dedup.heading', null, lang)}
        </h1>
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink-secondary)',
            margin: '0 0 var(--space-5)',
          }}
        >
          {t('dispatcher.dedup.subtitle', null, lang)}
        </p>

        {loading && (
          <SkeletonStatus lang={lang} className="dedup-loading-list">
            {[0, 1, 2].map((item) => (
              <div key={item} className="dedup-loading-card">
                <div style={{ display: 'grid', gap: 10, flex: 1 }}>
                  <SkeletonBlock style={{ width: '42%', height: 15 }} />
                  <SkeletonBlock style={{ width: '72%', height: 12 }} />
                  <SkeletonBlock style={{ width: '58%', height: 12 }} />
                </div>
                <div className="dedup-loading-actions">
                  <SkeletonBlock style={{ width: 118, height: 38, borderRadius: 'var(--radius-md)' }} />
                  <SkeletonBlock style={{ width: 118, height: 38, borderRadius: 'var(--radius-md)' }} />
                </div>
              </div>
            ))}
          </SkeletonStatus>
        )}

        {error && error !== 'not_authenticated' && (
          <p
            role="alert"
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-danger)',
            }}
          >
            {t('dispatcher.dedup.error', null, lang)}
          </p>
        )}

        {!loading && flags && flags.length === 0 && (
          <div
            style={{
              padding: 'var(--space-7) var(--space-5)',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
            }}
            data-testid="dispatcher-dedup-empty"
          >
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-2)',
              }}
            >
              {t('dispatcher.dedup.empty.title', null, lang)}
            </p>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink-secondary)',
                margin: 0,
              }}
            >
              {t('dispatcher.dedup.empty.subtitle', null, lang)}
            </p>
          </div>
        )}

        {flags && flags.length > 0 && (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
            data-testid="dispatcher-dedup-list"
          >
            {flags.map((f) => {
              const rowErrorMessage = rowError?.id === f.id ? rowError.message : null;
              return (
                <li
                  key={f.id}
                  data-testid={`dispatcher-dedup-row-${f.id}`}
                  style={{
                    background: 'var(--color-surface-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 'var(--space-4)',
                    }}
                    className="dispatcher-dedup-row-grid"
                  >
                    {f.ticket && f.originalTicket && (
                      <>
                        <TicketPanel
                          lang={lang}
                          label="New"
                          ticket={f.ticket}
                          distanceLabel={distanceLabel(f.ticket, f.originalTicket, lang)}
                        />
                        <TicketPanel
                          lang={lang}
                          label="Original"
                          ticket={f.originalTicket}
                          distanceLabel={null}
                        />
                      </>
                    )}
                  </div>

                  {f.citizenReason && (
                    <div>
                      <div
                        lang={lang}
                        style={{
                          fontSize: 'var(--text-caption)',
                          color: 'var(--color-ink-tertiary)',
                          fontWeight: 'var(--weight-semibold)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          marginBottom: 'var(--space-1)',
                        }}
                      >
                        {t('dispatcher.dedup.row.reason', null, lang)}
                      </div>
                      <p
                        lang={lang}
                        style={{
                          fontSize: 'var(--text-body-sm)',
                          color: 'var(--color-ink)',
                          margin: 0,
                        }}
                      >
                        {f.citizenReason}
                      </p>
                    </div>
                  )}

                  {rowErrorMessage && (
                    <span
                      role="alert"
                      lang={lang}
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--color-danger)',
                      }}
                    >
                      {rowErrorMessage}
                    </span>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--space-3)',
                      justifyContent: 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onDismiss(f.id)}
                      disabled={inFlightFlagId !== null}
                      data-testid={`dispatcher-dedup-dismiss-${f.id}`}
                      style={{
                        padding: 'var(--space-2) var(--space-4)',
                        background: 'transparent',
                        color: 'var(--color-ink)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-body-sm)',
                        fontWeight: 'var(--weight-semibold)',
                        cursor: inFlightFlagId !== null ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {inFlightFlagId === f.id
                        ? t('dispatcher.dedup.row.dismissing', null, lang)
                        : t('dispatcher.dedup.row.dismiss', null, lang)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfirm(f.id)}
                      disabled={inFlightFlagId !== null}
                      data-testid={`dispatcher-dedup-confirm-${f.id}`}
                      style={{
                        padding: 'var(--space-2) var(--space-4)',
                        background: 'var(--color-primary)',
                        color: 'var(--color-on-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-body-sm)',
                        fontWeight: 'var(--weight-semibold)',
                        cursor: inFlightFlagId !== null ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {inFlightFlagId === f.id
                        ? t('dispatcher.dedup.row.confirming', null, lang)
                        : t('dispatcher.dedup.row.confirm', null, lang)}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}

function TicketPanel({
  lang,
  label,
  ticket,
  distanceLabel,
}: {
  lang: Language;
  label: string;
  ticket: TicketSummary;
  distanceLabel: string | null;
}) {
  return (
    <div
      style={{
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        padding: 'var(--space-2)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
            fontWeight: 'var(--weight-bold)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          {label}
        </span>
        <span
          lang={lang}
          style={{
            padding: '2px var(--space-2)',
            background: 'var(--color-status-routed-soft)',
            color: 'var(--color-status-routed)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 10,
            fontWeight: 'var(--weight-bold)',
            textTransform: 'uppercase',
          }}
        >
          {`status.${ticket.status}` in ({} as Record<string, unknown>)
            ? ''
            : t(`status.${ticket.status}`, null, lang)}
        </span>
      </div>
      <div
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-ink-secondary)',
          fontFamily: 'monospace',
        }}
      >
        {formatTicketId(ticket.id)}
      </div>
      <div
        lang={lang}
        style={{ fontSize: 'var(--text-body-sm)', color: 'var(--color-ink)' }}
      >
        {ticket.locationLabel ?? '—'}
      </div>
      <div
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-ink-tertiary)',
        }}
      >
        {ticket.locationLat.toFixed(4)}, {ticket.locationLng.toFixed(4)}
      </div>
      {distanceLabel && (
        <div
          lang={lang}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
            marginTop: 'var(--space-1)',
          }}
        >
          {distanceLabel}
        </div>
      )}
      <div
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-ink-tertiary)',
          marginTop: 'var(--space-1)',
        }}
      >
        {formatTimestamp(ticket.createdAt, lang)}
      </div>
    </div>
  );
}
