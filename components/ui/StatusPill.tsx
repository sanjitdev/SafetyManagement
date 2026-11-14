/**
 * StatusPill — standardized status indicator for tickets, route
 * items, dispatcher queue rows, and any other surface that needs
 * to surface a ticket status.
 *
 * S-003.4 (ReportCard + StatusPill standardization). Extracted
 * from `app/home/page.tsx` (where it was inline) so the same
 * visual rules apply across the home, my-reports, dispatcher
 * queue, and dispatcher detail surfaces.
 *
 * Pure presentational component. No data fetching, no state,
 * no side effects. Safe to import from server or client
 * components; on the server it renders the same DOM as on the
 * client.
 *
 * A STATUS IS NEVER COLOUR ALONE
 * ------------------------------
 * The pill carries THREE signals: a shape (the Phosphor icon), a
 * word (the translated label) and a colour. The colour is the third
 * signal, not the only one — which is what makes the pill readable
 * to a colour-blind user, in a greyscale printout, and to a screen
 * reader (which reads the word).
 *
 * The icon comes from the shared registry (`lib/ui/icon-map.ts`) so
 * the same status carries the same shape everywhere in the product.
 *
 * Color tokens come from `tokens.css` (the
 * `--color-status-{name}` + `--color-status-{name}-soft` pairs).
 * The `submitted`/`routed`/`in_progress`/`resolved`/`paused`
 * states use their semantic pair; `closed`/`cancelled` reuse
 * the muted neutral pair so a closed ticket never looks like
 * an active one.
 *
 * The `lang` prop drives the `lang` attribute on the rendered
 * `<span>` so the browser's font + hyphenation pipelines know
 * which locale to pick. This matters for the Bangla-first
 * default; without `lang="bn"` the browser would fall back to
 * the document default.
 */

import { ICONS, type IconEntry } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';
import { STATUS_COLOR, STATUS_COLOR_SOFT } from '@/lib/ui/status-tokens';

export type StatusKey =
  | 'submitted'
  | 'routed'
  | 'in_progress'
  | 'resolved'
  | 'closed'
  | 'cancelled'
  | 'paused'
  | 'error'
  | 'warning';

interface StatusVisual {
  /** Foreground token (text on the soft fill). */
  fg: string;
  /** Background token (the soft fill). */
  bg: string;
  /** i18n key to look up the human label. */
  i18nKey: string;
  /** The icon that gives the status its SHAPE. */
  icon: IconEntry;
}

/**
 * The visual for each status.
 *
 * The COLOURS come from `lib/ui/status-tokens.ts` — the single
 * source, shared with the charts and legends. Only the icon and
 * the label live here, because those are presentation decisions
 * that belong to the pill.
 */
const STATUS_VISUAL: Record<StatusKey, StatusVisual> = {
  submitted: {
    fg: STATUS_COLOR.submitted,
    bg: STATUS_COLOR_SOFT.submitted,
    i18nKey: 'status.submitted',
    icon: ICONS.statusSubmitted,
  },
  routed: {
    fg: STATUS_COLOR.routed,
    bg: STATUS_COLOR_SOFT.routed,
    i18nKey: 'status.routed',
    icon: ICONS.statusRouted,
  },
  in_progress: {
    fg: STATUS_COLOR.in_progress,
    bg: STATUS_COLOR_SOFT.in_progress,
    i18nKey: 'status.in_progress',
    icon: ICONS.statusInProgress,
  },
  resolved: {
    fg: STATUS_COLOR.resolved,
    bg: STATUS_COLOR_SOFT.resolved,
    i18nKey: 'status.resolved',
    icon: ICONS.statusResolved,
  },
  closed: {
    fg: STATUS_COLOR.closed,
    bg: STATUS_COLOR_SOFT.closed,
    i18nKey: 'status.closed',
    icon: ICONS.statusResolved,
  },
  cancelled: {
    fg: STATUS_COLOR.cancelled,
    bg: STATUS_COLOR_SOFT.cancelled,
    i18nKey: 'status.cancelled',
    icon: ICONS.statusError,
  },
  paused: {
    fg: STATUS_COLOR.paused,
    bg: STATUS_COLOR_SOFT.paused,
    i18nKey: 'status.paused',
    icon: ICONS.statusPaused,
  },
  error: {
    fg: STATUS_COLOR.error,
    bg: STATUS_COLOR_SOFT.error,
    i18nKey: 'status.error',
    icon: ICONS.statusError,
  },
  warning: {
    fg: STATUS_COLOR.warning,
    bg: STATUS_COLOR_SOFT.warning,
    i18nKey: 'status.warning',
    icon: ICONS.statusWarning,
  },
};

export interface StatusPillProps {
  status: StatusKey;
  lang: Language;
  /** Optional size — 'sm' (default) = 10px caption, 'md' = 12px. */
  size?: 'sm' | 'md';
  /** Optional aria-label override; defaults to the translated label. */
  ariaLabel?: string;
  /** Optional className for layout callers (e.g. inline-flex placement). */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function StatusPill({
  status,
  lang,
  size = 'sm',
  ariaLabel,
  className,
  'data-testid': testId,
}: StatusPillProps) {
  const visual = STATUS_VISUAL[status];
  const label = t(visual.i18nKey, null, lang);
  const fontSize = size === 'md' ? 'var(--text-caption)' : 'var(--text-micro)';
  const IconComponent = visual.icon.icon;

  return (
    <span
      lang={lang}
      aria-label={ariaLabel ?? label}
      data-testid={testId}
      data-status={status}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        padding: size === 'md' ? 'var(--space-1) var(--space-2)' : '2px var(--space-2)',
        background: visual.bg,
        color: visual.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
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
      {label}
    </span>
  );
}
