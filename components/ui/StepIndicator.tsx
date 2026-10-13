/**
 * StepIndicator — numbered circles + connector line for the
 * 5-step report flow.
 *
 * S-003.1 (StepIndicator primitive). The 5-step shape is the
 * Checkpoint-2 default per the intent's decisions log:
 *   1. Location
 *   2. Photo
 *   3. Category
 *   4. Note
 *   5. Summary
 *
 * Each step is a circle: filled-in navy (`--color-primary`)
 * when completed, accent sky-blue (`--color-accent`) for the
 * current step, and a sunken surface for future steps. A 2px
 * connector line runs between consecutive circles, painted in
 * `--color-primary` if both endpoints are completed and
 * `--color-surface-sunken` otherwise.
 *
 * The indicator is presentational. It does not own state. The
 * `current` and `total` props are 1-indexed and clamp-safe; the
 * component silently coerces out-of-range values to the nearest
 * valid step so a misbehaving caller doesn't crash the page.
 *
 * Reduced motion: the indicator has no transition by default. The
 * `<ReportShell>` parent may animate step transitions via the
 * `--duration-base` token, but the indicator itself is a static
 * progress affordance — pulsing or shimmering would draw the eye
 * away from the form's primary content.
 *
 * The indicator is a server-compatible component (no client hooks).
 */

import { Fragment, type ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface StepIndicatorProps {
  /** 1-indexed current step. Clamped to [1, total]. */
  current: number;
  /** Total step count. Must be ≥ 1. */
  total: number;
  /** Optional localized step labels in display order. */
  labels?: string[];
  /** Document language for the rendered aria-label. */
  lang: Language;
  /** Optional className passthrough. */
  className?: string;
  /** Test hook. */
  'data-testid'?: string;
}

interface StepState {
  index: number;
  state: 'completed' | 'current' | 'future';
}

function classifySteps(current: number, total: number): StepState[] {
  const clampedCurrent = Math.max(1, Math.min(current, total));
  return Array.from({ length: total }, (_, i) => {
    const stepNum = i + 1;
    const state: StepState['state'] =
      stepNum < clampedCurrent
        ? 'completed'
        : stepNum === clampedCurrent
        ? 'current'
        : 'future';
    return { index: stepNum, state };
  });
}

export function StepIndicator({
  current,
  total,
  labels,
  lang,
  className,
  'data-testid': testId,
}: StepIndicatorProps): ReactNode {
  if (total < 1) return null;
  const steps = classifySteps(current, total);
  const ariaLabel = t('step.indicator.label', { current, total }, lang);

  return (
    <nav
      aria-label={ariaLabel}
      data-testid={testId}
      data-current={current}
      data-total={total}
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
        padding: 'var(--space-2) 0',
        width: '100%',
      }}
    >
      {steps.map((step, i) => {
        const isCompleted = step.state === 'completed';
        const isCurrent = step.state === 'current';
        const isFuture = step.state === 'future';
        const connectorDone = isCompleted;
        const connectorBeforeCurrent = i > 0 && steps[i - 1].state === 'completed' && (isCurrent || isCompleted);
        const showConnector = i > 0;
        const circleBg = isCompleted
          ? 'var(--color-primary)'
          : isCurrent
          ? 'var(--color-accent)'
          : 'var(--color-surface-sunken)';
        const circleFg = isCompleted || isCurrent ? 'var(--color-on-primary)' : 'var(--color-ink-tertiary)';
        const label = labels?.[i] ?? String(step.index);
        return (
          <Fragment key={step.index}>
            {showConnector && (
              <div
                aria-hidden
                data-connector={connectorBeforeCurrent ? 'done' : 'pending'}
                style={{
                  flex: 1,
                  height: 2,
                  maxWidth: 48,
                  background: connectorDone || connectorBeforeCurrent
                    ? 'var(--color-primary)'
                    : 'var(--color-surface-sunken)',
                  transition: 'background var(--duration-base) var(--ease-out)',
                }}
              />
            )}
            <div
              data-step={step.index}
              data-state={step.state}
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-1)',
                flexShrink: 0,
                minWidth: 40,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: circleBg,
                  color: circleFg,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 'var(--text-caption)',
                  fontWeight: 'var(--weight-bold)',
                  transition: 'background var(--duration-base) var(--ease-out)',
                }}
              >
                {isCompleted ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  step.index
                )}
              </div>
              <span
                lang={lang}
                style={{
                  fontSize: 'var(--text-micro)',
                  color: isFuture ? 'var(--color-ink-tertiary)' : 'var(--color-ink)',
                  fontWeight: isCurrent ? 'var(--weight-bold)' : 'var(--weight-regular)',
                  whiteSpace: 'nowrap',
                  maxWidth: 64,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </nav>
  );
}