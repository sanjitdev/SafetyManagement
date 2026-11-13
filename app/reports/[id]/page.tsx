/**
 * 1.12 Report — My Reports Detail (mockup 16).
 *
 * Intent 009 / Unit 004 — citizen surface re-composition.
 *
 * WHAT CHANGED (presentation only)
 * --------------------------------
 * The page now matches mockup 16:
 *
 *   - The HERO carries the PUBLIC ticket code as a pill (with an
 *     icon), the category title, the ward + age line, and the status
 *     pill. The internal id never reaches the DOM.
 *   - The status trail is the `Timeline` primitive — an ordered list
 *     where EVERY step carries an ICON and a TIMESTAMP, so the state
 *     of the report is readable without colour and without a legend.
 *     The four steps are the locked status order:
 *     `submitted → routed → in_progress → resolved`.
 *   - The photos are TWO LABELLED GROUPS — "আগে" (Before, the
 *     citizen's own photos) and "পরে" (After, the crew's photos).
 *     Each group has a visible label AND a hint line; each tile
 *     repeats its own label so a cropped tile still says which side
 *     of the split it belongs to.
 *   - Every interactive element is a design-system primitive. The
 *     hand-rolled `<button>`s (photo delete, modal cancel/confirm)
 *     are now `IconButton` / `Button`, and the hand-rolled modal is
 *     now the `Modal` primitive (a native `<dialog>`, so the rest of
 *     the page is inert while it is open).
 *
 * WHAT DID NOT CHANGE
 * -------------------
 * The API surface, the role model and the transports are byte-
 * identical: the page still reads `GET /api/tickets/:id`, still
 * renders the serializer's output, and still calls the same two
 * citizen-only mutations (`DELETE .../photos/:idx` and the feedback
 * POST, the latter still owned by the `FeedbackPrompt` island).
 *
 * ON THE TRAIL
 * ------------
 * The serializer gives the trail as a list of TRANSITIONS (each with
 * a `toStatus`, a timestamp, an actor label and an optional note).
 * Mockup 16 shows the four canonical STEPS, not the transitions —
 * a report that was filed and routed shows "submitted" and "routed"
 * as done, "in progress" as upcoming, "resolved" as upcoming.
 *
 * So the trail is built from the CANONICAL step order, and each
 * step is matched to the transition that produced it. A step with no
 * matching transition is "upcoming" and shows an estimate instead of
 * a timestamp — because a future step has no timestamp yet, and
 * inventing one would be a lie.
 *
 * The step that is CURRENT is the one the ticket's own status names.
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTicketId } from '@/lib/format/ticket-id';
import { formatTimestamp } from '@/lib/format/datetime';
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
import {
  Button,
  IconButton,
  Modal,
  StatusPill,
  Timeline,
  type StatusKey,
  type TimelineItem,
} from '@/components/ui';
import { ICONS } from '@/lib/ui/icon-map';

// Local shape is the citizen branch of the canonical serializer —
// the API only ever returns one branch at a time so the narrowing is
// structural. The trail status union is lifted out of the imported
// type so this file does not have to re-state it.
type SerializedTicket = ApiSerializedTicket;
type TicketStatus = SerializedTicket['status'];

/**
 * The LOCKED four-step status order.
 *
 * This is the order the trail renders and the order a citizen reads
 * progress in: filed → routed → work started → fixed. It is the same
 * order the report flow's own step indicator uses for its statuses,
 * and the same order the mockup shows.
 */
const TRAIL_STEPS = ['submitted', 'routed', 'in_progress', 'resolved'] as const;
type TrailStep = (typeof TRAIL_STEPS)[number];

const STATUS_TITLES_KEY: Record<TicketStatus, string> = {
  submitted: 'trail.submitted',
  routed: 'trail.routed',
  in_progress: 'trail.in_progress',
  resolved: 'trail.resolved',
  closed: 'trail.closed',
  cancelled: 'trail.cancelled',
};

/**
 * The icon that gives each trail step its SHAPE.
 *
 * A trail that distinguishes its steps by hue alone is unreadable to
 * a colour-blind user and unreadable in a greyscale printout, so the
 * icon is mandatory — the `Timeline` primitive requires it.
 */
const TRAIL_STEP_ICON: Record<TrailStep, (typeof ICONS)[keyof typeof ICONS]> = {
  submitted: ICONS.statusSubmitted,
  routed: ICONS.statusRouted,
  in_progress: ICONS.statusInProgress,
  resolved: ICONS.statusResolved,
};

