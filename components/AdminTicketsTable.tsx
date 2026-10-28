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

interface AdminTicketsTableProps {
  rows: SerializedTicket[];
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
  hasMore: boolean;
  lang: Language;
}

/**
 * The status pill's background + foreground.
 *
 * The convention across the app is a `*-soft` background with the
 * SATURATED `*-status` colour as the foreground. Using the
 * saturated token as the BACKGROUND made the label unreadable
 * (white text on a saturated blue).
 */
const STATUS_STYLE: Record<
  string,
  { background: string; color: string }
> = {
  submitted: {
    background: 'var(--color-status-submitted-soft)',
    color: 'var(--color-status-submitted)',
  },
  routed: {
    background: 'var(--color-status-routed-soft)',
    color: 'var(--color-status-routed)',
  },
  in_progress: {
    background: 'var(--color-status-in-progress-soft)',
    color: 'var(--color-status-in-progress)',
  },
  resolved: {
    background: 'var(--color-status-resolved-soft)',
    color: 'var(--color-status-resolved)',
  },
  // `closed` and `cancelled` have no dedicated soft token — they
  // render neutral, the same as the other admin surfaces.
  closed: {
    background: 'var(--color-surface-raised)',
    color: 'var(--color-ink-secondary)',
  },
  cancelled: {
    background: 'var(--color-surface-raised)',
    color: 'var(--color-ink-secondary)',
  },
};

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
      <div style={{ padding: 'var(--space-4)' }}>
        <p style={{ color: 'var(--color-ink-secondary)' }}>
          {t('admin.tickets.loading', null, lang)}
        </p>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            data-testid="admin-tickets-skeleton-row"
            style={{
              height: 36,
              marginBottom: 6,
              background: 'var(--color-surface-raised)',
              borderRadius: 'var(--radius-sm)',
              animation: 'pulse 1.4s ease-in-out infinite',
            }}
          />
        ))}
      </div>
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
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background:
                      STATUS_STYLE[row.status]?.background ??
                      'var(--color-surface-raised)',
                    color:
                      STATUS_STYLE[row.status]?.color ??
                      'var(--color-ink-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--text-small)',
                  }}
                >
                  {t(`status.${row.status}`, null, lang)}
                </span>
              </td>
              <td style={tdStyle}>
                {categoryLabel(row, lang)}
              </td>
              <td style={tdStyle}>{wardLabel(row, lang)}</td>
              <td style={tdStyle}>
                {row.reporterName ?? row.reporterId}
              </td>
              <td style={tdStyle}>
                {row.assignedCrewId ? (
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
