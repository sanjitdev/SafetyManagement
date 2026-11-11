/**
 * 1.6 Reports — list view.
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports. The
 * top bar (64px) carries brand + breadcrumb + Home link + language toggle
 * + theme toggle + avatar. The content area shows either the citizen's
 * own tickets (filtered from /api/v1/activity by reporterId) or, for
 * staff roles (admin / dispatcher / crew), every ticket filed in the
 * session's city. Each row links to the re-skinned detail page at
 * /reports/[id].
 *
 * The home top bar's "My reports" link points here, so this page
 * replaces the previous 404. It reuses the activity feed for data; we
 * filter client-side to keep the API surface small.
 *
 * Bolt 008-010: staff roles (admin / dispatcher / crew) no longer
 * see the misleading empty state when the activity feed returns
 * tickets — they get the same rows with a different title +
 * breadcrumb + no "+ Report" CTA (staff don't file reports).
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';
import { firstRenderablePhotoUrl, thumbnailBackground } from '@/lib/format/photo-url';
import { PhotoPlaceholder } from '@/components/ui/PhotoPlaceholder';
import { useLanguage } from '@/components/useLanguage';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';


type TicketStatus =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled';

interface ActivityItem {
  id: string;
  status: TicketStatus;
  categoryId: string;
  categoryName?: string;
  categoryNameBn?: string;
  wardId: string;
  wardName?: string;
  wardNameBn?: string;
  note: string | null;
  photoUrls: string[];
  createdAt: string;
  reporterId: string;
}

/**
 * The city configuration the page renders against.
 *
 * WHY NOT /api/report/bootstrap
 * -----------------------------
 * That endpoint is the REPORT FORM's bootstrap and is deliberately
 * citizen-only — its OpenAPI contract says "Only citizens file reports".
 * This page used to call it for the category list, which meant a
 * dispatcher (or crew, or admin) who landed here got a 403 and the
 * page fell into its "reports.error" state — even though the list
 * itself is explicitly designed to show staff every report filed in
 * the session's city (see the `isStaff` filter below).
 *
 * `/api/v1/activity/public` is the endpoint that actually serves the
 * city-config purpose: it works for every role, and it already returns
 * the city's `categories` and `wards` alongside the feed.
 */
interface CityConfig {
  categories: Array<{ id: string; name: string; nameBn: string | null }>;
  wards: Array<{ id: string; number: number; name: string; nameBn: string | null }>;
}

function formatAge(iso: string, lang: Language): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return lang === 'bn' ? 'এইমাত্র' : 'just now';
  if (minutes < 60) return lang === 'bn' ? `${minutes} মিনিট আগে` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'bn' ? `${hours} ঘণ্টা আগে` : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return lang === 'bn' ? `${days} দিন আগে` : `${days} day ago`;
}

function pillStyle(status: TicketStatus) {
  switch (status) {
    case 'resolved':
      return {
        bg: 'var(--color-status-resolved-soft)',
        fg: 'var(--color-status-resolved)',
      };
    case 'routed':
      return {
        bg: 'var(--color-status-routed-soft)',
        fg: 'var(--color-status-routed)',
      };
    case 'in_progress':
      return {
        bg: 'var(--color-status-in-progress-soft)',
        fg: 'var(--color-status-in-progress)',
      };
    case 'submitted':
      return {
        bg: 'var(--color-primary-soft)',
        fg: 'var(--color-primary)',
      };
    case 'closed':
    case 'cancelled':
      return {
        bg: 'var(--color-surface-raised)',
        fg: 'var(--color-ink-secondary)',
      };
    default:
      return {
        bg: 'var(--color-surface-raised)',
        fg: 'var(--color-ink-secondary)',
      };
  }
}

function statusLabelKey(status: TicketStatus): string {
  // Per the new i18n keys (reports.status.*). Falls back to the older
  // status.* keys for parity with the rest of the app if a status
  // value is added before the new key is registered.
  return `reports.status.${status}`;
}

