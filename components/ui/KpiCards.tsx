/**
 * KpiCards — the KPI row on the dispatcher, crew and citizen
 * dashboards.
 *
 * ── WHY THIS EXISTS RATHER THAN MetricStrip ─────────────────────
 *
 * The dispatcher dashboard used to render its four headline numbers
 * through `MetricStrip` — ONE bordered surface with a headline cell
 * and three figure cells inside it. The strip was the right call for
 * a page where one number dominates and the rest are context, but
 * here the four numbers ARE peers: "new", "in review", "in progress"
 * and "resolved" are four equally-weighted states of the same
 * queue, and the dispatcher reads them left to right as a set.
 *
 * The design mockup (`ui-design/dispatcher-portal.png`) says the
 * same thing: four separate cards, each with its own circular icon
 * badge, its own label and its own value, each visibly separated
 * from the next.
 *
 * ── WHY NOT MetricStrip, PROPERLY ───────────────────────────────
 *
 * A strip's whole premise is that the supporting figures SHARE a
 * surface and are divided by hairlines. That is what makes a strip
 * read as one readout instead of four competing boxes. Asking the
 * strip to render four equal cards defeats that premise, and the
 * result is neither a strip nor a set of cards — it is one wide box
 * with four numbers in it, which is what the dashboard had.
 *
 * So the dashboard gets its own component.
 *
 * ── THE THREE VARIANTS ──────────────────────────────────────────
 *
 * The three dashboards draw the row with different ANATOMY, so the
 * component carries a `variant`:
 *
 *   - `dispatcher` — label above the value. Four peer states.
 *   - `crew`       — value above the label, plus a chevron.
 *   - `citizen`    — value above the label, NO chevron.
 *   - `admin`      — value above the label, a solid disc badge, a
 *                    trend percentage and a sparkline.
 *
 * See `KpiCardVariant` for why each one reads the way it does. The
 * surface treatment is identical across all three.
 *
 * ── NO SHADOWS ──────────────────────────────────────────────────
 *
 * The design system is explicit: "Cards have NO shadow — a 1px
 * border lifts them", and shadows are reserved for overlays
 * (modals, popovers, toasts). The separation between the cards
 * therefore comes from the GAP between them plus each card's own
 * border, not from a drop shadow. Adding one would put the app out
 * of step with every other surface.
 *
 * ── THE ICON IS NOT DECORATIVE ──────────────────────────────────
 *
 * The badge colour matches the status the card counts (submitted →
 * blue, routed → amber, in progress → teal, resolved → green), so
 * the row reads as one set of status colours that also appears in
 * the map legend and the status pills. The colour is never the
 * only signal: the label is always spelled out next to it.
 */

import type { ReactNode } from 'react';
import { ICONS, type IconEntry } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';

export interface KpiCard {
  /** Stable id — also used as the React key. */
  key: string;
  /** The label for the card. */
  label: string;
  /** The value, already formatted for the reading language. */
  value: string;
  /** The icon badge. */
  icon: IconEntry;
  /** The badge's foreground colour (a status token). */
  color: string;
  /** The badge's soft background colour. */
  colorSoft: string;
  /**
   * An optional third line under the value — a hint ("2 tasks
   * awaiting"). Rendered under the number in every variant.
   */
  hint?: string;
  /**
   * A short series of daily counts, drawn as a sparkline in the
   * card's bottom corner. Rendered only in the `admin` variant,
   * whose design reference gives every card one.
   */
  spark?: readonly number[];
  /**
   * The direction of change against the previous period. Rendered
   * only in the `admin` variant, beside `trendValue`.
   *
   * The arrow is a SHAPE and the value always sits beside it, so the
   * direction never depends on the arrow alone — and the tone is
   * explicit, because a rising ticket count is not a good thing.
   */
  trend?: 'up' | 'down' | 'flat';
  /** The change the trend describes (e.g. "12%"). */
  trendValue?: string;
  /** Whether the trend is good. */
  trendTone?: 'neutral' | 'success' | 'danger' | 'warning';
}