/**
 * The status pill key for a ticket status.
 *
 * `StatusPill` carries the icon + word + colour triple, so a status
 * is never colour-alone. The ticket status enum and the pill's key
 * union overlap exactly, so the cast is safe.
 */
function statusPillKey(status: TicketStatus): StatusKey {
  return status as StatusKey;
}

function timeAgoParts(iso: string): { value: number; unitKey: string } {
  const now = Date.now();
  const at = new Date(iso).getTime();
  const ms = Math.max(0, now - at);
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

  /**
   * The four trail steps, built from the canonical order.
   *
   * A step is "done" when the ticket has passed it, "current" when
   * the ticket's own status names it, and "upcoming" otherwise. Each
   * step carries the transition that produced it (for its timestamp
   * and note); a step with no transition shows the SLA estimate
   * instead, because a future step has no timestamp yet.
   */
  const trailItems = useMemo<TimelineItem[]>(() => {
    if (!ticket) return [];
    const currentIdx = TRAIL_STEPS.indexOf(
      (ticket.status === 'closed' || ticket.status === 'cancelled'
        ? 'resolved'
        : ticket.status) as TrailStep,
    );
    const transitionFor = (step: TrailStep) =>
      ticket.trail.find((entry) => entry.toStatus === step);

    return TRAIL_STEPS.map((step, idx) => {
      const transition = transitionFor(step);
      const state: TimelineItem['state'] =
        currentIdx < 0
          ? 'upcoming'
          : idx < currentIdx
            ? 'done'
            : idx === currentIdx
              ? 'current'
              : 'upcoming';

      const IconEntry = TRAIL_STEP_ICON[step];
      const icon = (
        <IconEntry.icon
          size={14}
          weight={IconEntry.weight}
          aria-hidden
          focusable="false"
        />
      );

      // The detail line. A step that HAS happened carries its clock
      // time and its actor; a step that has NOT yet happened carries
      // the estimate. The actor label comes from the serializer, which
      // anonymises internal actors for citizens ("সিটি কর্পোরেশন").
      const detail = transition
        ? `${formatTimestamp(transition.timestamp, LANG)} · ${transition.actorLabel}`
        : t('detail.trail.pending', null, LANG);

      return {
        key: step,
        title: t(STATUS_TITLES_KEY[step] as 'trail.submitted', null, LANG),
        detail,
        state,
        icon,
        aside: transition?.note ? (
          // The `Timeline` primitive renders `aside` INSIDE the step's
          // body column, as a block under the timestamp — matching the
          // mockup's `.trail-note` inside `.trail-body`.
          //
          // It used to be a flex sibling with `flex: '1 0 100%'` to
          // push it onto its own line. The row does not wrap, so that
          // basis collapsed the body column to width 0 and the
          // timestamp wrapped one word per line.
          <span
            lang={LANG}
            style={{
              display: 'block',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              fontStyle: 'italic',
            }}
          >
            “{transition.note}”
          </span>
        ) : null,
      };
    });
  }, [ticket, LANG]);

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
          {/* The HERO. Mockup 16: the ticket-code pill, the title,
              the ward + age line, then the meta row (status pill,
              ward, department). */}
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <span
              data-testid="report-detail-code"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: 'var(--space-1) var(--space-3)',
                background: 'var(--color-primary-soft)',
                color: 'var(--color-primary)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <ICONS.verified.icon
                size={13}
                weight={ICONS.verified.weight}
                aria-hidden
              />
              <strong>{formatTicketId(ticket.id)}</strong>
            </span>
            <h1
              lang={LANG}
              style={{
                margin: '0 0 var(--space-2)',
                // Mockup 16's hero H1 is `--text-h1` (24px).
                fontSize: 'var(--text-h1)',
                lineHeight: 1.2,
              }}
            >
              {categoryLabel(ticket, LANG)}
            </h1>
            <p
              lang={LANG}
              style={{
                margin: '0 0 var(--space-3)',
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {wardLabel} · {createdRel} {t('time.filed', null, LANG)}
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
              }}
            >
              <StatusPill
                status={statusPillKey(ticket.status)}
                lang={LANG}
                size="md"
              />
              <span
                lang={LANG}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                <ICONS.mapPin.icon
                  size={12}
                  weight={ICONS.mapPin.weight}
                  aria-hidden
                />
                {wardLabel}
              </span>
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
              <h2
                style={{
                  // A real section heading, not an uppercase
                  // micro-label: the mockup 16 `.section-title`
                  // uses `--text-h2` (20px) in the body colour, and
                  // a `<h2>` gives assistive tech the document
                  // outline the label never provided.
                  fontSize: 'var(--text-h2)',
                  color: 'var(--color-ink)',
                  margin: '0 0 var(--space-2)',
                  lineHeight: 'var(--leading-tight)',
                  letterSpacing: 'var(--tracking-tight)',
                }}
              >
                {t('detail.section.description', null, LANG)}
              </h2>
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

          {/* The TWO LABELLED PHOTO GROUPS.
              The Before group renders the citizen's own photos (the
              "evidence of the issue" set) with the per-photo delete
              affordance. The After group renders the crew's photos
              (the "evidence of the fix") without a delete affordance;
              it is hidden when empty.

              Each group has a LABEL ("আগে" / "পরে") and a hint line,
              and each tile repeats its own label — so a cropped tile
              still says which side of the split it belongs to. */}
          {ticket.beforePhotoUrls.length + ticket.afterPhotoUrls.length > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              {/* Before group — always rendered, may show an empty
                  state when the citizen attached no photos. The
                  delete affordance is scoped to the citizen's own
                  photos (the page index `idx` matches the
                  `beforePhotoUrls` array index the DELETE handler
                  resolves against `uploadedByRole = 'citizen'`). */}
              <div
                data-testid="report-detail-photos-before"
                style={{ marginBottom: 'var(--space-4)' }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    marginBottom: 'var(--space-2)',
                  }}
                >
                  <span
                    lang={LANG}
                    style={{
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    {t('detail.photos.before_title', null, LANG)}
                  </span>
                  <span
                    lang={LANG}
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-ink-tertiary)',
                    }}
                  >
                    {t('detail.photos.before_hint', null, LANG)}
                  </span>
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
                      <figure
                        key={`before-${idx}`}
                        style={{
                          position: 'relative',
                          margin: 0,
                          aspectRatio: '4 / 3',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          border: '1px solid var(--color-border)',
                          background:
                            thumbnailBackground(url) ??
                            'var(--color-surface-raised)',
                        }}
                      >
                        {/* The photo itself is the image. It is a
                            `role="img"` SPAN rather than an `<img>`
                            because the tile is painted with a
                            `background` shorthand; the span carries
                            the accessible name.
                            The role sits on THIS element and NOT on
                            the `<figure>`, because the figure also
                            holds the delete button — a `role="img"`
                            ancestor would hide that button from
                            assistive tech. */}
                        <span
                          role="img"
                          lang={LANG}
                          aria-label={t('detail.photos.before_title', null, LANG)}
                          style={{
                            position: 'absolute',
                            inset: 0,
                            backgroundImage: `url("${url}")`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        />
                        <span
                          lang={LANG}
                          style={{
                            position: 'absolute',
                            top: 'var(--space-2)',
                            left: 'var(--space-2)',
                            zIndex: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--space-1)',
                            padding: 'var(--space-1) var(--space-2)',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--color-surface-card)',
                            color: 'var(--color-ink-secondary)',
                            fontSize: 'var(--text-micro)',
                            fontWeight: 'var(--weight-semibold)',
                          }}
                        >
                          {t('detail.photos.before_title', null, LANG)}
                        </span>
                        {isCitizen && (
                          // The `IconButton` primitive renders a wrapper
                          // `<span>` around the button, so the absolute
                          // positioning belongs on a container THIS
                          // page owns — otherwise the wrapper would sit
                          // in the normal flow and the button would
                          // overlay the wrong tile.
                          <span
                            style={{
                              position: 'absolute',
                              top: 'var(--space-2)',
                              right: 'var(--space-2)',
                              zIndex: 1,
                            }}
                          >
                            <IconButton
                              label={t('detail.photos.remove', null, LANG)}
                              icon={
                                <ICONS.remove.icon
                                  size={16}
                                  weight={ICONS.remove.weight}
                                  aria-hidden
                                  focusable="false"
                                />
                              }
                              variant="danger"
                              size="sm"
                              onClick={() => handleDeletePhoto(idx)}
                              disabled={deletingIdx === idx}
                              data-testid={`report-detail-photo-remove-${idx}`}
                              style={{
                                // The visible control is painted at
                                // 44px (the touch-target floor)
                                // rather than the primitive's 32px
                                // `sm`. The primitive sizes the
                                // BUTTON to the floor on its own, so
                                // this override only changes how the
                                // control LOOKS.
                                width: 'var(--touch-min)',
                                height: 'var(--touch-min)',
                              }}
                            />
                          </span>
                        )}
                      </figure>
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
                    {t('detail.photos.before_empty', null, LANG)}
                  </div>
                )}
              </div>

              {/* After group — hidden entirely when empty so a
                  not-yet-resolved ticket does not draw a labelled
                  empty state. No delete affordance (the citizen did
                  not upload these photos). */}
              {ticket.afterPhotoUrls.length > 0 && (
                <div data-testid="report-detail-photos-after">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      marginBottom: 'var(--space-2)',
                    }}
                  >
                    <span
                      lang={LANG}
                      style={{
                        fontSize: 'var(--text-body-sm)',
                        fontWeight: 'var(--weight-semibold)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {t('detail.photos.after_title', null, LANG)}
                    </span>
                    <span
                      lang={LANG}
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--color-ink-tertiary)',
                      }}
                    >
                      {t('detail.photos.after_hint', null, LANG)}
                    </span>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                      gap: 'var(--space-3)',
                    }}
                  >
                    {ticket.afterPhotoUrls.map((url, idx) => (
                      <figure
                        key={`after-${idx}`}
                        style={{
                          position: 'relative',
                          margin: 0,
                          aspectRatio: '4 / 3',
                          borderRadius: 'var(--radius-md)',
                          overflow: 'hidden',
                          border: '1px solid var(--color-border)',
                          background:
                            thumbnailBackground(url) ??
                            'var(--color-surface-raised)',
                        }}
                        role="img"
                        aria-label={t('detail.photos.after_title', null, LANG)}
                      >
                        <span
                          lang={LANG}
                          style={{
                            position: 'absolute',
                            top: 'var(--space-2)',
                            left: 'var(--space-2)',
                            zIndex: 1,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--space-1)',
                            padding: 'var(--space-1) var(--space-2)',
                            borderRadius: 'var(--radius-pill)',
                            background: 'var(--color-surface-card)',
                            color: 'var(--color-ink-secondary)',
                            fontSize: 'var(--text-micro)',
                            fontWeight: 'var(--weight-semibold)',
                          }}
                        >
                          {t('detail.photos.after_title', null, LANG)}
                        </span>
                      </figure>
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

          {/* The status trail — the `Timeline` primitive. Every step
              carries an icon AND a timestamp, so the state of the
              report is readable without colour. */}
          <div
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
            }}
          >
            <h2
              style={{
                // Real section heading — mockup 16's `.section-title`
                // is `--text-h2` (20px) in the body colour, and the
                // `<h2>` gives assistive tech the document outline
                // an uppercase micro-label never provided.
                fontSize: 'var(--text-h2)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-4)',
                lineHeight: 'var(--leading-tight)',
                letterSpacing: 'var(--tracking-tight)',
              }}
            >
              {t('detail.section.progress', null, LANG)}
            </h2>
            <Timeline
              items={trailItems}
              ariaLabel={t('detail.trail.label', null, LANG)}
              lang={LANG}
              data-testid="report-detail-trail"
            />
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

      {/* Photo-delete confirmation — the `Modal` primitive (a native
          `<dialog>`, so the page behind it is inert while it is open
          and Escape closes it). */}
      <Modal
        open={pendingDeleteIdx != null}
        onClose={cancelDeletePhoto}
        title={t('detail.photo.delete_confirm', null, LANG)}
        lang={LANG}
        closeLabel={t('common.cancel', null, LANG)}
        data-testid="report-detail-photo-delete-modal"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={cancelDeletePhoto}
              data-testid="report-detail-photo-delete-cancel"
            >
              {t('detail.photos.remove_no', null, LANG)}
            </Button>
            <Button
              variant="danger"
              onClick={confirmDeletePhoto}
              data-testid="report-detail-photo-delete-confirm"
            >
              {t('detail.photos.remove_yes', null, LANG)}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, fontSize: 'var(--text-body-sm)', color: 'var(--color-ink-secondary)' }}>
          {t('detail.photo.delete_aria', null, LANG)}
        </p>
      </Modal>
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
          marginTop: 'var(--space-1)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--color-ink)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
