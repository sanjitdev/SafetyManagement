/**
 * /report/* layout — top bar + persistent "Submit a report" header.
 *
 * Per Phase B (2026-10-04) web re-skin: large (1440 × 900) and medium
 * (1024 × 768) viewports. Two-region "map + 480px side card" pattern
 * for 1.7–1.10; centered 640px card for 1.11.
 *
 * Server component — no client state.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { t } from '@/lib/i18n/keys';
import { ReportHeaderActions } from '@/components/ReportHeaderActions';

export default function ReportLayout({ children }: { children: ReactNode }) {
  const tagline = t('home.tagline', null, 'bn');
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header
        style={{
          height: 'var(--header-height-desktop)',
          background: 'var(--color-surface-raised)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-5)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            textDecoration: 'none',
            color: 'var(--color-ink)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              background: 'var(--color-primary)',
              borderRadius: '50%',
            }}
          />
          <span style={{ fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)' }}>
            CityFix
          </span>
          <span
            lang="bn"
            style={{
              fontSize: 'var(--text-caption)',
              color: 'var(--color-ink-secondary)',
              marginLeft: 'var(--space-2)',
            }}
          >
            {tagline}
          </span>
        </Link>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
          }}
        >
          <span
            style={{
              padding: 'var(--space-1) var(--space-2)',
              background: 'var(--color-primary-soft, #e6f2ee)',
              color: 'var(--color-primary)',
              borderRadius: 'var(--radius-pill)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            Submit a report
          </span>
          <span>BN</span>
          <ReportHeaderActions />
        </div>
      </header>
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  );
}
