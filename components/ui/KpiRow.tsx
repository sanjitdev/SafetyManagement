/**
 * KpiRow — the row of headline figures at the top of a dashboard.
 *
 * A KPI is NOT a chart. It is one number, its label, and — when the
 * product has a comparison — the direction of the change. The
 * direction is carried by an ARROW + the word, not by green-versus-
 * red alone, because "up" is not always good (open tickets going up
 * is bad) and because a colour-blind user must still read the trend.
 *
 * `trend` is therefore explicit: the caller decides whether an
 * increase is good, bad or neutral, and passes `tone` to match.
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export type KpiTrend = 'up' | 'down' | 'flat';

export interface KpiItem {
  /** Stable id. */
  key: string;
  /** The label above the number. */
  label: string;
  /** The headline value. */
  value: string;
  /** Optional secondary line (e.g. "vs last week"). */
  hint?: string;
  /** Optional direction of change. */
  trend?: KpiTrend;
  /** The change the trend describes (e.g. "+12%", "−4"). */
  trendValue?: string;
  /** Whether the trend is good. `neutral` uses the ink colour. */
  trendTone?: 'success' | 'danger' | 'neutral';
  /** Optional decorative icon. */
  icon?: ReactNode;
}

export interface KpiRowProps {
  /** The figures. */
  items: readonly KpiItem[];
  /** Accessible name for the region. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** Test hook. */
  'data-testid'?: string;
}

const TREND_ARROW: Record<KpiTrend, string> = { up: '▲', down: '▼', flat: '▬' };

export function KpiRow({ items, ariaLabel, lang, 'data-testid': testId }: KpiRowProps) {
  return (
    <section
      role="group"
      aria-label={ariaLabel ?? t('ui.kpi.label', null, lang)}
      data-testid={testId}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))`,
        gap: 'var(--space-3)',
      }}
    >
      {items.map((item) => {
        const trendColor =
          item.trendTone === 'success'
            ? 'var(--color-success)'
            : item.trendTone === 'danger'
              ? 'var(--color-danger)'
              : 'var(--color-ink-tertiary)';

        return (
          <div
            key={item.key}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-surface-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-card)',
              minWidth: 0,
            }}
          >
            <span
              lang={lang}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
              }}
            >
              {item.icon ? (
                <span aria-hidden style={{ display: 'inline-flex' }}>
                  {item.icon}
                </span>
              ) : null}
              {item.label}
            </span>

            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-display-md)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink)',
                lineHeight: 'var(--leading-tight)',
              }}
            >
              {item.value}
            </span>

            {item.trend || item.hint ? (
              <span
                lang={lang}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--space-1)',
                  fontSize: 'var(--text-caption)',
                  color: item.trend ? trendColor : 'var(--color-ink-tertiary)',
                }}
              >
                {item.trend && item.trendValue ? (
                  <>
                    <span aria-hidden>{TREND_ARROW[item.trend]}</span>
                    <span className="tabular-nums">{item.trendValue}</span>
                  </>
                ) : null}
                {!item.trendValue && item.hint ? (
                  <span className="tabular-nums">{item.hint}</span>
                ) : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
