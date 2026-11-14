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
 * ADR-007: both writes are **admin writes**, so both are gated
 * behind a fresh WebAuthn assertion by `requireWebAuthn`. When the
 * API answers 401 `webauthn_required` / `webauthn_assertion_expired`,
 * the page surfaces the step-up ceremony (`AdminWebAuthnStepUp`)
 * instead of a bare error code, and retries the refused write once
 * the ceremony verifies. The ceremony talks to
 * `POST /api/auth/webauthn/step-up` — a session-authenticated route
 * that binds the challenge to the session's own user and mints no
 * new session.
 *
 * The detail does NOT support editing the internal note or
 * reassigning ward/category — those operations live in the
 * dispatcher-only PATCH route (`PATCH /api/v1/dispatcher/tickets/[id]`)
 * and would require a new admin endpoint to be reachable. Tracked
 * as a v1.1 follow-up.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTimestamp } from '@/lib/format/datetime';
import { formatTicketId } from '@/lib/format/ticket-id';
import { displayNameFor } from '@/lib/identity/display-name';
import { TicketDetailSkeleton } from '@/components/ui/Skeleton';
import { useLanguage } from '@/components/useLanguage';
import { AdminWebAuthnStepUp } from '@/components/AdminWebAuthnStepUp';
import type { SerializedTicket } from '@/lib/serializers/ticket';
import { useSession } from '@/components/SessionProvider';


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

  const { lang, setLang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();
  const [ticket, setTicket] = useState<SerializedTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);

  const [reassignId, setReassignId] = useState('');

  // ADR-007: the admin's writes require a WebAuthn assertion. When
  // the API answers 401 `webauthn_required` (or
  // `webauthn_assertion_expired`), the page surfaces the step-up
  // ceremony instead of a bare error code. `pendingWrite` remembers
  // which write was refused so the ceremony can retry it.
  const [stepUpNeeded, setStepUpNeeded] = useState(false);
  const [stepUpInProgress, setStepUpInProgress] = useState(false);
  const [stepUpNoCredential, setStepUpNoCredential] = useState(false);
  const pendingWriteRef = useRef<(() => Promise<void>) | null>(null);

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
    if (authenticated === null) return; // still loading
    if (!authenticated) {
      setSignedIn(false);
      window.location.href =
        '/login?next=' + encodeURIComponent('/admin/tickets/' + id);
      return;
    }
    if (session?.role !== 'admin') {
      window.location.href = '/';
      return;
    }
    setSignedIn(true);
  }, [authenticated, session, id]);

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

  /**
   * The WebAuthn gate codes that mean "you need to run the step-up
   * ceremony, then retry".
   *
   * `webauthn_required` — the admin has no registered credential (or
   * has one but no fresh challenge). `webauthn_assertion_expired` —
   * the admin HAS a credential but the challenge is stale, so a new
   * assertion is needed. Both are satisfied by the same ceremony; the
   * difference is only in whether the admin needs to REGISTER a key
   * first, which the challenge step reports as `no_credential`.
   */
  const isWebAuthnGate = (code: string | undefined): boolean =>
    code === 'webauthn_required' || code === 'webauthn_assertion_expired';

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
          setError(null);
          await refetch();
        } else {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (isWebAuthnGate(body.error)) {
            // Remember the write so the ceremony can retry it.
            pendingWriteRef.current = () => onTransition(toStatus);
            setStepUpNeeded(true);
            setStepUpNoCredential(false);
            setError(null);
          } else {
            setError(body.error ?? `http_${res.status}`);
          }
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
        setError(null);
        setReassignId('');
        await refetch();
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (isWebAuthnGate(body.error)) {
          pendingWriteRef.current = () => onReassign();
          setStepUpNeeded(true);
          setStepUpNoCredential(false);
          setError(null);
        } else {
          setError(body.error ?? `http_${res.status}`);
        }
      }
    } finally {
      setActionInFlight(null);
    }
  }, [id, reassignId, refetch]);

  /**
   * The step-up ceremony completed. On `'verified'` the guard's
   * challenge ledger now holds a fresh row, so the refused write is
   * retried. The other outcomes do NOT retry — a retry without a
   * valid assertion would fail the same way.
   */
  const onStepUpOutcome = useCallback(
    (outcome: 'verified' | 'no_credential' | 'failed' | 'cancelled') => {
      if (outcome === 'verified') {
        setStepUpNeeded(false);
        setStepUpNoCredential(false);
        const retry = pendingWriteRef.current;
        pendingWriteRef.current = null;
        if (retry) void retry();
        return;
      }
      if (outcome === 'no_credential') {
        // No amount of retrying helps: the admin must REGISTER a key.
        setStepUpNoCredential(true);
        setStepUpNeeded(false);
        pendingWriteRef.current = null;
        return;
      }
      // 'failed' | 'cancelled' — clear the banner; the ceremony
      // component renders its own error line.
      setStepUpNeeded(false);
      pendingWriteRef.current = null;
    },
    [],
  );

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
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
    <div
      className="min-h-full flex flex-col"
      style={{ background: 'var(--color-surface-page)' }}
    >
      <div
        className="border-b px-6 py-4 flex items-center justify-between flex-wrap gap-3"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-page)',
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/admin/tickets"
            className="text-xs hover:underline"
            style={{ color: 'var(--color-ink-secondary)' }}
          >
            {t('admin.tickets.detail.back', null, lang)}
          </Link>
          <h1
            className="text-lg font-semibold"
            style={{ color: 'var(--color-ink)' }}
          >
            {t('admin.tickets.title', null, lang)}
          </h1>
          {ticket && (
            <span
              className="text-xs font-mono"
              style={{ color: 'var(--color-ink-tertiary)' }}
            >
              {formatTicketId(ticket.id)}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="px-6 py-2 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </div>
      )}

      {!ticket && !error && (
        <TicketDetailSkeleton lang={lang} />
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
                // Stack the label above its value on a phone. The
                // inline `gridTemplateColumns` out-prioritises any
                // plain class rule, so the override needs
                // `!important`.
                gridTemplateColumns: 'var(--meta-columns, 160px) 1fr',
                gap: '4px 12px',
                fontSize: 'var(--text-caption)',
              }}
            >
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                    @media (max-width: 640px) {
                      [data-testid="admin-tickets-meta"] {
                        --meta-columns: 1fr;
                      }
                    }
                  `,
                }}
              />
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('status.submitted', null, lang)}
              </dt>
              <dd>{t(`status.${ticket.status}`, null, lang)}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.category', null, lang)}
              </dt>
              <dd>{categoryLabel(ticket, lang)}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.ward', null, lang)}
              </dt>
              <dd>{wardLabel(ticket, lang)}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.reporter', null, lang)}
              </dt>
              <dd>{ticket.reporterName ?? ticket.reporterId}</dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.assigned', null, lang)}
              </dt>
              <dd>
                {ticket.assignedCrewName
                  ? ticket.assignedCrewName
                  : ticket.assignedCrewId
                    ? displayNameFor('crew', ticket.assignedCrewId)
                    : '—'}
              </dd>
              <dt style={{ color: 'var(--color-ink-secondary)' }}>
                {t('admin.tickets.col.created', null, lang)}
              </dt>
              <dd>{formatTimestamp(ticket.createdAt, lang)}</dd>
              {ticket.resolvedAt && (
                <>
                  <dt style={{ color: 'var(--color-ink-secondary)' }}>
                    {t('status.resolved', null, lang)}
                  </dt>
                  <dd>{formatTimestamp(ticket.resolvedAt, lang)}</dd>
                </>
              )}
              {ticket.note && (
                <>
                  <dt style={{ color: 'var(--color-ink-secondary)' }}>
                    {t('admin.tickets.detail.citizenNote', null, lang)}
                  </dt>
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
                        background: 'var(--color-surface-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-pill)',
                      }}
                    >
                      {t(`status.${entry.toStatus}`, null, lang)}
                    </span>
                    <code style={{ fontSize: 'var(--text-body-sm)' }}>
                      {trailActorLabel(entry, lang)}
                    </code>
                    <span
                      style={{
                        marginLeft: 8,
                        color: 'var(--color-ink-secondary)',
                      }}
                    >
                      {formatTimestamp(entry.timestamp, lang)}
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
              className="text-xs hover:underline"
              style={{ color: 'var(--color-ink-secondary)' }}
            >
              {t('admin.tickets.detail.meta', null, lang)}
            </Link>
          </main>

          <aside
            className="border-l"
            style={{
              width: 320,
              flexShrink: 0,
              padding: 'var(--space-4)',
              borderLeft: '1px solid var(--color-border)',
              background: 'var(--color-surface-card)',
            }}
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
                    disabled={busy || stepUpInProgress}
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

            {/*
              ADR-007: the WebAuthn step-up. This renders only after a
              gated write was refused — the ceremony is offered
              because the admin ASKED to make a change, not as a
              permanent button on the page.
            */}
            {(stepUpNeeded || stepUpNoCredential) && (
              <div
                data-testid="admin-webauthn-step-up-panel"
                style={{
                  marginTop: 16,
                  padding: 'var(--space-3)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--color-surface-raised)',
                }}
              >
                {stepUpNoCredential ? (
                  <>
                    <p
                      data-testid="admin-webauthn-step-up-register-hint"
                      style={{
                        fontSize: 'var(--text-body-sm)',
                        color: 'var(--color-ink-secondary)',
                        marginBottom: 8,
                      }}
                    >
                      {t('admin.webauthn.step_up.register_hint', null, lang)}
                    </p>
                    <Link
                      href="/admin"
                      data-testid="admin-webauthn-step-up-register-link"
                      className="admin-btn-primary px-4 py-2 rounded-md"
                      style={{ display: 'inline-block' }}
                    >
                      {t('admin.webauthn.register.title', null, lang)}
                    </Link>
                  </>
                ) : (
                  <AdminWebAuthnStepUp
                    lang={lang}
                    onStateChange={setStepUpInProgress}
                    onOutcome={onStepUpOutcome}
                  />
                )}
              </div>
            )}

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
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-ink)',
                  fontSize: 'var(--text-caption)',
                  fontFamily: 'inherit',
                }}
              />
              <button
                type="button"
                data-testid="admin-tickets-reassign-cta"
                onClick={onReassign}
                disabled={
                  isTerminal ||
                  actionInFlight === 'reassign' ||
                  stepUpInProgress ||
                  !reassignId.trim()
                }
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
                    fontSize: 'var(--text-body-sm)',
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

/**
 * The trail actor's display name.
 *
 * The staff branch of the serializer hands the client the raw actor
 * id (plus the role and the server-joined name) so the UI can
 * resolve a name. Prefer the joined name: the id-prefix fallback
 * below only fits the dev store's `user_*` ids, and on Postgres the
 * ids are opaque strings.
 */
function trailActorLabel(
  entry: SerializedTicket['trail'][number],
  lang: Language,
): string {
  if (entry.actorName) return entry.actorName;
  const actorId = entry.actorId ?? entry.actorLabel;
  if (!actorId) return '—';
  if (entry.actorRole) {
    return displayNameFor(entry.actorRole, actorId);
  }
  // No role on the entry — fall back to the role inferred from the
  // id prefix, then to the raw id.
  if (actorId.startsWith('user_citizen')) {
    return displayNameFor('citizen', actorId);
  }
  if (actorId.startsWith('user_dispatcher')) {
    return displayNameFor('dispatcher', actorId);
  }
  if (actorId.startsWith('user_crew')) {
    return displayNameFor('crew', actorId);
  }
  if (actorId.startsWith('user_admin')) {
    return displayNameFor('admin', actorId);
  }
  void lang;
  return actorId;
}

/**
 * The category's display name.
 *
 * The serializer denormalises the category's name onto the ticket,
 * so prefer that; fall back to the id when the join is absent.
 */
function categoryLabel(ticket: SerializedTicket, lang: Language): string {
  const name = lang === 'bn' ? ticket.categoryNameBn : ticket.categoryName;
  return name ?? ticket.categoryId;
}

/**
 * The ward's display name. Same fallback contract as
 * `categoryLabel`.
 */
function wardLabel(ticket: SerializedTicket, lang: Language): string {
  const name = lang === 'bn' ? ticket.wardNameBn : ticket.wardName;
  return name ?? ticket.wardId;
}
