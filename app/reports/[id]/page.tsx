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
import { formatTicketId } from '@/lib/format/ticket-id';
import { thumbnailBackground } from '@/lib/format/photo-url';
import { TicketDetailSkeleton } from '@/components/ui/Skeleton';
import { useLanguage } from '@/components/useLanguage';
import { useSession } from '@/components/SessionProvider';
// Canonical citizen-facing payload (lib/serializers/ticket.ts). Using
// the imported type instead of a local mirror keeps the page in sync
// with backend changes (ward names, future fields) without manual
// upkeep.
import type { SerializedTicket as ApiSerializedTicket } from '@/lib/serializers/ticket';
// The feedback prompt is a self-contained client island: it owns
// the submit / error state and calls POST /api/tickets/:id/feedback.
// Extracted into its own file so the detail page stays readable
// (and so the island has a clean place to document the contract).
import FeedbackPrompt from './feedback-prompt';
import type { FeedbackRating } from '@/lib/citizen/feedback-rating';

// Local shape is the citizen branch of the canonical serializer —
// the API only ever returns one branch at a time so the narrowing is
// structural. The trail status union is lifted out of the imported
// type so this file does not have to re-state it.
type SerializedTicket = ApiSerializedTicket;
type TicketStatus = SerializedTicket['status'];

const STATUS_ORDER: SerializedTicket['status'][] = [  'submitted',
  'routed',
  'in_progress',
  'resolved',
];

// The active UI language.
//
// This page used to hard-code `const LANG: Language = 'bn'` at module
// scope, so the ticket detail view was ALWAYS Bangla — a user who
// switched to English and opened one of their reports saw Bangla copy
// with English chrome around it.
//
// The language now comes from the shared `useLanguage()` hook, which
// reads the stored preference during the first render and subscribes
// to `cityfix:language-updated`. The module-scope constant is gone;
// `LANG` below is a per-render local so the thirty-odd call sites in
// this file stay readable.

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
      return { bg: 'var(--color-status-resolved-soft)', fg: 'var(--color-status-resolved)' };
    case 'routed':
      return { bg: 'var(--color-status-routed-soft)', fg: 'var(--color-status-routed)' };
    case 'in_progress':
      return { bg: 'var(--color-status-in-progress-soft)', fg: 'var(--color-status-in-progress)' };
    case 'submitted':
      return { bg: 'var(--color-primary-soft)', fg: 'var(--color-primary)' };
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

function timeAgoLabel(iso: string, lang: Language): string {
  const { value, unitKey } = timeAgoParts(iso);
  return `${value} ${t(unitKey as 'time.minutes_ago', null, lang)}`;
}

// Look up the human-readable category name for a ticket.
//
// The category name is denormalised ONTO the ticket by the backend
// (`getTicketWithTrail` joins `category` and the serializer exposes
// `categoryName` / `categoryNameBn` / `categorySlug` — see
// lib/serializers/ticket.ts). The page used to fetch the whole city
// category list from /api/report/bootstrap and look the id up
// client-side, but that endpoint is CITIZEN-ONLY, so on this shared
// surface it 403'd for every staff role and took the whole page down
// with it.
//
// Reading the name off the ticket is one fewer round-trip, works for
// every role, and cannot disagree with the ticket's own data.
//
// Bangla-first per project policy; falls back to the slug, then to a
// generic "Other" label if the category was deleted after the ticket
// was filed (the join then yields null).
function categoryLabel(ticket: SerializedTicket, lang: Language): string {
  const label =
    lang === 'bn'
      ? ticket.categoryNameBn ?? ticket.categoryName ?? ticket.categorySlug
      : ticket.categoryName ?? ticket.categorySlug;
  return label ?? t('category.other', null, lang);
}

