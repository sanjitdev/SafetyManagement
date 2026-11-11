/**
 * ReportShell — the layout wrapper for `/report/*` pages.
 *
 * S-003.2 (ReportShell + sticky top/bottom bars). The shell
 * owns the persistent top bar (brand + city + "Submit a report"
 * tag + theme + language toggle), the step indicator slot, the
 * in-flow content slot, and the optional sticky bottom action
 * bar slot.
 *
 * The shell is a server-compatible component — it does not
 * own any client state. The child step pages own their own
 * client state and render into `children`. The shell simply
 * provides the consistent chrome.
 *
 * The top bar is `position: sticky; top: 0` so it stays
 * visible while the user scrolls. The bottom bar is also
 * sticky when `bottomAction` is provided; this is how the
 * "Continue" / "Submit" CTA stays reachable in 1 tap on
 * mobile (S-002.2).
 *
 * At ≤ 1024px the shell switches to a single-column layout
 * with the step indicator collapsed into the top bar (the
 * numbered circles drop and only the "Step X of Y" label
 * remains). This matches the responsive breakpoints already
 * used in `app/home/page.tsx`.
 *
 * The shell deliberately does NOT pull in i18n directly. The
 * parent provides the brand + tagline as plain strings so the
 * shell stays a pure layout component.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { StepIndicator } from './StepIndicator';
import { type Language } from '@/lib/i18n/keys';
import { CityFixMark } from '@/components/CityFixMark';

export interface ReportShellProps {
  /** 1-indexed current step (drives the indicator). */
  currentStep: number;
  /** Total step count. */
  totalSteps: number;
  /** Optional localized step labels for the indicator. */
  stepLabels?: string[];
  /** Page content. */
  children: ReactNode;
  /** Optional sticky-bottom action bar content (e.g. "Continue" button). */
  bottomAction?: ReactNode;
  /** City brand name (Bangla-first, may be empty for v1.1). */
  brandTagline: string;
  /** Document language. */
  lang: Language;
  /** Optional className passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function ReportShell({
  currentStep,
  totalSteps,
  stepLabels,
  children,
  bottomAction,
  brandTagline,
  lang,
  className,
  'data-testid': testId,
}: ReportShellProps) {
  return (
    <div
      data-testid={testId}
      data-current-step={currentStep}
      data-total-steps={totalSteps}
      className={className}
      style={{
        minHeight: '100vh',
        background: 'var(--color-surface-page)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <style>{`
        @media (max-width: 1024px) {
          .report-shell-step-labels {
            display: none !important;
          }
        }
      `}</style>

      {/* Sticky top bar */}
      <header
        style={{
          height: 'var(--header-height-desktop)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-5)',
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-sticky)',
          flexShrink: 0,
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
          <CityFixMark />
          <span style={{ fontSize: 'var(--text-body-lg)', fontWeight: 'var(--weight-semibold)' }}>
            CityFix
          </span>
          {brandTagline && (
            <span
              lang={lang}
              style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--color-ink-secondary)',
                marginLeft: 'var(--space-2)',
              }}
            >
              {brandTagline}
            </span>
          )}
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
              background: 'var(--color-primary-soft)',
              color: 'var(--color-primary)',
              borderRadius: 'var(--radius-pill)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {lang === 'bn' ? 'রিপোর্ট জমা দিন' : 'Submit a report'}
          </span>
          <span
            lang={lang}
            style={{
              padding: 'var(--space-1) var(--space-2)',
              background: 'var(--color-surface-raised)',
              borderRadius: 'var(--radius-pill)',
              fontWeight: 'var(--weight-semibold)',
            }}
          >
            {lang === 'bn' ? `ধাপ ${currentStep} / ${totalSteps}` : `Step ${currentStep} of ${totalSteps}`}
          </span>
        </div>
      </header>

      {/* Step indicator (under the top bar) */}
      <div
        className="report-shell-step-labels"
        style={{
          padding: 'var(--space-3) var(--space-5)',
          background: 'var(--color-surface-card)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <StepIndicator
          current={currentStep}
          total={totalSteps}
          labels={stepLabels}
          lang={lang}
        />
      </div>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </main>

      {/* Optional sticky bottom action bar */}
      {bottomAction && (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            zIndex: 'var(--z-sticky)',
            background: 'var(--color-surface-card)',
            borderTop: '1px solid var(--color-border)',
            padding: 'var(--space-3) var(--space-5)',
            paddingBottom: 'max(var(--space-3), env(safe-area-inset-bottom))',
            minHeight: 'var(--sticky-cta-height)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          {bottomAction}
        </div>
      )}
    </div>
  );
}