/**
 * The card's layout.
 *
 * - `dispatcher` — the label sits ABOVE the value. The dispatcher
 *   reads the row as a set of counts, so the label reads first and
 *   the number reads as its answer.
 * - `crew` — the value sits ABOVE the label, and the card carries a
 *   chevron. The crew's design reference
 *   (`ui-design/Crew Portal Dashboard.png`) draws the crew row this
 *   way: a badge, then a big number with its caption UNDERNEATH,
 *   then a chevron suggesting the card is a way in to the jobs.
 * - `citizen` — the value sits ABOVE the label, and the card carries
 *   NO chevron. The citizen's design reference
 *   (`ui-design/citien-dashboard.png`) draws three cards with the
 *   number over its caption, and nothing at the right edge: the
 *   citizen's cards are a readout, not a doorway.
 * - `admin` — the value sits ABOVE the label, the badge is a SOLID
 *   disc with the glyph reversed out of it, and the card carries a
 *   sparkline and a trend badge. The admin's design reference
 *   (`ui-design/admin-dashboard.png`) draws all four: a coloured
 *   disc, the number over its caption, a trend percentage, and a
 *   sparkline in the corner.
 *
 * The variants differ in ANATOMY, not in surface treatment: same
 * 1px border, same radius, same badge size, no shadow any of them.
 */
export type KpiCardVariant = 'dispatcher' | 'crew' | 'citizen' | 'admin';

/**
 * The arrow that carries the direction of change.
 *
 * A SHAPE, not a glyph: the arrow says "up" the way a bar says
 * "more", and it recolours with the theme the way a text glyph
 * cannot. The value it describes is always beside it, so the
 * direction never depends on the arrow alone.
 */
const TREND_ARROW: Record<'up' | 'down' | 'flat', IconEntry> = {
  up: ICONS.trendUp,
  down: ICONS.trendDown,
  flat: ICONS.trendFlat,
};

/**
 * The colour the trend's tone maps to.
 *
 * The tone is explicit because "up" is not always good: more OPEN
 * tickets going up is bad, more RESOLVED tickets going up is good.
 */
const TREND_TONE_COLOR: Record<'neutral' | 'success' | 'danger' | 'warning', string> = {
  neutral: 'var(--color-ink-tertiary)',
  success: 'var(--color-success)',
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
};

/**
 * The sparkline — a short series of daily counts drawn as a line.
 *
 * It is the admin card's bottom-corner trend-at-a-glance, and it is
 * DECORATIVE: the numbers it plots are already spelled out as the
 * card's value and its trend percentage, so nothing is lost if the
 * line does not render. It is `aria-hidden` for that reason.
 *
 * The series is normalised against its own min and max, so the line
 * always uses the full height of its box — a flat series draws as a
 * straight line across the middle rather than as a spike, and a
 * one-point series is not drawn at all (there is no line to draw).
 */
