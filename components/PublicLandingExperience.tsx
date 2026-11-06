/**
 * Public landing experience (components/PublicLandingExperience.tsx).
 *
 * v1.1 launch-polish hotfix: the public landing at `/` (app/page.tsx)
 * shows a read-only city activity feed + interactive city map for
 * visitors who haven't registered. This is the data + interactive
 * surface; the route handler decides whether to render it (anonymous)
 * or redirect to /home (authed).
 *
 * No auth required. The activity feed polls
 * `/api/v1/activity/public`, which is PII-stripped via
 * `serializeTicketForPublic` (lib/serializers/ticket.ts): no reporter
 * id, no internal note, no assigned crew id, no trail, no
 * locationLabel. The pins on the map are status-coloured (same
 * palette as the home page CityActivityMap) and read-only.
 *
 * Anonymous "Report what you see" CTA → `/register?next=/report/location`
 * — register-before-submit (no report-draft can carry a session-only
 * state for an anonymous user, so the citizen registers first, the
 * draft is then created in sessionStorage once they're authed). The
 * "Log in" CTA → `/login?next=/report/location` for returning
 * citizens.
 *
 * Polling: every 30 s. Per-IP rate limited at the API layer via
 * `lib/platform/rate-limit.ts`; the client doesn't double-throttle.
 *
 * Bilingual: bn (default) / en, toggle persists in localStorage.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CityActivityMap, {
  type CityActivityPin,
} from '@/components/CityActivityMap';
import { t, type Language } from '@/lib/i18n/keys';
import { CityFixMark } from '@/components/CityFixMark';
import { firstRenderablePhotoUrl } from '@/lib/format/photo-url';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';

const LANG_KEY = 'cityfix.preferred_language.v1';
const POLL_INTERVAL_MS = 30_000;
const DHAKA_CENTER = { lat: 23.8069, lng: 90.3687 };

type PublicStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface PublicTicket {
  id: string;
  cityId: string;
  wardId: string;
  /**
   * Human-readable ward name (Bolt 008-011). When present, the
   * card renders "Ward 14 — Mirpur" instead of slicing the raw
   * wardId. Falls back to the id slice when the join is missing.
   */
  wardName: string | null;
  wardNameBn: string | null;
  categoryId: string;
  status: PublicStatus;
  locationLng: number;
  locationLat: number;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
}

// Status pill palette. Bolt 008-011: switched from raw hex
// (which clashed on the dark theme — the cream/amber "submitted"
// pill read as abandoned) to the brand's semantic status tokens
// (defined in tokens.css) so the pill matches the rest of the
// app on both light and dark themes. The hex fallbacks keep the
// page legible if the token is missing.
const STATUS_COLORS: Record<PublicStatus, { bg: string; fg: string }> = {
  submitted: {
    bg: 'var(--color-primary-soft)',
    fg: 'var(--color-primary)',
  },
  routed: {
    bg: 'var(--color-status-routed-soft)',
    fg: 'var(--color-status-routed)',
  },
  in_progress: {
    bg: 'var(--color-status-in-progress-soft)',
    fg: 'var(--color-status-in-progress)',
  },
  resolved: {
    bg: 'var(--color-status-resolved-soft)',
    fg: 'var(--color-status-resolved)',
  },
  closed: {
    bg: 'var(--color-surface-raised)',
    fg: 'var(--color-ink-secondary)',
  },
  cancelled: {
    bg: 'var(--color-status-error-soft)',
    fg: 'var(--color-status-error)',
  },
};

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) {
    return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  }
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}

