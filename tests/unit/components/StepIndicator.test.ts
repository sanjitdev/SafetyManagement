/**
 * Unit tests for the StepIndicator primitive (components/ui/StepIndicator.tsx).
 *
 * Same posture: pure-logic tests over the classifySteps reducer
 * that maps a 1-indexed current step to a list of {index, state}
 * entries. DOM render is covered by Playwright.
 *
 * S-003.1 acceptance: 5 steps, current step highlighted, completed
 * step marked, future step muted; current step out of range clamps.
 */

import { describe, it, expect } from 'vitest';

type StepState = 'completed' | 'current' | 'future';

interface ClassifiedStep {
  index: number;
  state: StepState;
}

// Mirror of classifySteps inside StepIndicator.
function classifySteps(current: number, total: number): ClassifiedStep[] {
  const clampedCurrent = Math.max(1, Math.min(current, total));
  return Array.from({ length: total }, (_, i) => {
    const stepNum = i + 1;
    const state: StepState =
      stepNum < clampedCurrent
        ? 'completed'
        : stepNum === clampedCurrent
        ? 'current'
        : 'future';
    return { index: stepNum, state };
  });
}

describe('StepIndicator', () => {
  it('returns 5 steps for a 5-step flow at step 1', () => {
    const steps = classifySteps(1, 5);
    expect(steps).toHaveLength(5);
    expect(steps[0]).toEqual({ index: 1, state: 'current' });
    expect(steps[1].state).toBe('future');
    expect(steps[4].state).toBe('future');
  });

  it('marks step 1 as completed when current=2', () => {
    const steps = classifySteps(2, 5);
    expect(steps[0]).toEqual({ index: 1, state: 'completed' });
    expect(steps[1]).toEqual({ index: 2, state: 'current' });
    expect(steps[2].state).toBe('future');
  });

  it('clamps current=6 to total=5 (the last step is `current`, not `completed`)', () => {
    // Defensive: a "submitted" confirmation page may render the
    // indicator with current=6. The reducer should clamp to total=5;
    // the last step is `current`, not `completed`, because there is
    // no step beyond it.
    const steps = classifySteps(6, 5);
    expect(steps[4]).toEqual({ index: 5, state: 'current' });
    expect(steps[0]).toEqual({ index: 1, state: 'completed' });
    expect(steps.every((s) => s.state !== 'future')).toBe(true);
  });

  it('clamps current=0 to 1', () => {
    const steps = classifySteps(0, 5);
    expect(steps[0]).toEqual({ index: 1, state: 'current' });
  });

  it('clamps current=-3 to 1', () => {
    const steps = classifySteps(-3, 5);
    expect(steps[0]).toEqual({ index: 1, state: 'current' });
    expect(steps[4].state).toBe('future');
  });

  it('renders an empty output for total=0 (defensive)', () => {
    // The component returns null when total < 1. The reducer
    // should still produce a safe empty array.
    const steps = classifySteps(1, 0);
    expect(steps).toHaveLength(0);
  });
});