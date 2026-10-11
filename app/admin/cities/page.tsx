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
import { t, type Language } from '@/lib/i18n/keys';
import { ThemeToggle } from '@/components/ThemeToggle';

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const statusRes = await fetch('/api/auth/status', {
          credentials: 'include',
        });
        const status = (await statusRes.json()) as { authenticated: boolean };
        if (cancelled) return;
        setSignedIn(status.authenticated);
        if (!status.authenticated) {
          window.location.href = '/login';
          return;
        }
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
  }, []);

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

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.cities.title', null, lang)} …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold text-slate-900">
            {t('admin.cities.title', null, lang)}
          </span>
          <span className="text-xs text-slate-500">
            {t('admin.cities.subtitle', null, lang)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-slate-600"
            onClick={() => setLang(lang === 'bn' ? 'en' : 'bn')}
          >
            {lang === 'bn' ? 'EN' : 'বাংলা'}
          </button>
          <ThemeToggle />
        </div>
      </header>
      <main className="px-6 py-8 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">
            {t('admin.cities.title', null, lang)}
          </h1>
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={handleNewCity}
          >
            {t('admin.cities.cta.newCity', null, lang)}
          </button>
        </div>
        {error ? (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        {!cities ? (
          <div className="text-sm text-slate-600">…</div>
        ) : cities.length === 0 ? (
          <div className="rounded border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
            {t('admin.cities.empty', null, lang)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-slate-700">
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
                <th className="text-right px-4 py-2">Wards</th>
                <th className="text-right px-4 py-2">Categories</th>
                <th className="text-right px-4 py-2">Departments</th>
                <th className="text-right px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {cities.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {c.name}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        c.status === 'live'
                          ? 'rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700'
                          : c.status === 'setup'
                            ? 'rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700'
                            : 'rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700'
                      }
                    >
                      {t(`admin.cities.status.${c.status}`, null, lang)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {c.counts.ticketsPerDay}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {c.counts.wards}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {c.counts.categories}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {c.counts.departments}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      className="text-emerald-700 hover:underline"
                      href={`/admin/cities/${c.id}/setup`}
                    >
                      {t('admin.cities.cta.view', null, lang)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}