export default function MyReportDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? '';

  // The shared hook owns the language. See the note above the removed
  // module-scope `LANG` constant for why this page used to be stuck
  // in Bangla.
  const { lang } = useLanguage();
  // A per-render alias so the copy below reads as `t(key, null, LANG)`
  // without a module-scope constant.
  const LANG = lang;

  const [ticket, setTicket] = useState<SerializedTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  // WO-002 — the rating the citizen has already given, if any.
  // Read from `GET /api/tickets/:id`'s top-level `feedback_rating`
  // field (the shared serializer contract is untouched). `null`
  // means the prompt is still open.
  const [feedbackRating, setFeedbackRating] = useState<FeedbackRating | null>(null);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);
  const [pendingDeleteIdx, setPendingDeleteIdx] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  /**
   * The signed-in role, from the shared `SessionProvider`.
   *
   * `/reports/:id` is a SHARED surface (see `CITIZEN_ONLY_SURFACES`
   * in lib/role-home.ts — `/report` is citizen-only, `/reports` is
   * not), so a dispatcher, crew member or admin may land here and
   * read the report. But two affordances on this page are
   * CITIZEN-ONLY writes, enforced server-side by
   * `requireRole(session, 'citizen')`:
   *
   *   - POST /api/tickets/:id/feedback      (the feel-heard rating)
   *   - DELETE /api/tickets/:id/photos/:idx (the photo delete)
   *
   * Rendering them for a staff viewer would offer a button that is
   * guaranteed to 401. The role gate below hides them instead.
   */
  const { session } = useSession();
  const role = session?.role ?? null;
  const isCitizen = role === 'citizen';

  // Guard against React strict mode double-mount racing the rate limiter.
  const fetchedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!id) return; // wait for useParams to resolve
    if (fetchedFor.current === id) return; // already fetched for this id
    fetchedFor.current = id;
    (async () => {
      // WHY THERE IS NO SEPARATE AUTH PROBE HERE
      // -----------------------------------------
      // This page used to gate itself on `GET /api/report/bootstrap`
      // — the REPORT FORM's bootstrap, which is deliberately
      // citizen-only:
      //
      //   if (session.role !== 'citizen') {
      //     return NextResponse.json({ error: 'citizen_only' }, { status: 403 });
      //   }
      //
      // It treated a non-OK response as "not signed in" and rendered
      // "You need to sign in to view this report." — so EVERY staff
      // role that opened a report was told to sign in, even though
      // `GET /api/tickets/:id` (below) authorizes them perfectly
      // well: staff are scoped by city + ward/department, citizens by
      // ownership.
      //
      // The ticket endpoint is the authority on whether this viewer
      // may see this ticket. It already distinguishes 401 (no
      // session) from 403 (a session, but not one that may see
      // this ticket), and `refresh()` below maps those onto
      // `authed === false` and the `forbidden` error respectively.
      // So there is exactly ONE authorization decision on this page,
      // and it is made by the endpoint that actually serves the data.
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
        // No session at all. This is the ONLY case that means "you
        // need to sign in" — a 403 means the session exists but is
        // not scoped to this ticket, which is a different message.
        setAuthed(false);
        return;
      }
      if (res.status === 403) {
        // A session, but this viewer may not see this ticket (a
        // citizen opening someone else's report, or a dispatcher
        // outside their ward / department).
        setAuthed(true);
        setError('forbidden');
        return;
      }
      if (res.status === 404) {
        setAuthed(true);
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
          setFeedbackRating(body.feedback_rating ?? null);
          setAuthed(true);
          return;
        }
        // Still rate-limited or otherwise failing; surface a transient
        // message rather than a permanent error.
        setAuthed(true);
        setError('rate_limited');
        return;
      }
      if (!res.ok) {
        setAuthed(true);
        setError(`failed (${res.status})`);
        return;
      }
      const body = await res.json();
      setTicket(body.ticket);
      setFeedbackRating(body.feedback_rating ?? null);
      setAuthed(true);
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
    return <TicketDetailSkeleton lang={LANG} />;
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
  // The serializer (lib/serializers/ticket.ts) ships the human-readable
  // ward name(s) joined in by the backend. The Bangla-first read per
  // project policy falls back to the English name, then to a generic
  // "Ward {id}" last resort so the citizen never sees a raw cuid.
  const wardLabel =
    ticket.wardNameBn || ticket.wardName || t('detail.ward.fallback', null, LANG);
  const createdRel = timeAgoLabel(ticket.createdAt, LANG);
  const resolvedRel = ticket.resolvedAt ? timeAgoLabel(ticket.resolvedAt, LANG) : null;
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
      // Re-fetch the canonical ticket so the new before/after split
      // (and any side effects on the trail) is reflected in the UI.
      // Cheaper than diffing locally and keeps the page in sync
      // with the serializer.
      await refresh();
    } finally {
      setDeletingIdx(null);
    }
  }

  function cancelDeletePhoto() {
    setPendingDeleteIdx(null);
    setDeleteError(null);
  }

  return (
    <div style={{ background: 'var(--color-surface-page)', minHeight: '100%' }}>
      {/* No page-level top bar: the global <AppHeader> is provided by
          the /reports/* layout's <AppShell> wrapper. The detail page
          lives directly under that header. */}

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
                {formatTicketId(ticket.id)}
              </span>
            </div>
            <h1
              lang={LANG}
              style={{
                margin: '0 0 var(--space-2)',
                fontSize: 'var(--text-h2)',
                lineHeight: 1.2,
              }}
            >
              {categoryLabel(ticket, LANG)}
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

          {/* The citizen's own description. The report flow collects
              a note ("অনুরোধ"), and the reporter must be able to read
              it back — otherwise the description they typed is
              accepted by the system and then never seen again, which
              reads as the report having been dropped. Rendered only
              when there IS a note so the card never shows an empty
              shell. */}
          {ticket.note && (
            <div
              data-testid="report-detail-description"
              style={{
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                marginBottom: 'var(--space-5)',
              }}
            >
              <div
                style={{
                  fontSize: 'var(--text-micro)',
                  color: 'var(--color-ink-tertiary)',
                  fontWeight: 'var(--weight-semibold)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {t('detail.section.description', null, LANG)}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {ticket.note}
              </p>
            </div>
          )}

          {/* Photo groups — Bolt 007-001.
              The Before group renders the citizen's own photos
              (the "evidence of the issue" set) with the per-photo
              delete affordance. The After group renders the crew's
              photos (the "evidence of the fix") without a delete
              affordance; it is hidden when empty. The legacy flat
              `photoUrls` grid is gone. */}
          {ticket.beforePhotoUrls.length + ticket.afterPhotoUrls.length > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              {/* Before group — always rendered, may show an empty
                  state when the citizen attached no photos. The
                  delete affordance is scoped to the citizen's own
                  photos (the page index `idx` matches the
                  `beforePhotoUrls` array index the DELETE handler
                  resolves against `uploadedByRole = 'citizen'`). */}
              <div
                style={{
                  fontSize: 'var(--text-micro)',
                  color: 'var(--color-ink-tertiary)',
                  fontWeight: 'var(--weight-semibold)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {t('photo.before', null, LANG)}
              </div>
              {ticket.beforePhotoUrls.length > 0 ? (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: 'var(--space-3)',
                  }}
                >
                  {ticket.beforePhotoUrls.map((url, idx) => (
                    <div
                      key={`before-${idx}`}
                      style={{
                        position: 'relative',
                        aspectRatio: '4 / 3',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        border: '1px solid var(--color-border)',
                        background:
                          thumbnailBackground(url) ??
                          'var(--color-surface-raised)',
                      }}
                    >
                      {isCitizen && (
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
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-surface-raised)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-ink-secondary)',
                    fontSize: 'var(--text-caption)',
                  }}
                >
                  {t('photo.emptyBefore', null, LANG)}
                </div>
              )}

              {/* After group — hidden entirely when empty so a
                  not-yet-resolved ticket does not draw a labelled
                  empty state. No delete affordance (the citizen did
                  not upload these photos). */}
              {ticket.afterPhotoUrls.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <div
                    style={{
                      fontSize: 'var(--text-micro)',
                      color: 'var(--color-ink-tertiary)',
                      fontWeight: 'var(--weight-semibold)',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    {t('photo.after', null, LANG)}
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: 'var(--space-3)',
                    }}
                  >
                    {ticket.afterPhotoUrls.map((url, idx) => (
                      <div
                        key={`after-${idx}`}
                        style={{
                          position: 'relative',
                          aspectRatio: '4 / 3',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          border: '1px solid var(--color-border)',
                          background:
                          thumbnailBackground(url) ??
                          'var(--color-surface-raised)',
                        }}
                        role="img"
                        aria-label={t('photo.after', null, LANG)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {deleteError && (
                <div
                  role="alert"
                  style={{
                    marginTop: 'var(--space-3)',
                    padding: 'var(--space-3)',
                    background: 'var(--color-warning-soft)',
                    border: '1px solid var(--color-warning)',
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
              background: 'var(--color-surface-card)',
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
                              ? 'var(--color-status-resolved)'
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
                            ? 'var(--color-status-resolved)'
                            : stepClass === 'current'
                              ? 'var(--color-primary)'
                              : 'var(--color-surface-raised)',
                        color:
                          stepClass !== 'pending'
                            ? 'var(--color-on-primary)'
                            : 'var(--color-ink-tertiary)',
                        fontSize: 'var(--text-micro)',
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
                        lang={LANG}
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
                        {timeAgoLabel(entry.timestamp, LANG)} · {entry.actorLabel}
                      </div>
                      {entry.note && (
                        <div
                          lang={LANG}
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
              background: 'var(--color-surface-card)',
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
                value={categoryLabel(ticket, LANG)}
                lang={LANG}
              />
              <MetaCell label={t('detail.meta.ward', null, LANG)} value={wardLabel} lang={LANG} />
              <MetaCell
                label={t('detail.meta.sla', null, LANG)}
                value={t('detail.meta.sla_value', null, LANG)}
                lang={LANG}
              />
              <MetaCell
                label={t('detail.meta.resolution', null, LANG)}
                value={resolutionDays ? `${resolutionDays} ${t('time.days_ago', null, LANG)}` : '—'}
                lang={LANG}
              />
            </div>
          </div>

          {ticket.status === 'resolved' && isCitizen && (
            <div
              style={{
                background: 'var(--color-primary-soft)',
                border: '1px solid var(--color-border)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <div
                lang={LANG}
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
              {/* PLAT-REQ-006 / feel-heard: the rating is PERSISTED
                  (POST /api/tickets/:id/feedback → `Ticket.feedback`),
                  which is what the admin adoption funnel and the
                  dispatcher crew table read. The prompt owns the
                  optimistic UI and reconciles it with the server
                  response. */}
              <FeedbackPrompt
                ticketId={ticket.id}
                initialRating={feedbackRating}
                onDispute={() => router.push(`/reports/${ticket.id}/dispute`)}
              />
              {resolvedRel && (
                <div
                  style={{
                    marginTop: 'var(--space-3)',
                    fontSize: 'var(--text-micro)',
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
              background: 'var(--color-surface-card)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              maxWidth: 400,
              width: '90%',
              boxShadow: 'var(--shadow-modal)',
            }}
          >
            <h2
              id="photo-delete-title"
              lang={LANG}
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
                  background: 'var(--color-surface-card)',
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
                  background: 'var(--color-danger)',
                  color: 'var(--color-on-danger)',
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

function MetaCell({ label, value, lang }: { label: string; value: string; lang: Language }) {
  return (
    <div>
      <div
        style={{
          fontSize: 'var(--text-micro)',
          color: 'var(--color-ink-tertiary)',
          fontWeight: 'var(--weight-semibold)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        lang={lang}
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
