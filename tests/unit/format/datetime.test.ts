/**
 * Tests for the timezone-pinned formatters (lib/format/datetime.ts).
 *
 * The pin to `Asia/Dhaka` is a PRODUCT decision, not a cosmetic one:
 * a ticket filed at 15:00 in Dhaka must show 15:00 to a Dhaka
 * resident, whatever timezone the server runs in. It is also what
 * makes the visual baselines reproducible — the asserting platform
 * (ubuntu-latest) runs in UTC and the dev machine does not.
 */

import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDayLabel,
  formatTimestamp,
  formatTimestampShort,
  formatWeekday,
  PRODUCT_TIME_ZONE,
} from '@/lib/format/datetime';

describe('timezone-pinned formatters', () => {
  it('exports the product timezone', () => {
    expect(PRODUCT_TIME_ZONE).toBe('Asia/Dhaka');
  });

  it('renders the Dhaka clock, not the runtime clock', () => {
    // 09:44 UTC is 15:44 in Dhaka (UTC+6).
    const iso = '2026-11-06T09:44:00.000Z';
    const rendered = formatTimestamp(iso, 'en');
    expect(rendered).toContain('3:44');
    expect(rendered).toContain('PM');
  });

  it('renders the same instant identically regardless of the host zone', () => {
    // The rendering must be a pure function of the instant + locale,
    // never of the host's TZ. If the host zone leaked in, this would
    // differ between the dev machine and CI.
    const iso = '2026-11-06T09:44:00.000Z';
    const first = formatTimestamp(iso, 'en');
    const second = formatTimestamp(iso, 'en');
    expect(second).toBe(first);
  });

  it('formats a date-only label in the product zone', () => {
    // 2026-11-06T18:30:00Z is already 07 Nov in Dhaka — the date-only
    // label must say 07 Nov, not 06 Nov.
    const rendered = formatDate('2026-11-06T18:30:00.000Z', 'en');
    expect(rendered).toContain('07');
    expect(rendered).not.toContain('06');
  });

  it('builds a calendar-day label in the product zone', () => {
    // `formatDayLabel(2026, 10, 7)` is "7 Nov" — the day components
    // are read in the product's zone, so a UTC server cannot shift the
    // label to the previous day.
    expect(formatDayLabel(2026, 10, 7, 'en')).toBe('Nov 7');
  });

  it('reads a weekday label in the product zone', () => {
    // 2026-11-06T18:30:00Z is Saturday 07 Nov in Dhaka (2026-11-07
    // is a Saturday). A UTC server would render it as Friday 06 Nov.
    expect(formatWeekday('2026-11-06T18:30:00.000Z', 'en')).toBe('Sat');
  });

  it('degrades to the raw string for an unparseable timestamp', () => {
    expect(formatTimestamp('not-a-date', 'en')).toBe('not-a-date');
    expect(formatTimestampShort('not-a-date', 'en')).toBe('not-a-date');
    expect(formatDate('not-a-date', 'en')).toBe('not-a-date');
    expect(formatWeekday('not-a-date', 'en')).toBe('');
  });

  it('renders Bangla timestamps with Bangla digits', () => {
    const rendered = formatTimestamp('2026-11-06T09:44:00.000Z', 'bn');
    // The Bangla form uses Eastern Arabic numerals.
    expect(rendered).toMatch(/[০-৯]/);
  });
});
