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

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { AdminPageSkeleton } from '@/components/ui/Skeleton';
import { useLanguage } from '@/components/useLanguage';
import { useSession } from '@/components/SessionProvider';
import { AdminWebAuthnStepUp } from '@/components/AdminWebAuthnStepUp';
import { useWebAuthnStepUp } from '@/components/useWebAuthnStepUp';


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
  const { lang, setLang } = useLanguage();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();
  const [city, setCity] = useState<City | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingRadius, setSavingRadius] = useState(false);
  const [newDept, setNewDept] = useState({ slug: '', name: '' });
  const [newCat, setNewCat] = useState({ slug: '', name: '', departmentId: '' });

  // ADR-007: every admin write needs a FRESH WebAuthn assertion,
  // and the challenge is a one-shot nonce — so a refused write
  // must be retried after a fresh ceremony, not merely reported.
  const stepUp = useWebAuthnStepUp();
  // Refs to the write handlers. `retryOnGateError` resolves a ref
  // at retry time, so the retry always invokes the current handler.
  const handleSaveRadiusRef = useRef<(() => Promise<void>) | null>(null);
  const handleCreateDeptRef = useRef<(() => Promise<void>) | null>(null);
  const handleDeleteDeptRef = useRef<((deptId: string) => Promise<void>) | null>(null);
  const handleCreateCatRef = useRef<(() => Promise<void>) | null>(null);
  const handleDeleteCatRef = useRef<((catId: string) => Promise<void>) | null>(null);

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
        if (stepUp.retryOnGateError(data?.error, handleSaveRadiusRef)) {
          setError(null);
          return;
        }
        setError(data?.error ?? `http_${res.status}`);
        return;
      }
      await refresh();
    } finally {
      setSavingRadius(false);
    }
  }, [city, id, refresh, stepUp]);

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
      if (stepUp.retryOnGateError(data?.error, handleCreateDeptRef)) {
        setError(null);
        return;
      }
      setError(data?.error ?? `http_${res.status}`);
    }
  }, [newDept, id, refresh, stepUp]);

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
        if (stepUp.retryOnGateError(data?.error, handleDeleteDeptRef, deptId)) {
          setError(null);
          return;
        }
        setError(data?.error ?? `http_${res.status}`);
      }
    },
    [id, refresh, stepUp],
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
      if (stepUp.retryOnGateError(data?.error, handleCreateCatRef)) {
        setError(null);
        return;
      }
      setError(data?.error ?? `http_${res.status}`);
    }
  }, [newCat, id, refresh, stepUp]);

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
        if (stepUp.retryOnGateError(data?.error, handleDeleteCatRef, catId)) {
          setError(null);
          return;
        }
        setError(data?.error ?? `http_${res.status}`);
      }
    },
    [id, refresh, stepUp],
  );

  // Register the handlers so the step-up retry can invoke the
  // CURRENT one (a ref is resolved at retry time).
  handleSaveRadiusRef.current = handleSaveRadius;
  handleCreateDeptRef.current = handleCreateDept;
  handleDeleteDeptRef.current = handleDeleteDept;
  handleCreateCatRef.current = handleCreateCat;
  handleDeleteCatRef.current = handleDeleteCat;
  stepUp.registerWrite(handleSaveRadius);

  if (signedIn === null || (!city && !error)) {
    return <AdminPageSkeleton lang={lang} />;
  }
  if (!city) {
    return (
      <div className="p-8 text-sm" role="alert" style={{ color: 'var(--color-danger)' }}>
        {error}
      </div>
    );
  }

  const panelStyle = {
    borderColor: 'var(--color-border)',
    background: 'var(--color-surface-card)',
  };
  const inputStyle = {
    borderColor: 'var(--color-border-strong)',
    background: 'var(--color-surface-card)',
    color: 'var(--color-ink)',
  };
  const formDividerStyle = { borderTop: '1px solid var(--color-border)' };

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
            href={`/admin/cities/${id}/setup`}
            className="text-sm hover:underline"
            style={{ color: 'var(--color-ink-secondary)' }}
          >
            ← {lang === 'bn' ? city.nameBn ?? city.name : city.name}
          </Link>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.taxonomy.title', null, lang)}
          </h1>
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

        {/* ADR-007 step-up. The panel renders only after a gated
            write was refused — the ceremony is offered because the
            admin ASKED to make a change, not as a permanent button on
            the page. */}
        {(stepUp.stepUpNeeded || stepUp.stepUpNoCredential) && (
          <div
            data-testid="admin-webauthn-step-up-panel"
            className="rounded border p-3"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-surface-card)',
            }}
          >
            {stepUp.stepUpNoCredential ? (
              <>
                <p
                  data-testid="admin-webauthn-step-up-register-hint"
                  className="text-sm"
                  style={{
                    color: 'var(--color-ink-secondary)',
                    marginBottom: 8,
                  }}
                >
                  {t('admin.webauthn.step_up.register_hint', null, lang)}
                </p>
                <Link
                  href="/admin"
                  data-testid="admin-webauthn-step-up-register-link"
                  className="admin-btn-primary px-4 py-2 rounded-md"
                  style={{ display: 'inline-block' }}
                >
                  {t('admin.webauthn.register.title', null, lang)}
                </Link>
              </>
            ) : (
              <AdminWebAuthnStepUp
                lang={lang}
                onStateChange={stepUp.setStepUpInProgress}
                onOutcome={stepUp.onStepUpOutcome}
              />
            )}
          </div>
        )}
        <div
          className="rounded-lg border p-6 space-y-3"
          style={panelStyle}
        >
          <label className="block text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
            {t('admin.taxonomy.dedupRadius', null, lang)}:{' '}
            {city.dedupRadiusMeters}m
          </label>
          <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
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
            className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium"
            onClick={handleSaveRadius}
            disabled={savingRadius}
          >
            {t('admin.taxonomy.saveDedup', null, lang)}
          </button>
        </div>
        {/* Two side-by-side panels cannot fit a 390px phone — stack
            them so neither is squeezed to a sliver. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border p-6 space-y-3" style={panelStyle}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
              {t('admin.taxonomy.departments', null, lang)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left" style={{ color: 'var(--color-ink-secondary)' }}>
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
                  <tr key={d.id} className="border-t" style={formDividerStyle}>
                    <td className="px-2 py-2" style={{ color: 'var(--color-ink)' }}>
                      {lang === 'bn' ? d.nameBn ?? d.name : d.name}
                    </td>
                    <td className="px-2 py-2" style={{ color: 'var(--color-ink-secondary)' }}>
                      {d.slug}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="text-xs hover:underline"
                        style={{ color: 'var(--color-danger)' }}
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
            <div className="flex flex-wrap gap-2 pt-3 border-t" style={formDividerStyle}>
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.slug', null, lang)}
                className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                style={inputStyle}
                value={newDept.slug}
                onChange={(e) => setNewDept({ ...newDept, slug: e.target.value })}
              />
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.name', null, lang)}
                className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                style={inputStyle}
                value={newDept.name}
                onChange={(e) => setNewDept({ ...newDept, name: e.target.value })}
              />
              <button
                type="button"
                className="admin-btn-primary rounded px-3 py-1 text-xs shrink-0"
                onClick={handleCreateDept}
              >
                {t('admin.taxonomy.cta.newDept', null, lang)}
              </button>
            </div>
          </section>
          <section className="rounded-lg border p-6 space-y-3" style={panelStyle}>
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
              {t('admin.taxonomy.categories', null, lang)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left" style={{ color: 'var(--color-ink-secondary)' }}>
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
                    <tr key={c.id} className="border-t" style={formDividerStyle}>
                      <td className="px-2 py-2" style={{ color: 'var(--color-ink)' }}>
                        {lang === 'bn' ? c.nameBn ?? c.name : c.name}
                      </td>
                      <td className="px-2 py-2" style={{ color: 'var(--color-ink-secondary)' }}>
                        {dept
                          ? lang === 'bn'
                            ? dept.nameBn ?? dept.name
                            : dept.name
                          : '—'}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          type="button"
                          className="text-xs hover:underline"
                          style={{ color: 'var(--color-danger)' }}
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
            <div className="flex flex-wrap gap-2 pt-3 border-t" style={formDividerStyle}>
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.slug', null, lang)}
                className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                style={inputStyle}
                value={newCat.slug}
                onChange={(e) => setNewCat({ ...newCat, slug: e.target.value })}
              />
              <input
                type="text"
                placeholder={t('admin.taxonomy.form.name', null, lang)}
                className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
                style={inputStyle}
                value={newCat.name}
                onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
              />
              <select
                className="min-w-0 shrink-0 rounded border px-2 py-1 text-xs"
                style={inputStyle}
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
                className="admin-btn-primary rounded px-3 py-1 text-xs shrink-0"
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
