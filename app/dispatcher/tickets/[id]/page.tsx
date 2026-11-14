/**
 * Dispatcher ticket detail (/dispatcher/tickets/[id]).
 *
 * DISP-003 + DISP-004 + DISP-005 (Intent 003, Unit 003):
 * the dispatcher's per-ticket work surface.
 *
 * Renders:
 *   - The full ticket record (all fields, incl.
 *     `internalNote`, `assignedCrewId`, real `actorId` on
 *     trail entries).
 *   - The status trail (every entry with real `actorId`).
 *   - The photo gallery.
 *   - The transition buttons — one per valid `toStatus`
 *     allowed by `lib/platform/transitions.ts` from the
 *     ticket's current status, intersected with the
 *     dispatcher's allowed transitions
 *     (['routed', 'cancelled']).
 *   - The reassign UI (ward + category dropdowns).
 *   - The internal note textarea.
 *   - A "View dedup flag" link if the ticket is the subject of
 *     a pending dedup flag (Unit 004's deliverable).
 *
 * Out-of-scope ticket id → 404 page (not 403). The dispatcher
 * cannot probe ticket existence outside their scope.
 *
 * No polling: the page renders the latest snapshot and
 * requires the dispatcher to re-fetch (reload / back / open
 * the page again) to see updates. v1.1 may add WebSocket /
 * SSE.
 *
 * The PATCH endpoint handles reassign + internalNote in one
 * call. The note is saved only when there is a diff; the
 * reassign is saved only when one of the dropdowns changes.
 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTicketId } from '@/lib/format/ticket-id';
import { formatTimestampShort as formatTimestamp } from '@/lib/format/datetime';
import { thumbnailBackground } from '@/lib/format/photo-url';
import { StatusPill } from '@/components/ui/StatusPill';
import { Combobox } from '@/components/ui/Combobox';
import { SlaCountdown } from '@/components/ui/SlaCountdown';
import type { SlaState, SlaTone } from '@/lib/dispatcher/sla';
import { useLanguage } from '@/components/useLanguage';
import { TicketDetailSkeleton } from '@/components/ui/Skeleton';
import {
  displayNameFor,
  categoryLabelBySlug,
} from '@/lib/identity/display-name';


type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface TrailEntry {
  toStatus: TicketStatus;
  actorLabel: string;
  actorId?: string;
  /** The actor's display name, joined server-side. */
  actorName?: string | null;
  actorRole?: 'citizen' | 'dispatcher' | 'crew' | 'admin';
  note: string | null;
  timestamp: string;
}

interface TicketDetail {
  id: string;
  status: TicketStatus;
  cityId: string;
  cityName?: string | null;
  cityNameBn?: string | null;
  wardId: string;
  wardName?: string | null;
  wardNameBn?: string | null;
  categoryId: string;
  /**
   * The category's localized display names, joined server-side.
   *
   * `categoryId` alone is not labelable on the client — it is
   * backend-specific (`cat_streetlight` in the dev store, a CUID on
   * Postgres), so without these the page printed the raw id.
   */
  categoryName?: string | null;
  categoryNameBn?: string | null;
  categorySlug?: string | null;
  locationLat: number;
  locationLng: number;
  locationLabel: string | null;
  note: string | null;
  /**
   * Bolt 007-001 wire shape — the dispatcher server
   * returns both the legacy un-split `photoUrls` (for
   * back-compat with v1 consumers) and the split view
   * (`beforePhotoUrls` for citizen photos, `afterPhotoUrls`
   * for crew photos). The page renders the split view
   * with role labels so the dispatcher can immediately
   * see which photos the citizen uploaded vs. which the
   * crew uploaded.
   */
  beforePhotoUrls: string[];
  afterPhotoUrls: string[];
  photoUrls: string[];
  reporterId: string;
  reporterName?: string | null;
  assignedCrewId: string | null;
  assignedCrewName?: string | null;
  internalNote: string | null;
  createdAt: string;
  /**
   * Bolt 009-005 — the resolved SLA.
   *
   * The tone is resolved on the SERVER and travels with the
   * ticket. The browser does not re-derive it: a client copy of
   * the warning-band rule would drift from the server's, and the
   * client does not hold the absolute deadline at render time the
   * way the server did.
   *
   * `slaTone: null` means "nothing was promised" (the category
   * has no policy) — which is NOT the same as `not_started`, and
   * certainly not the same as `on_track`.
   */
  slaTone: SlaTone | null;
  slaTargetHours: number | null;
  slaRemainingHours: number | null;
  slaStartedAt: string | null;
  slaDueAt: string | null;
  /** Set once the ticket is resolved; the chip reports "met" or "missed". */
  resolvedAt: string | null;
  trail: TrailEntry[];
}

