/**
 * EmptyState — "there is nothing here yet".
 *
 * An empty state is a designed moment, not an error. It says what
 * the region is for and what the user can do next, so the page never
 * shows a blank rectangle that reads as a broken screen.
 *
 * The icon is decorative (`aria-hidden`); the heading carries the
 * meaning.
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface EmptyStateProps {
  /** Heading. Defaults to the generic "nothing here yet". */
  title?: string;
  /** Supporting copy. */
  description?: string;
  /** Decorative icon. */
  icon?: ReactNode;
  /** A primary action (e.g. "Report an issue"). */
  action?: ReactNode;
  /** Document language. */
  lang: Language;
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  lang,
  className,
  'data-testid': testId,
}: EmptyStateProps) {
  return (
    <div
      data-testid={testId}
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-3)',
        padding: 'var(--space-7) var(--space-4)',
        textAlign: 'center',
      }}
    >
      {icon ? (
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 'var(--icon-size-xl)',
            height: 'var(--icon-size-xl)',
            color: 'var(--color-ink-tertiary)',
          }}
        >
          {icon}
        </span>
      ) : null}

      <p
        lang={lang}
        style={{
          margin: 0,
          fontSize: 'var(--text-body)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          lineHeight: 'var(--leading-snug)',
        }}
      >
        {title ?? t('ui.empty.title', null, lang)}
      </p>

      {description ? (
        <p
          lang={lang}
          style={{
            margin: 0,
            maxWidth: 'var(--card-max-width)',
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 'var(--leading-normal)',
          }}
        >
          {description}
        </p>
      ) : (
        <p
          lang={lang}
          style={{
            margin: 0,
            fontSize: 'var(--text-body-sm)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 'var(--leading-normal)',
          }}
        >
          {t('ui.empty.body', null, lang)}
        </p>
      )}

      {action}
    </div>
  );
}