function Sparkline({
  points,
  color,
}: {
  points: readonly number[];
  color: string;
}) {
  if (points.length < 2) return null;

  const width = 64;
  const height = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;

  /*
   * A flat series has no range to scale against, so every point sits
   * on the same line. Without this guard the divisor would be zero
   * and every point would collapse onto the top edge, which reads as
   * a spike rather than as flat.
   */
  const y = (value: number) => {
    if (span === 0) return height / 2;
    const ratio = (value - min) / span;
    return height - ratio * (height - 2) - 1;
  };

  const path = points
    .map((value, index) => {
      const x = (index / (points.length - 1)) * width;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y(value).toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ flex: '0 0 auto', display: 'block', overflow: 'visible' }}
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export interface KpiCardsProps {
  /** The cards, in reading order. */
  cards: readonly KpiCard[];
  /** Document language. */
  lang: Language;
  /** The card layout. Defaults to `dispatcher`. */
  variant?: KpiCardVariant;
  /** Accessible name for the region. */
  ariaLabel?: string;
  /** Optional class passthrough for the outer element. */
  className?: string;
  /** Test hook for the outer element. */
  'data-testid'?: string;
  /** Test hook prefix for each card. */
  'data-testid-prefix'?: string;
}

export function KpiCards({
  cards,
  lang,
  variant = 'dispatcher',
  ariaLabel,
  className,
  'data-testid': testId,
  'data-testid-prefix': testIdPrefix,
}: KpiCardsProps) {
  const isCrew = variant === 'crew';
  const isCitizen = variant === 'citizen';
  const isAdmin = variant === 'admin';
  /*
   * Which variant puts the NUMBER above its caption?
   *
   * `crew`, `citizen` and `admin` all do; `dispatcher` puts the
   * label first. The chevron is narrower than that: only the crew's
   * cards carry one, because only the crew's design reference draws
   * it.
   */
  const valueFirst = isCrew || isCitizen || isAdmin;
  return (
    <div
      role="group"
      aria-label={ariaLabel ?? t('ui.kpi.label', null, lang)}
      data-testid={testId}
      className={[
        'dispatcher-kpi-cards',
        isCrew ? 'crew-kpi-cards' : null,
        isCitizen ? 'citizen-kpi-cards' : null,
        isAdmin ? 'admin-kpi-cards' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--kpi-card-count': cards.length } as React.CSSProperties}
    >
      {cards.map((card) => {
        const IconComponent = card.icon.icon;
        return (
          <div
            key={card.key}
            data-testid={testIdPrefix ? `${testIdPrefix}-${card.key}` : undefined}
            className={[
              'dispatcher-kpi-card',
              isCrew ? 'crew-kpi-card' : null,
              isCitizen ? 'citizen-kpi-card' : null,
              isAdmin ? 'admin-kpi-card' : null,
            ]
              .filter(Boolean)
              .join(' ')}
            style={
              isAdmin
                ? {
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-4)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)',
                    background: 'var(--color-surface-card)',
                  }
                : {
                    minWidth: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-4)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-card)',
                    background: 'var(--color-surface-card)',
                  }
            }
          >
            {/*
             * The badge and the text block, side by side.
             *
             * For the ADMIN the pair is wrapped in a ROW, because that
             * card is a COLUMN: the badge and the number sit together
             * on the top row and the trend and the sparkline share the
             * bottom one. For the other three variants the card IS
             * that row, so the two sit directly in it — with no
             * wrapper, which keeps the card's children exactly what
             * they were before the admin variant existed.
             */}
            {isAdmin ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                <span
                  aria-hidden
                  style={{
                    flex: '0 0 auto',
                    width: 38,
                    height: 38,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    /*
                     * The admin's badge is a SOLID disc with the glyph
                     * reversed out of it — the one variant that fills
                     * the circle, because the admin's design reference
                     * (`ui-design/admin-dashboard.png`) draws it that
                     * way.
                     */
                    color: card.colorSoft,
                    background: card.color,
                  }}
                >
                  <IconComponent size={20} weight={card.icon.weight} />
                </span>
                <span
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    display: 'grid',
                    gap: 2,
                  }}
                >
                  <span
                    className="tabular-nums"
                    style={{
                      overflow: 'hidden',
                      color: 'var(--color-ink)',
                      fontSize: 'var(--text-display-md)',
                      fontWeight: 'var(--weight-bold)',
                      lineHeight: 'var(--leading-tight)',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {card.value}
                  </span>
                  <span
                    lang={lang}
                    style={{
                      overflow: 'hidden',
                      color: 'var(--color-ink-secondary)',
                      fontSize: 'var(--text-body-sm)',
                      fontWeight: 'var(--weight-medium)',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {card.label}
                  </span>
                </span>
              </span>
            ) : (
              <>
                <span
                  aria-hidden
                  style={{
                    flex: '0 0 auto',
                    width: 38,
                    height: 38,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: '50%',
                    color: card.color,
                    background: card.colorSoft,
                  }}
                >
                  <IconComponent size={20} weight={card.icon.weight} />
                </span>
                {/*
                 * The text block. It carries `flex: 1 1 auto` so it
                 * FILLS the space the badge leaves: without it the
                 * wrapper is a flex item with no grow, so it collapses
                 * to zero width and the label and value inside it —
                 * which are sized in PERCENTAGES of this wrapper —
                 * render at zero width and vanish.
                 */}
                <span
                  style={{
                    flex: '1 1 auto',
                    minWidth: 0,
                    display: 'grid',
                    gap: 2,
                  }}
                >
                  {valueFirst ? (
                    /* The crew and citizen layout: the NUMBER first, its
                       caption underneath. */
                    <>
                      <span
                        className="tabular-nums"
                        style={{
                          overflow: 'hidden',
                          color: 'var(--color-ink)',
                          fontSize: 'var(--text-display-md)',
                          fontWeight: 'var(--weight-bold)',
                          lineHeight: 'var(--leading-tight)',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {card.value}
                      </span>
                      <span
                        lang={lang}
                        style={{
                          overflow: 'hidden',
                          color: 'var(--color-ink-secondary)',
                          fontSize: 'var(--text-body-sm)',
                          fontWeight: 'var(--weight-medium)',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {card.label}
                      </span>
                    </>
                  ) : (
                    /* The dispatcher layout: the LABEL first, the number
                       as its answer. */
                    <>
                      <span
                        lang={lang}
                        style={{
                          overflow: 'hidden',
                          color: 'var(--color-ink-secondary)',
                          fontSize: 'var(--text-body-sm)',
                          fontWeight: 'var(--weight-medium)',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {card.label}
                      </span>
                      <span
                        className="tabular-nums"
                        style={{
                          overflow: 'hidden',
                          color: 'var(--color-ink)',
                          fontSize: 'var(--text-display-md)',
                          fontWeight: 'var(--weight-bold)',
                          lineHeight: 'var(--leading-tight)',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {card.value}
                      </span>
                    </>
                  )}
                  {card.hint ? (
                    <span
                      lang={lang}
                      style={{
                        overflow: 'hidden',
                        color: 'var(--color-ink-tertiary)',
                        fontSize: 'var(--text-caption)',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {card.hint}
                    </span>
                  ) : null}
                </span>
                {/*
                 * The chevron. It is DECORATIVE — the crew's design
                 * reference draws it to suggest the card is a way in
                 * to the job list, but none of these cards is a link,
                 * so a chevron that looked like one would be a promise
                 * the card does not keep. It is `aria-hidden` for that
                 * reason.
                 *
                 * ONLY the crew's cards carry one. The citizen's design
                 * reference draws its three cards with nothing at the
                 * right edge — the citizen's row is a readout, not a
                 * set of doorways — and the dispatcher's is a plain
                 * count strip.
                 */}
                {isCrew ? (
                  <span
                    aria-hidden
                    style={{
                      flex: '0 0 auto',
                      display: 'inline-flex',
                      color: 'var(--color-ink-tertiary)',
                    }}
                  >
                    <ICONS.chevronRight.icon size={16} weight={ICONS.chevronRight.weight} />
                  </span>
                ) : null}
              </>
            )}
            {/*
             * The admin card is a COLUMN, so the top row — the badge
             * and the text block — closed above, and the FOOTER row
             * follows: the trend percentage on the left, the
             * sparkline on the right.
             *
             * The admin's design reference
             * (`ui-design/admin-dashboard.png`) gives every card a
             * percentage beside a small arrow and a sparkline in the
             * bottom corner. The trend is a SHAPE and the value always
             * sits beside it, so the direction never depends on the
             * arrow alone — and the tone is explicit, because a
             * rising ticket count is not a good thing.
             */}
            {isAdmin ? (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  gap: 'var(--space-3)',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--space-1)',
                    flex: '0 0 auto',
                    color: TREND_TONE_COLOR[card.trendTone ?? 'neutral'],
                    fontSize: 'var(--text-caption)',
                    fontWeight: 'var(--weight-medium)',
                  }}
                >
                  {card.trend ? (
                    <span aria-hidden style={{ display: 'inline-flex' }}>
                      {(() => {
                        const entry = TREND_ARROW[card.trend];
                        const Arrow = entry.icon;
                        return <Arrow size={12} weight={entry.weight} />;
                      })()}
                    </span>
                  ) : null}
                  {card.trendValue ? (
                    <span className="tabular-nums">{card.trendValue}</span>
                  ) : null}
                </span>
                {card.spark && card.spark.length > 1 ? (
                  <Sparkline points={card.spark} color={card.color} />
                ) : null}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * The skeleton's placeholder for one card.
 *
 * It mirrors `KpiCards`' card geometry — a circular badge beside a
 * label block and a value block — so the page does not jump when
 * the data lands. A skeleton that does not match the loaded layout
 * makes the page jump, which is the thing a skeleton exists to
 * prevent.
 */
export function KpiCardSkeleton({
  className,
  style,
  variant = 'dispatcher',
}: {
  className?: string;
  style?: React.CSSProperties;
  variant?: KpiCardVariant;
}) {
  const isCrew = variant === 'crew';
  const isCitizen = variant === 'citizen';
  const isAdmin = variant === 'admin';
  const valueFirst = isCrew || isCitizen || isAdmin;
  return (
    <div
      aria-hidden
      className={className}
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: isAdmin ? 'column' : undefined,
        alignItems: isAdmin ? undefined : 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-surface-card)',
        ...style,
      }}
    >
      {/*
       * The badge and the text block, side by side.
       *
       * For the ADMIN the pair is wrapped in a ROW, because that card
       * is a COLUMN: the badge and the number sit together on the top
       * row and the trend and the sparkline share the bottom one. For
       * the other three variants the card IS that row, so the two sit
       * directly in it — with no wrapper, which keeps the card's
       * children exactly what they were before the admin variant
       * existed.
       */}
      {isAdmin ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
          <span
            className="cityfix-skeleton"
            style={{ flex: '0 0 auto', width: 38, height: 38, borderRadius: '50%' }}
          />
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 2 }}>
            {/*
             * Each row is a LINE BOX sized to the loaded card's
             * rendered line (24px for the label, 29px for the value)
             * with the shimmer bar inside it sized to the GLYPH
             * (12px, 20px) and aligned to the top of the line.
             *
             * Sizing the BAR to the line box instead would make the
             * skeleton card 15px taller than the loaded one and the
             * page would jump when the data landed. Sizing the whole
             * ROW to the glyph would make it 15px shorter and jump
             * the same way. The line box is the row's height; the
             * glyph is the bar.
             *
             * The admin variant puts the VALUE first, its caption
             * second, and its value line is the same 29px box with
             * the same 20px glyph, so the bar widths swap to match.
             */}
            <span style={{ display: 'grid', alignItems: 'start', height: 29 }}>
              <span
                className="cityfix-skeleton"
                style={{ width: '44%', height: 20, borderRadius: 'var(--radius-sm)' }}
              />
            </span>
            <span style={{ display: 'grid', alignItems: 'start', height: 24 }}>
              <span
                className="cityfix-skeleton"
                style={{ width: '72%', height: 12, borderRadius: 'var(--radius-sm)' }}
              />
            </span>
          </span>
        </span>
      ) : (
        <>
          <span
            className="cityfix-skeleton"
            style={{ flex: '0 0 auto', width: 38, height: 38, borderRadius: '50%' }}
          />
          {/*
           * The text block. It carries `flex: 1 1 auto` so it FILLS
           * the space the badge leaves: without it the wrapper is a
           * flex item with no grow, so it collapses to zero width
           * and the label and value bars inside it — which are sized
           * in PERCENTAGES of this wrapper — render at zero width and
           * vanish. The loaded card gets the same width for free
           * because its wrapper is a grid item in a `minmax(0, 1fr)`
           * column, which stretches.
           */}
          <span style={{ flex: '1 1 auto', minWidth: 0, display: 'grid', gap: 2 }}>
            {/*
             * Each row is a LINE BOX sized to the loaded card's
             * rendered line (24px for the label, 29px for the value)
             * with the shimmer bar inside it sized to the GLYPH
             * (12px, 20px) and aligned to the top of the line.
             *
             * Sizing the BAR to the line box instead would make the
             * skeleton card 15px taller than the loaded one and the
             * page would jump when the data landed. Sizing the whole
             * ROW to the glyph would make it 15px shorter and jump
             * the same way. The line box is the row's height; the
             * glyph is the bar.
             *
             * The crew and citizen variants swap the order — value
             * first, label second — and their value line is the same
             * 29px box with the same 20px glyph, so the bar widths
             * swap to match.
             */}
            {valueFirst ? (
              <>
                <span style={{ display: 'grid', alignItems: 'start', height: 29 }}>
                  <span
                    className="cityfix-skeleton"
                    style={{ width: '44%', height: 20, borderRadius: 'var(--radius-sm)' }}
                  />
                </span>
                <span style={{ display: 'grid', alignItems: 'start', height: 24 }}>
                  <span
                    className="cityfix-skeleton"
                    style={{ width: '72%', height: 12, borderRadius: 'var(--radius-sm)' }}
                  />
                </span>
              </>
            ) : (
              <>
                <span style={{ display: 'grid', alignItems: 'start', height: 24 }}>
                  <span
                    className="cityfix-skeleton"
                    style={{ width: '72%', height: 12, borderRadius: 'var(--radius-sm)' }}
                  />
                </span>
                <span style={{ display: 'grid', alignItems: 'start', height: 29 }}>
                  <span
                    className="cityfix-skeleton"
                    style={{ width: '44%', height: 20, borderRadius: 'var(--radius-sm)' }}
                  />
                </span>
              </>
            )}
          </span>
          {isCrew ? (
            <span
              className="cityfix-skeleton"
              style={{ flex: '0 0 auto', width: 16, height: 16, borderRadius: 'var(--radius-sm)' }}
            />
          ) : null}
        </>
      )}
      {/*
       * The admin card's FOOTER row: the trend percentage on the left
       * and the sparkline on the right. The skeleton mirrors it with
       * a short trend bar and a block for the line, so the card does
       * not change height when the data lands.
       */}
      {isAdmin ? (
        <span
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 'var(--space-3)',
            minWidth: 0,
          }}
        >
          <span
            className="cityfix-skeleton"
            style={{ flex: '0 0 auto', width: 44, height: 12, borderRadius: 'var(--radius-sm)' }}
          />
          <span
            className="cityfix-skeleton"
            style={{ flex: '0 0 auto', width: 64, height: 24, borderRadius: 'var(--radius-sm)' }}
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * The KPI row's loading state.
 *
 * The cards are rendered with the SAME geometry as the loaded row
 * (see `KpiCardSkeleton`), so the swap does not move the page.
 */
export function KpiCardsSkeleton({
  lang,
  count = 4,
  variant = 'dispatcher',
  ariaLabel,
  className,
  'data-testid': testId,
}: {
  lang: Language;
  count?: number;
  variant?: KpiCardVariant;
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}) {
  const isCrew = variant === 'crew';
  const isCitizen = variant === 'citizen';
  const isAdmin = variant === 'admin';
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? t('ui.loading.label', null, lang)}
      data-testid={testId}
      className={[
        'dispatcher-kpi-cards',
        isCrew ? 'crew-kpi-cards' : null,
        isCitizen ? 'citizen-kpi-cards' : null,
        isAdmin ? 'admin-kpi-cards' : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--kpi-card-count': count } as React.CSSProperties}
    >
      {Array.from({ length: count }, (_, index) => (
        <KpiCardSkeleton key={index} variant={variant} />
      ))}
    </div>
  );
}