const TRANSITIONS_BY_FROM: Record<TicketStatus, TicketStatus[]> = {
  submitted: ['routed', 'cancelled'],
  routed: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  closed: [],
  cancelled: [],
};

const DISPATCHER_ALLOWED = ['routed', 'cancelled'] as const;

/**
 * Bolt 009-005 — the reassign panel's options.
 *
 * These used to be two hard-coded constants in this file. That was
 * wrong three times over: the lists were a snapshot rather than the
 * truth (the dev store seeds 2 wards, real Postgres 50), they
 * were not scoped to the dispatcher's city (so every cross-city
 * option was a choice guaranteed to be refused with a 403), and
 * they were not scoped to the dispatcher's ward.
 *
 * They are now read from `GET /api/v1/dispatcher/reassign-options`,
 * which reads them from the store and narrows them. Until that
 * response arrives the panel shows nothing rather than a stale
 * list — a list that turns out to be wrong is worse than no list.
 */
interface ReassignWardOption {
  id: string;
  number: number;
  name: string | null;
  nameBn: string | null;
}

interface ReassignCategoryOption {
  id: string;
  name: string;
  nameBn: string | null;
}

export default function DispatcherTicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { lang, setLang } = useLanguage();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [transitionInFlight, setTransitionInFlight] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignWardId, setReassignWardId] = useState('');
  const [reassignCategoryId, setReassignCategoryId] = useState('');
  // Bolt 009-005 — the reassign options come from the API, not
  // from a constant baked into this file.
  const [reassignWards, setReassignWards] = useState<ReassignWardOption[]>([]);
  const [reassignCategories, setReassignCategories] = useState<
    ReassignCategoryOption[]
  >([]);
  const [reassignInFlight, setReassignInFlight] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [internalNoteDraft, setInternalNoteDraft] = useState('');
  const [internalNoteInFlight, setInternalNoteInFlight] = useState(false);
  const [internalNoteError, setInternalNoteError] = useState<string | null>(null);
  // Bolt 007-002 — dispatcher crew picker. `crewOptions` is the
  // list returned by `/api/v1/dispatcher/...` (a new sibling
  // shape — see the route file for the contract); `assignDraft`
  // is the working selection in the dropdown. `assignInFlight`
  // disables the Save button while the POST is pending.
  //
  // The load fields (`activeCount`, `capacityLimit`, `atCapacity`)
  // let the picker show how busy each crew member is and refuse to
  // offer one who is already at capacity. The picker is a HINT —
  // the assign endpoint re-checks the capacity, so a stale picker
  // cannot produce an over-capacity assignment.
  const [crewOptions, setCrewOptions] = useState<
    Array<{
      id: string;
      name: string;
      activeCount: number;
      capacityLimit: number;
      atCapacity: boolean;
    }>
  >([]);
  const [assignDraft, setAssignDraft] = useState<string>('');
  const [assignInFlight, setAssignInFlight] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignSuccess, setAssignSuccess] = useState<boolean>(false);

  useEffect(() => {
    function syncLang() {
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

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/dispatcher/tickets/${encodeURIComponent(id)}`, {
        credentials: 'include',
      });
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setReassignWardId(data.ticket.wardId);
      setReassignCategoryId(data.ticket.categoryId);
      setInternalNoteDraft(data.ticket.internalNote ?? '');
      // Bolt 007-002: sync the assign picker to the current
      // `assignedCrewId` so the dropdown reflects the saved
      // state on every refresh (assign, clear, page reload).
      setAssignDraft(data.ticket.assignedCrewId ?? '');
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [id]);

  // Bolt 007-002: fetch the crew list for the ticket's ward.
  // The picker is ward-scoped AND department-scoped: the ticket's
  // category decides its department, and only crew in that
  // department can actually work the ticket. Offering a
  // roads-drainage crew member on a streetlight ticket produced an
  // assignment that vanished from that member's list. We re-fetch
  // when the ticket's ward or category changes.
  const fetchCrew = useCallback(async (wardId: string, categoryId?: string) => {
    if (!wardId) {
      setCrewOptions([]);
      return;
    }
    try {
      const params = new URLSearchParams({ wardId });
      if (categoryId) params.set('categoryId', categoryId);
      const res = await fetch(
        `/api/v1/dispatcher/crew-for-ward?${params.toString()}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        setCrewOptions([]);
        return;
      }
      const data = (await res.json()) as {
        crew: Array<{
          id: string;
          name: string;
          activeCount: number;
          capacityLimit: number;
          atCapacity: boolean;
        }>;
      };
      setCrewOptions(data.crew);
    } catch {
      setCrewOptions([]);
    }
  }, []);

  useEffect(() => {
    void fetchTicket();
  }, [fetchTicket]);

  useEffect(() => {
    if (ticket?.wardId) void fetchCrew(ticket.wardId, ticket.categoryId);
  }, [ticket?.wardId, ticket?.categoryId, fetchCrew]);

  // Bolt 009-005 — the reassign panel's option lists.
  //
  // Fetched once on mount rather than when the panel opens: the
  // list is small, and the panel should be usable the instant it
  // opens. A failure leaves both lists EMPTY — the panel then
  // shows a note saying there is nothing to pick, which is honest.
  // A hard-coded fallback list would be a list of choices that
  // might not exist.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/dispatcher/reassign-options', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          wards: ReassignWardOption[];
          categories: ReassignCategoryOption[];
        };
        if (cancelled) return;
        setReassignWards(data.wards);
        setReassignCategories(data.categories);
      } catch {
        // Leave the lists empty; the panel renders a note.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const validTransitions = useMemo(() => {
    if (!ticket) return [];
    const from = TRANSITIONS_BY_FROM[ticket.status];
    return from.filter((t) =>
      (DISPATCHER_ALLOWED as readonly string[]).includes(t),
    );
  }, [ticket]);

  /**
   * Bolt 009-005 — the SLA chip's state.
   *
   * The SERVER resolved the tone; the page only assembles the
   * state object from the fields the response carries. The page
   * does not compute the tone — if it did, the warning band would
   * exist in two places and the copies would drift.
   *
   * `null` (no chip at all) when the server reported no tone: the
   * category has no policy, so there is no promise to be on time
   * against, and a chip saying "on track" would be a lie.
   */
  const detailSlaState: SlaState | null = useMemo(() => {
    if (!ticket?.slaTone) return null;
    return {
      tone: ticket.slaTone,
      remainingHours: ticket.slaRemainingHours ?? 0,
      targetHours: ticket.slaTargetHours ?? null,
      startedAt: ticket.slaStartedAt ?? null,
      dueAt: ticket.slaDueAt ?? null,
    };
  }, [
    ticket?.slaTone,
    ticket?.slaRemainingHours,
    ticket?.slaTargetHours,
    ticket?.slaStartedAt,
    ticket?.slaDueAt,
  ]);

  const transitionLabel = (toStatus: TicketStatus): string =>
    `dispatcher.transition.${toStatus}`;

  const onTransition = async (toStatus: TicketStatus) => {
    setTransitionError(null);
    setTransitionInFlight(toStatus);
    try {
      const res = await fetch(
        `/api/v1/dispatcher/tickets/${encodeURIComponent(id)}/transition`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStatus }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setTransitionError(body.error ?? 'transition_failed');
        setTransitionInFlight(null);
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setTransitionInFlight(null);
    } catch {
      setTransitionError('transition_failed');
      setTransitionInFlight(null);
    }
  };

  const onSaveReassign = async () => {
    if (!ticket) return;
    setReassignError(null);
    setReassignInFlight(true);
    try {
      const res = await fetch(
        `/api/v1/dispatcher/tickets/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wardId: reassignWardId,
            categoryId: reassignCategoryId,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setReassignError(body.error ?? 'reassign_failed');
        setReassignInFlight(false);
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setReassignOpen(false);
      setReassignInFlight(false);
    } catch {
      setReassignError('reassign_failed');
      setReassignInFlight(false);
    }
  };

  const onSaveNote = async () => {
    if (!ticket) return;
    setInternalNoteError(null);
    setInternalNoteInFlight(true);
    try {
      const res = await fetch(
        `/api/v1/dispatcher/tickets/${encodeURIComponent(id)}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ internalNote: internalNoteDraft }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setInternalNoteError(body.error ?? 'note_save_failed');
        setInternalNoteInFlight(false);
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setInternalNoteInFlight(false);
    } catch {
      setInternalNoteError('note_save_failed');
      setInternalNoteInFlight(false);
    }
  };

  // Bolt 007-002: dispatcher crew picker save handler. POST
  // the chosen crew id (or `null` to clear). On success, the
  // ticket snapshot is refreshed so the record list's read-only
  // `assignedCrewId` row updates without a page reload; the
  // picker's selected option is also re-synced.
  const onSaveAssign = async () => {
    if (!ticket) return;
    setAssignError(null);
    setAssignSuccess(false);
    setAssignInFlight(true);
    try {
      const res = await fetch(
        `/api/v1/dispatcher/tickets/${encodeURIComponent(id)}/assign-crew`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          // '' is the placeholder ("Unassigned"). Normalise to
          // `null` for the wire — the Zod schema rejects empty
          // strings on the read side, so this is the contract.
          body: JSON.stringify({
            assignedCrewId: assignDraft === '' ? null : assignDraft,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Map the server-side error codes to localized copy
        // for the picker (the record list has no picker-side
        // error display). Anything else falls back to the
        // generic save_failed key.
        const errorKey =
          body.error === 'cross_ward_access_denied'
            ? 'dispatcher.assignCrew.error.cross_ward'
            : body.error === 'not_found'
              ? 'dispatcher.assignCrew.error.not_found'
              : body.error === 'crew_at_capacity'
                ? 'dispatcher.assignCrew.error.at_capacity'
                : body.error === 'concurrent_write'
                  ? 'dispatcher.assignCrew.error.concurrent'
                  : 'dispatcher.assignCrew.error.save_failed';
        setAssignError(t(errorKey, null, lang));
        setAssignInFlight(false);
        // The crew list is now stale — this crew member's load
        // changed. Re-fetch so the picker's load counts and the
        // disabled options reflect reality.
        if (body.error === 'crew_at_capacity') {
          void fetchCrew(ticket.wardId, ticket.categoryId);
        }
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setAssignDraft(data.ticket.assignedCrewId ?? '');
      setAssignSuccess(true);
      setAssignInFlight(false);
      // The assigned crew member's load just changed. Re-fetch so
      // the picker's counts stay honest.
      void fetchCrew(ticket.wardId, ticket.categoryId);
    } catch {
      setAssignError(t('dispatcher.assignCrew.error.save_failed', null, lang));
      setAssignInFlight(false);
    }
  };

  if (notFound) {
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
        <h1
          lang={lang}
          style={{ fontSize: 'var(--text-h1)', marginBottom: 'var(--space-3)' }}
        >
          404
        </h1>
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-body-lg)',
            color: 'var(--color-ink-secondary)',
          }}
        >
          {t('dispatcher.detail.not_found', null, lang)}
        </p>
        <Link
          href="/dispatcher"
          style={{
            display: 'inline-block',
            marginTop: 'var(--space-5)',
            padding: 'var(--space-3) var(--space-5)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            borderRadius: 'var(--radius-md)',
            textDecoration: 'none',
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {t('dispatcher.detail.back_to_queue', null, lang)}
        </Link>
      </div>
    );
  }

  if (loading || !ticket) {
    return <TicketDetailSkeleton lang={lang} />;
  }

  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="dispatcher-ticket-detail"
    >
      {/*
        The two-region grid is pinned to `minmax(0, 1fr) 320px` via an
        inline style, so a phone viewport kept the 320px sidebar
        beside a main column that collapsed to a sliver — the sidebar
        then rendered OVER the main content and hid it entirely.
        Force a single column below 1025px so the regions stack.
        `!important` is required: the inline `grid-template-columns`
        on the same node out-prioritises any plain class rule.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 1024px) {
              .dispatcher-detail-grid {
                grid-template-columns: minmax(0, 1fr) !important;
              }
            }
          `,
        }}
      />
      {/* Sub-header: back link only. Brand, lang, theme, and user
          menu are rendered by the global AppHeader (AppShell). */}
      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
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
          ← {t('dispatcher.detail.back_to_queue', null, lang)}
        </Link>
      </div>

      {/* Two-region content: details + sidebar */}
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 0,
          minHeight: 0,
        }}
        className="dispatcher-detail-grid"
      >
        <main
          style={{
            padding: 'var(--space-5)',
            overflowY: 'auto',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                lang={lang}
                style={{
                  fontSize: 'var(--text-h1)',
                  fontWeight: 'var(--weight-bold)',
                  color: 'var(--color-ink)',
                  margin: 0,
                }}
              >
                {/* Bolt 008-002 — Story 002: H1 is the
                    category display name (e.g. "রাস্তার
                    আলো নেই"), not the raw tkt_* id. The
                    id is rendered as a small badge
                    below the H1 so the dispatcher can
                    still reference the ticket in a
                    support chat. */}
                {ticketCategoryLabel(ticket, lang)}
              </h1>
              <span
                lang={lang}
                data-testid="dispatcher-ticket-id-badge"
                style={{
                  display: 'inline-block',
                  marginTop: 'var(--space-1)',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                {formatTicketId(ticket.id)}
              </span>
            </div>
            {/* The two chips sit together on the right: where the
                ticket IS (status) and whether it is still inside
                the promised window (SLA). They are separate chips
                because they answer separate questions, and a
                dispatcher must not have to compare a colour to
                work out which one a colour belongs to. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                flexShrink: 0,
              }}
            >
              <StatusPill
                status={ticket.status}
                lang={lang}
                data-testid="dispatcher-ticket-status-pill"
              />
              {detailSlaState ? (
                <SlaCountdown
                  state={detailSlaState}
                  lang={lang}
                  size="md"
                  showLabel
                  data-testid="dispatcher-ticket-sla-chip"
                />
              ) : null}
            </div>
          </div>

          {/* Photo gallery — Bolt 008-002 — Story 003:
              split the photos into "Before" (citizen) and
              "After" (crew) groups with role labels, so the
              dispatcher immediately sees which photos the
              citizen uploaded at submit time vs. which the
              crew uploaded during resolution. The legacy
              combined gallery is no longer used here. */}
          {(ticket.beforePhotoUrls.length > 0 ||
            ticket.afterPhotoUrls.length > 0) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                marginBottom: 'var(--space-5)',
              }}
            >
              {ticket.beforePhotoUrls.length > 0 && (
                <div data-testid="dispatcher-photo-before-group">
                  <p
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-ink-secondary)',
                      margin: '0 0 var(--space-2)',
                    }}
                  >
                    {t('photo.before', null, lang)}
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {ticket.beforePhotoUrls.map((url, i) => (
                      <div
                        key={`b-${url}-${i}`}
                        aria-hidden
                        data-testid="dispatcher-photo"
                        style={{
                          aspectRatio: '1 / 1',
                          borderRadius: 'var(--radius-md)',
                          // `startsWith('http')` missed the inline
                          // `data:` URL (the default upload path) and
                          // the root-relative `/api/blob/…` path, so
                          // the dispatcher's evidence photos rendered
                          // as blank gradient squares.
                          background:
                            thumbnailBackground(url) ??
                            'linear-gradient(135deg, var(--color-primary-soft) 0%, var(--color-surface-raised) 100%)',
                          border: '1px solid var(--color-border)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
              {ticket.afterPhotoUrls.length > 0 && (
                <div data-testid="dispatcher-photo-after-group">
                  <p
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-ink-secondary)',
                      margin: '0 0 var(--space-2)',
                    }}
                  >
                    {t('photo.after', null, lang)}
                  </p>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {ticket.afterPhotoUrls.map((url, i) => (
                      <div
                        key={`a-${url}-${i}`}
                        aria-hidden
                        data-testid="dispatcher-photo"
                        style={{
                          aspectRatio: '1 / 1',
                          borderRadius: 'var(--radius-md)',
                          background:
                            thumbnailBackground(url) ??
                            'linear-gradient(135deg, var(--color-status-resolved-soft) 0%, var(--color-surface-raised) 100%)',
                          border: '1px solid var(--color-border)',
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Full record */}
          <section
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h2)',
                margin: '0 0 var(--space-3)',
              }}
            >
              {t('dispatcher.detail.record', null, lang)}
            </h2>
            <dl
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                columnGap: 'var(--space-5)',
                rowGap: 'var(--space-2)',
                fontSize: 'var(--text-body-sm)',
                margin: 0,
              }}
            >
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.city', null, lang)}</FieldLabel>
              <FieldValue>
                {/* Bolt 008-002 — Story 002: render the city
                    display name (Dhaka North) when the joined
                    city row carries one; fall back to the id.
                    The Bangla variant is preferred on a Bangla
                    page. */}
                {(lang === 'bn'
                  ? ticket.cityNameBn ?? ticket.cityName
                  : ticket.cityName) ?? ticket.cityId}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.ward', null, lang)}</FieldLabel>
              <FieldValue>
                {ticket.wardName ?? ticket.wardId}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.category', null, lang)}</FieldLabel>
              <FieldValue>
                {/* Bolt 008-002 — Story 002: localised
                    category label, not the raw cat_*
                    internal id. */}
                {ticketCategoryLabel(ticket, lang)}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.location', null, lang)}</FieldLabel>
              <FieldValue>
                {ticket.locationLat.toFixed(4)}, {ticket.locationLng.toFixed(4)}
                {ticket.locationLabel ? ` — ${ticket.locationLabel}` : ''}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.note', null, lang)}</FieldLabel>
              <FieldValue>{ticket.note ?? '—'}</FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.reporter', null, lang)}</FieldLabel>
              <FieldValue>
                {/* Bolt 008-002 — Story 002: human
                    display name (Rahim), not the raw
                    user id.
                    The server-joined `reporterName` wins —
                    it works on every backend, whereas the
                    id→name map in `display-name.ts`
                    covers only the dev store's demo
                    personas. Falls back to the map, then
                    to the id. */}
                {ticket.reporterName ??
                  displayNameFor('citizen', ticket.reporterId)}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.crew', null, lang)}</FieldLabel>
              <FieldValue>
                {/* Bolt 008-002 — Story 003: when no
                    crew is assigned, show the
                    localised "Not assigned" string
                    instead of an em-dash. When
                    assigned, show the display name
                    (Rashid), not the raw id. */}
                {ticket.assignedCrewId
                  ? (ticket.assignedCrewName ??
                    displayNameFor('crew', ticket.assignedCrewId))
                  : t('dispatcher.assignCrew.none', null, lang)}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.created', null, lang)}</FieldLabel>
              <FieldValue>{formatTimestamp(ticket.createdAt, lang)}</FieldValue>
            </dl>
          </section>

          {/* Status trail */}
          <section
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h2)',
                margin: '0 0 var(--space-3)',
              }}
            >
              {t('dispatcher.detail.trail', null, lang)}
            </h2>
            {ticket.trail.length === 0 ? (
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-tertiary)',
                  margin: 0,
                }}
              >
                —
              </p>
            ) : (
              <ol
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
                data-testid="dispatcher-trail"
              >
                {ticket.trail.map((entry, i) => (
                  <li
                    key={i}
                    style={{
                      paddingLeft: 'var(--space-4)',
                      borderLeft: '2px solid var(--color-primary)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-2)',
                        alignItems: 'center',
                      }}
                    >
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
                        {t(`status.${entry.toStatus}`, null, lang)}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--text-caption)',
                          color: 'var(--color-ink-tertiary)',
                        }}
                      >
                        {formatTimestamp(entry.timestamp, lang)}
                      </span>
                    </div>
                    <div
                      lang={lang}
                      style={{
                        fontSize: 'var(--text-caption)',
                        color: 'var(--color-ink-secondary)',
                        marginTop: 'var(--space-1)',
                      }}
                    >
                      {t('dispatcher.detail.trail.actor', null, lang)}:{' '}
                      {/* Bolt 008-002 — Story 002: render
                          the actor's display name (Rahim /
                          Habib / Rashid) instead of the raw
                          user id.
                          The server-joined `actorName` wins —
                          it is the ONLY source that works on
                          every backend (the id→name map in
                          `display-name.ts` covers just the dev
                          store's three demo personas). Falls
                          back to the map, then to the id. */}
                      {entry.actorName ??
                        displayNameFor(
                          entry.actorRole ?? 'citizen',
                          entry.actorId ?? entry.actorLabel,
                        )}
                      {entry.note && (
                        <>
                          {' · '}
                          {entry.note}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Internal note */}
          <section
            style={{
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-5)',
              marginBottom: 'var(--space-5)',
            }}
          >
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h2)',
                margin: '0 0 var(--space-2)',
              }}
            >
              {t('dispatcher.detail.internal_note', null, lang)}
            </h2>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                margin: '0 0 var(--space-3)',
              }}
            >
              {t('dispatcher.detail.internal_note.help', null, lang)}
            </p>
            <textarea
              data-testid="dispatcher-internal-note"
              lang={lang}
              rows={4}
              value={internalNoteDraft}
              onChange={(e) => setInternalNoteDraft(e.target.value)}
              disabled={internalNoteInFlight}
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-page)',
                color: 'var(--color-ink)',
                fontSize: 'var(--text-body-sm)',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)', gap: 'var(--space-2)' }}>
              {internalNoteError && (
                <span
                  role="alert"
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-danger)',
                  }}
                >
                  {internalNoteError}
                </span>
              )}
              <button
                type="button"
                onClick={onSaveNote}
                disabled={
                  internalNoteInFlight ||
                  internalNoteDraft === (ticket.internalNote ?? '')
                }
                data-testid="dispatcher-save-note"
                style={{
                  padding: 'var(--space-2) var(--space-4)',
                  background: 'var(--color-primary)',
                  color: 'var(--color-on-primary)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                  opacity:
                    internalNoteInFlight ||
                    internalNoteDraft === (ticket.internalNote ?? '')
                      ? 0.5
                      : 1,
                }}
              >
                {t('dispatcher.detail.save_note', null, lang)}
              </button>
            </div>
          </section>
        </main>

        {/* Sidebar — actions */}
        <aside
          style={{
            background: 'var(--color-surface-card)',
            borderLeft: '1px solid var(--color-border)',
            padding: 'var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            overflowY: 'auto',
          }}
          data-testid="dispatcher-actions"
        >
          {/* Bolt 007-002 — Dispatcher crew picker. The picker
              is the "how" view; the read-only `assignedCrewId`
              row in the record list is the "what" view. The
              dropdown is ward-scoped (only crew users in the
              ticket's ward render as options), the empty
              placeholder maps to the wire value `null`, and
              the server-side trust boundary in
              `lib/dispatcher/assign-crew.ts` re-validates the
              chosen crew on save.

              Wave 4 / bolt 009-005 replaced the native `<select>`
              with the searchable `Combobox`. A ward with many
              crews produced a native picker that had to be
              scrolled, and the load count was crammed into the
              option text (`Name (2/5)`) where it read as part of
              the name. The combobox puts the load on its own
              line, so the name is a name. */}
          <div>
            <h3
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
              {t('dispatcher.assignCrew.heading', null, lang)}
            </h3>
            <Combobox
              data-testid="dispatcher-assign-crew"
              label={t('dispatcher.assignCrew.label', null, lang)}
              placeholder={t('dispatcher.assignCrew.placeholder', null, lang)}
              emptyMessage={t('dispatcher.combobox.no_results', null, lang)}
              lang={lang}
              value={assignDraft === '' ? null : assignDraft}
              onChange={(next) => {
                setAssignDraft(next ?? '');
                setAssignSuccess(false);
              }}
              disabled={assignInFlight}
              options={crewOptions.map((c) => ({
                value: c.id,
                label: c.name,
                // The load rides on its own line rather than inside
                // the name. A crew member already at capacity is
                // not offered as a choice — the endpoint enforces
                // the same rule, so this is a hint, but a hint the
                // dispatcher can act on without hitting a 409.
                description: `${c.activeCount}/${c.capacityLimit}`,
                disabled: c.atCapacity,
              }))}
              footer={
                <button
                  type="button"
                  onClick={() => {
                    setAssignDraft('');
                    setAssignSuccess(false);
                  }}
                  disabled={assignInFlight || assignDraft === ''}
                  data-testid="dispatcher-assign-clear"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    padding: 0,
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-primary)',
                    fontFamily: 'inherit',
                    fontSize: 'var(--text-caption)',
                    fontWeight: 'var(--weight-semibold)',
                    cursor: assignDraft === '' ? 'not-allowed' : 'pointer',
                    opacity: assignDraft === '' ? 0.5 : 1,
                  }}
                >
                  {t('dispatcher.combobox.selected_none', null, lang)}
                </button>
              }
            />
            {assignError && (
              <div
                role="alert"
                lang={lang}
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-danger)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {assignError}
              </div>
            )}
            {assignSuccess && (
              <div
                role="status"
                lang={lang}
                data-testid="dispatcher-assign-success"
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-status-resolved)',
                  marginBottom: 'var(--space-2)',
                }}
              >
                {t('dispatcher.assignCrew.success', null, lang)}
              </div>
            )}
            <button
              type="button"
              onClick={onSaveAssign}
              disabled={assignInFlight}
              data-testid="dispatcher-assign-save"
              style={{
                width: '100%',
                padding: 'var(--space-2) var(--space-3)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
                cursor: assignInFlight ? 'wait' : 'pointer',
                opacity: assignInFlight ? 0.6 : 1,
              }}
            >
              {assignInFlight
                ? t('dispatcher.assignCrew.saving', null, lang)
                : t('dispatcher.assignCrew.save', null, lang)}
            </button>
          </div>

          {/* Transition buttons — Bolt 009-005.
              The action bar is STICKY at the top of the sidebar:
              the record below it is long (photos, the trail, the
              internal note), and the one thing the dispatcher came
              to this page to do — move the ticket on — was buried
              under all of it. A primary action that scrolls out of
              reach is an action the dispatcher forgets. */}
          <div
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'var(--color-surface-card)',
              // The sticky bar must not let the record scroll
              // through it, so it carries its own bottom edge.
              borderBottom: '1px solid var(--color-border)',
              /*
               * The bar bleeds to the sidebar's LEFT and RIGHT
               * edges so its background reaches the divider and
               * the record does not scroll through a gap.
               *
               * It must NOT bleed vertically. A negative top and
               * bottom margin made the bar OVERLAP the content
               * that follows it — the "Reassign" heading rendered
               * half-under the bar and read as clipped text.
               * The vertical padding below is what keeps the
               * bar's own content off the heading beneath it.
               */
              margin: '0 calc(-1 * var(--space-5))',
              padding: 'var(--space-5) var(--space-5) var(--space-4)',
            }}
            data-testid="dispatcher-action-bar"
          >
            <h3
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
              {t('dispatcher.detail.transition.heading', null, lang)}
            </h3>
            {validTransitions.length === 0 ? (
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-ink-tertiary)',
                  margin: 0,
                }}
              >
                {t('dispatcher.detail.transition.none', null, lang)}
              </p>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)',
                }}
              >
                {validTransitions.map((toStatus) => (
                  <button
                    key={toStatus}
                    type="button"
                    data-testid={`dispatcher-transition-${toStatus}`}
                    onClick={() => onTransition(toStatus)}
                    disabled={transitionInFlight !== null}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--color-primary)',
                      color: 'var(--color-on-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {transitionInFlight === toStatus
                      ? t('dispatcher.detail.transition.saving', null, lang)
                      : t(transitionLabel(toStatus), null, lang)}
                  </button>
                ))}
                {transitionError && (
                  <span
                    role="alert"
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {transitionError}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Reassign UI */}
          <div>
            <h3
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
              {t('dispatcher.detail.reassign.heading', null, lang)}
            </h3>
            {!reassignOpen ? (
              <button
                type="button"
                onClick={() => {
                  // Seed the drafts from the ticket so the panel
                  // opens showing the CURRENT ward and category
                  // rather than the first option in the list.
                  setReassignWardId(ticket.wardId);
                  setReassignCategoryId(ticket.categoryId);
                  setReassignOpen(true);
                }}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'transparent',
                  color: 'var(--color-primary)',
                  border: '1px solid var(--color-primary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-body-sm)',
                  fontWeight: 'var(--weight-semibold)',
                  cursor: 'pointer',
                }}
              >
                {t('dispatcher.detail.reassign.cta', null, lang)}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label
                  lang={lang}
                  htmlFor="dispatcher-reassign-ward"
                  style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-secondary)' }}
                >
                  Ward
                </label>
                <select
                  id="dispatcher-reassign-ward"
                  data-testid="dispatcher-reassign-ward"
                  value={reassignWardId}
                  onChange={(e) => setReassignWardId(e.target.value)}
                  style={{
                    padding: 'var(--space-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-page)',
                    color: 'var(--color-ink)',
                    fontSize: 'var(--text-body-sm)',
                  }}
                >
                  {reassignWards.map((w) => (
                    <option key={w.id} value={w.id}>
                      {wardOptionLabel(w, lang)}
                    </option>
                  ))}
                </select>
                <label
                  lang={lang}
                  htmlFor="dispatcher-reassign-category"
                  style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-secondary)' }}
                >
                  Category
                </label>
                <select
                  id="dispatcher-reassign-category"
                  data-testid="dispatcher-reassign-category"
                  value={reassignCategoryId}
                  onChange={(e) => setReassignCategoryId(e.target.value)}
                  style={{
                    padding: 'var(--space-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-page)',
                    color: 'var(--color-ink)',
                    fontSize: 'var(--text-body-sm)',
                  }}
                >
                  {reassignCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
                    </option>
                  ))}
                </select>
                {reassignError && (
                  <span
                    role="alert"
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-danger)',
                    }}
                  >
                    {reassignError}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    onClick={onSaveReassign}
                    disabled={reassignInFlight}
                    data-testid="dispatcher-save-reassign"
                    style={{
                      flex: 1,
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'var(--color-primary)',
                      color: 'var(--color-on-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('dispatcher.detail.reassign.save', null, lang)}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReassignOpen(false)}
                    style={{
                      flex: 1,
                      padding: 'var(--space-2) var(--space-3)',
                      background: 'transparent',
                      color: 'var(--color-ink)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-body-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    {t('dispatcher.detail.reassign.cancel', null, lang)}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * The label for a ward option.
 *
 * A ward with no display name still needs a readable label — the
 * raw id is better than a blank row, because a blank row is
 * indistinguishable from a rendering bug. The number is used in
 * that case, matching the filter rail's rule.
 */
function wardOptionLabel(
  ward: ReassignWardOption,
  lang: Language,
): string {
  const name = lang === 'bn' ? ward.nameBn : ward.name;
  return name ?? `Ward ${ward.number}`;
}

/**
 * The ticket's category display name.
 *
 * Prefers the server-joined localized name (`categoryName` /
 * `categoryNameBn`) — the backend knows the category's row, so it
 * can answer in both languages. Falls back to the i18n registry via
 * the slug, and finally to the raw id.
 *
 * WHY THE FALLBACK CHAIN
 * ----------------------
 * `categoryId` is backend-specific: `cat_streetlight` in the dev
 * store, a CUID on Postgres. A client-side id→label map only fits
 * ONE backend, and on the other it silently printed the raw id —
 * the exact thing this label exists to avoid.
 */
function ticketCategoryLabel(
  ticket: {
    categoryId: string;
    categoryName?: string | null;
    categoryNameBn?: string | null;
    categorySlug?: string | null;
  },
  lang: Language,
): string {
  const joined = lang === 'bn' ? ticket.categoryNameBn : ticket.categoryName;
  if (joined) return joined;
  return categoryLabelBySlug(ticket.categorySlug ?? null, lang, ticket.categoryId);
}

function FieldLabel({ lang, children }: { lang: Language; children: React.ReactNode }) {  return (
    <dt
      lang={lang}
      style={{
        fontSize: 'var(--text-caption)',
        color: 'var(--color-ink-tertiary)',
        fontWeight: 'var(--weight-semibold)',
      }}
    >
      {children}
    </dt>
  );
}

function FieldValue({ children }: { children: React.ReactNode }) {
  return (
    <dd
      style={{
        margin: 0,
        fontSize: 'var(--text-body-sm)',
        color: 'var(--color-ink)',
      }}
    >
      {children}
    </dd>
  );
}
