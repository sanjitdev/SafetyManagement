/**
 * /admin — the admin's landing page.
 *
 * WHY THIS PAGE EXISTS
 * --------------------
 * `app/admin/` used to hold only `layout.tsx` plus the three
 * sub-routes `audit/`, `cities/` and `tickets/`. With no
 * `app/admin/page.tsx`, `GET /admin` was a 404 — but its three
 * children all resolved fine. So an admin who typed `/admin`, or
 * whose session redirect landed there, got a 404 rather than their
 * home. This page closes that gap.
 *
 * It also makes `ROLE_HOME.admin` = `/admin` honest: the role→home
 * mapping in `lib/role-home.ts` used to point the admin at
 * `/admin/tickets` purely because no index route existed. Now there
 * is an index, so the admin lands here — a card grid linking every
 * admin surface.
 *
 * AUTH GATE
 * ---------
 * Same client-side pattern as `/admin/cities` and `/admin/tickets`:
 * unauthenticated → `/login?next=/admin`; authenticated but not an
 * admin → `/` (the splash / role-aware router). The APIs under
 * `/api/v1/admin/*` independently enforce `requireRole('admin')`,
 * so this gate is UX, not security — a non-admin who bypassed it
 * would get 403s from the APIs, not data.
 *
 * The page fetches `/api/v1/admin/cities` so the header can name
 * the city the admin is operating in; a failure to load it degrades
 * to a blank city line rather than blocking the navigation cards,
 * because the links themselves are the point of this page.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { AdminSecurityKey } from '@/components/AdminSecurityKey';

const LANG_KEY = 'cityfix.preferred_language.v1';

interface AdminCity {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  status: 'live' | 'setup' | 'paused';
}

/**
 * The admin surfaces this page links to.
 *
 * `href` is the surface root; `count` is the number of cities (or
 * city-scoped drill-downs) behind it, used only for the card's
 * supporting line.
 */
interface AdminSurface {
  key: string;
  href: string;
  titleKey:
    | 'admin.home.card.reports.title'
    | 'admin.home.card.audit.title'
    | 'admin.home.card.cities.title'
    | 'admin.home.card.setup.title';
  bodyKey:
    | 'admin.home.card.reports.body'
    | 'admin.home.card.audit.body'
    | 'admin.home.card.cities.body'
    | 'admin.home.card.setup.body';
}

const SURFACES: AdminSurface[] = [
  {
    key: 'reports',
    href: '/admin/tickets',
    titleKey: 'admin.home.card.reports.title',
    bodyKey: 'admin.home.card.reports.body',
  },
  {
    key: 'audit',
    href: '/admin/audit',
    titleKey: 'admin.home.card.audit.title',
    bodyKey: 'admin.home.card.audit.body',
  },
  {
    key: 'cities',
    href: '/admin/cities',
    titleKey: 'admin.home.card.cities.title',
    bodyKey: 'admin.home.card.cities.body',
  },
];