export default function ReportsListPage() {
  const { lang, setLang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Bolt 008-010: capture the session role so we can render the
  // staff view ("All city reports") for admin / dispatcher / crew.
  const [role, setRole] = useState<'citizen' | 'dispatcher' | 'crew' | 'admin' | null>(
    null,
  );
  const [config, setConfig] = useState<CityConfig | null>(null);
  const [tickets, setTickets] = useState<ActivityItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The session comes from the shared `SessionProvider` — the page no
  // longer issues its own `/api/auth/status` request.
  const { authenticated, session } = useSession();

  useEffect(() => {
    setSearchQuery(new URLSearchParams(window.location.search).get('q') ?? '');
  }, []);

  // Auth + city config + ticket fetch
  //
  // The session comes from the shared `SessionProvider`; this page
  // reads it instead of issuing its own `/api/auth/status` request.
  //
  // The city config comes from `/api/v1/activity/public`, which serves
  // every role. It used to come from `/api/report/bootstrap`, a
  // citizen-only endpoint — so a dispatcher landing here got a 403 and
  // the page fell into its "reports.error" state, even though the list
  // below is explicitly designed to show staff every report in the city.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    let cancelled = false;
    (async () => {
      try {
        if (!authenticated) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        setUserId(session?.userId ?? null);
        setRole(session?.role ?? null);

        const cfgRes = await fetch('/api/v1/activity/public?limit=1', {
          credentials: 'include',
        });
        if (!cfgRes.ok) {
          setError('reports.error');
          setLoading(false);
          return;
        }
        const cfg = (await cfgRes.json()) as {
          categories: CityConfig['categories'];
          wards: CityConfig['wards'];
        };
        if (cancelled) return;
        setConfig({ categories: cfg.categories ?? [], wards: cfg.wards ?? [] });

        const actRes = await fetch('/api/v1/activity?limit=50', { credentials: 'include' });
        if (!actRes.ok) {
          setError('reports.error');
          setLoading(false);
          return;
        }
        const data = (await actRes.json()) as {
          tickets: Array<{
            id: string;
            status: TicketStatus;
            categoryId: string;
            wardId: string;
            wardName?: string | null;
            wardNameBn?: string | null;
            note: string | null;
            photoUrls: string[];
            createdAt: string;
            reporterId: string;
          }>;
        };
        if (cancelled) return;
        const items: ActivityItem[] = data.tickets.map((t) => {
          // The locally-fetched config, not the state: the state is
          // still null on this first pass, and the category/ward names
          // would come out blank.
          const cat = cfg.categories.find((c) => c.id === t.categoryId);
          // The row's ward is the ward the ticket was FILED IN, which
          // is what the serializer already returns. The city's ward list
          // is the fallback for a row whose ward was not hydrated.
          const ward = cfg.wards.find((w) => w.id === t.wardId);
          return {
            id: t.id,
            status: t.status,
            categoryId: t.categoryId,
            categoryName: cat?.name,
            categoryNameBn: cat?.nameBn ?? cat?.name,
            wardId: t.wardId,
            wardName: t.wardName ?? ward?.name,
            wardNameBn: t.wardNameBn ?? ward?.nameBn ?? ward?.name,
            note: t.note,
            photoUrls: t.photoUrls,
            createdAt: t.createdAt,
            reporterId: t.reporterId,
          };
        });
        setTickets(items);
        setError(null);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('reports.error');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session]);

  // Citizens see only their own reports; staff (admin / dispatcher /
  // crew) see every report filed in the session's city — the API
  // already scopes to session.cityId. The activity endpoint is
  // city-scoped for every role (Bolt 008-009), so this filter is
  // safe: a non-citizen role can never see another city's tickets.
  const isStaff = role !== null && role !== 'citizen';
  const mine = useMemo(
    () => (isStaff ? tickets : userId ? tickets.filter((t) => t.reporterId === userId) : []),
    [tickets, userId, isStaff],
  );
  const visibleReports = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    if (!needle) return mine;
    return mine.filter((ticket) => [ticket.id, ticket.note, ticket.categoryName, ticket.categoryNameBn, ticket.wardName, ticket.wardNameBn]
      .some((value) => value?.toLocaleLowerCase().includes(needle)));
  }, [mine, searchQuery]);

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    // The hook's setter persists the choice AND publishes the
    // `cityfix:language-updated` event.
    setLang(next);
  }

  if (signedIn === false) {
    return (
      <div
        style={{
          minHeight: '100%',
          background: 'var(--color-surface-page)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--space-7) var(--space-5)',
        }}
      >
        <div style={{ maxWidth: 480, textAlign: 'center' }}>
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-lg)',
              color: 'var(--color-ink-secondary)',
              margin: '0 0 var(--space-5)',
            }}
          >
            {t('reports.signin_required', null, lang)}
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

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      {/* Content column. Note: the global AppHeader (rendered by the
          /reports/layout's AppShell) is the only `<header>` on this
          page. This page uses an H1 + breadcrumb + Report CTA block
          instead of a second `<header>` element to avoid stacking
          two `<header>` landmarks (which screen readers and Playwright
          visual-regression tests both flag as duplicate chrome). */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'center',
          padding: 'var(--space-6) var(--space-5)',
          minHeight: 0,
          overflowY: 'auto',
        }}
      >
        <div style={{ width: '100%', maxWidth: 720 }}>
          <span
            lang={lang}
            style={{
              display: 'block',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              marginBottom: 'var(--space-2)',
            }}
          >
            {t(isStaff ? 'reports.breadcrumb.all' : 'reports.breadcrumb', null, lang)}
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexWrap: 'wrap',
              marginBottom: 'var(--space-5)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h1
                lang={lang}
                style={{
                  fontSize: 'var(--text-h1)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-ink)',
                  margin: '0 0 var(--space-2)',
                  letterSpacing: 'var(--tracking-tight)',
                }}
              >
                {t(isStaff ? 'reports.title.all' : 'reports.title', null, lang)}
              </h1>
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink-secondary)',
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {t(isStaff ? 'reports.subtitle.all' : 'reports.subtitle', null, lang)}
              </p>
            </div>
            {/* Bolt 008-010: staff don't file reports, so the "+ Report"
                CTA is hidden for non-citizen roles. The empty state
                below also omits its CTA for staff. */}
            {!isStaff && (
            <Link
              href="/report/location"
              lang={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-1)',
                padding: 'var(--space-2) var(--space-4)',
                background: 'var(--color-primary)',
                color: 'var(--color-on-primary)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--text-body-sm)',
                fontWeight: 'var(--weight-semibold)',
                textDecoration: 'none',
                flexShrink: 0,
              }}
            >
              {t('reports.empty.cta', null, lang)}
            </Link>
            )}
          </div>

          {/* Loading / error / empty / list */}
          {loading && (
            <SkeletonStatus lang={lang} className="reports-loading-list">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="reports-loading-card">
                  <SkeletonBlock style={{ width: 72, height: 72, borderRadius: 'var(--radius-md)', flex: '0 0 auto' }} />
                  <div style={{ display: 'grid', gap: 9, flex: 1 }}>
                    <SkeletonBlock style={{ width: '52%', height: 15 }} />
                    <SkeletonBlock style={{ width: '86%', height: 12 }} />
                    <SkeletonBlock style={{ width: '36%', height: 11 }} />
                  </div>
                  <SkeletonBlock className="reports-loading-status" style={{ width: 84, height: 24, borderRadius: 999 }} />
                </div>
              ))}
            </SkeletonStatus>
          )}

          {error && !loading && (
            <p
              lang={lang}
              style={{
                color: 'var(--color-danger)',
                fontSize: 'var(--text-body)',
              }}
            >
              {t('feed.error', null, lang)}
            </p>
          )}

          {!loading && !error && visibleReports.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--space-7) var(--space-5)',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
              }}
            >
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-h3)',
                  fontWeight: 'var(--weight-semibold)',
                  color: 'var(--color-ink)',
                  margin: '0 0 var(--space-2)',
                }}
              >
                {t(isStaff ? 'reports.empty.title.all' : 'reports.empty.title', null, lang)}
              </p>
              <p
                lang={lang}
                style={{
                  fontSize: 'var(--text-body)',
                  color: 'var(--color-ink-secondary)',
                  margin: '0 0 var(--space-5)',
                  lineHeight: 1.5,
                }}
              >
                {t(isStaff ? 'reports.empty.subtitle.all' : 'reports.empty.subtitle', null, lang)}
              </p>
              {!isStaff && (
              <Link
                href="/report/location"
                lang={lang}
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
                {t('reports.empty.cta', null, lang)}
              </Link>
              )}
            </div>
          )}

          {!loading && !error && visibleReports.length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
              }}
            >
              {visibleReports.map((tkt) => {
                const pill = pillStyle(tkt.status);
                const catName =
                  lang === 'bn'
                    ? tkt.categoryNameBn ?? tkt.categoryName
                    : tkt.categoryName ?? tkt.categoryNameBn;
                const wardName =
                  lang === 'bn'
                    ? tkt.wardNameBn ?? tkt.wardName
                    : tkt.wardName ?? tkt.wardNameBn;
                /*
                 * The report thumbnail. The stored photo URL can be an
                 * inline `data:image/…` URL (the default — the photo
                 * picker inlines the file bytes), an absolute
                 * `https://` URL (R2/S3 with a public base URL), or a
                 * root-relative `/api/blob/…` path (the local blob
                 * provider). `firstRenderablePhotoUrl` picks the first
                 * URL we can actually render; the shared placeholder
                 * is the genuine "no photo attached" state.
                 */
                const photoUrl = firstRenderablePhotoUrl(tkt.photoUrls);
                const thumbBackground = thumbnailBackground(photoUrl);
                return (
                  <li key={tkt.id}>
                    <Link
                      href={`/reports/${tkt.id}`}
                      style={{
                        display: 'flex',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-4)',
                        background: 'var(--color-surface-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        color: 'var(--color-ink)',
                      }}
                    >
                      {thumbBackground ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={photoUrl!}
                          alt=""
                          aria-hidden
                          loading="lazy"
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 'var(--radius-sm)',
                            objectFit: 'cover',
                            background: 'var(--color-surface-raised)',
                            flexShrink: 0,
                          }}
                        />
                      ) : (
                        /* No renderable photo → the shared "no photo" empty state. */
                        <PhotoPlaceholder size={56} lang={lang} />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-2)',
                            marginBottom: 'var(--space-2)',
                          }}
                        >
                          <span
                            lang={lang}
                            style={{
                              display: 'inline-block',
                              padding: '2px 10px',
                              background: pill.bg,
                              color: pill.fg,
                              fontSize: 'var(--text-caption)',
                              fontWeight: 'var(--weight-semibold)',
                              borderRadius: 'var(--radius-pill)',
                            }}
                          >
                            {t(statusLabelKey(tkt.status), null, lang)}
                          </span>
                          <span
                            lang={lang}
                            style={{
                              fontSize: 'var(--text-caption)',
                              color: 'var(--color-ink-tertiary)',
                            }}
                          >
                            {formatAge(tkt.createdAt, lang)}
                          </span>
                        </div>
                        <div
                          lang={lang}
                          style={{
                            fontSize: 'var(--text-body-lg)',
                            fontWeight: 'var(--weight-semibold)',
                            color: 'var(--color-ink)',
                            marginBottom: 'var(--space-1)',
                          }}
                        >
                          {catName ?? tkt.categoryId}
                          {wardName ? ` · ${wardName}` : ''}
                        </div>
                        {tkt.note && (
                          <p
                            lang={lang}
                            style={{
                              fontSize: 'var(--text-body-sm)',
                              color: 'var(--color-ink-secondary)',
                              margin: 0,
                              lineHeight: 1.4,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {tkt.note}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
