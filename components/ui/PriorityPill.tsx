/**
 * PriorityPill — the dispatcher's triage-priority chip.
 *
 * Appears on the triage queue row and the ticket detail header.
 *
 * ── WHAT IT SHOWS ────────────────────────────────────────────────
 *
 * The band a dispatcher has put the report in: `low`, `normal`,
 * `high` or `urgent` — or the UNTRIAGED state, which is the absence
 * of a decision rather than a band.
 *
 * ── A PRIORITY IS NEVER COLOUR ALONE ─────────────────────────────
 *
 * The chip carries THREE signals: a shape (the Phosphor icon), a word
 * (the translated band) and a colour. The colour is the third signal,
 * not the only one — which is what makes the chip readable to a
 * colour-blind user, in a greyscale printout, and to a screen reader
 * (which reads the word).
 *
 * The four shapes escalate by SIDE COUNT — circle (0), triangle (3),
 * diamond (4), octagon (8) — so the escalation is countable rather
 * than a matter of taste, and the bands do not collapse into one
 * another when the colour is dropped.
 *
 * ── THE UNTRIAGED STATE IS NOT A BAND ────────────────────────────
 *
 * A report nobody has triaged carries the DEFAULT `low` band and a
 * NULL `prioritySetAt`. It is NOT the same as a report a dispatcher
 * deliberately deprioritised, and the chip must not make them look
 * the same:
 *
 *   - The untriaged report is UNKNOWN work. Nobody has looked.
 *   - The deprioritised report is KNOWN work that was judged less
 *     urgent. It was triaged.
 *
 * So the untriaged chip is drawn with a DASHED outline and no fill,
 * and says "Not triaged" rather than repeating the `low` word. A
 * filled `low` chip and a dashed "not triaged" chip are visibly
 * different states.
 *
 * ── PURE PRESENTATIONAL ──────────────────────────────────────────
 *
 * No data fetching, no state, no side effects. The caller passes the
 * band and whether the report has been triaged, and the chip decides
 * how to draw them.
 */

import { ICONS, type IconEntry } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';
import {
  PRIORITY_COLOR,
  PRIORITY_COLOR_SOFT,
  type PriorityVisualKey,
} from '@/lib/ui/priority-tokens';
import type { TicketPriority } from '@/lib/dispatcher/priority';

interface PriorityVisual {
  /** Foreground token (text + icon). */
  fg: string;
  /** Background token (the soft fill). */
  bg: string;
  /** The i18n key for the band word. */
  i18nKey: string;
  /** The icon that gives the band its SHAPE. */
  icon: IconEntry;
}

/**
 * The visual for each band.
 *
 * The COLOURS come from `lib/ui/priority-tokens.ts` — the single
 * source, shared with any chart or legend. Only the icon and the
 * label live here, because those are presentation decisions that
 * belong to the chip.
 */
const PRIORITY_VISUAL: Record<TicketPriority, PriorityVisual> = {
  low: {
    fg: PRIORITY_COLOR.low,
    bg: PRIORITY_COLOR_SOFT.low,
    i18nKey: 'dispatcher.priority.low',
    icon: ICONS.priorityLow,
  },
  normal: {
    fg: PRIORITY_COLOR.normal,
    bg: PRIORITY_COLOR_SOFT.normal,
    i18nKey: 'dispatcher.priority.normal',
    icon: ICONS.priorityNormal,
  },
  high: {
    fg: PRIORITY_COLOR.high,
    bg: PRIORITY_COLOR_SOFT.high,
    i18nKey: 'dispatcher.priority.high',
    icon: ICONS.priorityHigh,
  },
  urgent: {
    fg: PRIORITY_COLOR.urgent,
    bg: PRIORITY_COLOR_SOFT.urgent,
    i18nKey: 'dispatcher.priority.urgent',
    icon: ICONS.priorityUrgent,
  },
};

export interface PriorityPillProps {
  /**
   * The band, or `null` when the report has never been triaged.
   *
   * `null` and `'low'` are DIFFERENT states. A `null` band means
   * nobody has judged this report; a `'low'` band means a dispatcher
   * did. The chip draws them differently.
   */
  priority: TicketPriority | null | undefined;
  /**
   * When a dispatcher last set the band.
   *
   * The chip treats a report as UNTRIAGED when the band is absent OR
   * the band was never stamped. The serializer emits the two fields
   * independently, so a row can carry a band with no timestamp — and
   * the queue's ordering rule keys off `prioritySetAt` (untriaged
   * sorts first within a band), so the chip and the queue must agree
   * on what "untriaged" means. A band with no timestamp has not been
   * triaged, whatever the band says.
   */
  prioritySetAt?: string | null;
  /** Document language. */
  lang: Language;
  /** 'sm' (default, queue row) or 'md' (detail header). */
  size?: 'sm' | 'md';
  /** Optional className for layout callers. */
  className?: string;
  /**
   * Whether to show the band's WORD as well as the shape.
   *
   * On the queue row the chip is narrow and the shape carries the
   * signal; the word is in the `aria-label`. On the detail header
   * there is room for both, and the word is what makes the chip
   * legible without the colour.
   */
  showLabel?: boolean;
  /** Test hook. */
  'data-testid'?: string;
}

export function PriorityPill({
  priority,
  prioritySetAt,
  lang,
  size = 'sm',
  className,
  showLabel = false,
  'data-testid': testId,
}: PriorityPillProps) {
  // UNTRIAGED is the absence of a decision, and the decision is
  // recorded by the TIMESTAMP, not by the band. A band alone can be
  // a stale default; a stamp proves a dispatcher chose it. So the
  // chip asks: has anyone ever triaged this?
  const untriaged = !priority || !prioritySetAt;
  const key: PriorityVisualKey = untriaged ? 'untriaged' : priority;
  const visual = untriaged ? null : PRIORITY_VISUAL[priority];

  const label = untriaged
    ? t('dispatcher.priority.untriaged', null, lang)
    : t(visual!.i18nKey, null, lang);

  const IconComponent = untriaged ? ICONS.priorityLow.icon : visual!.icon.icon;
  const weight = untriaged ? ICONS.priorityLow.weight : visual!.icon.weight;

  const fg = PRIORITY_COLOR[key];
  const bg = untriaged ? 'transparent' : PRIORITY_COLOR_SOFT[key];
  const fontSize = size === 'md' ? 'var(--text-caption)' : 'var(--text-micro)';

  return (
    <span
      lang={lang}
      aria-label={label}
      title={label}
      data-testid={testId}
      data-priority={untriaged ? 'untriaged' : priority}
      data-triaged={untriaged ? 'false' : 'true'}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding:
          size === 'md'
            ? 'var(--space-1) var(--space-2)'
            : '2px var(--space-2)',
        background: bg,
        color: fg,
        // The untriaged state is DASHED and unfilled. A filled `low`
        // chip means "a dispatcher judged this low"; a dashed one
        // means "nobody has looked at this yet". They must never look
        // the same.
        border: untriaged
          ? '1px dashed var(--color-border-strong)'
          : '1px solid transparent',
        borderRadius: 'var(--radius-pill)',
        fontSize,
        fontWeight: 'var(--weight-bold)',
        whiteSpace: 'nowrap',
        lineHeight: 'var(--leading-snug)',
      }}
    >
      <IconComponent
        size={size === 'md' ? 14 : 12}
        weight={weight}
        aria-hidden
        focusable="false"
      />
      {showLabel ? <span>{label}</span> : null}
    </span>
  );
}
