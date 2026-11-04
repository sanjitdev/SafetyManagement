'use client';

/**
 * AdminTicketsFilters (components/AdminTicketsFilters.tsx).
 *
 * Bolt admin-tickets (Intent 005, Unit 005). The left-rail
 * filter UI on the admin /admin/tickets page. Pure
 * presentational; reads + writes through props.
 *
 * Six filter dimensions:
 *   - status:   one of the 6 TicketStatus values + "All"
 *   - city:     one of the admin's cities (fetched on mount)
 *   - category: one of the categories in the chosen city
 *   - ward:     one of the wards in the chosen city
 *   - q:        exact-match ticket id (cuid)
 *   - from/to:  ISO range on createdAt
 *
 * When the city changes, the category and ward selects refetch
 * (effect: [cityId]). Bilingual via t(...).
 */

import { useEffect, useState } from 'react';
import { t, type Language } from '@/lib/i18n/keys';
import {
  TICKET_STATUS_VALUES,
  type AdminTicketsFilters as Filters,
  type TicketStatusFilter,
} from '@/lib/admin/tickets-query-types';

interface AdminTicketsFiltersProps {
  initial: Filters;
  lang: Language;
  onApply: (filters: Filters) => void;
  onReset: () => void;
}

interface CityRow {
  id: string;
  name: string;
  nameBn: string | null;
}
interface CategoryRow {
  id: string;
  name: string;
  nameBn: string | null;
}
interface WardRow {
  id: string;
  name: string;
  number: number;
}

