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
  lang = 'bn',
  'data-testid': testId,
}: ReportStepAsideProps) {
  return (
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
        // viewports.
        paddingBottom: 'var(--space-7)',
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
        {`ধাপ ${currentStep} / ${totalSteps}`}
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
    </aside>
  );
}
