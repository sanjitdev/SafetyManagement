/**
 * LoadingState — the "we are fetching" placeholder.
 *
 * `role="status"` with `aria-live="polite"` so the wait is
 * announced once, without stealing focus. The visible label comes
 * from the i18n registry; the spinner itself is decorative.
 *
 * The skeleton block is sized by the caller (`width`/`height`) so a
 * list of ten rows and a single card do not need different
 * components.
 */

import { t, type Language } from '@/lib/i18n/keys';

export interface LoadingStateProps {
  /** Document language. */
  lang: Language;
  /** Visible label. Defaults to the generic "Loading…". */
  label?: string;
  /** Placeholder block width. */
  width?: string;
  /** Placeholder block height. */
  height?: string;
  /** Show the spinner above the block (default) or hide it. */
  showSpinner?: boolean;
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function LoadingState({
  lang,
  label,
  width = '100%',
  height = 'var(--space-7)',
  showSpinner = true,
  className,
  'data-testid': testId,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-6) var(--space-4)',
      }}
    >
      {showSpinner ? (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            color: 'var(--color-primary)',
          }}
        >
          <svg
            width="var(--icon-size-lg)"
            height="var(--icon-size-lg)"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ animation: 'cityfix-spin 900ms linear infinite' }}
          >
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
        </span>
      ) : null}

      <span
        lang={lang}
        style={{
          fontSize: 'var(--text-caption)',
          color: 'var(--color-ink-secondary)',
        }}
      >
        {label ?? t('ui.loading.label', null, lang)}
      </span>

      <span
        aria-hidden
        style={{
          display: 'block',
          width,
          height,
          background: 'var(--color-surface-raised)',
          borderRadius: 'var(--radius-input)',
        }}
      />
    </div>
  );
}
