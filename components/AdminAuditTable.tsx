'use client';

/**
 * AdminAuditTable (components/AdminAuditTable.tsx).
 *
 * Bolt 005-004 (Intent 005, Unit 004). The main-panel
 * table on the admin audit dashboard. Pure
 * presentational; reads + writes through props.
 *
 * Columns: timestamp, actor, action, entity type,
 * entity id (truncated), details (expand slot).
 * Loading: 5 skeleton rows. Error: a single error row.
 * Empty: a single empty row.
 */

import { Fragment, useId } from 'react';
import { t, type Language } from '@/lib/i18n/keys';
import type { AuditEntryView } from '@/lib/admin/audit-query';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';

interface AdminAuditTableProps {
  entries: AuditEntryView[];
  loading: boolean;
  error: string | null;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  lang: Language;
}

export function AdminAuditTable({
  entries,
  loading,
  error,
  expanded,
  onToggleExpand,
  onLoadMore,
  hasMore,
  lang,
}: AdminAuditTableProps) {
  const tableId = useId();

  if (loading && entries.length === 0) {
    return (
      <SkeletonStatus lang={lang} className="admin-table-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="admin-table-skeleton-row">
            {[0, 1, 2, 3, 4, 5].map((cell) => <SkeletonBlock key={cell} style={{ width: `${48 + (cell % 3) * 13}%`, height: 13 }} />)}
          </div>
        ))}
      </SkeletonStatus>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-error)' }}>{error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-ink-secondary)' }}>
          {t('admin.audit.empty', null, lang)}
        </p>
      </div>
    );
  }

  return (
    /*
     * The wrapper scrolls horizontally, but a `width: 100%` table
     * shrinks its columns to fit instead of overflowing — on a 390px
     * phone the timestamp column collapsed to ~40px and the date
     * broke across five lines, which made the whole log unreadable.
     * A `minWidth` larger than a phone viewport forces the wrapper to
     * scroll sideways and keeps every cell legible.
     */
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        id={tableId}
        style={{
          width: '100%',
          minWidth: 720,
          borderCollapse: 'collapse',
          fontSize: 'var(--text-caption)',
        }}
      >
        <thead>
          <tr
            style={{
              background: 'var(--color-surface-raised)',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <th style={thStyle}>{t('admin.audit.col.timestamp', null, lang)}</th>
            <th style={thStyle}>{t('admin.audit.col.actor', null, lang)}</th>
            <th style={thStyle}>{t('admin.audit.col.action', null, lang)}</th>
            <th style={thStyle}>{t('admin.audit.col.entityType', null, lang)}</th>
            <th style={thStyle}>{t('admin.audit.col.entityId', null, lang)}</th>
            <th style={thStyle}>{t('admin.audit.col.details', null, lang)}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((row) => {
            const isOpen = expanded.has(row.id);
            return (
              // The `key` must sit on the OUTERMEST element of the
              // list item. It used to sit on the inner `<tr>`, so
              // the fragment was the unkeyed element React warned
              // about ("Each child in a list should have a unique
              // 'key' prop").
              <Fragment key={row.id}>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <td
                    style={{
                      ...tdStyle,
                      // The Bangla date string is long; without this it
                      // wraps mid-value even on a wide-enough screen.
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatTimestamp(row.createdAt, lang)}
                  </td>
                  <td style={tdStyle}>{row.actorName}</td>
                  <td style={tdStyle}>{row.action}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        background: 'var(--color-surface-raised)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-pill)',
                        fontSize: 'var(--text-small)',
                        color: 'var(--color-ink-secondary)',
                      }}
                    >
                      {row.entityType}
                    </span>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-ink-secondary)',
                    }}
                    title={row.entityId}
                  >
                    {row.entityId.length > 16
                      ? row.entityId.slice(0, 14) + '…'
                      : row.entityId}
                  </td>
                  <td style={tdStyle}>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(row.id)}
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? t('admin.audit.expand.after', null, lang)
                          : t('admin.audit.col.details', null, lang)
                      }
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-primary)',
                        fontFamily: 'inherit',
                        fontSize: 'inherit',
                      }}
                    >
                      {isOpen ? '▼' : '▶'}
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        background: 'var(--color-surface-raised)',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
                        <div>
                          <p
                            style={{
                              margin: '0 0 4px',
                              fontWeight: 'var(--weight-semibold)',
                              color: 'var(--color-ink-secondary)',
                            }}
                          >
                            {t('admin.audit.expand.before', null, lang)}
                          </p>
                          <pre
                            style={{
                              margin: 0,
                              padding: 8,
                              background: 'var(--color-surface-page)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 'var(--text-small)',
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {row.beforeValue
                              ? JSON.stringify(row.beforeValue, null, 2)
                              : '—'}
                          </pre>
                        </div>
                        <div>
                          <p
                            style={{
                              margin: '0 0 4px',
                              fontWeight: 'var(--weight-semibold)',
                              color: 'var(--color-ink-secondary)',
                            }}
                          >
                            {t('admin.audit.expand.after', null, lang)}
                          </p>
                          <pre
                            style={{
                              margin: 0,
                              padding: 8,
                              background: 'var(--color-surface-page)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-sm)',
                              fontSize: 'var(--text-small)',
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                            }}
                          >
                            {row.afterValue
                              ? JSON.stringify(row.afterValue, null, 2)
                              : '—'}
                          </pre>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {hasMore && (
        <div
          style={{
            padding: 'var(--space-3)',
            textAlign: 'center',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loading}
            style={{
              minHeight: 36,
              padding: '0 var(--space-4)',
              background: 'var(--color-surface-raised)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              fontFamily: 'inherit',
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {t('admin.audit.loadMore', null, lang)}
          </button>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 12px',
  textAlign: 'left',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--color-ink-secondary)',
  fontSize: 'var(--text-small)',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'middle',
};

function formatTimestamp(iso: string, lang: Language): string {
  try {
    const d = new Date(iso);
    if (lang === 'bn') {
      // Use Bangla locale for month names; keep numeric date/time
      return d.toLocaleString('bn-BD', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
