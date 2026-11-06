/**
 * PageSubNav (components/PageSubNav.tsx).
 *
 * Compact horizontal nav row rendered *inside* the page content
 * (not in the global header) for surfaces that need page-specific
 * links (e.g. the dispatcher page links to /dispatcher/dedup and
 * /dispatcher/map; the admin pages link to /admin/cities and
 * /admin/audit). Replaces the bespoke topbar each of these
 * pages had before Bolt 006-004 unified the global AppShell.
 *
 * Visually a row of pill links + a breadcrumb on the left. The
 * pill style matches the inline-nav in `<AppHeader>` so the two
 * look like one continuous nav system.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { t, type Language } from '@/lib/i18n/keys';

interface PageSubNavProps {
  /** Optional breadcrumb label (e.g. "Cities", "Reports"). */
  breadcrumb?: string;
  /** Action links rendered as pills. The active one is auto-detected by pathname. */
  links?: Array<{ href: string; label: string; testId?: string; tone?: 'default' | 'warning' }>;
  /** Optional right-side content (e.g. a back link, a filter button). */
  right?: ReactNode;
  lang?: Language;
}

export function PageSubNav({ breadcrumb, links, right, lang = 'bn' }: PageSubNavProps) {
  const pathname = usePathname() ?? '/';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-3) var(--space-5)',
        background: 'var(--color-surface-card)',
        borderBottom: '1px solid var(--color-border)',
        gap: 'var(--space-3)',
        flexWrap: 'wrap',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          minWidth: 0,
        }}
      >
        {breadcrumb && (
          <span
            lang={lang}
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              fontWeight: 'var(--weight-semibold)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {breadcrumb}
          </span>
        )}
        {links && links.length > 0 && (
          <nav
            aria-label={t('header.nav.menu_label', null, lang)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              marginLeft: breadcrumb ? 'var(--space-3)' : 0,
            }}
          >
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + '/');
              const isWarning = link.tone === 'warning' && !active;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  data-testid={link.testId}
                  aria-current={active ? 'page' : undefined}
                  style={{
                    padding: 'var(--space-1) var(--space-3)',
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: active ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                    color: active
                      ? 'var(--color-primary)'
                      : isWarning
                        ? 'var(--color-ink)'
                        : 'var(--color-ink-secondary)',
                    background: active
                      ? 'var(--color-primary-soft)'
                      : isWarning
                        ? 'var(--color-warning-soft)'
                        : 'transparent',
                    textDecoration: 'none',
                    borderRadius: 'var(--radius-pill)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
      {right && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          {right}
        </div>
      )}
    </div>
  );
}
