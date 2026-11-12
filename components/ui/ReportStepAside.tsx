/**
 * ReportStepAside — the unified right-side panel for the
 * `/report/*` step pages (S-004.1-6).
 *
 * Every step (location / photo / category / note / summary)
 * renders the same aside skeleton:
 *
 *   ┌─────────────────────────────┐
 *   │  [Step X / Y]               │  ← step pill
 *   │                             │
 *   │  H1                         │  ← step title
 *   │  Body text                  │  ← step help
 *   │                             │
 *   │  <children />               │  ← step-specific body
 *   │                             │
 *   │  ─────────────────────────  │  ← divider
 *   │  [ Back ]  [ Continue ▶ ]   │  ← sticky CTA row
 *   └─────────────────────────────┘
 *
 * The action row is the part the user reported as misaligned
 * across steps. The fix is a single fixed-height 56dp row with
 * two slot buttons that always sit at the same x position, same
 * height, same internal padding, same font — the only thing
 * that changes per step is the slot content (a back link
 * inside the left slot, the continue/submit CTA inside the
 * right slot).
 *
 * The aside is a flex column. The action row is at the bottom
 * because every step uses `marginTop: auto` on it. The content
 * area between the help text and the action row scrolls
 * independently when the viewport is short.
 *
 * Server-compatible: the primitive owns no state. The parent
 * step page is responsible for the click handlers and the
 * disabled / loading flags on the CTA.
 */

import type { ReactNode } from 'react';
import { t } from '@/lib/i18n/keys';

export interface ReportStepAsideProps {
  /** 1-indexed current step (drives the pill text). */
  currentStep: number;
  /** Total step count. */
  totalSteps: number;
  /** Optional H1 override; some steps pass the value in as the children. */
  title?: ReactNode;
  /** Optional one-paragraph help line. */
  help?: ReactNode;
  /** Step-specific body content (e.g. a category grid, the note input). */
  children?: ReactNode;
  /** Optional inline error / out-of-bounds banner. Rendered above the divider. */
  error?: ReactNode;
  /** Left slot: typically a Back link. */
  back?: ReactNode;
  /** Right slot: the primary Continue / Submit CTA. */
  primary?: ReactNode;
  /**
   * Render the action row as a FIXED bottom bar (mockup 14's
   * `.actionbar`) instead of an in-flow row at the bottom of the
   * aside.
   *
   * When this is on, the step page is responsible for reserving the
   * bar's footprint with
   * `padding-bottom: calc(var(--sticky-cta-height) + var(--space-3) * 2 + 1px + var(--space-8))`
   * so the last card is never hidden behind the bar.
   */
  sticky?: boolean;
  /** Optional Bangla language override; affects nothing here but lets parents avoid re-renders. */
  lang?: 'bn' | 'en';
  /** Test hook. */
  'data-testid'?: string;
}

export function ReportStepAside({
  currentStep,
  totalSteps,
  title,
  help,
  children,
  error,
  back,
  primary,
  sticky = false,
  lang = 'bn',
  'data-testid': testId,
}: ReportStepAsideProps) {
  return (
    <>
      <aside
        data-testid={testId}
        lang={lang}
        style={{
          padding: 'var(--space-6) var(--space-5)',
          background: 'var(--color-surface-card)',
          borderLeft: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          // Internal scroll if the page is shorter than the content
          overflowY: 'auto',
          // Reserve a fixed 72dp slot at the bottom for the action row
          // so the button never collides with the help text on small
          // viewports. When the bar is FIXED (`sticky`), it no
          // longer occupies flow space inside the aside, so the
          // aside keeps a smaller bottom pad and the PAGE reserves
          // the bar's footprint instead.
          paddingBottom: sticky ? 'var(--space-6)' : 'var(--space-7)',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            padding: 'var(--space-1) var(--space-3)',
            background: 'var(--color-primary-soft)',
            color: 'var(--color-primary)',
            borderRadius: 'var(--radius-pill)',
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-semibold)',
            alignSelf: 'flex-start',
          }}
          data-testid={`report-step-pill-${currentStep}`}
        >
          {t('report.step.pill', { current: currentStep, total: totalSteps }, lang)}
        </div>

        {title && (
          <h1
            lang={lang}
            style={{
              fontSize: 'var(--text-display-md)',
              margin: 0,
              color: 'var(--color-ink)',
              lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-tight)',
            }}
          >
            {title}
          </h1>
        )}

        {help && (
          <p
            lang={lang}
            style={{
              color: 'var(--color-ink-secondary)',
              fontSize: 'var(--text-body)',
              margin: 0,
              lineHeight: 'var(--leading-normal)',
            }}
          >
            {help}
          </p>
        )}

        {children}

        {error}

        {/* The in-flow action row is rendered only when the bar is
            NOT fixed — a fixed bar lives outside the aside (below)
            so it is not clipped by the aside's `overflowY: auto`
            and does not scroll with the aside's content. */}
        {sticky ? null : (
          <div
            style={{
              marginTop: 'auto',
              // Spacer so the divider+row sit a consistent
              // `--space-5` away from whatever came before.
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'center',
            }}
            data-testid="report-step-aside-actions"
          >
            <div style={{ flexShrink: 0 }}>{back}</div>
            <div style={{ flex: 1, display: 'flex' }}>{primary}</div>
          </div>
        )}
      </aside>

      {/* The FIXED bottom action bar (mockup 14's `.actionbar`).
          It spans the viewport, not the aside column, so the
          citizen always has the continue control in thumb reach
          however tall the step's content is. */}
      {sticky ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 'var(--z-sticky)',
            background: 'var(--color-surface-card)',
            borderTop: '1px solid var(--color-border)',
          }}
          data-testid="report-step-action-bar"
        >
          <div
            style={{
              maxWidth: 760,
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              padding: 'var(--space-3) var(--space-5)',
              minHeight: 'var(--sticky-cta-height)',
            }}
          >
            <div style={{ flexShrink: 0 }}>{back}</div>
            <div style={{ flex: 1, display: 'flex' }}>{primary}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
