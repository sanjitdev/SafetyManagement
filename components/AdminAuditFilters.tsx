'use client';

/**
 * AdminAuditFilters (components/AdminAuditFilters.tsx).
 *
 * Bolt 005-004 (Intent 005, Unit 004). The left-rail
 * filter UI on the admin audit dashboard. Pure
 * presentational; reads + writes through props.
 *
 * Internal state is uncontrolled inputs; on `Apply` the
 * component reads its inputs and calls
 * `onApply({ actorId, action, entityType, from, to })`.
 * The `action` field is comma-separated in the input
 * and split on `Apply`. Bilingual via `t(...)`.
 */

import { useState } from 'react';
import { t, type Language } from '@/lib/i18n/keys';
import type { AuditQueryFilters, AuditEntityType } from '@/lib/admin/audit-query';

interface AdminAuditFiltersProps {
  initial: AuditQueryFilters;
  lang: Language;
  onApply: (filters: AuditQueryFilters) => void;
  onReset: () => void;
}

const ENTITY_TYPE_VALUES: AuditEntityType[] = [
  'ticket',
  'city',
  'category',
  'department',
  'ward',
  'user',
];

export function AdminAuditFilters({
  initial,
  lang,
  onApply,
  onReset,
}: AdminAuditFiltersProps) {
  const [actorId, setActorId] = useState(initial.actorId ?? '');
  const [action, setAction] = useState(
    (initial.action ?? []).join(','),
  );
  const [entityType, setEntityType] = useState<string>(
    (initial.entityType ?? [])[0] ?? '',
  );
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');

  const apply = () => {
    onApply({
      actorId: actorId.trim() || undefined,
      action: action
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      entityType: entityType
        ? ([entityType] as AuditEntityType[])
        : undefined,
      from: from.trim() || undefined,
      to: to.trim() || undefined,
    });
  };

  const reset = () => {
    setActorId('');
    setAction('');
    setEntityType('');
    setFrom('');
    setTo('');
    onReset();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg)',
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
        <label htmlFor="audit-filter-actor" style={labelStyle}>
          {t('admin.audit.filter.actor', null, lang)}
        </label>
        <input
          id="audit-filter-actor"
          type="text"
          value={actorId}
          onChange={(e) => setActorId(e.target.value)}
          placeholder="user_..."
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="audit-filter-action" style={labelStyle}>
          {t('admin.audit.filter.action', null, lang)}
        </label>
        <input
          id="audit-filter-action"
          type="text"
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="create, update, ..."
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="audit-filter-entityType" style={labelStyle}>
          {t('admin.audit.filter.entityType', null, lang)}
        </label>
        <select
          id="audit-filter-entityType"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
          style={inputStyle}
        >
          <option value="">—</option>
          {ENTITY_TYPE_VALUES.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="audit-filter-from" style={labelStyle}>
          {t('admin.audit.filter.from', null, lang)}
        </label>
        <input
          id="audit-filter-from"
          type="datetime-local"
          value={from ? toLocalInput(from) : ''}
          onChange={(e) => setFrom(e.target.value ? new Date(e.target.value).toISOString() : '')}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="audit-filter-to" style={labelStyle}>
          {t('admin.audit.filter.to', null, lang)}
        </label>
        <input
          id="audit-filter-to"
          type="datetime-local"
          value={to ? toLocalInput(to) : ''}
          onChange={(e) => setTo(e.target.value ? new Date(e.target.value).toISOString() : '')}
          style={inputStyle}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          type="button"
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
          {t('admin.audit.filter.apply', null, lang)}
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
          {t('admin.audit.filter.reset', null, lang)}
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
