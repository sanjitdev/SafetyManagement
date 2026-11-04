/**
 * Breadcrumb — the path back up the hierarchy.
 *
 * The trail is an ordered list with the current page marked
 * `aria-current="page"`. The separators are `aria-hidden` so a
 * screen reader hears "Home / Reports / CF-1042" rather than
 * "Home slash Reports slash CF-1042".
 *
 * The last crumb is NOT a link — it is where the user already is.
 */

import { t, type Language } from '@/lib/i18n/keys';

export interface BreadcrumbItem {
  /** Visible label. */
  label: string;
  /** Link target. Omit on the current page. */
  href?: string;
}

export interface BreadcrumbProps {
  /** The trail, from root to current page. */
  items: readonly BreadcrumbItem[];
  /** Document language. */
  lang: Language;
  /** Accessible name for the navigation landmark. */
  ariaLabel?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function Breadcrumb({ items, lang, ariaLabel, 'data-testid': testId }: BreadcrumbProps) {
  return (
    <nav
      aria-label={ariaLabel ?? t('ui.breadcrumb.label', null, lang)}
      data-testid={testId}
    >
      <ol
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          margin: 0,
          padding: 0,
          listStyle: 'none',
          flexWrap: 'wrap',
          fontSize: 'var(--text-caption)',
        }}
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              {index > 0 ? (
                <span aria-hidden style={{ color: 'var(--color-ink-tertiary)' }}>
                  /
                </span>
              ) : null}
              {item.href && !isLast ? (
                <a
                  href={item.href}
                  lang={lang}
                  style={{ color: 'var(--color-accent)', textDecoration: 'none' }}
                >
                  {item.label}
                </a>
              ) : (
                <span
                  lang={lang}
                  aria-current={isLast ? 'page' : undefined}
                  style={{
                    color: isLast ? 'var(--color-ink)' : 'var(--color-ink-secondary)',
                    fontWeight: isLast ? 'var(--weight-semibold)' : undefined,
                  }}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
