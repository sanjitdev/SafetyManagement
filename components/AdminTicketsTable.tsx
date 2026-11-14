'use client';

/**
 * AdminTicketsTable (components/AdminTicketsTable.tsx).
 *
 * Bolt admin-tickets (Intent 005, Unit 005). The main-panel
 * table on the admin /admin/tickets page. Seven columns:
 * id · status · category · ward · reporter · assigned crew ·
 * created. Row click → /admin/tickets/[id].
 *
 * Pure presentational; reads + writes through props. Mirrors
 * components/AdminAuditTable.tsx for empty/loading/error/load-more
 * states so the two admin surfaces feel uniform.
 *
 * Bilingual via t(...). The status pill uses the same
 * `var(--color-*)` palette the audit table uses for consistency.
 */

import { useRouter } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';
import { formatTimestamp } from '@/lib/format/datetime';
import { formatTicketId } from '@/lib/format/ticket-id';
import { displayNameFor } from '@/lib/identity/display-name';
import type { SerializedTicket } from '@/lib/serializers/ticket';
import { SkeletonBlock, SkeletonStatus } from '@/components/ui/Skeleton';
import { StatusPill, type StatusKey } from '@/components/ui/StatusPill';

interface AdminTicketsTableProps {
  rows: SerializedTicket[];
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
  hasMore: boolean;
  lang: Language;
}

export function AdminTicketsTable({
  rows,
  loading,
  error,
  onLoadMore,
  hasMore,
  lang,
}: AdminTicketsTableProps) {
  const router = useRouter();

  if (loading && rows.length === 0) {
    return (
      <SkeletonStatus lang={lang} className="admin-table-skeleton">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} data-testid="admin-tickets-skeleton-row" className="admin-table-skeleton-row">
            {[0, 1, 2, 3, 4, 5, 6].map((cell) => <SkeletonBlock key={cell} style={{ width: `${48 + (cell % 3) * 13}%`, height: 13 }} />)}
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

  if (rows.length === 0) {
    return (
      <div style={{ padding: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-ink-secondary)' }}>
          {t('admin.tickets.empty', null, lang)}
        </p>
      </div>
    );
  }

  return (
    /*
     * Seven columns cannot fit a 390px phone. The wrapper scrolls
     * sideways, but a `width: 100%` table shrinks its columns to fit
     * instead of overflowing — every cell collapsed to a sliver and
     * the Bangla labels wrapped character by character. A `minWidth`
     * forces the horizontal scroll and keeps each cell legible.
     */
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <table
        data-testid="admin-tickets-table"
        style={{
          width: '100%',
          minWidth: 860,
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
            <th style={thStyle}>{t('admin.tickets.col.id', null, lang)}</th>
            <th style={thStyle}>{t('admin.tickets.col.status', null, lang)}</th>
            <th style={thStyle}>{t('admin.tickets.col.category', null, lang)}</th>
            <th style={thStyle}>{t('admin.tickets.col.ward', null, lang)}</th>
            <th style={thStyle}>{t('admin.tickets.col.reporter', null, lang)}</th>
            <th style={thStyle}>{t('admin.tickets.col.assigned', null, lang)}</th>
            <th style={thStyle}>{t('admin.tickets.col.created', null, lang)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              data-testid="admin-tickets-row"
              onClick={() => router.push(`/admin/tickets/${row.id}`)}
              style={{
                borderBottom: '1px solid var(--color-border)',
                cursor: 'pointer',
              }}
            >
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                {formatTicketId(row.id)}
              </td>
              <td style={tdStyle}>
                <StatusPill status={row.status as StatusKey} lang={lang} />
              </td>
              <td style={tdStyle}>
                {categoryLabel(row, lang)}
              </td>
              <td style={tdStyle}>{wardLabel(row, lang)}</td>
              <td style={tdStyle}>
                {row.reporterName ?? row.reporterId}
              </td>
              <td style={tdStyle}>
                {row.assignedCrewName ? (
                  <span>{row.assignedCrewName}</span>
                ) : row.assignedCrewId ? (
                  <span>{displayNameFor('crew', row.assignedCrewId)}</span>
                ) : (
                  <span style={{ color: 'var(--color-ink-secondary)' }}>—</span>
                )}
              </td>
              <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                {formatTimestamp(row.createdAt, lang)}
              </td>

            </tr>
          ))}
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
            data-testid="admin-tickets-load-more"
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
            {t('admin.tickets.loadMore', null, lang)}
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

/**
 * The category's display name.
 *
 * The admin table used to print the raw `cat_*` id. The
 * serializer denormalises the category's name onto the ticket,
 * so prefer that; fall back to the id when the join is absent.
 */
function categoryLabel(row: SerializedTicket, lang: Language): string {
  const name = lang === 'bn' ? row.categoryNameBn : row.categoryName;
  return name ?? row.categoryId;
}

/**
 * The ward's display name. Same fallback contract as
 * `categoryLabel`.
 */
function wardLabel(row: SerializedTicket, lang: Language): string {
  const name = lang === 'bn' ? row.wardNameBn : row.wardName;
  return name ?? row.wardId;
}
