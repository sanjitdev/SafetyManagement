/**
 * /admin/cities/[id]/users — 4.6 User Provisioning.
 *
 * Bolt 005-003 (Intent 005, Unit 003).
 *
 * Two columns: the provisioned-user list (left) and the add/edit
 * form (right). Role tabs filter the list; the sticky launch button
 * stays disabled until the city has at least one dispatcher AND one
 * crew.
 *
 * Delete and bulk import require the hardware key — the API enforces
 * that (`requireWebAuthn`); the page surfaces the `webauthn_required`
 * error the API returns.
 *
 * All user-facing copy goes through `t(...)`.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTimestamp } from '@/lib/format/datetime';
import { AdminPageSkeleton, SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { useSession } from '@/components/SessionProvider';

const LANG_KEY = 'cityfix.preferred_language.v1';

interface AdminUserCard {
  id: string;
  nameBn: string;
  nameEn: string;
  identifier: string;
  email: string | null;
  role: 'dispatcher' | 'crew' | 'supervisor';
  prismaRole: string;
  wardIds: string[];
  wardLabels: string[];
  wardLabelsBn: string[];
  crewId: string | null;
  crewLabel: string | null;
  crewLabelBn: string | null;
  departmentId: string | null;
  departmentLabel: string | null;
  departmentLabelBn: string | null;
  status: 'active' | 'invited' | 'disabled';
  lastLoginAt: string | null;
}

interface AdminCrew {
  id: string;
  name: string;
  nameBn: string;
  wardId: string | null;
  departmentId: string | null;
  memberIds: string[];
}

interface AdminWard {
  id: string;
  number: number;
  name: string;
  nameBn: string | null;
}

interface AdminDepartment {
  id: string;
  name: string;
  nameBn: string | null;
}

interface UsersListResult {
  users: AdminUserCard[];
  counts: { all: number; dispatcher: number; crew: number; supervisor: number };
  crews: AdminCrew[];
  wards: AdminWard[];
  departments: AdminDepartment[];
  canLaunch: boolean;
}

type Tab = 'all' | 'dispatcher' | 'crew' | 'supervisor';

interface FormState {
  id: string | null;
  nameBn: string;
  nameEn: string;
  identifier: string;
  email: string;
  role: 'dispatcher' | 'crew' | 'supervisor';
  wardIds: string[];
  crewId: string;
  departmentId: string;
  password: string;
  status: 'active' | 'invited' | 'disabled';
}

const EMPTY_FORM: FormState = {
  id: null,
  nameBn: '',
  nameEn: '',
  identifier: '',
  email: '',
  role: 'dispatcher',
  wardIds: [],
  crewId: '',
  departmentId: '',
  password: '',
  status: 'invited',
};

export default function AdminCityUsersPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const cityId = params?.id ?? '';
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  // The shared session — one request for the whole page.
  const { authenticated, session } = useSession();
  const [data, setData] = useState<UsersListResult | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importCsv, setImportCsv] = useState('');
  const [importResult, setImportResult] = useState<{
    imported: number;
    failed: number;
    errors: { rowNumber: number; errors: string[] }[];
  } | null>(null);

  useEffect(() => {
    const stored =
      typeof window !== 'undefined'
        ? window.localStorage.getItem(LANG_KEY)
        : null;
    if (stored === 'bn' || stored === 'en') setLang(stored);
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('role');
    if (requestedTab === 'all' || requestedTab === 'dispatcher' || requestedTab === 'crew' || requestedTab === 'supervisor') {
      setTab(requestedTab);
    }
  }, []);

  const selectTab = (next: Tab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('role', next);
    window.history.replaceState(null, '', url.toString());
    window.dispatchEvent(new CustomEvent('cityfix:admin-users-filter-updated', { detail: next }));
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANG_KEY, lang);
    }
  }, [lang]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v1/admin/cities/${cityId}/users`, {
      credentials: 'include',
    });
    if (!res.ok) {
      setError(`http_${res.status}`);
      return;
    }
    const payload = (await res.json()) as UsersListResult;
    setData(payload);
  }, [cityId]);

  // Auth + role gate.
  useEffect(() => {
    if (authenticated === null) return; // still loading
    let cancelled = false;
    (async () => {
      try {
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
        await load();
      } catch {
        if (!cancelled) setError('network');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, session, pathname, load]);

  const visibleUsers = useMemo(() => {
    if (!data) return [];
    if (tab === 'all') return data.users;
    return data.users.filter((u) => u.role === tab);
  }, [data, tab]);

  const wardLabel = (w: AdminWard): string => w.nameBn ?? w.name;

  const openAdd = useCallback(() => {
    setForm({ ...EMPTY_FORM });
    setError(null);
    setNotice(null);
  }, []);

  const openEdit = useCallback((u: AdminUserCard) => {
    setForm({
      id: u.id,
      nameBn: u.nameBn,
      nameEn: u.nameEn,
      identifier: u.identifier,
      email: u.email ?? '',
      role: u.role,
      wardIds: u.wardIds,
      crewId: u.crewId ?? '',
      departmentId: u.departmentId ?? '',
      password: '',
      status: u.status,
    });
    setError(null);
    setNotice(null);
  }, []);

  const autoGenerate = useCallback(() => {
    const chars = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 12; i += 1) {
      out += chars[Math.floor(Math.random() * chars.length)];
    }
    // Guarantee the policy: upper, lower, digit.
    out = `A${out.slice(1, 7)}a${out.slice(8)}7`;
    setForm((f) => ({ ...f, password: out }));
  }, []);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload: Record<string, unknown> = {
        nameBn: form.nameBn,
        nameEn: form.nameEn,
        identifier: form.identifier,
        email: form.email,
        role: form.role,
        wardIds: form.wardIds,
        crewId: form.crewId || null,
        departmentId: form.departmentId || null,
        status: form.status,
      };
      if (form.password) payload.password = form.password;

      const res = await fetch(
        form.id
          ? `/api/v1/admin/cities/${cityId}/users/${form.id}`
          : `/api/v1/admin/cities/${cityId}/users`,
        {
          method: form.id ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `http_${res.status}`);
        return;
      }
      setForm({ ...EMPTY_FORM });
      await load();
    } catch {
      setError('network');
    } finally {
      setBusy(false);
    }
  }, [form, cityId, load]);

  const handleDelete = useCallback(async () => {
    if (!form.id) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/v1/admin/cities/${cityId}/users/${form.id}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `http_${res.status}`);
        return;
      }
      setForm({ ...EMPTY_FORM });
      await load();
    } catch {
      setError('network');
    } finally {
      setBusy(false);
    }
  }, [form.id, cityId, load]);

  const handleImport = useCallback(async () => {
    setBusy(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await fetch(`/api/v1/admin/cities/${cityId}/users/import`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ csv: importCsv }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        imported?: number;
        failed?: number;
        errors?: { rowNumber: number; errors: string[] }[];
      };
      if (!res.ok && body.error) {
        setError(body.error);
        return;
      }
      setImportResult({
        imported: body.imported ?? 0,
        failed: body.failed ?? 0,
        errors: body.errors ?? [],
      });
      await load();
    } catch {
      setError('network');
    } finally {
      setBusy(false);
    }
  }, [importCsv, cityId, load]);

  const downloadTemplate = useCallback(() => {
    const csv =
      'name_bn,name_en,identifier,email,role,wards_or_crew,department\n' +
      'Rahim Uddin,Rahim Uddin,+8801711000010,rahim@example.org,dispatcher,ward_14,\n' +
      'Karim Mia,Karim Mia,+8801711000011,,crew,,dept_streetlight\n' +
      'Salma Begum,Salma Begum,supervisor@example.org,,supervisor,,\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cityfix-users-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (signedIn === null || (!data && !error)) {
    return <AdminPageSkeleton lang={lang} />;
  }

  /**
   * The status pill's colours.
   *
   * Previously a class-name string carrying a hardcoded palette
   * that could not follow the theme. Now it returns the token
   * references the pill's inline style consumes.
   */
  const statusPill = (
    status: AdminUserCard['status'],
  ): { background: string; color: string } => {
    if (status === 'active') {
      return {
        background: 'var(--color-success-soft)',
        color: 'var(--color-success)',
      };
    }
    if (status === 'invited') {
      return {
        background: 'var(--color-warning-soft)',
        color: 'var(--color-warning)',
      };
    }
    return {
      background: 'var(--color-surface-raised)',
      color: 'var(--color-ink-secondary)',
    };
  };

  const fieldInputStyle = {
    borderColor: 'var(--color-border-strong)',
    background: 'var(--color-surface-card)',
    color: 'var(--color-ink)',
  };
  const labelStyle = { color: 'var(--color-ink-secondary)' };

  return (
    <div
      className="min-h-full pb-24"
      style={{ background: 'var(--color-surface-page)' }}
    >
      <header
        data-testid="admin-city-users-header"
        className="sticky top-0 z-20 border-b px-6 py-4 flex items-center justify-between flex-wrap gap-3"
        style={{
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-surface-page)',
        }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold" style={{ color: 'var(--color-ink)' }}>
            {t('admin.users.title', null, lang)}
          </h1>
          <span className="text-xs" style={{ color: 'var(--color-ink-tertiary)' }}>
            {t('admin.users.subtitle', null, lang)}
          </span>
        </div>
        <Link
          href="/admin/cities"
          className="text-sm hover:underline"
          style={{ color: 'var(--color-primary)' }}
        >
          {t('admin.users.back', null, lang)}
        </Link>
      </header>

      <main
        data-testid="admin-city-users-page"
        className="mx-auto grid max-w-[1280px] grid-cols-1 gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_420px]"
      >
        {/* ---------------- Left column: the list ---------------- */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
            <button
              type="button"
              data-testid="admin-city-users-button-add"
              className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium"
              onClick={openAdd}
            >
              {t('admin.users.cta.add', null, lang)}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="admin-city-users-button-bulk-import"
                className="text-sm hover:underline"
                style={{ color: 'var(--color-primary)' }}
                onClick={() => setImportOpen(true)}
              >
                {t('admin.users.cta.bulkImport', null, lang)}
              </button>
              <button
                type="button"
                className="text-sm hover:underline"
                style={{ color: 'var(--color-ink-tertiary)' }}
                onClick={downloadTemplate}
              >
                {t('admin.users.cta.downloadTemplate', null, lang)}
              </button>
            </div>
          </div>

          <div
            data-testid="admin-city-users-tabs"
            role="tablist"
            className="mb-3 flex flex-wrap gap-2"
          >
            {(
              [
                ['all', data?.counts.all ?? 0],
                ['dispatcher', data?.counts.dispatcher ?? 0],
                ['crew', data?.counts.crew ?? 0],
                ['supervisor', data?.counts.supervisor ?? 0],
              ] as const
            ).map(([key, count]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-testid={`admin-city-users-tab-${key}`}
                onClick={() => selectTab(key)}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={
                  tab === key
                    ? {
                        background: 'var(--color-primary)',
                        color: 'var(--color-on-primary)',
                      }
                    : {
                        background: 'var(--color-surface-raised)',
                        color: 'var(--color-ink-secondary)',
                      }
                }
              >
                {t(`admin.users.tab.${key}`, null, lang)} ({count})
              </button>
            ))}
          </div>

          {error ? (
            <div
              data-testid="admin-city-users-error"
              className="mb-3 rounded border p-3 text-sm"
              style={{
                borderColor: 'var(--color-danger)',
                background: 'var(--color-surface-card)',
                color: 'var(--color-danger)',
              }}
            >
              {error === 'webauthn_required' ||
              error === 'webauthn_assertion_expired'
                ? t('admin.users.webauthn.required', null, lang)
                : error}
            </div>
          ) : null}

          <div data-testid="admin-city-users-list" className="space-y-2">
            {!data && !error ? (
              <SkeletonStatus lang={lang} className="admin-users-loading-list">
                {[0, 1, 2, 3, 4].map((item) => <div className="admin-user-skeleton-card" key={item}><SkeletonBlock style={{ width: 40, height: 40, borderRadius: '50%', flex: '0 0 auto' }} /><div style={{ display: 'grid', gap: 8, flex: 1 }}><SkeletonBlock style={{ width: '46%', height: 14 }} /><SkeletonBlock style={{ width: '72%', height: 12 }} /></div><SkeletonBlock style={{ width: 58, height: 22, borderRadius: 999 }} /></div>)}
              </SkeletonStatus>
            ) : !data ? null : visibleUsers.length === 0 ? (
              <div
                className="rounded border p-8 text-center text-sm"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-surface-card)',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                {t('admin.users.empty', null, lang)}
              </div>
            ) : (
              visibleUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  data-testid={`admin-city-users-row-${u.id}`}
                  onClick={() => openEdit(u)}
                  className="admin-card-hover w-full rounded border p-4 text-left"
                  style={{
                    borderColor: 'var(--color-border)',
                    background: 'var(--color-surface-card)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="truncate font-medium"
                        style={{ color: 'var(--color-ink)' }}
                      >
                        {u.nameBn}
                      </div>
                      <div
                        className="truncate text-xs"
                        style={{ color: 'var(--color-ink-tertiary)' }}
                      >
                        {u.nameEn}
                      </div>
                      <div
                        className="mt-1 truncate text-xs"
                        style={{ color: 'var(--color-ink-secondary)' }}
                      >
                        {u.identifier}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: 'var(--color-primary-soft)',
                          color: 'var(--color-primary)',
                        }}
                      >
                        {t(`admin.users.role.${u.role}`, null, lang)}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={statusPill(u.status)}
                      >
                        {t(`admin.users.status.${u.status}`, null, lang)}
                      </span>
                    </div>
                  </div>
                  <dl
                    className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs"
                    style={{ color: 'var(--color-ink-secondary)' }}
                  >
                    <div className="flex gap-1">
                      <dt>{t('admin.users.form.wards', null, lang)}:</dt>
                      <dd>
                        {wardLabelsFor(u, lang).join(', ') ||
                          t('admin.users.notAssigned', null, lang)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{t('admin.users.form.crew', null, lang)}:</dt>
                      <dd>
                        {(lang === 'bn'
                          ? u.crewLabelBn
                          : u.crewLabel) ?? t('admin.users.notAssigned', null, lang)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{t('admin.users.form.department', null, lang)}:</dt>
                      <dd>
                        {(lang === 'bn'
                          ? u.departmentLabelBn
                          : u.departmentLabel) ??
                          t('admin.users.notAssigned', null, lang)}
                      </dd>
                    </div>
                    <div className="flex gap-1">
                      <dt>{t('admin.users.lastLogin.at', null, lang)}:</dt>
                      <dd>
                        {u.lastLoginAt
                          ? formatTimestamp(u.lastLoginAt, lang)
                          : t('admin.users.lastLogin.never', null, lang)}
                      </dd>
                    </div>
                  </dl>
                </button>
              ))
            )}
          </div>
        </section>

        {/* ---------------- Right column: the form ---------------- */}
        <section>
          <form
            data-testid="admin-city-users-form"
            className="sticky top-24 space-y-3 rounded border p-4"
            style={{
              borderColor: 'var(--color-border)',
              background: 'var(--color-surface-card)',
            }}
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={labelStyle}>
                {t('admin.users.form.nameBn', null, lang)}
              </span>
              <input
                data-testid="admin-city-users-form-input-name-bn"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.nameBn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nameBn: e.target.value }))
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={labelStyle}>
                {t('admin.users.form.nameEn', null, lang)}
              </span>
              <input
                data-testid="admin-city-users-form-input-name-en"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.nameEn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nameEn: e.target.value }))
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={labelStyle}>
                {t('admin.users.form.identifier', null, lang)}
              </span>
              <input
                data-testid="admin-city-users-form-input-identifier"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.identifier}
                onChange={(e) =>
                  setForm((f) => ({ ...f, identifier: e.target.value }))
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={labelStyle}>
                {t('admin.users.form.email', null, lang)}
              </span>
              <input
                data-testid="admin-city-users-form-input-email"
                type="email"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={labelStyle}>
                {t('admin.users.form.role', null, lang)}
              </span>
              <select
                data-testid="admin-city-users-form-select-role"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    role: e.target.value as FormState['role'],
                  }))
                }
              >
                <option value="dispatcher">
                  {t('admin.users.role.dispatcher', null, lang)}
                </option>
                <option value="crew">{t('admin.users.role.crew', null, lang)}</option>
                <option value="supervisor">
                  {t('admin.users.role.supervisor', null, lang)}
                </option>
              </select>
            </label>

            {form.role === 'dispatcher' ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium" style={labelStyle}>
                  {t('admin.users.form.wards', null, lang)}
                </span>
                <select
                  data-testid="admin-city-users-form-multi-wards"
                  multiple
                  className="h-24 w-full rounded border px-2 py-1.5 text-sm"
                  style={fieldInputStyle}
                  value={form.wardIds}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      wardIds: Array.from(
                        e.target.selectedOptions,
                        (o) => o.value,
                      ),
                    }))
                  }
                >
                  {(data?.wards ?? []).map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.number} — {wardLabel(w)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {form.role === 'crew' ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium" style={labelStyle}>
                    {t('admin.users.form.crew', null, lang)}
                  </span>
                  <select
                    data-testid="admin-city-users-form-select-crew"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={fieldInputStyle}
                    value={form.crewId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, crewId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {(data?.crews ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nameBn || c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium" style={labelStyle}>
                    {t('admin.users.form.department', null, lang)}
                  </span>
                  <select
                    data-testid="admin-city-users-form-select-department"
                    className="w-full rounded border px-2 py-1.5 text-sm"
                    style={fieldInputStyle}
                    value={form.departmentId}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, departmentId: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {(data?.departments ?? []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nameBn ?? d.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}

            {form.role === 'supervisor' ? (
              <p
                className="rounded p-2 text-xs"
                style={{
                  background: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink-secondary)',
                }}
              >
                {t('admin.users.form.supervisor.note', null, lang)}
              </p>
            ) : null}

            <label className="block text-sm">
              <span
                className="mb-1 flex items-center justify-between font-medium"
                style={labelStyle}
              >
                {t('admin.users.form.password', null, lang)}
                <button
                  type="button"
                  className="text-xs font-normal hover:underline"
                  style={{ color: 'var(--color-primary)' }}
                  onClick={autoGenerate}
                >
                  {t('admin.users.cta.autoGenerate', null, lang)}
                </button>
              </span>
              <input
                data-testid="admin-city-users-form-input-password"
                type="text"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
              />
              <span
                className="mt-1 block text-xs"
                style={{ color: 'var(--color-ink-tertiary)' }}
              >
                {t('admin.users.form.password.hint', null, lang)}
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium" style={labelStyle}>
                {t('admin.users.form.status', null, lang)}
              </span>
              <select
                data-testid="admin-city-users-form-select-status"
                className="w-full rounded border px-2 py-1.5 text-sm"
                style={fieldInputStyle}
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    status: e.target.value as FormState['status'],
                  }))
                }
              >
                <option value="active">
                  {t('admin.users.status.active', null, lang)}
                </option>
                <option value="invited">
                  {t('admin.users.status.invited', null, lang)}
                </option>
                <option value="disabled">
                  {t('admin.users.status.disabled', null, lang)}
                </option>
              </select>
            </label>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={busy}
                data-testid="admin-city-users-form-button-save"
                className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium"
              >
                {t('admin.users.cta.save', null, lang)}
              </button>
              <button
                type="button"
                data-testid="admin-city-users-form-button-cancel"
                className="text-sm hover:underline"
                style={{ color: 'var(--color-ink-secondary)' }}
                onClick={() => setForm({ ...EMPTY_FORM })}
              >
                {t('admin.users.cta.cancel', null, lang)}
              </button>
              {form.id ? (
                <button
                  type="button"
                  disabled={busy}
                  data-testid="admin-city-users-form-button-delete"
                  className="ml-auto text-sm hover:underline disabled:opacity-50"
                  style={{ color: 'var(--color-danger)' }}
                  onClick={() => void handleDelete()}
                >
                  {t('admin.users.cta.delete', null, lang)}
                </button>
              ) : null}
            </div>
          </form>
        </section>
      </main>

      {/* ---------------- Sticky launch bar ---------------- */}
      <div
        className="fixed inset-x-0 bottom-0 border-t px-6 py-3"
        style={{
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface-card)',
        }}
      >
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3">
          <button
            type="button"
            disabled={!data?.canLaunch}
            data-testid="admin-city-users-button-launch"
            title={data?.canLaunch ? undefined : t('admin.users.launch.disabled', null, lang)}
            className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed"
            style={
              data?.canLaunch
                ? undefined
                : {
                    background: 'var(--color-surface-raised)',
                    color: 'var(--color-ink-disabled)',
                  }
            }
          >
            {t('admin.users.cta.launch', null, lang)}
          </button>
          <Link
            href="/admin/cities"
            data-testid="admin-city-users-link-skip"
            className="text-sm hover:underline"
            style={{ color: 'var(--color-ink-secondary)' }}
          >
            {t('admin.users.cta.skip', null, lang)}
          </Link>
        </div>
      </div>

      {/* ---------------- Bulk import modal ---------------- */}
      {importOpen ? (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.45)' }}
        >
          <div
            data-testid="admin-city-users-import"
            className="w-full max-w-2xl space-y-3 rounded p-5"
            style={{ background: 'var(--color-surface-card)' }}
          >
            <h2 className="text-base font-semibold" style={{ color: 'var(--color-ink)' }}>
              {t('admin.users.import.title', null, lang)}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-ink-secondary)' }}>
              {t('admin.users.import.columns', null, lang)}
            </p>
            <textarea
              data-testid="admin-city-users-import-csv"
              aria-label={t('admin.users.import.title', null, lang)}
              className="h-40 w-full rounded border p-2 font-mono text-xs"
              style={fieldInputStyle}
              value={importCsv}
              onChange={(e) => setImportCsv(e.target.value)}
            />
            {importResult ? (
              <div
                data-testid="admin-city-users-import-result"
                className="rounded border p-3 text-xs"
                style={{
                  borderColor: 'var(--color-border)',
                  background: 'var(--color-surface-sunken)',
                }}
              >
                <p style={{ color: 'var(--color-success)' }}>
                  {importResult.imported} {t('admin.users.import.success', null, lang)}
                </p>
                <p style={{ color: 'var(--color-danger)' }}>
                  {importResult.failed} {t('admin.users.import.failed', null, lang)}
                </p>
                <ul
                  className="mt-1 space-y-0.5"
                  style={{ color: 'var(--color-ink-secondary)' }}
                >
                  {importResult.errors.map((e) => (
                    <li key={e.rowNumber}>
                      {t('admin.users.import.row', null, lang)} {e.rowNumber}:{' '}
                      {e.errors.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                data-testid="admin-city-users-import-submit"
                className="admin-btn-primary rounded-md px-4 py-2 text-sm font-medium"
                onClick={() => void handleImport()}
              >
                {t('admin.users.cta.bulkImport', null, lang)}
              </button>
              <button
                type="button"
                data-testid="admin-city-users-import-close"
                className="text-sm hover:underline"
                style={{ color: 'var(--color-ink-secondary)' }}
                onClick={() => {
                  setImportOpen(false);
                  setImportResult(null);
                }}
              >
                {t('admin.users.import.close', null, lang)}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The ward display names for a card, in the active language.
 *
 * The API emits both the English and the Bangla label; the page
 * picks the one that matches the reader's language. A missing
 * Bangla variant falls back to the English one. The leading
 * "Ward"/"ওয়ার্ড" is stripped because the row's own label
 * ("ওয়ার্ড:") already says it.
 */
function wardLabelsFor(u: AdminUserCard, lang: Language): string[] {
  const labels = lang === 'bn' ? u.wardLabelsBn : u.wardLabels;
  const picked = labels.length > 0 ? labels : lang === 'bn' ? u.wardLabels : u.wardLabelsBn;
  return picked.map((label) =>
    label.replace(/^\s*(ward|ওয়ার্ড)\s*[:\-–—]?\s*/i, ''),
  );
}

/**
 * The last-login timestamp, formatted for the active language.
 *
 * `toLocaleString()` with no locale falls back to the runtime
 * default, which rendered US-format dates on the Bangla page.
 */