export function AdminTicketsFilters({
  initial,
  lang,
  onApply,
  onReset,
}: AdminTicketsFiltersProps) {
  const [status, setStatus] = useState<TicketStatusFilter | ''>(
    initial.status ?? '',
  );
  const [cityId, setCityId] = useState(initial.cityId ?? '');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [wardId, setWardId] = useState(initial.wardId ?? '');
  const [q, setQ] = useState(initial.q ?? '');
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');

  const [cities, setCities] = useState<CityRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [wards, setWards] = useState<WardRow[]>([]);

  // Load the admin's cities on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/admin/cities', {
          credentials: 'include',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { cities: CityRow[] };
        if (cancelled) return;
        setCities(body.cities);
        // If a city is already set in initial, leave the dropdown as-is.
      } catch {
        // Network errors are non-fatal; the user can retry.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetch categories + wards when the city changes.
  useEffect(() => {
    if (!cityId) {
      setCategories([]);
      setWards([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [catRes, wardRes] = await Promise.all([
          fetch(`/api/v1/admin/cities/${cityId}/categories`, {
            credentials: 'include',
          }),
          fetch(`/api/v1/admin/cities/${cityId}/wards`, {
            credentials: 'include',
          }),
        ]);
        if (cancelled) return;
        if (catRes.ok) {
          const body = (await catRes.json()) as { categories: CategoryRow[] };
          setCategories(body.categories);
        } else {
          setCategories([]);
        }
        if (wardRes.ok) {
          const body = (await wardRes.json()) as { wards: WardRow[] };
          setWards(body.wards);
        } else {
          setWards([]);
        }
      } catch {
        if (cancelled) return;
        setCategories([]);
        setWards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cityId]);

  const apply = () => {
    onApply({
      status: status === '' ? undefined : status,
      cityId: cityId.trim() || undefined,
      categoryId: categoryId.trim() || undefined,
      wardId: wardId.trim() || undefined,
      q: q.trim() || undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    });
  };

  const reset = () => {
    setStatus('');
    setCityId('');
    setCategoryId('');
    setWardId('');
    setQ('');
    setFrom('');
    setTo('');
    onReset();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-surface-page)',
    color: 'var(--color-ink)',
    fontSize: 'var(--text-caption)',
    fontFamily: 'inherit',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 'var(--text-caption)',
    fontWeight: 'var(--weight-semibold)',
    color: 'var(--color-ink-secondary)',
    marginBottom: 4,
  };

  return (
    <div
      data-testid="admin-tickets-filters"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: 'var(--space-4)',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      <div>
        <label htmlFor="tickets-filter-status" style={labelStyle}>
          {t('admin.tickets.filter.status', null, lang)}
        </label>
        <select
          id="tickets-filter-status"
          data-testid="admin-tickets-filter-status"
          value={status}
          onChange={(e) =>
            setStatus(e.target.value as TicketStatusFilter | '')
          }
          style={inputStyle}
        >
          <option value="">{t('admin.tickets.filter.statusAll', null, lang)}</option>
          {TICKET_STATUS_VALUES.map((v) => (
            <option key={v} value={v}>
              {t(`status.${v}`, null, lang)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tickets-filter-city" style={labelStyle}>
          {t('admin.tickets.filter.city', null, lang)}
        </label>
        <select
          id="tickets-filter-city"
          data-testid="admin-tickets-filter-city"
          value={cityId}
          onChange={(e) => {
            setCityId(e.target.value);
            setCategoryId('');
            setWardId('');
          }}
          style={inputStyle}
        >
          <option value="">{t('admin.tickets.filter.statusAll', null, lang)}</option>
          {cities.map((c) => (
            <option key={c.id} value={c.id}>
              {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tickets-filter-category" style={labelStyle}>
          {t('admin.tickets.filter.category', null, lang)}
        </label>
        <select
          id="tickets-filter-category"
          data-testid="admin-tickets-filter-category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          style={inputStyle}
          disabled={!cityId}
        >
          <option value="">{t('admin.tickets.filter.statusAll', null, lang)}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {lang === 'bn' && c.nameBn ? c.nameBn : c.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tickets-filter-ward" style={labelStyle}>
          {t('admin.tickets.filter.ward', null, lang)}
        </label>
        <select
          id="tickets-filter-ward"
          data-testid="admin-tickets-filter-ward"
          value={wardId}
          onChange={(e) => setWardId(e.target.value)}
          style={inputStyle}
          disabled={!cityId}
        >
          <option value="">{t('admin.tickets.filter.statusAll', null, lang)}</option>
          {wards.map((w) => (
            <option key={w.id} value={w.id}>
              {`#${w.number} — ${lang === 'bn' ? w.name : w.name}`}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="tickets-filter-q" style={labelStyle}>
          {t('admin.tickets.filter.id', null, lang)}
        </label>
        <input
          id="tickets-filter-q"
          data-testid="admin-tickets-filter-q"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="tkt_..."
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="tickets-filter-from" style={labelStyle}>
          {t('admin.tickets.filter.from', null, lang)}
        </label>
        <input
          id="tickets-filter-from"
          data-testid="admin-tickets-filter-from"
          type="datetime-local"
          value={from ? toLocalInput(from) : ''}
          onChange={(e) =>
            setFrom(
              e.target.value
                ? new Date(e.target.value).toISOString()
                : '',
            )
          }
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="tickets-filter-to" style={labelStyle}>
          {t('admin.tickets.filter.to', null, lang)}
        </label>
        <input
          id="tickets-filter-to"
          data-testid="admin-tickets-filter-to"
          type="datetime-local"
          value={to ? toLocalInput(to) : ''}
          onChange={(e) =>
            setTo(
              e.target.value
                ? new Date(e.target.value).toISOString()
                : '',
            )
          }
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          data-testid="admin-tickets-filter-apply"
          onClick={apply}
          style={{
            flex: 1,
            minHeight: 36,
            padding: '0 var(--space-3)',
            background: 'var(--color-primary)',
            color: 'var(--color-on-primary)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {t('admin.tickets.filter.apply', null, lang)}
        </button>
        <button
          type="button"
          onClick={reset}
          style={{
            flex: 1,
            minHeight: 36,
            padding: '0 var(--space-3)',
            background: 'var(--color-surface-raised)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          {t('admin.tickets.filter.reset', null, lang)}
        </button>
      </div>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    '-' +
    pad(d.getMonth() + 1) +
    '-' +
    pad(d.getDate()) +
    'T' +
    pad(d.getHours()) +
    ':' +
    pad(d.getMinutes())
  );
}
