/**
 * MetricStrip — the headline figures at the top of a dashboard.
 *
 * The trap this component exists to avoid is the HERO-METRIC
 * TEMPLATE: a row of four identical cards, each a big number, a
 * small label and a coloured icon tile. Four cards of the same size
 * say "these four numbers matter equally", which is almost never
 * true, and the repetition makes the row read as decoration rather
 * than as a readout.
 *
 * So the strip has a HIERARCHY instead of a grid:
 *
 *   ┌─────────────────────┐  ┌──────────┬──────────┬──────────┐
 *   │ 42                  │  │  ১৮০    │   ১১     │   ৭      │
 *   │ নতুন রিপোর্ট         │  │ সমাধান   │ চলমান    │  অপেক্ষমাণ │
 *   │ ▲ ১২% · গত সপ্তাহে    │  │ ──────── │ ──────── │ ──────── │
 *   └─────────────────────┘  └──────────┴──────────┴──────────┘
 *     the headline figure      the supporting figures, one row
 *
 * The headline gets the size, the weight and its own surface. The
 * supporting figures share a single surface and are divided by
 * hairlines, so they read as ONE strip of related facts rather than
 * three more cards competing with the first.
 *
 * The supporting figures are a real `<dl>` — each is a term (the
 * label) bound to a description (the value). That is the semantic
 * structure the visual structure is describing, and it means a screen
 * reader hears "সমাধান, ১৮০" rather than two unrelated strings.
 *
 * The trend arrow is a SHAPE, not a glyph: it says "up" the way a bar
 * says "more", and it recolours with the theme the way a text glyph
 * cannot. The word ("+12%") is always beside it, so the direction
 * never depends on the arrow alone — and the tone is explicit,
 * because "up" is not always good (more OPEN tickets going up is bad).
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';
import { ICONS, type IconEntry } from '@/lib/ui/icon-map';

export type MetricTrend = 'up' | 'down' | 'flat';
export type MetricTone = 'neutral' | 'success' | 'danger' | 'warning';

export interface MetricFigure {
  /** Stable id. */
  key: string;
  /** The label for the figure. */
  label: string;
  /** The value. */
  value: string;
  /** Optional qualifier beside the value (e.g. "টিকিট", "%"). */
  unit?: string;
  /** Optional direction of change. */
  trend?: MetricTrend;
  /** The change the trend describes (e.g. "+12%", "−4"). */
  trendValue?: string;
  /** Whether the trend is good. */
  trendTone?: MetricTone;
  /** Optional supporting copy under the value. */
  hint?: string;
}

export interface MetricStripProps {
  /** The headline figure. It gets the large treatment. */
  headline: MetricFigure;
  /** The supporting figures, in reading order. */
  figures?: readonly MetricFigure[];
  /** Optional decorative icon for the headline. */
  icon?: ReactNode;
  /** Accessible name for the region. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** Optional class passthrough for the outer element. */
  className?: string;
  /** Test hook for the outer element. */
  'data-testid'?: string;
  /** Test hook for the headline figure. */
  'data-testid-headline'?: string;
}

const TREND_ARROW: Record<MetricTrend, IconEntry> = {
  up: ICONS.trendUp,
  down: ICONS.trendDown,
  flat: ICONS.trendFlat,
};

const TONE_COLOR: Record<MetricTone, string> = {
  neutral: 'var(--color-ink-tertiary)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
};

/**
 * The arrow that carries the direction of change.
 *
 * A shape, not a glyph: the arrow says "up" the way a bar says "more",
 * and it recolours with the theme the way a text glyph cannot. The
 * value it describes is always beside it, so the direction never
 * depends on the arrow alone.
 */
function TrendArrow({ trend }: { trend: MetricTrend }) {
  const entry = TREND_ARROW[trend];
  const IconComponent = entry.icon;
  return <IconComponent size={12} weight={entry.weight} />;
}

/** The trend line — an arrow plus the value it describes, never the arrow alone. */
function Trend({ trend, trendValue, tone }: { trend: MetricTrend; trendValue?: string; tone: MetricTone }) {
  if (!trendValue) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        fontSize: 'var(--text-caption)',
        fontWeight: 'var(--weight-medium)',
        color: TONE_COLOR[tone],
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex' }}>
        <TrendArrow trend={trend} />
      </span>
      <span className="tabular-nums">{trendValue}</span>
    </span>
  );
}

/**
 * The headline figure.
 *
 * It is the only element in the strip with its own border and its own
 * size, which is what makes the hierarchy legible at a glance. The
 * label sits ABOVE the number, in the sentence case the product's
 * copy uses everywhere — the number is the thing you read, and the
 * label says what it counts.
 */
