/**
 * /admin/cities/[id]/taxonomy —
 * departments + categories tables
 * + dedup-radius slider.
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 * The page wires to:
 *   - GET/PATCH /api/v1/admin/cities/[id]
 *     (the dedup-radius slider)
 *   - GET/POST /api/v1/admin/cities/[id]/departments
 *   - PATCH/DELETE .../departments/[deptId]
 *   - GET/POST .../categories
 *   - PATCH/DELETE .../categories/[catId]
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';

const LANG_KEY = 'cityfix.preferred_language.v1';

interface City {
  id: string;
  name: string;
  nameBn: string | null;
  dedupRadiusMeters: number;
}

interface Department {
  id: string;
  cityId: string;
  slug: string;
  name: string;
  nameBn: string | null;
}

interface Category {
  id: string;
  cityId: string;
  departmentId: string | null;
  slug: string;
  name: string;
  nameBn: string | null;
  narrowCategoryPhotoCap: number | null;
}

export default function TaxonomyPage() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingRadius, setSavingRadius] = useState(false);
  const [newDept, setNewDept] = useState({ slug: '', name: '' });
  const [newCat, setNewCat] = useState({ slug: '', name: '', departmentId: '' });

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

  const refresh = useCallback(async () => {
    const [cityRes, deptRes, catRes] = await Promise.all([
      fetch(`/api/v1/admin/cities/${id}`, { credentials: 'include' }),
      fetch(`/api/v1/admin/cities/${id}/departments`, {
        credentials: 'include',
      }),
      fetch(`/api/v1/admin/cities/${id}/categories`, {
        credentials: 'include',
      }),
    ]);
    if (cityRes.ok) {
      const data = (await cityRes.json()) as { city: City };
      setCity(data.city);
    }
    if (deptRes.ok) {
      const data = (await deptRes.json()) as { departments: Department[] };
      setDepartments(data.departments);
    }
    if (catRes.ok) {
      const data = (await catRes.json()) as { categories: Category[] };
      setCategories(data.categories);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
          '/login?next=' + encodeURIComponent(pathname || '/admin/cities');
        return;
      }
      if (status.session?.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setSignedIn(true);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleSaveRadius = useCallback(async () => {
    if (!city) return;
    setSavingRadius(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/cities/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dedupRadiusMeters: city.dedupRadiusMeters }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        };
        setError(data?.error ?? `http_${res.status}`);
        return;
      }
      await refresh();
    } finally {
      setSavingRadius(false);
    }
  }, [city, id, refresh]);

  const handleCreateDept = useCallback(async () => {
    if (!newDept.slug || !newDept.name) return;
    const res = await fetch(
      `/api/v1/admin/cities/${id}/departments`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(newDept),
      },
    );
    if (res.ok) {
      setNewDept({ slug: '', name: '' });
      await refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string };
      setError(data?.error ?? `http_${res.status}`);
    }
  }, [newDept, id, refresh]);

  const handleDeleteDept = useCallback(
    async (deptId: string) => {
      const res = await fetch(
        `/api/v1/admin/cities/${id}/departments/${deptId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (res.ok) {
        await refresh();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          count?: number;
        };
        setError(data?.error ?? `http_${res.status}`);
      }
    },
    [id, refresh],
  );

  const handleCreateCat = useCallback(async () => {
    if (!newCat.slug || !newCat.name) return;
    const body: Record<string, unknown> = {
      slug: newCat.slug,
      name: newCat.name,
    };
    if (newCat.departmentId) body.departmentId = newCat.departmentId;
    const res = await fetch(
      `/api/v1/admin/cities/${id}/categories`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      setNewCat({ slug: '', name: '', departmentId: '' });
      await refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string };
      setError(data?.error ?? `http_${res.status}`);
    }
  }, [newCat, id, refresh]);

  const handleDeleteCat = useCallback(
    async (catId: string) => {
      const res = await fetch(
        `/api/v1/admin/cities/${id}/categories/${catId}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (res.ok) {
        await refresh();
      } else {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        };
        setError(data?.error ?? `http_${res.status}`);
      }
    },
    [id, refresh],
  );

  if (signedIn === null || !city) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.taxonomy.title', null, lang)} …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/cities/${id}/setup`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← {lang === 'bn' ? city.nameBn ?? city.name : city.name}
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">
            {t('admin.taxonomy.title', null, lang)}
          </h1>
        </div>
      </div>
      <main className="px-6 py-8 max-w-6xl mx-auto space-y-6">
        {error ? (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
          <label className="block text-sm font-medium text-slate-900">
            {t('admin.taxonomy.dedupRadius', null, lang)}:{' '}
            {city.dedupRadiusMeters}m
          </label>
          <p className="text-xs text-slate-600">
            {t('admin.taxonomy.dedupRadius.helper', null, lang)}
          </p>
          <input
            type="range"
            min={1}
            max={500}
            step={1}
            value={city.dedupRadiusMeters}
            onChange={(e) =>
              setCity({ ...city, dedupRadiusMeters: Number(e.target.value) })
            }
            className="w-full"
          />
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={handleSaveRadius}
            disabled={savingRadius}
          >
            {t('admin.taxonomy.saveDedup', null, lang)}
          </button>
        </div>
        {/* Two side-by-side panels cannot fit a 390px phone — stack
            them so neither is squeezed to a sliver. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              {t('admin.taxonomy.departments', null, lang)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-slate-700">
                <tr>
                  <th className="px-2 py-1">
                    {t('admin.taxonomy.col.name', null, lang)}
                  </th>
                  <th className="px-2 py-1">
                    {t('admin.taxonomy.col.slug', null, lang)}
                  </th>
                  <th className="px-2 py-1 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-t border-slate-100">
                    <td className="px-2 py-2 text-slate-900">
                      {lang === 'bn' ? d.nameBn ?? d.name : d.name}
                    </td>
                    <td className="px-2 py-2 text-slate-600">{d.slug}</td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        onClick={() => handleDeleteDept(d.id)}
                      >
                        {t('admin.wards.cta.delete', null, lang)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
            {/* `min-w-0` lets the inputs shrink below their content
                width. Without it a flex item refuses to shrink, so
                the two inputs pushed the "new" button off the right
                edge of a 390px phone. */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.slug', null, lang)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                value={newDept.slug}
                onChange={(e) => setNewDept({ ...newDept, slug: e.target.value })}
              />
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.name', null, lang)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                value={newDept.name}
                onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
              />
              <button
                type="button"
                className="rounded bg-emerald-600 px-3 py-1 text-xs text-white shrink-0"
                onClick={handleCreateDept}
              >
                {t('admin.taxonomy.cta.newDept', null, lang)}
              </button>
            </div>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              {t('admin.taxonomy.categories', null, lang)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-slate-700">
                <tr>
                  <th className="px-2 py-1">
                    {t('admin.taxonomy.col.name', null, lang)}
                  </th>
                  <th className="px-2 py-1">
                    {t('admin.taxonomy.col.department', null, lang)}
                  </th>
                  <th className="px-2 py-1 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => {
                  const dept = departments.find(
                    (d) => d.id === c.departmentId,
                  );
                  return (
                    <tr key={c.id} className="border-t border-slate-100">
                      <td className="px-2 py-2 text-slate-900">
                        {lang === 'bn' ? c.nameBn ?? c.name : c.name}
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {dept
                          ? lang === 'bn'
                            ? dept.nameBn ?? dept.name
                            : dept.name
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          className="text-xs text-rose-600 hover:underline"
                          onClick={() => handleDeleteCat(c.id)}
                        >
                          {t('admin.wards.cta.delete', null, lang)}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              </table>
            </div>
            {/* `min-w-0` lets the inputs shrink below their content
                width. Without it a flex item refuses to shrink, so
                the two inputs pushed the "new" button off the right
                edge of a 390px phone. */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.slug', null, lang)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                value={newCat.slug}
                onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
              />
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.name', null, lang)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              />
              <select
                className="min-w-0 shrink-0 rounded border border-slate-300 px-2 py-1 text-xs"
                value={newCat.departmentId}
                onChange={(e) =>
                  setNewCat({ ...newCat, departmentId: e.target.value })
                }
              >
                <option value="">
                  {t('admin.taxonomy.form.none', null, lang)}
                </option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {lang === 'bn' ? d.nameBn ?? d.name : d.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="rounded bg-emerald-600 px-3 py-1 text-xs text-white shrink-0"
                onClick={handleCreateCat}
              >
                {t('admin.taxonomy.cta.newCat', null, lang)}
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}