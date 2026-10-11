/**
 * Field crew — ticket detail (/crew/tickets/[id]).
 *
 * CREW-003 + CREW-004 + CREW-005 (Intent 004, Unit
 * 003): the crew's per-ticket work surface.
 *
 * Renders:
 *   - The full ticket record (all fields, incl.
 *     `internalNote`, real `actorId` on trail).
 *   - The status trail.
 *   - The photo gallery (citizen-submitted + crew
 *     after-photos inline).
 *   - The "Navigate" CTA (CREW-005) — a link to the
 *     device's maps app via URL scheme; the href is
 *     built by the pure `navigate-href` module.
 *   - The transition buttons (CREW-003) — one per
 *     valid `toStatus` allowed by
 *     `lib/platform/transitions.ts` from the ticket's
 *     current status, intersected with the crew's
 *     allowed transitions
 *     (['in_progress', 'resolved']).
 *   - The resolution note textarea (CREW-004) —
 *     required when the user taps "Mark resolved";
 *     the button is disabled when the note is empty.
 *   - The after-photo input (CREW-003) — a URL paste
 *     (v1 surface); the route appends to
 *     `Ticket.photoUrls` and writes a trail entry
 *     + an audit row.
 *
 * Out-of-scope ticket id → 404 page (not 403). The
 * crew cannot probe ticket existence outside their
 * scope.
 *
 * No polling: the page renders the latest snapshot
 * and requires the crew to re-fetch (reload / back /
 * open the page again) to see updates. v1.1 may add
 * WebSocket / SSE.
 *
 * CREW-006 — offline-read cache. The page reads the
 * per-ticket cache on mount (BEFORE the network) so a
 * flaky network still shows the last-seen ticket
 * immediately. The page writes the cache on a
 * successful fetch AND on a successful transition /
 * photo-append. The cache is invalidated on a
 * successful write so the next read pulls fresh
 * from the network.
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
import {
  formatCachedAge,
  readTicketCache,
  writeTicketCache,
  type ReadResult,
} from '@/lib/crew/cache';
import type { SerializedTicket } from '@/lib/serializers/ticket';
import {
  detectPlatform,
  buildNavigateHref,
} from './navigate-href';

const LANG_KEY = 'cityfix.preferred_language.v1';
const MAX_NOTE_LENGTH = 1000;

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
  locationLabelBn: string | null;
  note: string | null;
  photoUrls: string[];
  reporterId: string;
  assignedCrewId: string | null;
  internalNote: string | null;
  createdAt: string;
  trail: TrailEntry[];
}

// Engine edges. Mirrors lib/platform/transitions.ts.
const TRANSITIONS_BY_FROM: Record<TicketStatus, TicketStatus[]> = {
  submitted: ['routed', 'cancelled'],
  routed: ['in_progress', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [],
  closed: [],
  cancelled: [],
};

// The crew's allowed set: narrower than the dispatcher's
// (['routed', 'cancelled']). The crew owns the
// in-the-field work; the dispatcher owns the start
// of the chain and cancellation.
const CREW_ALLOWED = ['in_progress', 'resolved'] as const;

function categoryIcon(slug: string): string {
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

export default function CrewTicketPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // The "Mark resolved" button is disabled when the
  // resolution note is empty (CREW-004 Acceptance 3).
  const [resolutionNote, setResolutionNote] = useState('');
  const [transitioningTo, setTransitioningTo] = useState<TicketStatus | null>(
    null,
  );
  const [transitionError, setTransitionError] = useState<string | null>(null);
  // After-photo URL input.
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Navigate URL — built on mount from navigator.userAgent.
  const [navigateHref, setNavigateHref] = useState<string | null>(null);
  // CREW-006 — the cache snapshot the page fell
  // back to on network failure. `null` means the
  // page is showing fresh data (or is mid-fetch).
  // The banner renders the cached age via
  // `formatCachedAge(cachedAt, now, lang)`.
  const [cacheSnapshot, setCacheSnapshot] = useState<ReadResult<SerializedTicket> | null>(null);
  // The crew's session userId is fetched on mount
  // and used to scope the cache key.
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
  }, []);

  // Build the navigate URL on mount once the ticket
  // coords are known. The platform detection reads
  // navigator.userAgent; in the test we pass an
  // explicit UA via the `navigate-href` module's
  // `detectPlatform` helper.
  useEffect(() => {
    if (!ticket) return;
    if (typeof navigator === 'undefined') return;
    const platform = detectPlatform(navigator.userAgent);
    setNavigateHref(
      buildNavigateHref(platform, {
        lat: ticket.locationLat,
        lng: ticket.locationLng,
        label: ticket.locationLabel ?? undefined,
      }),
    );
  }, [ticket]);

  const fetchTicket = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/crew/tickets/${id}`, {
        credentials: 'include',
      });
      if (res.status === 404) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        // Network failure or 5xx. CREW-006: stay
        // on the cached snapshot (if any) — the
        // banner is already rendered from the
        // mount effect.
        setNotFound(false);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setNotFound(false);
      setLoading(false);
      // CREW-006 — write the fresh response to
      // the per-ticket cache so the next mount
      // (on a flaky network) sees the fresh
      // snapshot. The cache write is best-effort;
      // a failure here is silent.
      if (userId) {
        writeTicketCache(userId, data.ticket as unknown as SerializedTicket);
        // Clear the cache-snapshot banner — the
        // page is now showing fresh data.
        setCacheSnapshot(null);
      }
    } catch {
      // Network failure (offline, DNS, etc.).
      // CREW-006: stay on the cached snapshot
      // (if any) and let the banner render. Do
      // NOT flip to notFound — the cache might
      // still be valid.
      setNotFound(false);
      setLoading(false);
    }
  }, [id, userId]);

  // Auth check
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', { credentials: 'include' });
        const status = (await statusRes.json()) as {
          authenticated: boolean;
          userId?: string;
        };
        if (cancelled) return;
        setSignedIn(status.authenticated);
        if (status.authenticated && status.userId) setUserId(status.userId);
      } catch {
        if (!cancelled) setSignedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // CREW-006 — read the per-ticket cache on mount
  // BEFORE the network request lands, so the page
  // is immediately interactive on a flaky network.
  // The cache read is sync (localStorage) so
  // there's no "first paint" delay.
  useEffect(() => {
    if (!userId || !id) return;
    const cached = readTicketCache(userId, id);
    if (cached) {
      setTicket(cached.data as unknown as TicketDetail);
      setCacheSnapshot(cached);
      setLoading(false);
    }
  }, [userId, id]);

  // Fetch the ticket on mount.
  useEffect(() => {
    if (!signedIn || !id) return;
    void fetchTicket();
  }, [signedIn, id, fetchTicket]);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  // Compute the visible transition buttons. The set
  // is the intersection of (engine edges from
  // currentStatus) ∩ (crew's allowed set).
  const visibleTransitions = useMemo(() => {
    if (!ticket) return [] as TicketStatus[];
    const edges = TRANSITIONS_BY_FROM[ticket.status];
    return edges.filter((e) =>
      (CREW_ALLOWED as ReadonlyArray<TicketStatus>).includes(e),
    );
  }, [ticket]);

  // Submit a transition. The page disables "Mark
  // resolved" when the note is empty, but the API
  // is the source of truth — a stale request still
  // gets a clean 400.
  const onTransition = useCallback(
    async (toStatus: TicketStatus) => {
      if (!ticket) return;
      setTransitioningTo(toStatus);
      setTransitionError(null);
      try {
        const body: { toStatus: TicketStatus; note?: string } = { toStatus };
        if (toStatus === 'resolved') {
          body.note = resolutionNote.trim();
        }
        const res = await fetch(
          `/api/v1/crew/tickets/${ticket.id}/transition`,
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          const errBody = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (errBody.error === 'role_cannot_perform_transition') {
            setTransitionError('crew.transition.error.role_cannot');
          } else if (errBody.error === 'illegal_transition') {
            setTransitionError('crew.transition.error.illegal');
          } else if (errBody.error === 'invalid_input') {
            setTransitionError('crew.resolution_note.required');
          } else {
            setTransitionError('crew.transition.error.generic');
          }
          return;
        }
        const data = (await res.json()) as { ticket: TicketDetail };
        setTicket(data.ticket);
        // Clear the note on a successful resolved write
        // so a subsequent in_progress transition doesn't
        // carry the old note over.
        setResolutionNote('');
        // CREW-006 — on a successful transition,
        // refresh the per-ticket cache with the
        // server's response. The next mount sees
        // the post-transition state immediately.
        if (userId) {
          writeTicketCache(
            userId,
            data.ticket as unknown as SerializedTicket,
          );
          setCacheSnapshot(null);
        }
      } catch {
        setTransitionError('crew.transition.error.generic');
      } finally {
        setTransitioningTo(null);
      }
    },
    [ticket, resolutionNote, userId],
  );

  // Submit an after-photo URL. The Zod schema on the
  // API does the same `url` validation; the page
  // pre-validates with `URL.canParse` for a friendlier
  // UX.
  const onAddPhoto = useCallback(async () => {
    if (!ticket) return;
    setPhotoError(null);
    const trimmed = photoUrl.trim();
    if (trimmed.length === 0) {
      setPhotoError('crew.photo.error.invalid_url');
      return;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        setPhotoError('crew.photo.error.invalid_url');
        return;
      }
    } catch {
      setPhotoError('crew.photo.error.invalid_url');
      return;
    }
    setPhotoSaving(true);
    try {
      const res = await fetch(`/api/v1/crew/tickets/${ticket.id}/photos`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        setPhotoError('crew.photo.error.invalid_url');
        return;
      }
      const data = (await res.json()) as { ticket: TicketDetail };
      setTicket(data.ticket);
      setPhotoUrl('');
      // CREW-006 — refresh the per-ticket cache
      // with the server's response (the photo
      // URL is appended to ticket.photoUrls and
      // a trail entry is written). The next
      // mount sees the after-photo immediately.
      if (userId) {
        writeTicketCache(
          userId,
          data.ticket as unknown as SerializedTicket,
        );
        setCacheSnapshot(null);
      }
    } catch {
      setPhotoError('crew.photo.error.invalid_url');
    } finally {
      setPhotoSaving(false);
    }
  }, [ticket, photoUrl, userId]);

  if (signedIn === false) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-4)',
        }}
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('crew.detail.not_found', null, lang)}
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

  if (notFound) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-4)',
        }}
        data-testid="crew-ticket-not-found"
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('crew.detail.not_found', null, lang)}
          </p>
          <Link
            href="/crew"
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
            {t('crew.detail.back_to_list', null, lang)}
          </Link>
        </div>
      </div>
    );
  }

  if (loading || !ticket) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        data-testid="crew-ticket-loading"
      >
        <p
          lang={lang}
          style={{
            fontSize: 'var(--text-body-md)',
            color: 'var(--color-ink-secondary)',
          }}
        >
          {t('crew.detail.loading', null, lang)}
        </p>
      </div>
    );
  }

  const noteTrimmed = resolutionNote.trim();
  const resolvedDisabled = noteTrimmed.length === 0;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
      data-testid="crew-ticket-page"
    >
      {/* Top bar */}
      <header
        style={{
          height: 56,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-4)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--space-2)',
        }}
      >
        <Link
          href="/crew"
          lang={lang}
          data-testid="crew-ticket-back"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink-secondary)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {t('crew.detail.back_to_list', null, lang)}
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={toggleLang}
            aria-label="Toggle language"
            style={{
              padding: 'var(--space-1) var(--space-2)',
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
          <ThemeToggle lang={lang} variant="compact" />
        </div>
      </header>

      {/* CREW-006 — cache banner. Renders when the
          page is showing a cached snapshot because
          the network failed (or the page is mid-fetch
          and the cached snapshot was the "first paint"
          source). Hidden when fresh data is on screen. */}
      {cacheSnapshot && (
        <div
          data-testid="crew-cache-banner"
          role="status"
          lang={lang}
          style={{
            padding: 'var(--space-2) var(--space-3)',
            background: 'var(--color-warning-bg, #fff4e6)',
            borderBottom: '1px solid var(--color-warning-border, #f59f00)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-warning-ink, #663c00)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <span aria-hidden style={{ fontSize: 16 }}>⚠️</span>
          <span style={{ flex: 1 }}>
            {t(
              'crew.cache.last_updated',
              {
                when: formatCachedAge(
                  cacheSnapshot.cachedAt,
                  Date.now(),
                  lang,
                ),
              },
              lang,
            )}
          </span>
          <button
            type="button"
            onClick={() => {
              void fetchTicket();
            }}
            data-testid="crew-cache-retry"
            lang={lang}
            style={{
              padding: 'var(--space-1) var(--space-3)',
              background: 'var(--color-warning-ink, #663c00)',
              color: 'var(--color-on-primary, #fff)',
              border: 'none',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              cursor: 'pointer',
            }}
          >
            {t('crew.cache.retry', null, lang)}
          </button>
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-raised)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
            }}
          >
            {categoryIcon(ticket.categoryId)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              lang={lang}
              style={{
                fontSize: 'var(--text-h3)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink)',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {ticket.wardId} · {ticket.categoryId}
            </h1>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                margin: 0,
                fontFamily: 'monospace',
              }}
            >
              {ticket.id}
            </p>
          </div>
          <StatusPill status={ticket.status} lang={lang} />
        </div>

        {/* Record card */}
        <SectionCard
          heading={t('crew.detail.record', null, lang)}
          lang={lang}
        >
          <RecordRow
            label={t('crew.detail.field.ward', null, lang)}
            value={ticket.wardId}
            lang={lang}
          />
          <RecordRow
            label={t('crew.detail.field.category', null, lang)}
            value={ticket.categoryId}
            lang={lang}
          />
          <RecordRow
            label={t('crew.detail.field.location', null, lang)}
            value={
              ticket.locationLabelBn && lang === 'bn'
                ? ticket.locationLabelBn
                : ticket.locationLabel ?? `${ticket.locationLat}, ${ticket.locationLng}`
            }
            lang={lang}
          />
          {ticket.note && (
            <RecordRow
              label={t('crew.detail.field.note', null, lang)}
              value={ticket.note}
              lang={lang}
              multiline
            />
          )}
          <RecordRow
            label={t('crew.detail.field.reporter', null, lang)}
            value={ticket.reporterId}
            lang={lang}
            mono
          />
          {navigateHref && (
            <a
              href={navigateHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="crew-ticket-navigate"
              lang={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                marginTop: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-4)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontWeight: 'var(--weight-semibold)',
                fontSize: 'var(--text-body-sm)',
                minHeight: 44,
              }}
            >
              📍 {t('crew.detail.navigate', null, lang)}
            </a>
          )}
        </SectionCard>

        {/* Photos */}
        <SectionCard
          heading={t('crew.detail.photos', null, lang)}
          lang={lang}
        >
          {ticket.photoUrls.length === 0 ? (
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink-tertiary)',
                margin: 0,
              }}
            >
              {t('crew.detail.photos.empty', null, lang)}
            </p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'var(--space-2)',
              }}
            >
              {ticket.photoUrls.map((u, i) => (
                <a
                  key={u}
                  href={u}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    aspectRatio: '1 / 1',
                    background: 'var(--color-surface-raised)',
                    borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden',
                    textDecoration: 'none',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={u}
                    alt={`photo ${i + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </a>
              ))}
            </div>
          )}

          {/* Add-after-photo input */}
          <div
            style={{
              marginTop: 'var(--space-3)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            <label
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {t('crew.photo.heading', null, lang)}
            </label>
            <input
              type="url"
              value={photoUrl}
              onChange={(e) => {
                setPhotoUrl(e.target.value);
                if (photoError) setPhotoError(null);
              }}
              placeholder={t('crew.photo.input.placeholder', null, lang)}
              data-testid="crew-photo-input"
              lang={lang}
              style={{
                width: '100%',
                padding: 'var(--space-3)',
                background: 'var(--color-surface-page)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink)',
                fontFamily: 'monospace',
                minHeight: 44,
                boxSizing: 'border-box',
              }}
            />
            <button
              type="button"
              onClick={onAddPhoto}
              disabled={photoSaving || photoUrl.trim().length === 0}
              data-testid="crew-photo-submit"
              lang={lang}
              style={{
                padding: 'var(--space-3) var(--space-4)',
                background:
                  photoSaving || photoUrl.trim().length === 0
                    ? 'var(--color-surface-raised)'
                    : 'var(--color-primary)',
                color:
                  photoSaving || photoUrl.trim().length === 0
                    ? 'var(--color-ink-tertiary)'
                    : 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
                cursor:
                  photoSaving || photoUrl.trim().length === 0
                    ? 'not-allowed'
                    : 'pointer',
                minHeight: 44,
              }}
            >
              {photoSaving
                ? t('crew.photo.saving', null, lang)
                : t('crew.photo.submit', null, lang)}
            </button>
            {photoError && (
              <p
                role="alert"
                lang={lang}
                style={{
                  fontSize: 'var(--text-caption)',
                  color: 'var(--color-danger, #c92a2a)',
                  margin: 0,
                }}
              >
                {t(photoError, null, lang)}
              </p>
            )}
          </div>
        </SectionCard>

        {/* Trail */}
        <SectionCard
          heading={t('crew.detail.trail', null, lang)}
          lang={lang}
        >
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
            }}
          >
            {ticket.trail.map((entry, i) => (
              <li
                key={i}
                style={{
                  padding: 'var(--space-2) 0',
                  borderBottom:
                    i < ticket.trail.length - 1
                      ? '1px solid var(--color-border)'
                      : 'none',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                  }}
                >
                  <StatusPill status={entry.toStatus} lang={lang} small />
                  <span
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-ink-tertiary)',
                      fontFamily: 'monospace',
                    }}
                  >
                    {entry.actorLabel}
                  </span>
                </div>
                {entry.note && (
                  <p
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-ink-secondary)',
                      margin: 'var(--space-1) 0 0',
                    }}
                  >
                    {entry.note.startsWith('after_photo:')
                      ? `📷 ${entry.note.slice('after_photo:'.length)}`
                      : entry.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>

        {/* Action bar */}
        <SectionCard
          heading={t('crew.detail.transition.heading', null, lang)}
          lang={lang}
        >
          {visibleTransitions.length === 0 ? (
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body-sm)',
                color: 'var(--color-ink-tertiary)',
                margin: 0,
              }}
            >
              {t('crew.detail.transition.none', null, lang)}
            </p>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              {visibleTransitions.includes('in_progress') && (
                <button
                  type="button"
                  onClick={() => onTransition('in_progress')}
                  disabled={transitioningTo !== null}
                  data-testid="crew-transition-in-progress"
                  lang={lang}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--color-primary)',
                    color: 'var(--color-on-primary)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: 'var(--weight-semibold)',
                    cursor: 'pointer',
                    minHeight: 44,
                  }}
                >
                  {transitioningTo === 'in_progress'
                    ? t('crew.detail.transition.saving', null, lang)
                    : t('crew.transition.in_progress', null, lang)}
                </button>
              )}

              {visibleTransitions.includes('resolved') && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-2)',
                  }}
                >
                  <label
                    lang={lang}
                    style={{
                      fontSize: 'var(--text-caption)',
                      fontWeight: 'var(--weight-semibold)',
                      color: 'var(--color-ink-secondary)',
                    }}
                  >
                    {t('crew.resolution_note.label', null, lang)}
                    <span
                      style={{
                        color: 'var(--color-danger, #c92a2a)',
                        marginLeft: 4,
                      }}
                    >
                      *
                    </span>
                  </label>
                  <textarea
                    value={resolutionNote}
                    onChange={(e) => {
                      setResolutionNote(e.target.value.slice(0, MAX_NOTE_LENGTH));
                      if (transitionError) setTransitionError(null);
                    }}
                    placeholder={t(
                      'crew.resolution_note.helper',
                      null,
                      lang,
                    )}
                    rows={3}
                    maxLength={MAX_NOTE_LENGTH}
                    data-testid="crew-resolution-note"
                    lang={lang}
                    style={{
                      width: '100%',
                      padding: 'var(--space-3)',
                      background: 'var(--color-surface-page)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-body-sm)',
                      color: 'var(--color-ink)',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onTransition('resolved')}
                    disabled={transitioningTo !== null || resolvedDisabled}
                    data-testid="crew-transition-resolved"
                    lang={lang}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background:
                        transitioningTo !== null || resolvedDisabled
                          ? 'var(--color-surface-raised)'
                          : 'var(--color-success, #1f7a3f)',
                      color:
                        transitioningTo !== null || resolvedDisabled
                          ? 'var(--color-ink-tertiary)'
                          : '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-semibold)',
                      cursor:
                        transitioningTo !== null || resolvedDisabled
                          ? 'not-allowed'
                          : 'pointer',
                      minHeight: 44,
                    }}
                  >
                    {transitioningTo === 'resolved'
                      ? t('crew.detail.transition.saving', null, lang)
                      : t('crew.transition.resolved', null, lang)}
                  </button>
                </div>
              )}

              {transitionError && (
                <p
                  role="alert"
                  lang={lang}
                  style={{
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-danger, #c92a2a)',
                    margin: 0,
                  }}
                >
                  {t(transitionError, null, lang)}
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  heading,
  lang,
  children,
}: {
  heading: string;
  lang: Language;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-4)',
      }}
    >
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
        {heading}
      </h2>
      {children}
    </section>
  );
}

function RecordRow({
  label,
  value,
  lang,
  multiline,
  mono,
}: {
  label: string;
  value: string;
  lang: Language;
  multiline?: boolean;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        padding: 'var(--space-1) 0',
      }}
    >
      <span
        lang={lang}
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-ink-tertiary)',
          fontWeight: 'var(--weight-semibold)',
        }}
      >
        {label}
      </span>
      <span
        lang={lang}
        style={{
          fontSize: 'var(--text-body-sm)',
          color: 'var(--color-ink)',
          fontFamily: mono ? 'monospace' : 'inherit',
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({
  status,
  lang,
  small,
}: {
  status: TicketStatus;
  lang: Language;
  small?: boolean;
}) {
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
        padding: small ? '2px 6px' : '2px var(--space-2)',
        background: c.bg,
        color: c.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize: small ? 9 : 10,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {t(c.label, null, lang)}
    </span>
  );
}