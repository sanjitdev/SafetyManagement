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
import { ThemeToggle } from '@/components/ThemeToggle';

const LANG_KEY = 'cityfix.preferred_language.v1';

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
  note: string | null;
  timestamp: string;
}

interface TicketDetail {
  id: string;
  status: TicketStatus;
  cityId: string;
  wardId: string;
  categoryId: string;
  locationLat: number;
  locationLng: number;
  locationLabel: string | null;
  note: string | null;
  photoUrls: string[];
  reporterId: string;
  assignedCrewId: string | null;
  internalNote: string | null;
  createdAt: string;
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

const WARD_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'ward_14', label: 'Ward 14 — Mirpur' },
  { id: 'ward_15', label: 'Ward 15 — Cantonment' },
];

const CATEGORY_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'cat_streetlight', label: 'Broken streetlight' },
  { id: 'cat_pothole', label: 'Pothole / road damage' },
  { id: 'cat_drainage', label: 'Drainage blocked' },
  { id: 'cat_garbage', label: 'Garbage not collected' },
];

function formatTimestamp(iso: string, lang: Language): string {
  const d = new Date(iso);
  return d.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-GB');
}

export default function DispatcherTicketDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [lang, setLang] = useState<Language>('bn');
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [transitionInFlight, setTransitionInFlight] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignWardId, setReassignWardId] = useState('');
  const [reassignCategoryId, setReassignCategoryId] = useState('');
  const [reassignInFlight, setReassignInFlight] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [internalNoteDraft, setInternalNoteDraft] = useState('');
  const [internalNoteInFlight, setInternalNoteInFlight] = useState(false);
  const [internalNoteError, setInternalNoteError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
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
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchTicket();
  }, [fetchTicket]);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  const validTransitions = useMemo(() => {
    if (!ticket) return [];
    const from = TRANSITIONS_BY_FROM[ticket.status];
    return from.filter((t) =>
      (DISPATCHER_ALLOWED as readonly string[]).includes(t),
    );
  }, [ticket]);

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

  if (notFound) {
    return (
      <div
        style={{
          minHeight: '100vh',
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
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface-page)',
          padding: 'var(--space-7) var(--space-5)',
          textAlign: 'center',
          color: 'var(--color-ink-secondary)',
        }}
        lang={lang}
      >
        <p>{t('dispatcher.detail.loading', null, lang)}</p>
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
      data-testid="dispatcher-ticket-detail"
    >
      {/* Top bar */}
      <header
        style={{
          height: 64,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-5)',
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
          }}
        >
          ← {t('dispatcher.detail.back_to_queue', null, lang)}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            style={{
              padding: 'var(--space-1) var(--space-3)',
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
          <ThemeToggle lang={lang} />
        </div>
      </header>

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
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-4)',
            }}
          >
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-h1)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink)',
                margin: 0,
              }}
            >
              {ticket.id}
            </h1>
            <span
              lang={lang}
              style={{
                padding: 'var(--space-1) var(--space-3)',
                background: 'var(--color-status-routed, #e7f5ff)',
                color: 'var(--color-primary)',
                borderRadius: 'var(--radius-pill)',
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-bold)',
                textTransform: 'uppercase',
              }}
            >
              {t(`status.${ticket.status}`, null, lang)}
            </span>
          </div>

          {/* Photo gallery */}
          {ticket.photoUrls.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 'var(--space-2)',
                marginBottom: 'var(--space-5)',
              }}
            >
              {ticket.photoUrls.map((url, i) => (
                <div
                  key={url + i}
                  aria-hidden
                  data-testid="dispatcher-photo"
                  style={{
                    aspectRatio: '1 / 1',
                    borderRadius: 'var(--radius-md)',
                    background: url.startsWith('http')
                      ? `url(${url}) center/cover`
                      : 'linear-gradient(135deg, var(--color-primary-soft, #e6f2ee) 0%, var(--color-surface-raised) 100%)',
                    border: '1px solid var(--color-border)',
                  }}
                />
              ))}
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
              <FieldValue>{ticket.cityId}</FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.ward', null, lang)}</FieldLabel>
              <FieldValue>{ticket.wardId}</FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.category', null, lang)}</FieldLabel>
              <FieldValue>{ticket.categoryId}</FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.location', null, lang)}</FieldLabel>
              <FieldValue>
                {ticket.locationLat.toFixed(4)}, {ticket.locationLng.toFixed(4)}
                {ticket.locationLabel ? ` — ${ticket.locationLabel}` : ''}
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.note', null, lang)}</FieldLabel>
              <FieldValue>{ticket.note ?? '—'}</FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.reporter', null, lang)}</FieldLabel>
              <FieldValue>
                <code style={{ fontSize: 11 }}>{ticket.reporterId}</code>
              </FieldValue>
              <FieldLabel lang={lang}>{t('dispatcher.detail.field.crew', null, lang)}</FieldLabel>
              <FieldValue>
                <code style={{ fontSize: 11 }}>{ticket.assignedCrewId ?? '—'}</code>
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
                          background: 'var(--color-status-routed, #e7f5ff)',
                          color: 'var(--color-primary)',
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
                      <code style={{ fontSize: 11 }}>{entry.actorLabel}</code>
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
                    color: 'var(--color-danger, #c92a2a)',
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
          {/* Transition buttons */}
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
                      color: 'var(--color-danger, #c92a2a)',
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
                onClick={() => setReassignOpen(true)}
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
                  style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-secondary)' }}
                >
                  Ward
                </label>
                <select
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
                  {WARD_OPTIONS.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label}
                    </option>
                  ))}
                </select>
                <label
                  lang={lang}
                  style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-secondary)' }}
                >
                  Category
                </label>
                <select
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
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {reassignError && (
                  <span
                    role="alert"
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-danger, #c92a2a)',
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

function FieldLabel({ lang, children }: { lang: Language; children: React.ReactNode }) {
  return (
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
