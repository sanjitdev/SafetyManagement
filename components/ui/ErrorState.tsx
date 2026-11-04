/**
 * ErrorState — "this region failed to load".
 *
 * Distinct from `EmptyState` on purpose. An empty region is a valid
 * outcome; a failed region is not, and it must be recoverable. The
 * component therefore always offers a retry action when one is
 * wired, and the retry is the primary button.
 *
 * `role="alert"` on the container so the failure is announced when it
 * appears — a screen-reader user must not have to hunt for the change.
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface ErrorStateProps {
  /** Heading. Defaults to the generic failure heading. */
  title?: string;
  /** Supporting copy. */
  description?: string;
  /** Decorative icon. */
  icon?: ReactNode;
  /** The retry action. */
  action?: ReactNode;
  /** Document language. */
  lang: Language;
  /** Optional class passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function ErrorState({
  title,
  description,
  icon,
  action,
  lang,
  className,
  'data-testid': testId,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
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
            color: 'var(--color-danger)',
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
        {title ?? t('ui.error.title', null, lang)}
      </p>

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
        {description ?? t('ui.error.body', null, lang)}
      </p>

      {action}
    </div>
  );
}
