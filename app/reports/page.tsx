/**
 * 1.6 My Reports — list view.
 *
 * Phase B (2026-10-04): web-first, 1440×900 + 1024×768 viewports. The
 * top bar (64px) carries brand + breadcrumb + Home link + language toggle
 * + theme toggle + avatar. The content area shows the citizen's own
 * tickets (filtered from /api/v1/activity by reporterId). Each row links
 * to the re-skinned detail page at /reports/[id].
 *
 * The home top bar's "My reports" link points here, so this page
 * replaces the previous 404. It reuses the activity feed for data; we
 * filter client-side to keep the API surface small.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';

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

interface Bootstrap {
  city: { id: string; name: string; nameBn: string | null };
  categories: Array<{ id: string; name: string; nameBn: string | null }>;
  // The /api/report/bootstrap endpoint returns the citizen's own ward
  // (`ward`, singular) plus the category list — it does NOT enumerate
  // every ward. The /reports list is filtered to this citizen's own
  // reports, so showing the citizen's ward name from `ward` is sufficient
  // for the v1 surface. Future v1.1 work can add a wards endpoint.
  ward: { id: string; name: string; nameBn: string | null } | null;
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
        bg: 'var(--color-status-resolved-soft, #d4edda)',
        fg: 'var(--color-status-resolved, #1f7a3f)',
      };
    case 'routed':
      return {
        bg: 'var(--color-status-routed-soft, #cfe2ff)',
        fg: 'var(--color-status-routed, #0b5ed7)',
      };
    case 'in_progress':
      return {
        bg: 'var(--color-status-in-progress-soft, #fff3cd)',
        fg: 'var(--color-status-in-progress, #b58410)',
      };
    case 'submitted':
      return {
        bg: 'var(--color-primary-soft, #e6f2ee)',
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
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [tickets, setTickets] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_KEY);
      if (stored === 'en' || stored === 'bn') setLang(stored);
    } catch {
      // ignore
    }
  }, []);

  // Auth + bootstrap + ticket fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', { credentials: 'include' });
        const status = (await statusRes.json()) as {
          authenticated: boolean;
          session?: { userId: string };
        };
        if (cancelled) return;
        if (!status.authenticated) {
          setSignedIn(false);
          return;
        }
        setSignedIn(true);
        setUserId(status.session?.userId ?? null);

        const bootRes = await fetch('/api/report/bootstrap', { credentials: 'include' });
        if (!bootRes.ok) {
          setError('reports.error');
          setLoading(false);
          return;
        }
        const boot = (await bootRes.json()) as {
          city: Bootstrap['city'];
          categories: Bootstrap['categories'];
          ward: Bootstrap['ward'];
        };
        if (cancelled) return;
        setBootstrap({
          city: boot.city,
          categories: boot.categories,
          ward: boot.ward,
        });

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
            note: string | null;
            photoUrls: string[];
            createdAt: string;
            reporterId: string;
          }>;
        };
        if (cancelled) return;
        const items: ActivityItem[] = data.tickets.map((t) => {
          const cat = boot.categories.find((c) => c.id === t.categoryId);
          // For v1 the citizen's own reports are always filed in the
          // citizen's own ward (cross-ward filing is a v1.1 surface), so
          // we surface the citizen's ward as the row's ward label.
          const ward = boot.ward;
          return {
            id: t.id,
            status: t.status,
            categoryId: t.categoryId,
            categoryName: cat?.name,
            categoryNameBn: cat?.nameBn ?? cat?.name,
            wardId: t.wardId,
            wardName: ward?.name,
            wardNameBn: ward?.nameBn ?? ward?.name,
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
  }, []);

  // Only this citizen's own reports
  const mine = useMemo(
    () => (userId ? tickets.filter((t) => t.reporterId === userId) : []),
    [tickets, userId],
  );

  function toggleLang() {
    const next: Language = lang === 'bn' ? 'en' : 'bn';
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  if (signedIn === false) {
    return (
      <div
        style={{
          minHeight: '100vh',
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
      {/* Content column */}
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
          <header style={{ marginBottom: 'var(--space-5)' }}>
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
              {t('reports.breadcrumb', null, lang)}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 'var(--space-3)',
                flexWrap: 'wrap',
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
                  {t('reports.title', null, lang)}
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
                  {t('reports.subtitle', null, lang)}
                </p>
              </div>
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
            </div>
          </header>

          {/* Loading / error / empty / list */}
          {loading && (
            <p
              lang={lang}
              style={{
                color: 'var(--color-ink-secondary)',
                fontSize: 'var(--text-body)',
              }}
            >
              {t('feed.loading', null, lang)}
            </p>
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

          {!loading && !error && mine.length === 0 && (
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
                {t('reports.empty.title', null, lang)}
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
                {t('reports.empty.subtitle', null, lang)}
              </p>
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
            </div>
          )}

          {!loading && !error && mine.length > 0 && (
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
              {mine.map((tkt) => {
                const pill = pillStyle(tkt.status);
                const catName =
                  lang === 'bn'
                    ? tkt.categoryNameBn ?? tkt.categoryName
                    : tkt.categoryName ?? tkt.categoryNameBn;
                const wardName =
                  lang === 'bn'
                    ? tkt.wardNameBn ?? tkt.wardName
                    : tkt.wardName ?? tkt.wardNameBn;
                return (
                  <li key={tkt.id}>
                    <Link
                      href={`/reports/${tkt.id}`}
                      style={{
                        display: 'block',
                        padding: 'var(--space-4)',
                        background: 'var(--color-surface-card)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        textDecoration: 'none',
                        color: 'var(--color-ink)',
                      }}
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
