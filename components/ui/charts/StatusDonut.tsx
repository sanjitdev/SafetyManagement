/**
 * StatusDonut — "where the tickets are", as a ring.
 *
 * A donut because the question is "what is the MIX", and a ring
 * shows a proportion of a whole better than a ranked list does.
 * The ranked list is the CATEGORY chart's job; repeating it here
 * would waste the ring.
 *
 * ── WHY THE COLOUR IS NEVER THE ONLY SIGNAL ─────────────────────
 *
 * A donut has no axis and no label on the arc itself, so the
 * legend is where the reader learns what each slice means. The
 * legend therefore spells the status NAME out beside the swatch
 * and the count — a coloured dot with no word is unreadable to
 * anyone who cannot separate the hues, and the ring's meaning
 * depends entirely on the legend.
 *
 * The slices are also ordered by the ticket's own life (submitted,
 * routed, in progress, resolved, then the closed pair), not by
 * size, so a reader learns the order once and it does not shuffle
 * between refreshes. The order is stable because a pie whose
 * slices move on every poll is unreadable.
 *
 * ── THE RING IS DECORATIVE ───────────────────────────────────────
 *
 * `ChartFrame` marks the SVG `aria-hidden`; the data table carries
 * the accessible content. The ring's centre shows the total as a
 * convenience, but the number that matters is in the table.
 */

import { ChartFrame } from './ChartFrame';
import { DataTable, type DataTableColumn } from '../DataTable';
import { t, type Language } from '@/lib/i18n/keys';
import { statusColor } from '@/lib/ui/status-tokens';

export interface StatusDonutEntry {
  /** The status key. */
  status: string;
  /** The number of tickets in this status. */
  count: number;
}

export interface StatusDonutProps {
  /** The chart heading. */
  title: string;
  /** Optional supporting copy. */
  description?: string;
  /** The entries. */
  entries: readonly StatusDonutEntry[];
  /** Document language. */
  lang: Language;
  /** Optional actions in the heading row. */
  actions?: React.ReactNode;
  /** Test hook. */
  'data-testid'?: string;
  /** Test hook for the data table. */
  'data-testid-table'?: string;
}

/**
 * The order the slices are drawn in.
 *
 * The ticket's life, not the size: a ring whose slices reshuffle
 * on every poll cannot be read across two refreshes.
 */
const STATUS_ORDER = [
  'submitted',
  'routed',
  'in_progress',
  'resolved',
  'closed',
  'cancelled',
];

/**
 * Sort the entries into the canonical order, with any unknown status
 * last (in its own alphabetical order, so the result is still
 * deterministic).
 */
export function sortByStatusOrder(
  entries: readonly StatusDonutEntry[],
): StatusDonutEntry[] {
  const rank = (status: string) => {
    const index = STATUS_ORDER.indexOf(status);
    return index === -1 ? STATUS_ORDER.length : index;
  };
  return [...entries].sort((a, b) => {
    const diff = rank(a.status) - rank(b.status);
    if (diff !== 0) return diff;
    return a.status.localeCompare(b.status);
  });
}

export function StatusDonut({
  title,
  description,
  entries,
  lang,
  actions,
  'data-testid': testId,
  'data-testid-table': tableTestId,
}: StatusDonutProps) {
  const ordered = sortByStatusOrder(entries);
  const total = ordered.reduce((sum, entry) => sum + entry.count, 0);
  // A ring with a single 100% slice is a circle, not a ring —
  // the hole is drawn as a separate circle on top, so it still
  // reads as a ring with one segment.
  const size = 180;
  const radius = 70;
  const stroke = 28;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  const columns: DataTableColumn<StatusDonutEntry>[] = [
    {
      key: 'status',
      header: t('dispatcher.performance.chart.col.status', null, lang),
      render: (row) => t(`status.${row.status}`, null, lang),
      sortValue: (row) => row.status,
    },
    {
      key: 'count',
      header: t('dispatcher.performance.chart.col.count', null, lang),
      numeric: true,
      render: (row) => row.count,
      sortValue: (row) => row.count,
    },
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      lang={lang}
      actions={actions}
      data-testid={testId}
      chart={
        total === 0 ? (
          <p
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              color: 'var(--color-ink-tertiary)',
              margin: 0,
            }}
          >
            {t('dispatcher.performance.empty', null, lang)}
          </p>
        ) : (
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-5)',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <svg
              width={size}
              height={size}
              viewBox={`0 0 ${size} ${size}`}
              style={{ flexShrink: 0 }}
            >
              <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                {ordered.map((entry) => {
                  if (entry.count === 0) return null;
                  const fraction = entry.count / total;
                  const dash = fraction * circumference;
                  const el = (
                    <circle
                      key={entry.status}
                      cx={size / 2}
                      cy={size / 2}
                      r={radius}
                      fill="none"
                      stroke={statusColor(entry.status)}
                      strokeWidth={stroke}
                      strokeDasharray={`${dash} ${circumference - dash}`}
                      strokeDashoffset={-offset}
                    />
                  );
                  offset += dash;
                  return el;
                })}
              </g>
              {/* The hole, punched in the surface colour so the ring
                  reads as a ring over any page background. */}
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius - stroke / 2}
                fill="var(--color-surface-card)"
              />
              <text
                x={size / 2}
                y={size / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={22}
                fontWeight="700"
                fill="var(--color-ink)"
              >
                {total}
              </text>
            </svg>
            {/* The legend spells the status name out — the colour is
                the third signal, not the first and not the only one. */}
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-1)',
              }}
            >
              {ordered.map((entry) => (
                <li
                  key={entry.status}
                  lang={lang}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    fontSize: 'var(--text-caption)',
                    color: 'var(--color-ink-secondary)',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: statusColor(entry.status),
                      flexShrink: 0,
                    }}
                  />
                  {t(`status.${entry.status}`, null, lang)} · {entry.count}
                </li>
              ))}
            </ul>
          </div>
        )
      }
      table={
        <DataTable
          columns={columns}
          rows={ordered}
          rowKey={(row: StatusDonutEntry) => row.status}
          caption={title}
          lang={lang}
          data-testid={tableTestId}
        />
      }
    />
  );
}
