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
import { AdminPageSkeleton, SkeletonBlock } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';

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
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/cities/${id}/wards`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = (await res.json()) as { wards: Ward[] };
      setWards(data.wards);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'network');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authenticated === null) return; // still loading
    let cancelled = false;
    (async () => {
      if (!authenticated) {
        window.location.href =
          '/login?next=' + encodeURIComponent(pathname || '/admin/cities');
        return;
      }
      if (session?.role !== 'admin') {
        window.location.href = '/';
        return;
      }
      setSignedIn(true);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session, pathname, refresh]);

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
          <Link
            href={`/admin/cities/${id}/taxonomy`}
            className="text-sm hover:underline"
            style={{ color: 'var(--color-ink-secondary)' }}
          >
            ← {t('admin.taxonomy.title', null, lang)}
          </Link>
          <span className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.wards.title', null, lang)}
          </span>
        </div>
      </div>
      <main className="px-6 py-8 max-w-6xl mx-auto space-y-6">
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
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.wards.title', null, lang)}
          </h1>
          <button
            type="button"
            className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium"
            onClick={() => setShowForm(true)}
          >
            {t('admin.wards.cta.newWard', null, lang)}
          </button>
        </div>
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface-card)',
          }}
        >
          <p className="text-xs mb-3" style={{ color: 'var(--color-ink-secondary)' }}>
            {t('admin.wards.instruction', null, lang)}
          </p>
          {/* The ward name is Bangla and long; without a `minWidth`
              the browser squeezed it to a few characters per line on
              a phone. The wrapper scrolls sideways instead. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
            <thead className="text-left" style={{ color: 'var(--color-ink-secondary)' }}>
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">{t('admin.wards.col.name', null, lang)}</th>
                <th className="px-3 py-2">
                  {t('admin.wards.col.polygon', null, lang)}
                </th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody aria-busy={loading}>
              {loading ? Array.from({ length: 5 }).map((_, row) => <tr key={`loading-${row}`}><td className="px-3 py-3" colSpan={4}><div className="admin-ward-skeleton-row" aria-hidden="true"><SkeletonBlock style={{ width: '48%', height: 14 }} /><SkeletonBlock style={{ width: '26%', height: 14 }} /><SkeletonBlock style={{ width: 38, height: 14 }} /></div></td></tr>) : wards.map((w) => (
                <tr
                  key={w.id}
                  className="border-t"
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  <td className="px-3 py-2" style={{ color: 'var(--color-ink-secondary)' }}>
                    {w.number}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--color-ink)' }}>
                    {lang === 'bn' ? w.nameBn ?? w.name : w.name}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--color-ink-secondary)' }}>
                    {w.polygonGeoJson ? '✓' : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-xs hover:underline"
                      style={{ color: 'var(--color-danger)' }}
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
        </div>
        {showForm ? (
          <div
            className="rounded-lg border p-6 space-y-3"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-surface-card)',
            }}
          >
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
              {t('admin.wards.cta.newWard', null, lang)}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label
                  className="block text-xs font-medium"
                  style={{ color: 'var(--color-ink-secondary)' }}
                >
                  #
                </label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                  style={{
                    borderColor: 'var(--color-border-strong)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-ink)',
                  }}
                  value={newWard.number}
                  onChange={(e) =>
                    setNewWard({ ...newWard, number: Number(e.target.value) })
                  }
                />
              </div>
              <div className="col-span-2">
                <label
                  className="block text-xs font-medium"
                  style={{ color: 'var(--color-ink-secondary)' }}
                >
                  {t('admin.wards.form.name', null, lang)}
                </label>
                <input
                  type="text"
                  className="mt-1 block w-full rounded border px-2 py-1 text-sm"
                  style={{
                    borderColor: 'var(--color-border-strong)',
                    background: 'var(--color-surface-card)',
                    color: 'var(--color-ink)',
                  }}
                  value={newWard.name}
                  onChange={(e) =>
                    setNewWard({ ...newWard, name: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <label
                className="block text-xs font-medium"
                style={{ color: 'var(--color-ink-secondary)' }}
              >
                {t('admin.wards.form.polygon', null, lang)}
              </label>
              <textarea
                className="mt-1 block w-full rounded border px-2 py-1 text-xs font-mono"
                style={{
                  borderColor: 'var(--color-border-strong)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-ink)',
                }}
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
                className="admin-btn-secondary rounded px-3 py-1 text-sm"
                onClick={() => setShowForm(false)}
              >
                {t('admin.wards.cta.cancel', null, lang)}
              </button>
              <button
                type="button"
                className="admin-btn-primary rounded px-3 py-1 text-sm"
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
