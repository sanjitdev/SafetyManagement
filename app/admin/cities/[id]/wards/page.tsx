/**
 * /admin/cities/[id]/wards — wards & boundaries.
 *
 * Bolt 005-002 (Intent 005, Unit 002).
 * v1 surface: list of wards with create
 * + delete actions. The Leaflet.draw
 * canvas is gated behind a "New ward"
 * modal that accepts a polygon (the
 * full Leaflet + Leaflet.draw map is
 * a v1.1 enhancement — the v1 surface
 * pins the data contract via a JSON
 * polygon field).
 *
 * The "preview before publish" rule
 * (per ADR-012) is honoured at the
 * API level: a polygon that fails
 * the server-side `validatePolygon`
 * guard is rejected with a typed
 * 400 error before the row is
 * written.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { ThemeToggle } from '@/components/ThemeToggle';

const LANG_KEY = 'cityfix.preferred_language.v1';

interface Ward {
  id: string;
  cityId: string;
  number: number;
  name: string;
  nameBn: string | null;
  polygonGeoJson: string | null;
}

const SAMPLE_POLYGON = JSON.stringify(
  {
    type: 'Polygon',
    coordinates: [
      [
        [90.365, 23.74],
        [90.385, 23.74],
        [90.385, 23.755],
        [90.365, 23.755],
        [90.365, 23.74],
      ],
    ],
  },
  null,
  0,
);

export default function WardsPage() {
  const pathname = usePathname();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [wards, setWards] = useState<Ward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newWard, setNewWard] = useState({
    number: 1,
    name: '',
    polygonGeoJson: SAMPLE_POLYGON,
  });

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
    const res = await fetch(`/api/v1/admin/cities/${id}/wards`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = (await res.json()) as { wards: Ward[] };
      setWards(data.wards);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const statusRes = await fetch('/api/auth/status', {
        credentials: 'include',
      });
      const status = (await statusRes.json()) as { authenticated: boolean };
      if (cancelled) return;
      setSignedIn(status.authenticated);
      if (!status.authenticated) {
        window.location.href =
          '/login?next=' + encodeURIComponent(pathname || '/admin/cities');
        return;
      }
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    setError(null);
    let polygon;
    try {
      polygon = JSON.parse(newWard.polygonGeoJson);
    } catch {
      setError('invalid_polygon');
      return;
    }
    const res = await fetch(
      `/api/v1/admin/cities/${id}/wards`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          number: newWard.number,
          name: newWard.name,
          polygonGeoJson: polygon,
        }),
      },
    );
    if (res.ok) {
      setShowForm(false);
      setNewWard({ number: 1, name: '', polygonGeoJson: SAMPLE_POLYGON });
      await refresh();
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string };
      setError(data?.error ?? `http_${res.status}`);
    }
  }, [newWard, id, refresh]);

  const handleDelete = useCallback(
    async (wardId: string) => {
      const res = await fetch(
        `/api/v1/admin/cities/${id}/wards/${wardId}`,
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

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.wards.title', null, lang)} …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/cities/${id}/taxonomy`}
            className="text-sm text-slate-600 hover:underline"
          >
            ← {t('admin.taxonomy.title', null, lang)}
          </Link>
          <span className="text-lg font-semibold text-slate-900">
            {t('admin.wards.title', null, lang)}
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
      <main className="px-6 py-8 max-w-6xl mx-auto space-y-6">
        {error ? (
          <div className="rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold text-slate-900">
            {t('admin.wards.title', null, lang)}
          </h1>
          <button
            type="button"
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            onClick={() => setShowForm(true)}
          >
            {t('admin.wards.cta.newWard', null, lang)}
          </button>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-600 mb-3">
            {t('admin.wards.instruction', null, lang)}
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-700">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Polygon</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {wards.map((w) => (
                <tr key={w.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-slate-700">{w.number}</td>
                  <td className="px-3 py-2 text-slate-900">{w.name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {w.polygonGeoJson ? '✓' : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-rose-600 hover:underline"
                      onClick={() => handleDelete(w.id)}
                    >
                      {t('admin.wards.cta.delete', null, lang)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {showForm ? (
          <div className="rounded-lg border border-slate-200 bg-white p-6 space-y-3">
            <h2 className="text-base font-semibold text-slate-900">
              {t('admin.wards.cta.newWard', null, lang)}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">
                  #
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={newWard.number}
                  onChange={(e) =>
                    setNewWard({ ...newWard, number: Number(e.target.value) })
                  }
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700">
                  Name
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
                  value={newWard.name}
                  onChange={(e) =>
                    setNewWard({ ...newWard, name: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Polygon (GeoJSON)
              </label>
              <textarea
                className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-xs font-mono"
                rows={6}
                value={newWard.polygonGeoJson}
                onChange={(e) =>
                  setNewWard({ ...newWard, polygonGeoJson: e.target.value })
                }
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-slate-300 bg-white px-3 py-1 text-sm"
                onClick={() => setShowForm(false)}
              >
                {t('admin.wards.cta.cancel', null, lang)}
              </button>
              <button
                type="button"
                className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
                onClick={handleCreate}
              >
                {t('admin.wards.cta.save', null, lang)}
              </button>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}