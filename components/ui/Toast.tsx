/**
 * Toast — a transient status message.
 *
 * Toasts announce themselves politely (`role="status"`) rather than
 * assertively: a toast is an FYI, and an assertive announcement
 * interrupts whatever the screen-reader user was doing. Genuine
 * errors use `role="alert"` via the `tone` prop.
 *
 * The toast NEVER disappears on a timer by itself — a message the
 * user cannot read at their own pace is not a message. The caller
 * owns the dismissal (a timer, a route change, an action).
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastProps {
  /** The message. */
  title: string;
  /** Optional supporting line. */
  description?: string;
  /** Semantic tone. Defaults to `info`. */
  tone?: ToastTone;
  /** Decorative leading icon. */
  icon?: ReactNode;
  /** Called when the user dismisses the toast. */
  onDismiss?: () => void;
  /** Document language. */
  lang: Language;
  /** Accessible name for the dismiss button. */
  dismissLabel?: string;
  /** Test hook. */
  'data-testid'?: string;
}

const TONE_STYLE: Record<ToastTone, { fg: string; bg: string; border: string }> = {
  info: { fg: 'var(--color-info)', bg: 'var(--color-info-soft)', border: 'var(--color-info)' },
  success: { fg: 'var(--color-success)', bg: 'var(--color-success-soft)', border: 'var(--color-success)' },
  warning: { fg: 'var(--color-warning)', bg: 'var(--color-warning-soft)', border: 'var(--color-warning)' },
  danger: { fg: 'var(--color-danger)', bg: 'var(--color-danger-soft)', border: 'var(--color-danger)' },
};

export function Toast({
  title,
  description,
  tone = 'info',
  icon,
  onDismiss,
  lang,
  dismissLabel,
  'data-testid': testId,
}: ToastProps) {
  const style = TONE_STYLE[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      data-tone={tone}
      data-testid={testId}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius-card)',
        boxShadow: 'var(--shadow-popover)',
        maxWidth: 'var(--card-max-width)',
      }}
    >
      {icon ? (
        <span aria-hidden style={{ display: 'inline-flex', color: style.fg, marginTop: 'var(--space-1)' }}>
          {icon}
        </span>
      ) : null}

      <div style={{ flex: '1 1 auto', minWidth: 0 }}>
        <p
          lang={lang}
          style={{
            margin: 0,
            fontSize: 'var(--text-body-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--color-ink)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {title}
        </p>
        {description ? (
          <p
            lang={lang}
            style={{
              margin: 'var(--space-1) 0 0',
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              lineHeight: 'var(--leading-snug)',
            }}
          >
            {description}
          </p>
        ) : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel ?? t('ui.toast.dismiss', null, lang)}
          style={{
            flexShrink: 0,
            width: 'var(--touch-min)',
            height: 'var(--touch-min)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-input)',
            color: 'var(--color-ink-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--text-body-lg)',
            lineHeight: 1,
          }}
        >
          <span aria-hidden>×</span>
        </button>
      ) : null}
    </div>
  );
}
