/**
 * /admin/cities — the admin's cities overview.
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 * Lists the cities the admin administers
 * (admins bypass the cross-city check
 * per ADR-006). Each row: name, status
 * (live / setup / paused), counts of
 * wards / categories / departments.
 *
 * Auth gate: redirects to /login if
 * no session is resolved. The API
 * also enforces the same gate
 * (`requireRole('admin')`).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { AdminPageSkeleton, SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';

const LANG_KEY = 'cityfix.preferred_language.v1';

interface AdminCity {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  defaultLanguage: 'bn' | 'en';
  dedupRadiusMeters: number;
  status: 'live' | 'setup' | 'paused';
  counts: {
    dispatchers: number;
    crews: number;
    ticketsPerDay: number;
    wards: number;
    categories: number;
    departments: number;
  };
}

export default function AdminCitiesPage() {
  const pathname = usePathname();
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();
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

  // Auth + role gate.
  //
  // The API independently enforces `requireRole('admin')` on
  // `/api/v1/admin/cities`, but a non-admin user who lands here
  // directly (e.g. a bookmark, a stale link) would otherwise see
  // an empty `http_403` page instead of a clean redirect to their
  // own home. We check the role on the client too and bounce
  // non-admins to `/` (the splash / role-aware router) so the UX
  // matches the dispatcher's and crew's pages.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    let cancelled = false;
    (async () => {
      try {
        if (!authenticated) {
          // Forward `?next=/admin/cities` so the admin can resume after
          // sign-in. (Admin accounts sign in via WebAuthn, but if a
          // session has expired mid-page-load we want the same UX.)
          window.location.href =
            '/login?next=' + encodeURIComponent(pathname || '/admin/cities');
          return;
        }
        if (session?.role !== 'admin') {
          window.location.href = '/';
          return;
        }
        setSignedIn(true);
        const res = await fetch('/api/v1/admin/cities', {
          credentials: 'include',
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(`http_${res.status}`);
          return;
        }
        const data = (await res.json()) as { cities: AdminCity[] };
        setCities(data.cities);
      } catch (e) {
        if (!cancelled) setError('network');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session, pathname]);

  const handleNewCity = useCallback(async () => {
    const slug = window.prompt(
      t('admin.cities.cta.newCity', null, lang) + ' (slug)',
    );
    if (!slug) return;
    const res = await fetch('/api/v1/admin/cities', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        slug: slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
        name: slug,
        defaultLanguage: 'bn',
        dedupRadiusMeters: 50,
        applyDhakaTemplate: true,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { city: AdminCity };
      setCities((prev) => (prev ? [...prev, data.city] : [data.city]));
    } else {
      setError(`http_${res.status}`);
    }
  }, [lang]);

  if (signedIn === null && !error) {
    return <AdminPageSkeleton lang={lang} />;
  }

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
          <span className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.cities.title', null, lang)}
          </span>
          <span className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
            {t('admin.cities.subtitle', null, lang)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/audit"
            className="admin-pill rounded-full px-3 py-1 text-xs font-medium"
          >
            {t('admin.audit.title', null, lang)}
          </Link>
          <Link
            href="/admin/tickets"
            className="admin-pill rounded-full px-3 py-1 text-xs font-medium"
          >
            {t('admin.tickets.title', null, lang)}
          </Link>
        </div>
      </div>
      <main className="px-6 py-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.cities.title', null, lang)}
          </h1>
          <button
            type="button"
            className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium"
            onClick={handleNewCity}
          >
            {t('admin.cities.cta.newCity', null, lang)}
          </button>
        </div>
        {error ? (
          <div
            className="rounded border p-3 text-sm"
            style={{
              borderColor: 'var(--color-danger)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-danger)',
            }}
          >
            {error}
          </div>
        ) : null}
        {!cities && !error ? (
          <SkeletonStatus lang={lang} className="admin-city-list-skeleton">
            {[0, 1, 2, 3, 4].map((row) => <div className="admin-city-skeleton-row" key={row}><SkeletonBlock style={{ width: `${34 + row % 3 * 12}%`, height: 15 }} /><SkeletonBlock style={{ width: 90, height: 22, borderRadius: 999 }} /><SkeletonBlock style={{ width: 58, height: 14 }} /><SkeletonBlock style={{ width: 92, height: 14 }} /></div>)}
          </SkeletonStatus>
        ) : !cities ? null : cities.length === 0 ? (
          <div
            className="rounded border p-8 text-center text-sm"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-surface-card)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            {t('admin.cities.empty', null, lang)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Seven columns cannot fit a 390px phone. The wrapper
                scrolls sideways and the table's `minWidth` stops the
                browser from squeezing every column into a sliver. */}
            <table className="w-full min-w-[720px] text-sm">
            <thead
              className="text-left"
              style={{
                background: 'var(--color-surface-sunken)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              <tr>
                <th className="text-left px-4 py-2">
                  {t('admin.cities.col.name', null, lang)}
                </th>
                <th className="text-left px-4 py-2">
                  {t('admin.cities.col.status', null, lang)}
                </th>
                <th className="text-right px-4 py-2">
                  {t('admin.cities.col.ticketsPerDay', null, lang)}
                </th>
                <th className="text-right px-4 py-2">
                  {t('admin.cities.col.wards', null, lang)}
                </th>
                <th className="text-right px-4 py-2">
                  {t('admin.cities.col.categories', null, lang)}
                </th>
                <th className="text-right px-4 py-2">
                  {t('admin.cities.col.departments', null, lang)}
                </th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody style={{ background: 'var(--color-surface-card)' }}>
              {cities.map((c) => (
                <tr
                  key={c.id}
                  className="border-t"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  <td
                    className="px-4 py-3 font-medium"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    {lang === 'bn' ? c.nameBn ?? c.name : c.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-full px-2 py-1 text-xs"
                      style={{
                        background:
                          c.status === 'live'
                            ? 'var(--color-success-soft, var(--color-surface-sunken))'
                            : c.status === 'setup'
                              ? 'var(--color-warning-soft, var(--color-surface-sunken))'
                              : 'var(--color-surface-sunken)',
                        color:
                          c.status === 'live'
                            ? 'var(--color-success)'
                            : c.status === 'setup'
                              ? 'var(--color-warning)'
                              : 'var(--color-ink-secondary)',
                      }}
                    >
                      {t(`admin.cities.status.${c.status}`, null, lang)}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: 'var(--color-ink-secondary)' }}
                  >
                    {c.counts.ticketsPerDay}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: 'var(--color-ink-secondary)' }}
                  >
                    {c.counts.wards}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: 'var(--color-ink-secondary)' }}
                  >
                    {c.counts.categories}
                  </td>
                  <td
                    className="px-4 py-3 text-right"
                    style={{ color: 'var(--color-ink-secondary)' }}
                  >
                    {c.counts.departments}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="flex items-center justify-end gap-3">
                      <Link
                        className="hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                        href={`/admin/cities/${c.id}/adoption`}
                        data-testid={`admin-cities-link-adoption-${c.id}`}
                      >
                        {t('admin.cities.viewAdoption', null, lang)}
                      </Link>
                      <Link
                        className="hover:underline"
                        style={{ color: 'var(--color-primary)' }}
                        href={`/admin/cities/${c.id}/setup`}
                      >
                        {t('admin.cities.cta.view', null, lang)}
                      </Link>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