export default function AdminHomePage() {
  const pathname = usePathname();
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [cities, setCities] = useState<AdminCity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LANG_KEY)
        : null;
    if (stored === 'bn' || stored === 'en') setLang(stored);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, lang);
    }
  }, [lang]);

  // Auth + role gate. Same shape as the sibling admin pages: the
  // API enforces the real authorisation; this keeps a stray
  // bookmark from showing a bare `http_403` page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', {
          credentials: 'include',
        });
        const status = (await statusRes.json()) as {
          authenticated: boolean;
          session?: { role: 'citizen' | 'dispatcher' | 'crew' | 'admin' } | null;
        };
        if (cancelled) return;
        if (!status.authenticated) {
          window.location.href =
            '/login?next=' + encodeURIComponent(pathname || '/admin');
          return;
        }
        if (status.session?.role !== 'admin') {
          window.location.href = '/';
          return;
        }
        setSignedIn(true);
      } catch {
        if (cancelled) return;
        setSignedIn(false);
        window.location.href =
          '/login?next=' + encodeURIComponent(pathname || '/admin');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The city list is decoration on this page — it names the city
  // the admin is operating in. If it fails we still show every card.
  const loadCities = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/cities', {
        credentials: 'include',
      });
      if (!res.ok) {
        setError(`http_${res.status}`);
        return;
      }
      const data = (await res.json()) as { cities: AdminCity[] };
      setCities(data.cities);
    } catch {
      setError('network');
    }
  }, []);

  useEffect(() => {
    if (signedIn !== true) return;
    loadCities();
  }, [signedIn, loadCities]);

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm" style={{ color: 'var(--color-ink-secondary)' }}>
        {t('admin.home.loading', null, lang)}
      </div>
    );
  }

  const liveCities = (cities ?? []).filter((c) => c.status === 'live');

  return (
    <div className="min-h-full" style={{ background: 'var(--color-surface-page)' }}>
      <div
        className="border-b px-6 py-4 flex items-center justify-between flex-wrap gap-3"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-page)',
        }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.home.title', null, lang)}
          </h1>
          <span className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
            {t('admin.home.subtitle', null, lang)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/cities"
            className="admin-pill rounded-full px-3 py-1 text-xs font-medium"
          >
            {t('admin.home.cta.cities', null, lang)}
          </Link>
          <Link
            href="/admin/audit"
            className="admin-pill rounded-full px-3 py-1 text-xs font-medium"
          >
            {t('admin.home.cta.audit', null, lang)}
          </Link>
          <Link
            href="/admin/tickets"
            className="admin-pill rounded-full px-3 py-1 text-xs font-medium"
          >
            {t('admin.home.cta.reports', null, lang)}
          </Link>
        </div>
      </div>

      <main className="px-6 py-8 max-w-6xl mx-auto">
        {error ? (
          <div
            className="rounded border p-3 text-sm mb-4"
            data-testid="admin-home-error"
            style={{
              borderColor: 'var(--color-warning)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-warning)',
            }}
          >
            {t('admin.home.error', null, lang)}
          </div>
        ) : null}

        {/*
          A 3-card grid does not fit a 390px phone, so the grid
          collapses to one column below the `md` breakpoint. The
          cards themselves are links — the whole card is the
          hit target, which matters on a phone.
        */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SURFACES.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              data-testid={`admin-home-card-${s.key}`}
              className="admin-card-hover rounded-lg border p-5 hover:shadow-sm transition-colors flex flex-col"
              style={{
                borderColor: 'var(--color-border)',
                background: 'var(--color-surface-card)',
              }}
            >
              <h2
                className="text-base font-semibold"
                style={{ color: 'var(--color-ink)' }}
              >
                {t(s.titleKey, null, lang)}
              </h2>
              <p
                className="mt-2 text-sm flex-1"
                style={{ color: 'var(--color-ink-secondary)' }}
              >
                {t(s.bodyKey, null, lang)}
              </p>
              <span
                className="mt-4 text-xs font-medium"
                style={{ color: 'var(--color-primary)' }}
              >
                {t('admin.home.open', null, lang)} →
              </span>
            </Link>
          ))}
        </div>

        {/*
          The security-key registration. ADR-007 requires a
          WebAuthn assertion for EVERY admin write, so without a
          registered key this admin can read everything and
          change nothing. This panel is where the key gets
          enrolled — the ceremony component and the challenge
          endpoint both existed, but neither was reachable from
          any page until this mount point.
        */}
        <div className="mt-8">
          <AdminSecurityKey lang={lang} />
        </div>

        {/*
          The city strip is the per-city drill-down entry point:
          each live city links to its own setup surface, where
          wards / categories / departments / users live.
        */}
        {liveCities.length > 0 ? (
          <section className="mt-8">
            <h2
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: 'var(--color-ink-tertiary)' }}
            >
              {t('admin.home.card.setup.title', null, lang)}
            </h2>
            <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {liveCities.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/cities/${c.id}/setup`}
                    data-testid={`admin-home-city-${c.id}`}
                    className="admin-card-hover block rounded-lg border px-4 py-3 transition-colors"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'var(--color-surface-card)',
                    }}
                  >
                    <span
                      className="block text-sm font-medium"
                      style={{ color: 'var(--color-ink)' }}
                    >
                      {lang === 'bn' ? c.nameBn ?? c.name : c.name}
                    </span>
                    <span
                      className="block mt-1 text-xs"
                      style={{ color: 'var(--color-ink-tertiary)' }}
                    >
                      {t('admin.home.card.setup.body', null, lang)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  );
}