export default function PublicLandingExperience() {
  const [lang, setLang] = useState<Language>('bn');
  const [tickets, setTickets] = useState<PublicTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore — storage may be disabled
    }
  }, []);

  // Poll the public activity feed. No cookies, no auth.
  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/v1/activity/public?limit=20', {
          // Public endpoint, no credentials. Caching headers are server-side.
          cache: 'no-store',
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { tickets: PublicTicket[] };
        if (cancelled) return;
        setTickets(data.tickets ?? []);
        setError(false);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    };

    void fetchOnce();
    timer = window.setInterval(fetchOnce, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  const pins: CityActivityPin[] = useMemo(
    () =>
      tickets.map((t) => ({
        id: t.id,
        lat: t.locationLat,
        lng: t.locationLng,
        status: t.status,
      })),
    [tickets],
  );

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
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
          href="/"
          aria-label="CityFix"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
          }}
        >
          <CityFixMark size={34} />
          <span
            style={{
              fontSize: 'var(--text-body-lg)',
              fontWeight: 'var(--weight-bold)',
              whiteSpace: 'nowrap',
            }}
          >
            CityFix
          </span>
        </Link>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            flexShrink: 0,
          }}
        >
          <Link
            href="/login?next=/report/location"
            lang={lang}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-secondary)',
              textDecoration: 'none',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('public.cta.login', null, lang)}
          </Link>
          <Link
            href="/register?next=/report/location"
            lang={lang}
            style={{
              padding: 'var(--space-2) var(--space-4)',
              background: 'var(--color-primary)',
              color: 'var(--color-on-primary)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-semibold)',
              textDecoration: 'none',
            }}
          >
            {t('public.cta.register', null, lang)}
          </Link>
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
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          padding: 'var(--space-8) var(--space-5) var(--space-7)',
          maxWidth: 1200,
          margin: '0 auto',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
          gap: 'var(--space-7)',
          alignItems: 'center',
        }}
        className="public-hero-grid"
      >
        <style>{`
          @media (max-width: 900px) {
            .public-hero-grid { grid-template-columns: 1fr !important; gap: var(--space-5) !important; }
          }
        `}</style>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            maxWidth: 560,
          }}
        >
          <p
            lang={lang}
            style={{
              margin: 0,
              color: 'var(--color-ink-tertiary)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-medium)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            {t('public.hero.eyebrow', null, lang)}
          </p>
          <h1
            lang={lang}
            style={{
              fontSize: 'var(--text-display-lg)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
              margin: 0,
              letterSpacing: 'var(--tracking-tight)',
              lineHeight: 1.1,
            }}
            dangerouslySetInnerHTML={{
              __html: t('public.hero.headline', null, lang),
            }}
          />
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: 0,
              lineHeight: 1.55,
            }}
          >
            {t('public.hero.subhead', null, lang)}
          </p>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-2)',
              marginTop: 'var(--space-3)',
            }}
          >
            <Link
              href="/register?next=/report/location"
              lang={lang}
              style={{
                height: 56,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-lg)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
                gap: 'var(--space-2)',
              }}
            >
              <PlusIcon />
              {t('public.cta.report', null, lang)}
            </Link>
            <span
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                textAlign: 'center',
              }}
            >
              {t('public.cta.report.hint', null, lang)}
            </span>
          </div>
        </div>

        {/* Map preview */}
        <div
          style={{
            position: 'relative',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            minHeight: 380,
            height: '100%',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <CityActivityMap pins={pins} center={DHAKA_CENTER} />
          {/* Map label */}
          <div
            style={{
              position: 'absolute',
              top: 'var(--space-3)',
              left: 'var(--space-3)',
              padding: '4px var(--space-3)',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {t('public.feed.title', null, lang)}
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '0 var(--space-5) var(--space-6)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
            flexWrap: 'wrap',
          }}
        >
          <span
            lang={lang}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            {t('public.trust.marker1', null, lang)}
          </span>
          <Divider />
          <span
            lang={lang}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            {t('public.trust.marker2', null, lang)}
          </span>
          <Divider />
          <span
            lang={lang}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}
          >
            {t('public.trust.marker3', null, lang)}
          </span>
        </div>
      </section>

      {/* Activity feed */}
      <section
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          padding: '0 var(--space-5) var(--space-8)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-3)',
            gap: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2
              lang={lang}
              style={{
                fontSize: 'var(--text-h2)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-ink)',
                margin: '0 0 var(--space-1)',
              }}
            >
              {t('public.feed.title', null, lang)}
            </h2>
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-tertiary)',
                margin: 0,
              }}
            >
              {t('public.feed.subtitle', null, lang)}
            </p>
          </div>
        </div>

        {loading ? (
          <FeedSkeleton />
        ) : error ? (
          <p
            lang={lang}
            role="alert"
            style={{
              padding: 'var(--space-5)',
              background: 'var(--color-warning-soft)',
              border: '1px solid var(--color-warning)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-body-sm)',
              margin: 0,
            }}
          >
            {t('public.feed.error', null, lang)}
          </p>
        ) : tickets.length === 0 ? (
          <div
            style={{
              padding: 'var(--space-7) var(--space-5)',
              background: 'var(--color-surface-card)',
              border: '1px dashed var(--color-border)',
              borderRadius: 'var(--radius-md)',
              textAlign: 'center',
            }}
          >
            <p
              lang={lang}
              style={{
                fontSize: 'var(--text-body)',
                color: 'var(--color-ink-secondary)',
                margin: '0 0 var(--space-4)',
              }}
            >
              {t('public.feed.empty', null, lang)}
            </p>
            <Link
              href="/register?next=/report/location"
              lang={lang}
              style={{
                display: 'inline-block',
                padding: 'var(--space-3) var(--space-5)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
              }}
            >
              {t('public.cta.report', null, lang)}
            </Link>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {tickets.map((ticket) => (
              <PublicActivityCard
                key={ticket.id}
                ticket={ticket}
                lang={lang}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      style={{
        width: 1,
        height: 12,
        background: 'var(--color-border)',
      }}
    />
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function PublicActivityCard({
  ticket,
  lang,
}: {
  ticket: PublicTicket;
  lang: Language;
}) {
  const statusLabel = t(`status.${ticket.status}`, null, lang);
  const colors = STATUS_COLORS[ticket.status];
  // The public serializer omits the category name. We render the
  // ward and the note; the category label is intentionally
  // hidden from anonymous visitors (categories are city-configured
  // and not part of the public data contract yet).
  /*
   * A stored photo URL can be an inline `data:` URL (the default
   * upload path), an absolute `https://` URL (R2/S3), or a
   * root-relative `/api/blob/…` path (the local blob provider).
   * The old guard only accepted the first two.
   */
  const photoUrl = firstRenderablePhotoUrl(ticket.photoUrls);
  const hasPhoto = photoUrl !== null;

  return (
    <article
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        padding: 'var(--space-3)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        minHeight: 120,
      }}
    >
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl!}
          alt=""
          style={{
            width: 80,
            height: 80,
            borderRadius: 'var(--radius-sm)',
            objectFit: 'cover',
            flexShrink: 0,
            background: 'var(--color-surface-raised)',
          }}
        />
      ) : (
        /*
         * No renderable photo → the shared "no photo" empty state
         * (dashed border + camera glyph + label). Bolt 008-011
         * introduced this markup inline; it now lives in
         * components/ui/PhotoPlaceholder.tsx so the feed, home list
         * and report cards all render the SAME empty state.
         */
        <PhotoPlaceholder size={80} lang={lang} showLabel />
      )}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            justifyContent: 'space-between',
          }}
        >
          <span
            lang={lang}
            style={{
              padding: '3px var(--space-2)',
              background: colors.bg,
              color: colors.fg,
              borderRadius: 'var(--radius-pill)',
              fontSize: 11,
              fontWeight: 'var(--weight-semibold)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              whiteSpace: 'nowrap',
              lineHeight: 1.2,
            }}
          >
            {statusLabel}
          </span>
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatAge(ticket.createdAt, lang)}
          </span>
        </div>
        {ticket.note && (
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink)',
              margin: 0,
              lineHeight: 1.45,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {ticket.note}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'auto',
            flexWrap: 'wrap',
          }}
        >
          {/*
            Bolt 008-011: ward pill now renders the human-readable
            ward name (e.g. "Ward 14 — Mirpur") instead of slicing
            the raw wardId ("cmv53x"). Falls back to the id slice
            when the join is missing on older payloads. The
            location-pin glyph + a soft surface tint give the pill
            a more "city bulletin" look on both light and dark
            themes.
          */}
          <span
            lang={lang}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px var(--space-2)',
              background: 'var(--color-primary-soft)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-pill)',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              style={{ flexShrink: 0 }}
            >
              <path d="M12 22s-7-7.5-7-12a7 7 0 0 1 14 0c0 4.5-7 12-7 12z" />
              <circle cx="12" cy="10" r="2.5" />
            </svg>
            <span>
              {t('public.feed.ward', null, lang)}{' '}
              {lang === 'bn'
                ? ticket.wardNameBn ?? ticket.wardName ?? ticket.wardId
                : ticket.wardName ?? ticket.wardNameBn ?? ticket.wardId}
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--space-3)',
      }}
    >
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            minHeight: 96,
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--color-surface-raised)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                width: '40%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: '85%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
                marginBottom: 6,
              }}
            />
            <div
              style={{
                width: '30%',
                height: 10,
                background: 'var(--color-surface-raised)',
                borderRadius: 4,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
