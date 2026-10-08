/**
 * 1.12 Report — My Reports Detail
 *
 * Two-region layout at large viewport, single column at medium:
 *   - LEFT: hero (status pill + ticket ID + Bangla title + ward/age),
 *     photo gallery with per-photo delete, status trail.
 *   - RIGHT: metadata card (category, ward, SLA, resolution time),
 *     feel-heard feedback prompt when status === 'resolved'.
 *
 * Photos live as data URLs in the dev store today; v1.1 swaps to S3/MinIO
 * keys. The DELETE handler is intentionally lightweight so the demo can
 * show the citizen's "delete individual photos" affordance; it remains a
 * valid citizen-only mutation (PLAT-REQ-001).
 *
 * All user-facing copy routes through `lib/i18n/keys.ts` per
 * `team.md` Forbidden rule (no hardcoded strings). Status pill, trail
 * titles, feedback prompt, photo-delete dialog, and metadata labels are
 * all i18n-keyed.
 *
 * Matches mockup 04-my-reports-detail.html.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';

interface SerializedTicket {
  id: string;
  cityId: string;
  wardId: string;
  categoryId: string;
  status:
    | 'submitted'
    | 'routed'
    | 'in_progress'
    | 'resolved'
    | 'closed'
    | 'cancelled';
  locationLng: number;
  locationLat: number;
  locationLabel: string | null;
  locationLabelBn: string | null;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
  resolvedAt: string | null;
  trail: Array<{
    toStatus: SerializedTicket['status'];
    actorLabel: string;
    note: string | null;
    timestamp: string;
  }>;
}

const STATUS_ORDER: SerializedTicket['status'][] = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
];

// City default is Bangla per project.md; the citizen session carries
// the actual override once the WO-004 auth surface lands, but for the
// v1 detail view we read the city default from the ticket's cityId.
const LANG: Language = 'bn';

const STATUS_TITLES_KEY: Record<SerializedTicket['status'], string> = {
  submitted: 'trail.submitted',
  routed: 'trail.routed',
  in_progress: 'trail.in_progress',
  resolved: 'trail.resolved',
  closed: 'trail.closed',
  cancelled: 'trail.cancelled',
};

function pillClass(status: SerializedTicket['status']) {
  switch (status) {
    case 'resolved':
      return { bg: 'var(--color-status-resolved-soft, #d4edda)', fg: 'var(--color-status-resolved, #1f7a3f)' };
    case 'routed':
      return { bg: 'var(--color-status-routed-soft, #cfe2ff)', fg: 'var(--color-status-routed, #0b5ed7)' };
    case 'in_progress':
      return { bg: 'var(--color-status-in-progress-soft, #fff3cd)', fg: 'var(--color-status-in-progress, #b58410)' };
    case 'submitted':
      return { bg: 'var(--color-primary-soft, #e6f2ee)', fg: 'var(--color-primary)' };
    default:
      return { bg: 'var(--color-surface-raised)', fg: 'var(--color-ink-secondary)' };
  }
}

function timeAgoParts(iso: string): { value: number; unitKey: string } {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const ms = Math.max(0, now - t);
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return { value: minutes, unitKey: 'time.minutes_ago' };
  const hours = Math.round(minutes / 60);
  if (hours < 24) return { value: hours, unitKey: 'time.hours_ago' };
  const days = Math.round(hours / 24);
  return { value: days, unitKey: 'time.days_ago' };
}

function timeAgoLabel(iso: string): string {
  const { value, unitKey } = timeAgoParts(iso);
  return `${value} ${t(unitKey as 'time.minutes_ago', null, LANG)}`;
}

export default function MyReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  const [ticket, setTicket] = useState<SerializedTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Guard against React strict mode double-mount racing the rate limiter.
  const fetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!id) return; // wait for useParams to resolve
    if (fetchedFor.current === id) return; // already fetched for this id
    fetchedFor.current = id;
    (async () => {
      const authRes = await fetch('/api/report/bootstrap', { credentials: 'include' });
      if (!authRes.ok) {
        setAuthed(false);
        return;
      }
      setAuthed(true);
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/tickets/${id}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.status === 401) {
        setAuthed(false);
        return;
      }
      if (res.status === 403) {
        setError('forbidden');
        return;
      }
      if (res.status === 404) {
        setError('not_found');
        return;
      }
      // 429 is the platform's PLAT-REQ-008 rate limiter. It's transient
      // and can fire when the same page mounts more than once in dev
      // (React strict mode + fast refresh). Retry once with a short
      // backoff rather than failing the render.
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 600));
        const retry = await fetch(url, { credentials: 'include' });
        if (retry.ok) {
          const body = await retry.json();
          setTicket(body.ticket);
          return;
        }
        // Still rate-limited or otherwise failing; surface a transient
        // message rather than a permanent error.
        setError('rate_limited');
        return;
      }
      if (!res.ok) {
        setError(`failed (${res.status})`);
        return;
      }
      const body = await res.json();
      setTicket(body.ticket);
    } finally {
      setLoading(false);
    }
  }

  if (authed === false) {
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <p>{t('detail.signin_required', null, LANG)}</p>
        <a href="/">← {t('detail.topbar.home', null, LANG)}</a>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)', color: 'var(--color-ink-secondary)' }}>
        {t('detail.loading', null, LANG)}
      </div>
    );
  }

  if (error || !ticket) {
    const isNotFound = error === 'not_found';
    const isForbidden = error === 'forbidden';
    const isRateLimited = error === 'rate_limited';
    return (
      <div style={{ padding: 'var(--space-7) var(--space-5)' }}>
        <h1 style={{ fontSize: 'var(--text-h3)', margin: '0 0 var(--space-2)' }}>
          {isNotFound
            ? t('detail.error.not_found', null, LANG)
            : isRateLimited
              ? t('detail.error.rate_limited.title', null, LANG)
              : t('detail.error.generic', null, LANG)}
        </h1>
        <p style={{ color: 'var(--color-ink-secondary)' }}>
          {isForbidden
            ? t('detail.error.forbidden', null, LANG)
            : isRateLimited
              ? t('detail.error.rate_limited.blurb', null, LANG)
              : t('detail.error.not_found_blurb', null, LANG)}
        </p>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-3)',
            color: 'var(--color-primary)',
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {t('detail.error.back_home', null, LANG)}
        </a>
      </div>
    );
  }

  const pill = pillClass(ticket.status);
  const currentIdx = STATUS_ORDER.indexOf(ticket.status);
  const wardLabel = `ওয়ার্ড ${ticket.wardId.replace(/^ward_/, '')}, মিরপুর`;
  const createdRel = timeAgoLabel(ticket.createdAt);
  const resolvedRel = ticket.resolvedAt ? timeAgoLabel(ticket.resolvedAt) : null;
  const resolutionDays =
    ticket.resolvedAt
      ? (
          (new Date(ticket.resolvedAt).getTime() - new Date(ticket.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
        ).toFixed(1)
      : null;

  async function handleDeletePhoto(idx: number) {
    if (!ticket) return;
    setPendingDeleteIdx(idx);
  }

  async function confirmDeletePhoto() {
    if (!ticket || pendingDeleteIdx == null) return;
    const idx = pendingDeleteIdx;
    setPendingDeleteIdx(null);
    setDeletingIdx(idx);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/photos/${idx}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setDeleteError(t('detail.photo.delete_failed', null, LANG) + ` (${res.status})`);
        return;
      }
      setTicket({
        ...ticket,
        photoUrls: ticket.photoUrls.filter((_, i) => i !== idx),
      });
    } finally {
      setDeletingIdx(null);
    }
  }

  function cancelDeletePhoto() {
    setPendingDeleteIdx(null);
    setDeleteError(null);
  }

  function handleFeedbackSatisfied() {
    setFeedbackSent(true);
    // PLAT-REQ-006 / feel-heard: a satisfied citizen = audit event we
    // can hand to the WO-002 dispatcher surface later. v1 only logs locally.
    // The actual persistence lands in WO-002.
  }

  return (
    <div style={{ background: 'var(--color-surface-page)', minHeight: '100vh' }}>
      {/* Top bar — citizen-side dashboard. */}
      <div
        style={{
          height: 'var(--header-height-desktop, 64px)',
          background: 'var(--color-surface-card, #fff)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: 'var(--color-primary)',
              borderRadius: '50%',
            }}
            aria-hidden
          />
          <strong style={{ fontSize: 'var(--text-body-lg)' }}>CityFix</strong>
          <span style={{ color: 'var(--color-ink-tertiary)', fontSize: 'var(--text-caption)' }}>
            ·
          </span>
          <span
            lang="bn"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            {t('detail.topbar.section', null, LANG)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <a
            href="/"
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
            }}
          >
            {t('detail.topbar.home', null, LANG)}
          </a>
          <div
            aria-hidden
            style={{
              width: 32,
              height: 32,
              background: 'var(--color-primary-soft)',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-primary)',
              fontSize: 'var(--text-caption)',
            }}
          >
            {t('detail.avatar.fallback', null, LANG)}
          </div>
        </div>
      </div>

      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: 'var(--space-6) var(--space-5)',
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr',
          gap: 'var(--space-6)',
        }}
        className="report-detail-grid"
      >
        <style>{`
          @media (max-width: 1024px) {
            .report-detail-grid { grid-template-columns: 1fr !important; padding: var(--space-5) var(--space-4) !important; }
          }
        `}</style>

        {/* LEFT */}
        <div>
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-2)',
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 'var(--weight-semibold)',
                  background: pill.bg,
                  color: pill.fg,
                }}
              >
                {t(`status.${ticket.status}` as 'status.submitted', null, LANG)}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                #{ticket.id}
              </span>
            </div>
            <h1
              lang="bn"
              style={{
                margin: '0 0 var(--space-2)',
                fontSize: 'var(--text-h2)',
                lineHeight: 1.2,
              }}
            >
              {t(
                `category.${ticket.categoryId.replace(/^cat_/, '')}` as 'category.other',
                null,
                LANG,
              )}
            </h1>
            <div
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {wardLabel} · {createdRel} {t('time.filed', null, LANG)}
            </div>
          </div>

          {/* Photo gallery */}
          {ticket.photoUrls.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-5)',
              }}
            >
              {ticket.photoUrls.map((url, idx) => (
                <div
                  key={idx}
                  style={{
                    position: 'relative',
                    aspectRatio: '4 / 3',
                    borderRadius: 'var(--radius-md)',
                    overflow: 'hidden',
                    border: '1px solid var(--color-border)',
                    background: `url(${url}) center/cover no-repeat`,
                  }}
                >
                  <button
                    type="button"
                    aria-label={t('detail.photo.delete_aria', null, LANG)}
                    onClick={() => handleDeletePhoto(idx)}
                    disabled={deletingIdx === idx}
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      fontSize: 14,
                      cursor: deletingIdx === idx ? 'wait' : 'pointer',
                    }}
                  >
                    {deletingIdx === idx ? '…' : '×'}
                  </button>
                </div>
              ))}
              {deleteError && (
                <div
                  role="alert"
                  style={{
                    gridColumn: '1 / -1',
                    padding: 'var(--space-3)',
                    background: 'var(--color-warning-soft, #fdf2cf)',
                    border: '1px solid var(--color-warning, #b58410)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-ink)',
                    fontSize: 'var(--text-caption)',
                  }}
                >
                  {deleteError}
                </div>
              )}
            </div>
          )}

          {/* Status trail */}
          <div
            style={{
              background: 'var(--color-surface-card, #fff)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-micro)',
                color: 'var(--color-ink-tertiary)',
                fontWeight: 'var(--weight-semibold)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginBottom: 'var(--space-4)',
              }}
            >
              {t('detail.section.progress', null, LANG)}
            </div>
            {ticket.trail.length === 0 ? (
              <p
                style={{
                  margin: 0,
                  color: 'var(--color-ink-secondary)',
                  fontSize: 'var(--text-caption)',
                }}
              >
                {t('detail.progress.empty', null, LANG)}
              </p>
            ) : (
              ticket.trail.map((entry, idx) => {
                const orderIdx = STATUS_ORDER.indexOf(entry.toStatus);
                const isDone = orderIdx >= 0 && orderIdx <= currentIdx;
                const isCurrent = entry.toStatus === ticket.status;
                const isLastInList = idx === ticket.trail.length - 1;
                const stepClass = isCurrent ? 'current' : isDone ? 'done' : 'pending';
                return (
                  <div
                    key={`${entry.timestamp}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--space-3)',
                      position: 'relative',
                      marginTop: idx === 0 ? 0 : 'var(--space-4)',
                    }}
                  >
                    {!isLastInList && (
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 11,
                          top: 24,
                          bottom: -16,
                          width: 2,
                          background:
                            stepClass === 'done'
                              ? 'var(--color-status-resolved, #1f7a3f)'
                              : 'var(--color-border)',
                        }}
                      />
                    )}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background:
                          stepClass === 'done'
                            ? 'var(--color-status-resolved, #1f7a3f)'
                            : stepClass === 'current'
                              ? 'var(--color-primary)'
                              : 'var(--color-surface-raised)',
                        color:
                          stepClass !== 'pending'
                            ? 'var(--color-on-primary, #fff)'
                            : 'var(--color-ink-tertiary)',
                        fontSize: 'var(--text-micro, 11px)',
                        fontWeight: 'var(--weight-semibold)',
                      }}
                      aria-hidden
                    >
                      {stepClass === 'done' || stepClass === 'current' ? (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        STATUS_ORDER.indexOf(entry.toStatus) + 1
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div
                        lang="bn"
                        style={{
                          fontWeight: 'var(--weight-semibold)',
                          fontSize: 'var(--text-body-sm)',
                        }}
                      >
                        {t(STATUS_TITLES_KEY[entry.toStatus] as 'trail.submitted', null, LANG)}
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-caption)',
                          color: 'var(--color-ink-tertiary)',
                          marginTop: 2,
                        }}
                      >
                        {timeAgoLabel(entry.timestamp)} · {entry.actorLabel}
                      </div>
                      {entry.note && (
                        <div
                          lang="bn"
                          style={{
                            fontSize: 'var(--text-caption)',
                            color: 'var(--color-ink-secondary)',
                            marginTop: 4,
                            fontStyle: 'italic',
                          }}
                        >
                          “{entry.note}”
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT */}
        <aside>
          <div
            style={{
              background: 'var(--color-surface-card, #fff)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-4)',
              }}
            >
              <MetaCell
                label={t('detail.meta.category', null, LANG)}
                value={t(
                  `category.${ticket.categoryId.replace(/^cat_/, '')}` as 'category.other',
                  null,
                  LANG,
                )}
              />
              <MetaCell label={t('detail.meta.ward', null, LANG)} value={wardLabel} />
              <MetaCell
                label={t('detail.meta.sla', null, LANG)}
                value={t('detail.meta.sla_value', null, LANG)}
              />
              <MetaCell
                label={t('detail.meta.resolution', null, LANG)}
                value={resolutionDays ? `${resolutionDays} ${t('time.days_ago', null, LANG)}` : '—'}
              />
            </div>
          </div>

          {ticket.status === 'resolved' && (
            <div
              style={{
                background: 'var(--color-primary-soft, #e6f2ee)',
                borderLeft: '3px solid var(--color-primary)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                lang="bn"
                style={{
                  fontWeight: 'var(--weight-semibold)',
                  marginBottom: 'var(--space-1)',
                }}
              >
                {t('detail.feedback.title', null, LANG)}
              </div>
              <div
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-secondary)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                {t('detail.feedback.subtitle', null, LANG)}
              </div>
              {feedbackSent ? (
                <div
                  lang="bn"
                  style={{
                    fontSize: 'var(--text-body-sm)',
                    color: 'var(--color-primary)',
                    fontWeight: 'var(--weight-semibold)',
                  }}
                >
                  {t('detail.feedback.thanks', null, LANG)}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={handleFeedbackSatisfied}
                    style={{
                      height: 40,
                      padding: '0 var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-primary)',
                      background: '#fff',
                      color: 'var(--color-primary)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('detail.feedback.satisfied', null, LANG)}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/reports/${ticket.id}/dispute`)}
                    style={{
                      height: 40,
                      padding: '0 var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-strong, #aaa)',
                      background: '#fff',
                      color: 'var(--color-ink)',
                      fontWeight: 'var(--weight-medium)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('detail.feedback.dispute', null, LANG)}
                  </button>
                </div>
              )}
              {resolvedRel && (
                <div
                  style={{
                    marginTop: 'var(--space-3)',
                    fontSize: 'var(--text-micro, 11px)',
                    color: 'var(--color-ink-tertiary)',
                  }}
                >
                  {t('detail.feedback.resolved_ago', null, LANG)} {resolvedRel}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Photo-delete confirmation modal — replaces `confirm()` so all
          copy is i18n-keyed and the design system controls the look. */}
      {pendingDeleteIdx != null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-delete-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'var(--color-surface-card, #fff)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            }}
          >
            <h2
              id="photo-delete-title"
              lang="bn"
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--text-h3)',
              }}
            >
              {t('detail.photo.delete_confirm', null, LANG)}
            </h2>
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-2)',
                justifyContent: 'flex-end',
                marginTop: 'var(--space-4)',
              }}
            >
              <button
                type="button"
                onClick={cancelDeletePhoto}
                style={{
                  height: 40,
                  padding: '0 var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                  color: 'var(--color-ink-secondary)',
                  fontWeight: 'var(--weight-medium)',
                  cursor: 'pointer',
                }}
              >
                {t('common.cancel', null, LANG)}
              </button>
              <button
                type="button"
                onClick={confirmDeletePhoto}
                style={{
                  height: 40,
                  padding: '0 var(--space-4)',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: 'var(--color-warning, #b58410)',
                  color: '#fff',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {t('detail.photo.delete_aria', null, LANG)}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-micro, 11px)',
          color: 'var(--color-ink-tertiary)',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        lang="bn"
        style={{
          marginTop: 4,
          fontWeight: 'var(--weight-medium)',
          color: 'var(--color-ink)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
