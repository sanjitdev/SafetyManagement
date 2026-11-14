/**
 * SlaCountdown — the dispatcher's SLA chip.
 *
 * Wave 4 / bolt 009-005. Appears on the triage row, the ticket
 * detail header and the monitor board.
 *
 * ── What it shows ──────────────────────────────────────────────
 *
 * The time **REMAINING** against the ticket's category SLA target.
 * Not the time elapsed, and not a static "48h" label — a static
 * label says nothing about whether this ticket needs a crew today,
 * which is the only question the chip exists to answer.
 *
 * ── A STATUS IS NEVER COLOUR ALONE ─────────────────────────────
 *
 * The chip carries FOUR signals: a shape (the Phosphor icon), a
 * word (the translated state), a number (the remaining time) and a
 * colour. The colour is the fourth signal, not the only one. That
 * is what makes the chip readable to a colour-blind user, in a
 * greyscale printout, and to a screen reader (which reads the word
 * and the number).
 *
 * The shape differs per state too, so the states do not collapse
 * into one another when the colour is dropped:
 *
 *   on_track    — a check circle
 *   at_risk     — a warning circle
 *   breached    — an error circle
 *   met         — a seal (the target was met; a distinct shape
 *                 from "on track", which is a different fact)
 *   not_started — a clock (nothing is running yet)
 *
 * ── The four states ────────────────────────────────────────────
 *
 * `not_started` covers two distinct situations that must not be
 * conflated:
 *
 *   1. the category has NO policy — there is no target to be on
 *      time against. The chip says "no target", not "on time".
 *   2. the ticket has not been ROUTED yet — the clock has not
 *      started. The chip says "not started", not "on time".
 *
 * Neither is a breach, and neither is a comfort. Conflating either
 * with "on track" would tell the dispatcher a ticket is fine when
 * nothing has actually been promised yet.
 *
 * ── Pure presentational ────────────────────────────────────────
 *
 * No data fetching, no state, no side effects. The caller resolves
 * the SLA (see `lib/dispatcher/sla.ts`) and passes the result in.
 * The chip is therefore safe to render on the server, and the same
 * markup comes out on both sides.
 */

import { ICONS, type IconEntry } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';
import {
  formatRemainingHours,
  type SlaState,
  type SlaTone,
} from '@/lib/dispatcher/sla';

interface SlaVisual {
  /** Foreground token (the text + icon on the soft fill). */
  fg: string;
  /** Background token (the soft fill). */
  bg: string;
  /** The i18n key for the STATE word. */
  i18nKey: string;
  /** The icon that gives the state its SHAPE. */
  icon: IconEntry;
}

const SLA_VISUAL: Record<SlaTone, SlaVisual> = {
  on_track: {
    fg: 'var(--color-success)',
    bg: 'var(--color-success-soft)',
    i18nKey: 'dispatcher.sla.on_track',
    icon: ICONS.statusResolved,
  },
  at_risk: {
    fg: 'var(--color-status-warning)',
    bg: 'var(--color-status-warning-soft)',
    i18nKey: 'dispatcher.sla.at_risk',
    icon: ICONS.statusWarning,
  },
  breached: {
    fg: 'var(--color-status-error)',
    bg: 'var(--color-status-error-soft)',
    i18nKey: 'dispatcher.sla.breached',
    icon: ICONS.statusError,
  },
  met: {
    fg: 'var(--color-success)',
    bg: 'var(--color-success-soft)',
    i18nKey: 'dispatcher.sla.met',
    icon: ICONS.statusMet,
  },
  not_started: {
    fg: 'var(--color-ink-tertiary)',
    bg: 'var(--color-surface-raised)',
    i18nKey: 'dispatcher.sla.not_started',
    icon: ICONS.statusInProgress,
  },
};

/**
 * The unit words for the remaining-time figure.
 *
 * The number and its unit are separate because the Bangla forms
 * put the unit AFTER the number ("৪৫ মিনিট") while English puts
 * it before ("45 minutes") — and the numeral itself is rendered in
 * the script of the reading language.
 */
const UNIT_KEY: Record<'minutes' | 'hours' | 'days', string> = {
  minutes: 'dispatcher.sla.unit.minutes',
  hours: 'dispatcher.sla.unit.hours',
  days: 'dispatcher.sla.unit.days',
};

export interface SlaCountdownProps {
  /** The resolved SLA state. */
  state: SlaState;
  /** Document language. */
  lang: Language;
  /** 'sm' (default, triage row) or 'md' (detail header, monitor board). */
  size?: 'sm' | 'md';
  /** Optional className for layout callers. */
  className?: string;
  /**
   * Whether to show the state's WORD as well as the number.
   *
   * On the triage row the chip is narrow and the number is the
   * headline; the word is carried by the `aria-label`. On the detail
   * header there is room for both, and the word is what makes the
   * chip legible without the colour.
   */
  showLabel?: boolean;
  /** Test hook. */
  'data-testid'?: string;
}

/**
 * Render the remaining time as a number + unit.
 *
 * The number uses the locale's own numeral system — `bn-BD` renders
 * "৪৫", `en-US` renders "45" — so the chip reads as part of the
 * page rather than as a pasted-in number.
 */
function formatFigure(remainingHours: number, lang: Language): string {
  const { value, unit } = formatRemainingHours(remainingHours);
  const number = value.toLocaleString(lang === 'bn' ? 'bn-BD' : 'en-US');
  const unitWord = t(UNIT_KEY[unit], null, lang);
  // Bangla puts the unit after the number; English before it.
  return lang === 'bn' ? `${number} ${unitWord}` : `${number} ${unitWord}`;
}

export function SlaCountdown({
  state,
  lang,
  size = 'sm',
  className,
  showLabel = false,
  'data-testid': testId,
}: SlaCountdownProps) {
  const visual = SLA_VISUAL[state.tone];
  const label = t(visual.i18nKey, null, lang);
  const IconComponent = visual.icon.icon;
  const fontSize = size === 'md' ? 'var(--text-caption)' : 'var(--text-micro)';

  // The accessible name carries BOTH the state and the figure, so a
  // screen reader announces "2 days left" rather than a bare number
  // that means nothing without the surrounding context.
  const figure =
    state.targetHours === null || state.startedAt === null
      ? null
      : formatFigure(state.remainingHours, lang);
  const accessibleName = figure ? `${label}: ${figure}` : label;

  return (
    <span
      lang={lang}
      aria-label={accessibleName}
      title={accessibleName}
      data-testid={testId}
      data-sla-tone={state.tone}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding:
          size === 'md'
            ? 'var(--space-1) var(--space-2)'
            : '2px var(--space-2)',
        background: visual.bg,
        color: visual.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize,
        fontWeight: 'var(--weight-bold)',
        whiteSpace: 'nowrap',
        lineHeight: 'var(--leading-snug)',
      }}
    >
      <IconComponent
        size={size === 'md' ? 14 : 12}
        weight={visual.icon.weight}
        aria-hidden
        focusable="false"
      />
      {showLabel ? <span>{label}</span> : null}
      {figure ? <span className="tabular-nums">{figure}</span> : null}
      {!showLabel && !figure ? <span>{label}</span> : null}
    </span>
  );
}