function Headline({
  figure,
  icon,
  lang,
  testId,
}: {
  figure: MetricFigure;
  icon?: ReactNode;
  lang: Language;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="metric-strip-headline"
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4) var(--space-5)',
        /*
         * The headline sits BESIDE the supporting-figures strip, and
         * both are card surfaces. When each carried its own border the
         * two adjacent 1px lines read as a seam down the middle of one
         * strip — the row looked like two half-strips that happened to
         * touch rather than one readout.
         *
         * So the outer edge belongs to the STRIP (see the section
         * below) and the headline only draws the hairline that
         * separates it from the figures beside it.
         */
        borderRight: '1px solid var(--color-border)',
        background: 'var(--color-surface-card)',
      }}
    >
      <span
        lang={lang}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-body-sm)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--color-ink-secondary)',
        }}
      >
        {icon ? (
          <span aria-hidden style={{ display: 'inline-flex' }}>
            {icon}
          </span>
        ) : null}
        {figure.label}
      </span>

      <span
        className="tabular-nums"
        style={{
          display: 'inline-flex',
          alignItems: 'baseline',
          gap: 'var(--space-2)',
          fontSize: 'var(--text-display-lg)',
          fontWeight: 'var(--weight-bold)',
          color: 'var(--color-ink)',
          lineHeight: 'var(--leading-tight)',
          letterSpacing: '-0.02em',
        }}
      >
        {figure.value}
        {figure.unit ? (
          <span style={{ fontSize: 'var(--text-body-sm)', fontWeight: 'var(--weight-medium)', color: 'var(--color-ink-tertiary)' }}>
            {figure.unit}
          </span>
        ) : null}
      </span>

      {figure.trend && figure.trendValue ? (
        <Trend trend={figure.trend} trendValue={figure.trendValue} tone={figure.trendTone ?? 'neutral'} />
      ) : null}

      {figure.hint ? (
        <span lang={lang} style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}>
          {figure.hint}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The supporting figures.
 *
 * A `<dl>`: each figure is a term (the label) bound to a value. The
 * hairline dividers are the visual echo of that binding — they are
 * what separates one fact from the next without putting a border
 * around each one, which is what turned the old grid into four
 * competing boxes.
 */
function Supporting({
  figures,
  lang,
}: {
  figures: readonly MetricFigure[];
  lang: Language;
}) {
  if (figures.length === 0) return null;
  return (
    <dl
      className="metric-strip-figures"
      style={{
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${figures.length}, minmax(0, 1fr))`,
        margin: 0,
        /*
         * No border of its own — the strip draws the outer edge. Only
         * the hairline BETWEEN figures remains, so the row reads as
         * one surface divided into cells rather than as a stack of
         * separate boxes.
         */
        border: 'none',
        background: 'var(--color-surface-card)',
        overflow: 'hidden',
      }}
    >
      {figures.map((figure) => (
        <div
          key={figure.key}
          className="metric-strip-figure"
          style={{
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-1)',
            padding: 'var(--space-4) var(--space-5)',
          }}
        >
          <dt
            lang={lang}
            style={{
              fontSize: 'var(--text-body-sm)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--color-ink-secondary)',
            }}
          >
            {figure.label}
          </dt>
          <dd
            style={{
              margin: 0,
              display: 'inline-flex',
              alignItems: 'baseline',
              gap: 'var(--space-2)',
            }}
          >
            <span
              className="tabular-nums"
              style={{
                fontSize: 'var(--text-display-md)',
                fontWeight: 'var(--weight-bold)',
                color: 'var(--color-ink)',
                lineHeight: 'var(--leading-tight)',
              }}
            >
              {figure.value}
            </span>
            {figure.unit ? (
              <span style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}>{figure.unit}</span>
            ) : null}
          </dd>
          {figure.trend && figure.trendValue ? (
            <Trend trend={figure.trend} trendValue={figure.trendValue} tone={figure.trendTone ?? 'neutral'} />
          ) : null}
          {figure.hint ? (
            <span lang={lang} style={{ fontSize: 'var(--text-caption)', color: 'var(--color-ink-tertiary)' }}>
              {figure.hint}
            </span>
          ) : null}
        </div>
      ))}
    </dl>
  );
}

export function MetricStrip({
  headline,
  figures = [],
  icon,
  ariaLabel,
  lang,
  className,
  'data-testid': testId,
  'data-testid-headline': headlineTestId,
}: MetricStripProps) {
  return (
    <section
      role="group"
      aria-label={ariaLabel ?? t('ui.kpi.label', null, lang)}
      data-testid={testId}
      className={className}
      style={{
        display: 'grid',
        // A single column: the bordered surface below is the only
        // child. The headline/figures split lives on the surface
        // (`.metric-strip-surface` in globals.css) so the responsive
        // rules can reach it.
        gridTemplateColumns: 'minmax(0, 1fr)',
        alignItems: 'stretch',
      }}
    >
      {/*
       * ONE bordered surface wraps both halves. The border belongs
       * here — at the edge of the whole strip — so the row reads as a
       * single readout rather than as two bordered boxes that happen
       * to sit next to each other. The hairline between the headline
       * and the figures is the only internal rule.
       *
       * The gap lives INSIDE this wrapper, so the two halves are
       * adjacent cells of one card, separated by their own hairline.
       */}
      <div
        className="metric-strip-surface"
        style={{
          minWidth: 0,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--color-surface-card)',
          overflow: 'hidden',
        }}
      >
        <Headline figure={headline} icon={icon} lang={lang} testId={headlineTestId} />
        <Supporting figures={figures} lang={lang} />
      </div>
    </section>
  );
}
