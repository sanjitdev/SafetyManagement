/**
 * ReportStepBack — the unified "Back" link in the report
 * step pages (S-004.1-6).
 *
 * Rendered as a `<a>` (not a `<button>`) so the keyboard
 * activation is consistent with a normal in-app link and the
 * browser back-button / middle-click open-in-new-tab
 * affordances are honoured.
 *
 * Fixed 56dp height to match `ReportStepPrimary`. Plain text
 * link style (no border) per the design system; sits in the
 * left slot of the action row.
 */

import type { AnchorHTMLAttributes } from 'react';

export interface ReportStepBackProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'lang'> {
  href: string;
  lang?: 'bn' | 'en';
}

export function ReportStepBack({
  href,
  children,
  lang = 'bn',
  style,
  ...rest
}: ReportStepBackProps) {
  return (
    <a
      href={href}
      lang={lang}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-3) var(--space-4)',
        color: 'var(--color-ink-secondary)',
        textDecoration: 'none',
        fontSize: 'var(--text-body)',
        minHeight: 'var(--touch-cta)',
        minWidth: 'var(--touch-cta)',
        whiteSpace: 'nowrap',
        ...style,
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
