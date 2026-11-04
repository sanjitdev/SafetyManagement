/**
 * StatCard — one headline figure.
 *
 * Not a chart: a number, its label, and the direction of change. The
 * trend arrow is accompanied by the value it describes, and the tone
 * is explicit, because "up" is not always good — more OPEN tickets
 * going up is bad, and a green "▲" would be a lie.
 *
 * The number uses the global `.tabular-nums` utility so a column of
 * KPI cards has digits that line up.
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export type StatTrend = 'up' | 'down' | 'flat';
export type StatTone = 'neutral' | 'success' | 'danger' | 'warning';

export interface StatCardProps {
  /** The label above the number. */
  label: string;
  /** The headline value. */
  value: string;
  /** The unit or qualifier next to the value (e.g. "টিকিট", "%"). */
  unit?: string;
  /** The direction of change. */
  trend?: StatTrend;
  /** The change value (e.g. "+12%", "−4"). */
  trendValue?: string;
  /** Whether the trend is good. */
  trendTone?: StatTone;
  /** Optional decorative icon. */
  icon?: ReactNode;
  /** Optional supporting copy under the value. */
  hint?: string;
  /** Document language. */
  lang: Language;
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

const TREND_ARROW: Record<StatTrend, string> = { up: '▲', down: '▼', flat: '▬' };

const TONE_COLOR: Record<StatTone, string> = {
  neutral: 'var(--color-ink-tertiary)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
};

export function StatCard({
  label,
  value,
  unit,
  trend,
  trendValue,
  trendTone = 'neutral',
  icon,
  hint,
  lang,
  className,
  'data-testid': testId,
}: StatCardProps) {
  return (
    <div
      data-testid={testId}
      className={className}
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
        {icon ? (
          <span aria-hidden style={{ display: 'inline-flex' }}>
            {icon}
          </span>
        ) : null}
        {label}
      </span>

      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 'var(--space-2)' }}>
        <span
          className="tabular-nums"
          style={{
            fontSize: 'var(--text-display-md)',
            fontWeight: 'var(--weight-bold)',
            color: 'var(--color-ink)',
            lineHeight: 'var(--leading-tight)',
          }}
        >
          {value}
        </span>
        {unit ? (
          <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}>{unit}</span>
        ) : null}
      </span>

      {trend && trendValue ? (
        <span
          lang={lang}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: 'var(--text-caption)',
            color: TONE_COLOR[trendTone],
          }}
        >
          <span aria-hidden>{TREND_ARROW[trend]}</span>
          <span className="tabular-nums">{trendValue}</span>
        </span>
      ) : null}

      {hint ? (
        <span
          lang={lang}
          style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** The accessible label a chart frame uses when the title is empty. */
export function statCardDefaultLabel(lang: Language): string {
  return t('ui.kpi.label', null, lang);
}
