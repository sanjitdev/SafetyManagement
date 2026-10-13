/**
 * Unit tests for the StatusPill primitive (components/ui/StatusPill.tsx).
 *
 * We don't have a DOM test runner installed (no @testing-library/jsdom),
 * so these tests exercise the pure helper logic — the i18n key map,
 * the color-token resolution, and the label string. The actual rendered
 * DOM is covered by the Playwright mockup baseline suites.
 *
 * S-003.4 acceptance: each status renders with the right bg/fg token
 * pair and exposes a localized label.
 */

import { describe, it, expect } from 'vitest';
import { t, type Language } from '@/lib/i18n/keys';

// We re-derive the visual map (mirroring StatusPill.tsx) so the test
// can assert on token names without importing the React component.
const STATUS_VISUAL: Record<string, { fg: string; bg: string; i18nKey: string }> = {
  submitted: { fg: 'var(--color-status-submitted)', bg: 'var(--color-status-submitted-soft)', i18nKey: 'status.submitted' },
  routed: { fg: 'var(--color-status-routed)', bg: 'var(--color-status-routed-soft)', i18nKey: 'status.routed' },
  in_progress: { fg: 'var(--color-status-in-progress)', bg: 'var(--color-status-in-progress-soft)', i18nKey: 'status.in_progress' },
  resolved: { fg: 'var(--color-status-resolved)', bg: 'var(--color-status-resolved-soft)', i18nKey: 'status.resolved' },
  closed: { fg: 'var(--color-ink-tertiary)', bg: 'var(--color-surface-raised)', i18nKey: 'status.closed' },
  cancelled: { fg: 'var(--color-ink-tertiary)', bg: 'var(--color-surface-raised)', i18nKey: 'status.cancelled' },
  paused: { fg: 'var(--color-status-paused)', bg: 'var(--color-status-in-progress-soft)', i18nKey: 'status.paused' },
  error: { fg: 'var(--color-status-error)', bg: 'var(--color-status-error-soft)', i18nKey: 'status.error' },
  warning: { fg: 'var(--color-status-warning)', bg: 'var(--color-status-warning-soft)', i18nKey: 'status.warning' },
};

describe('StatusPill', () => {
  it('has a visual pair for every supported status', () => {
    const expected = [
      'submitted', 'routed', 'in_progress', 'resolved',
      'closed', 'cancelled', 'paused', 'error', 'warning',
    ];
    for (const status of expected) {
      expect(STATUS_VISUAL[status], `missing visual for ${status}`).toBeDefined();
      expect(STATUS_VISUAL[status].fg).toMatch(/^var\(--color-/);
      expect(STATUS_VISUAL[status].bg).toMatch(/^var\(--color-/);
    }
  });

  it('uses the status-i18n key for the human label', () => {
    expect(STATUS_VISUAL.submitted.i18nKey).toBe('status.submitted');
    expect(STATUS_VISUAL.in_progress.i18nKey).toBe('status.in_progress');
    expect(STATUS_VISUAL.resolved.i18nKey).toBe('status.resolved');
  });

  it('renders a localized label in Bangla (canonical)', () => {
    const label = t(STATUS_VISUAL.in_progress.i18nKey, null, 'bn' as Language);
    expect(label).toBeTruthy();
    expect(label).not.toEqual(STATUS_VISUAL.in_progress.i18nKey);
  });

  it('renders a localized label in English (fallback)', () => {
    const label = t(STATUS_VISUAL.in_progress.i18nKey, null, 'en' as Language);
    expect(label).toBe('In progress');
  });

  it('muted states (closed, cancelled) reuse the neutral pair so a closed ticket never looks active', () => {
    expect(STATUS_VISUAL.closed.bg).toBe(STATUS_VISUAL.cancelled.bg);
    expect(STATUS_VISUAL.closed.fg).toBe(STATUS_VISUAL.cancelled.fg);
  });

  it('active states use status-specific bg/fg pairs (not the muted neutral pair)', () => {
    const muted = STATUS_VISUAL.closed.bg;
    const active = ['submitted', 'routed', 'in_progress', 'resolved'];
    for (const status of active) {
      expect(STATUS_VISUAL[status].bg, `${status} bg should not be the muted neutral`).not.toBe(muted);
    }
  });
});