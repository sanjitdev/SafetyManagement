/**
 * ChartFrame — the shared shell around every chart.
 *
 * Every chart in the product obeys the same three rules:
 *
 *   1. THE DATA TABLE IS ALWAYS REACHABLE. A chart is a picture of
 *      the data; a screen-reader user (and anyone reading a printed
 *      report) needs the numbers themselves. The table is rendered
 *      VISIBLY, not hidden behind a screen-reader-only region — a
 *      sighted keyboard user must be able to reach it too.
 *
 *   2. NO SERIES IS ENCODED BY HUE ALONE. Every series also carries
 *      a dash pattern or a direct label, so the chart survives a
 *      greyscale printout and a colour-blind reader.
 *
 *   3. THE CHART ITSELF IS DECORATIVE. The SVG is `aria-hidden`; the
 *      table carries the accessible content. Announcing a chart's
 *      internals is noise — "path, line, 4 points" — while announcing
 *      the table gives the actual figures.
 *
 * The toggle between the chart and the table is a real button with
 * `aria-expanded`, so its state is announced.
 */

'use client';

import { useId, useState, type ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface ChartFrameProps {
  /** The chart heading. */
  title: string;
  /** Optional supporting copy under the heading. */
  description?: string;
  /** The chart canvas (usually a dynamically imported Recharts component). */
  chart: ReactNode;
  /** The equivalent data table. */
  table: ReactNode;
  /** Document language. */
  lang: Language;
  /** Optional actions in the heading row (a range picker, an export). */
  actions?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

export function ChartFrame({
  title,
  description,
  chart,
  table,
  lang,
  actions,
  'data-testid': testId,
}: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const tableId = useId();

  return (
    <figure
      data-testid={testId}
      style={{
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--color-surface-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        padding: 'var(--space-4)',
      }}
    >
      <figcaption
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3
            lang={lang}
            style={{
              margin: 0,
              fontSize: 'var(--text-body)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-ink)',
              lineHeight: 'var(--leading-snug)',
            }}
          >
            {title}
          </h3>
          {description ? (
            <p
              lang={lang}
              style={{
                margin: 'var(--space-1) 0 0',
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
                lineHeight: 'var(--leading-snug)',
              }}
            >
              {description}
            </p>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
          {actions}
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            aria-expanded={showTable}
            aria-controls={tableId}
            lang={lang}
            style={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border-strong)',
              borderRadius: 'var(--radius-pill)',
              color: 'var(--color-ink-secondary)',
              fontFamily: 'inherit',
              fontSize: 'var(--text-caption)',
              fontWeight: 'var(--weight-semibold)',
              padding: 'var(--space-1) var(--space-3)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {showTable ? t('ui.action.hide_table', null, lang) : t('ui.action.show_table', null, lang)}
          </button>
        </div>
      </figcaption>

      <div aria-hidden style={{ width: '100%' }}>
        {chart}
      </div>

      <div id={tableId} hidden={!showTable}>
        <h4
          lang={lang}
          style={{
            margin: '0 0 var(--space-2)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink-secondary)',
          }}
        >
          {t('ui.chart.data_table', null, lang)}
        </h4>
        {table}
      </div>
    </figure>
  );
}
