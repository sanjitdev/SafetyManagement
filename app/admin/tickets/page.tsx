/**
 * /admin/tickets — the admin's Reports list.
 *
 * Bolt admin-tickets (Intent 005, Unit 005). 2-column desktop
 * layout (288px filter rail + main table). Filter state lives
 * in the URL. 30 s `setInterval` polling on the current view;
 * the "Load more" button advances the cursor. Auth gate redirects
 * to /login if no session; the API independently enforces
 * `requireRole('admin')`.
 *
 * Re-uses the same URL-state + polling + cursor pattern as
 * `app/admin/audit/page.tsx` so the two admin surfaces feel
 * uniform.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminTicketsFilters } from '@/components/AdminTicketsFilters';
import { AdminTicketsTable } from '@/components/AdminTicketsTable';
import { t, type Language } from '@/lib/i18n/keys';
import type { SerializedTicket } from '@/lib/serializers/ticket';
import {
  type AdminTicketsFilters as Filters,
  type AdminTicketsQueryResult,
} from '@/lib/admin/tickets-query';

const LANG_KEY = 'cityfix.preferred_language.v1';

function readFiltersFromUrl(params: URLSearchParams): Filters {
  const status = params.get('status');
  return {
    status:
      status &&
      [
        'submitted',
        'routed',
        'in_progress',
        'resolved',
        'closed',
        'cancelled',
      ].includes(status)
        ? (status as Filters['status'])
        : undefined,
    cityId: params.get('cityId') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    wardId: params.get('wardId') ?? undefined,
    q: params.get('q') ?? undefined,
    from: params.get('from') ?? undefined,
    to: params.get('to') ?? undefined,
  };
}

function writeFiltersToUrl(filters: Filters): string {
  const u = new URLSearchParams();
  if (filters.status) u.set('status', filters.status);
  if (filters.cityId) u.set('cityId', filters.cityId);
  if (filters.categoryId) u.set('categoryId', filters.categoryId);
  if (filters.wardId) u.set('wardId', filters.wardId);
  if (filters.q) u.set('q', filters.q);
  if (filters.from) u.set('from', filters.from);
  if (filters.to) u.set('to', filters.to);
  const s = u.toString();
  return s ? `?${s}` : '';
}

export default function AdminTicketsPage() {
  const pathname = usePathname();
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<Filters>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [rows, setRows] = useState<SerializedTicket[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
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
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setFilters(readFiltersFromUrl(sp));
  }, []);

  // Auth + role gate.
  //
  // The API independently enforces `requireRole('admin')` on the
  // tickets list endpoint, but a non-admin user who lands here
  // directly (e.g. a bookmark, a stale link) would otherwise see
  // an empty `http_403` page instead of a clean redirect to their
  // own home. We check the role on the client too and bounce
  // non-admins to `/` (the splash / role-aware router) so the UX
  // matches the dispatcher's and crew's pages.
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
            '/login?next=' + encodeURIComponent(pathname || '/admin/tickets');
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
          '/login?next=' + encodeURIComponent(pathname || '/admin/tickets');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (
      activeFilters: Filters,
      activeCursor: string | null,
      append: boolean,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (activeFilters.status) params.set('status', activeFilters.status);
        if (activeFilters.cityId) params.set('cityId', activeFilters.cityId);
        if (activeFilters.categoryId)
          params.set('categoryId', activeFilters.categoryId);
        if (activeFilters.wardId) params.set('wardId', activeFilters.wardId);
        if (activeFilters.q) params.set('q', activeFilters.q);
        if (activeFilters.from) params.set('from', activeFilters.from);
        if (activeFilters.to) params.set('to', activeFilters.to);
        if (activeCursor) params.set('cursor', activeCursor);
        params.set('limit', '50');
        const res = await fetch(
          `/api/v1/admin/tickets?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          setError(`http_${res.status}`);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as AdminTicketsQueryResult;
        setRows((prev) =>
          append && prev ? [...prev, ...data.tickets] : data.tickets,
        );
        setNextCursor(data.nextCursor);
      } catch {
        setError(t('admin.tickets.error', null, lang));
      } finally {
        setLoading(false);
      }
    },
    [lang],
  );

  const cursorRef = useMemo(() => ({ current: cursor as string | null }), []);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor, cursorRef]);

  // Refetch when filters change.
  useEffect(() => {
    if (signedIn !== true) return;
    setCursor(null);
    setRows(null);
    fetchPage(filters, null, false);
    // 30 s polling on the current view.
    const id = setInterval(() => {
      fetchPage(filters, cursorRef.current, !!cursorRef.current);
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, signedIn, fetchPage]);

  const onApply = useCallback((next: Filters) => {
    const qs = writeFiltersToUrl(next);
    window.history.replaceState(
      null,
      '',
      `/admin/tickets${qs}`,
    );
    setFilters(next);
  }, []);

  const onReset = useCallback(() => {
    window.history.replaceState(null, '', '/admin/tickets');
    setFilters({});
  }, []);

  const onLoadMore = useCallback(() => {
    if (!nextCursor) return;
    setCursor(nextCursor);
    fetchPage(filters, nextCursor, true);
  }, [nextCursor, filters, fetchPage]);

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.tickets.title', null, lang)} …
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/cities"
            className="text-xs text-slate-600 hover:underline"
          >
            {t('admin.tickets.back', null, lang)}
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">
            {t('admin.tickets.title', null, lang)}
          </h1>
          <span className="text-xs text-slate-500">
            {t('admin.tickets.subtitle', null, lang)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/audit"
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
          >
            {t('admin.audit.title', null, lang)}
          </Link>
        </div>
      </div>
      {/*
        The filter rail is a fixed 288px column on wide screens, but
        a fixed-width flex child never shrinks — on a 390px phone it
        ate the whole viewport and crushed the table into a ~100px
        sliver. The rail stacks above the table below the `lg`
        breakpoint and only pins its width once there is room.
      */}
      <div className="flex-1 flex flex-col lg:flex-row" style={{ minHeight: 0 }}>
        <aside
          className="border-b lg:border-b-0 lg:border-r border-slate-200 bg-white lg:w-[288px] lg:flex-shrink-0"
          style={{ width: undefined }}
        >
          <AdminTicketsFilters
            initial={filters}
            lang={lang}
            onApply={onApply}
            onReset={onReset}
          />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <AdminTicketsTable
            rows={rows ?? []}
            loading={loading}
            error={error}
            onLoadMore={onLoadMore}
            hasMore={!!nextCursor}
            lang={lang}
          />
        </main>
      </div>
    </div>
  );
}
