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

import { t, type Language } from '@/lib/i18n/keys';

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
}

const STATUS_VISUAL: Record<StatusKey, StatusVisual> = {
  submitted: {
    fg: 'var(--color-status-submitted)',
    bg: 'var(--color-status-submitted-soft)',
    i18nKey: 'status.submitted',
  },
  routed: {
    fg: 'var(--color-status-routed)',
    bg: 'var(--color-status-routed-soft)',
    i18nKey: 'status.routed',
  },
  in_progress: {
    fg: 'var(--color-status-in-progress)',
    bg: 'var(--color-status-in-progress-soft)',
    i18nKey: 'status.in_progress',
  },
  resolved: {
    fg: 'var(--color-status-resolved)',
    bg: 'var(--color-status-resolved-soft)',
    i18nKey: 'status.resolved',
  },
  closed: {
    fg: 'var(--color-ink-tertiary)',
    bg: 'var(--color-surface-raised)',
    i18nKey: 'status.closed',
  },
  cancelled: {
    fg: 'var(--color-ink-tertiary)',
    bg: 'var(--color-surface-raised)',
    i18nKey: 'status.cancelled',
  },
  paused: {
    fg: 'var(--color-status-paused)',
    bg: 'var(--color-status-in-progress-soft)',
    i18nKey: 'status.paused',
  },
  error: {
    fg: 'var(--color-status-error)',
    bg: 'var(--color-status-error-soft)',
    i18nKey: 'status.error',
  },
  warning: {
    fg: 'var(--color-status-warning)',
    bg: 'var(--color-status-warning-soft)',
    i18nKey: 'status.warning',
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
  const fontSize = size === 'md' ? 'var(--text-caption)' : 10;

  return (
    <span
      lang={lang}
      aria-label={ariaLabel ?? label}
      data-testid={testId}
      data-status={status}
      className={className}
      style={{
        display: 'inline-block',
        padding: size === 'md' ? 'var(--space-1) var(--space-2)' : '2px var(--space-2)',
        background: visual.bg,
        color: visual.fg,
        borderRadius: 'var(--radius-pill)',
        fontSize,
        fontWeight: 'var(--weight-bold)',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {label}
    </span>
  );
}
