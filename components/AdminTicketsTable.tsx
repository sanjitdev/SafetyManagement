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
import type { SerializedTicket } from '@/lib/serializers/ticket';

interface AdminTicketsTableProps {
  rows: SerializedTicket[];
  loading: boolean;
  error: string | null;
  onLoadMore: () => void;
  hasMore: boolean;
  lang: Language;
}

const STATUS_BG: Record<string, string> = {
  submitted: 'var(--color-status-submitted)',
  routed: 'var(--color-status-routed)',
  in_progress: 'var(--color-status-in-progress)',
  resolved: 'var(--color-status-resolved)',
  closed: 'var(--color-status-closed)',
  cancelled: 'var(--color-status-cancelled)',
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
    <div style={{ overflowX: 'auto' }}>
      <table
        data-testid="admin-tickets-table"
        style={{
          width: '100%',
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
                {truncate(row.id, 14)}
              </td>
              <td style={tdStyle}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background:
                      STATUS_BG[row.status] ?? 'var(--color-surface-raised)',
                    color: 'var(--color-on-primary, white)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 'var(--text-small)',
                  }}
                >
                  {t(`status.${row.status}`, null, lang)}
                </span>
              </td>
              <td style={tdStyle}>{row.categoryId}</td>
              <td style={tdStyle}>{row.wardId}</td>
              <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                {row.reporterId}
              </td>
              <td style={tdStyle}>
                {row.assignedCrewId ? (
                  <span style={{ fontFamily: 'monospace' }}>
                    {row.assignedCrewId}
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-ink-secondary)' }}>—</span>
                )}
              </td>
              <td style={tdStyle}>{formatTimestamp(row.createdAt, lang)}</td>
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

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}

function formatTimestamp(iso: string, lang: Language): string {
  try {
    const d = new Date(iso);
    if (lang === 'bn') {
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
