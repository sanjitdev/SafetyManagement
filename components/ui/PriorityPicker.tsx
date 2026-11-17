/**
 * PriorityPicker — the dispatcher's triage control.
 *
 * Appears in the dispatcher ticket detail sidebar, where the
 * dispatcher sets the band on a single ticket.
 *
 * ── WHY A RADIO GROUP AND NOT A SELECT ───────────────────────────
 *
 * A `<select>` collapses the four bands into one line of text, so
 * the dispatcher cannot see the ESCALATION without opening the
 * dropdown — and the escalation (which band is more urgent than
 * which) is exactly what the control exists to express. The four
 * bands are therefore always visible, stacked, each labelled.
 *
 * The control is a real radio group: one tab stop, arrow keys move
 * between the bands, and the checked band is announced by the
 * screen reader as the selected one. `FilterChipGroup` uses
 * `aria-pressed` buttons instead, which is the toolbar pattern —
 * right for a multi-select filter rail, wrong for a single-choice
 * control whose answer has a right answer.
 *
 * ── A BAND IS NEVER COLOUR ALONE ─────────────────────────────────
 *
 * Each band carries a SHAPE (the Phosphor icon) and a WORD (the
 * translated band) alongside its colour. The shapes escalate by
 * side count — circle (0), triangle (3), diamond (4), octagon (8) —
 * so the scale survives a greyscale printout and a colour-blind
 * reader. The colours come from `lib/ui/priority-tokens.ts`, the
 * single source shared with `PriorityPill`.
 *
 * ── THE UNTRIAGED STATE IS NOT A CHOICE ──────────────────────────
 *
 * "Not triaged" is the ABSENCE of a decision, so it is not one of
 * the four bands and is NOT offered as a selectable option. It is
 * the picker's current value when the ticket has never been
 * triaged, and it is rendered as the empty state beside the
 * groups. The dispatcher who wants to leave a ticket untriaged does
 * not choose it — they simply do not choose.
 *
 * ── PURE PRESENTATIONAL ──────────────────────────────────────────
 *
 * No fetching, no state, no side effects. The caller owns the
 * draft, the save handler and the error copy; the picker only
 * draws the four bands and reports the chosen one.
 */

import { ICONS, type IconEntry } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';
import {
  PRIORITY_COLOR,
  PRIORITY_COLOR_SOFT,
} from '@/lib/ui/priority-tokens';
import type { TicketPriority } from '@/lib/dispatcher/priority';

export interface PriorityPickerProps {
  /**
   * The currently selected band, or `null` when the ticket has
   * never been triaged.
   *
   * `null` selects no band — the group's "nothing chosen yet"
   * state — which is a real state on the ticket, not a default
   * the picker invents.
   */
  value: TicketPriority | null | undefined;
  /** Fired when the dispatcher chooses a band. */
  onChange: (priority: TicketPriority) => void;
  /** Document language. */
  lang: Language;
  /** Disables the whole group (a save is in flight). */
  disabled?: boolean;
  /** Optional className passthrough. */
  className?: string;
  /** Test hook for the GROUP. */
  'data-testid'?: string;
}

/**
 * The four bands, LOWEST FIRST.
 *
 * The order is the scale, read bottom-up: the list climbs from
 * `low` to `urgent`, so the escalation is visible in the arrangement
 * and not only in the colours. The array order matches
 * `PRIORITY_ORDER` in `lib/dispatcher/priority.ts`.
 */
const BANDS: ReadonlyArray<{
  band: TicketPriority;
  i18nKey: string;
  icon: IconEntry;
}> = [
  {
    band: 'low',
    i18nKey: 'dispatcher.priority.low',
    icon: ICONS.priorityLow,
  },
  {
    band: 'normal',
    i18nKey: 'dispatcher.priority.normal',
    icon: ICONS.priorityNormal,
  },
  {
    band: 'high',
    i18nKey: 'dispatcher.priority.high',
    icon: ICONS.priorityHigh,
  },
  {
    band: 'urgent',
    i18nKey: 'dispatcher.priority.urgent',
    icon: ICONS.priorityUrgent,
  },
];

export function PriorityPicker({
  value,
  onChange,
  lang,
  disabled = false,
  className,
  'data-testid': testId,
}: PriorityPickerProps) {
  const current = value ?? null;

  return (
    <div
      role="radiogroup"
      lang={lang}
      aria-label={t('dispatcher.priority.label', null, lang)}
      data-testid={testId}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-1)',
      }}
    >
      {BANDS.map(({ band, i18nKey, icon }) => {
        const selected = current === band;
        const IconComponent = icon.icon;
        return (
          <button
            key={band}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={lang}
            disabled={disabled}
            onClick={() => onChange(band)}
            data-testid={`dispatcher-priority-option-${band}`}
            data-priority={band}
            data-selected={selected ? 'true' : 'false'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)',
              // The selected band is the only one that carries a
              // fill. The unselected bands are flat on the surface,
              // so "chosen" reads as a state change rather than as
              // a colour the dispatcher has to compare.
              background: selected
                ? PRIORITY_COLOR_SOFT[band]
                : 'transparent',
              color: selected ? PRIORITY_COLOR[band] : 'var(--color-ink-secondary)',
              border: selected
                ? `1px solid ${PRIORITY_COLOR[band]}`
                : '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-body-sm)',
              fontWeight: selected
                ? 'var(--weight-bold)'
                : 'var(--weight-medium)',
              textAlign: 'left',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition:
                'background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)',
            }}
          >
            <IconComponent
              size={16}
              weight={icon.weight}
              aria-hidden
              focusable="false"
            />
            <span>{t(i18nKey, null, lang)}</span>
          </button>
        );
      })}
      {/*
       * The untriaged state, shown only when it is TRUE.
       *
       * It is a note rather than an option, because "not triaged"
       * is the absence of a decision. Offering it as a choice
       * would imply a dispatcher can UN-triage a report, which
       * the product does not do — the write path always stamps a
       * band and a timestamp together.
       */}
      {current === null ? (
        <p
          lang={lang}
          data-testid="dispatcher-priority-untriaged"
          style={{
            margin: 'var(--space-1) 0 0',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {t('dispatcher.priority.untriaged', null, lang)}
        </p>
      ) : null}
    </div>
  );
}
