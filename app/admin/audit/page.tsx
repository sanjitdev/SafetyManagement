/**
 * /admin/audit — the admin's audit dashboard.
 *
 * Bolt 005-004 (Intent 005, Unit 004). Read-only view
 * over the `AuditEntry` rows written by every prior
 * Bolt in this intent. Auth gate: redirects to
 * /login if no session is resolved. The API also
 * enforces the same gate (`requireRole('admin')`).
 *
 * 30 s polling refreshes the current view; the Next
 * button advances the cursor. Filter state lives in
 * the URL.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminAuditFilters } from '@/components/AdminAuditFilters';
import { AdminAuditTable } from '@/components/AdminAuditTable';
import { t, type Language } from '@/lib/i18n/keys';
import type {
  AuditEntryView,
  AuditQueryFilters,
  AuditQueryResult,
} from '@/lib/admin/audit-query';

const LANG_KEY = 'cityfix.preferred_language.v1';

function readFiltersFromUrl(params: URLSearchParams): AuditQueryFilters {
  const actorId = params.get('actorId') ?? undefined;
  const action = params.get('action');
  const entityType = params.get('entityType');
  const from = params.get('from') ?? undefined;
  const to = params.get('to') ?? undefined;
  return {
    actorId,
    action: action ? action.split(',').filter(Boolean) : undefined,
    entityType: entityType
      ? (entityType.split(',').filter(Boolean) as never)
      : undefined,
    from,
    to,
  };
}

function writeFiltersToUrl(filters: AuditQueryFilters): string {
  const u = new URLSearchParams();
  if (filters.actorId) u.set('actorId', filters.actorId);
  if (filters.action?.length) u.set('action', filters.action.join(','));
  if (filters.entityType?.length)
    u.set('entityType', filters.entityType.join(','));
  if (filters.from) u.set('from', filters.from);
  if (filters.to) u.set('to', filters.to);
  const s = u.toString();
  return s ? `?${s}` : '';
}

export default function AdminAuditPage() {
  const pathname = usePathname();
  const [lang, setLang] = useState<Language>('bn');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<AuditQueryFilters>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [entries, setEntries] = useState<AuditEntryView[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Hydrate lang from localStorage.
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

  // Hydrate filters from URL on first mount. Read directly from
  // window.location.search (instead of useSearchParams) so the page
  // doesn't need a Suspense boundary and can be statically exported.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    setFilters(readFiltersFromUrl(sp));
  }, []);

  // Auth + role gate (mirrors the cities page).
  //
  // The API independently enforces `requireRole('admin')` on the
  // audit list endpoint, but a non-admin user who lands here
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
            '/login?next=' + encodeURIComponent(pathname || '/admin/audit');
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
          '/login?next=' + encodeURIComponent(pathname || '/admin/audit');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPage = useCallback(
    async (
      activeFilters: AuditQueryFilters,
      activeCursor: string | null,
      append: boolean,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (activeFilters.actorId) params.set('actorId', activeFilters.actorId);
        if (activeFilters.action?.length)
          params.set('action', activeFilters.action.join(','));
        if (activeFilters.entityType?.length)
          params.set('entityType', activeFilters.entityType.join(','));
        if (activeFilters.from) params.set('from', activeFilters.from);
        if (activeFilters.to) params.set('to', activeFilters.to);
        if (activeCursor) params.set('cursor', activeCursor);
        params.set('limit', '50');
        const res = await fetch(
          `/api/v1/admin/audit?${params.toString()}`,
          { credentials: 'include' },
        );
        if (!res.ok) {
          setError(`http_${res.status}`);
          setLoading(false);
          return;
        }
        const data = (await res.json()) as AuditQueryResult;
        setEntries((prev) =>
          append && prev ? [...prev, ...data.entries] : data.entries,
        );
        setNextCursor(data.nextCursor);
      } catch {
        setError(t('admin.audit.error', null, lang));
      } finally {
        setLoading(false);
      }
    },
    [lang],
  );

  // Refetch when filters change (cursor resets to top).
  useEffect(() => {
    if (signedIn !== true) return;
    setCursor(null);
    setEntries(null);
    fetchPage(filters, null, false);
    // 30 s polling on the current view.
    const id = setInterval(() => {
      fetchPage(filters, cursorRef.current, !!cursorRef.current);
    }, 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, signedIn, fetchPage]);

  // Keep a ref to the current cursor for the polling closure.
  const cursorRef = useMemo(() => ({ current: cursor as string | null }), []);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor, cursorRef]);

  const onApply = useCallback(
    (next: AuditQueryFilters) => {
      const qs = writeFiltersToUrl(next);
      window.history.replaceState(
        null,
        '',
        `/admin/audit${qs}`,
      );
      setFilters(next);
    },
    [],
  );

  const onReset = useCallback(() => {
    window.history.replaceState(null, '', '/admin/audit');
    setFilters({});
  }, []);

  const onLoadMore = useCallback(() => {
    if (!nextCursor) return;
    setCursor(nextCursor);
    fetchPage(filters, nextCursor, true);
  }, [nextCursor, filters, fetchPage]);

  const onToggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  if (signedIn === null) {
    return (
      <div className="p-8 text-sm text-slate-600">
        {t('admin.audit.title', null, lang)} …
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
            {t('admin.audit.back', null, lang)}
          </Link>
          <span className="text-lg font-semibold text-slate-900">
            {t('admin.audit.title', null, lang)}
          </span>
          <span className="text-xs text-slate-500">
            {t('admin.audit.subtitle', null, lang)}
          </span>
        </div>
      </div>
      <div className="flex-1 flex" style={{ minHeight: 0 }}>
        <aside
          className="border-r border-slate-200 bg-white"
          style={{ width: 288, flexShrink: 0 }}
        >
          <AdminAuditFilters
            initial={filters}
            lang={lang}
            onApply={onApply}
            onReset={onReset}
          />
        </aside>
        <main className="flex-1 overflow-y-auto">
          <AdminAuditTable
            entries={entries ?? []}
            loading={loading}
            error={error}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onLoadMore={onLoadMore}
            hasMore={!!nextCursor}
            lang={lang}
          />
        </main>
      </div>
    </div>
  );
}
