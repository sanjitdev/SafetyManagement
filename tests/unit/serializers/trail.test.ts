/**
 * Unit tests for the citizen-facing trail filter
 * (lib/serializers/trail.ts → applyCitizenTrailFilter).
 *
 * Bolt 007-001 (Intent 007 — Citizen Resolution Visibility).
 *
 * Pinned behaviours:
 *   - `applyCitizenTrailFilter` rewrites any note matching the marker
 *     regex `^[a-z_]+:` to the localized "After photo added" string.
 *   - `note: null` and free-text notes pass through unchanged.
 *   - The replacement preserves the entry's `toStatus`, `timestamp`,
 *     and `actorLabel` so the timeline slot is intact.
 *   - Locale switches correctly: bn vs en returns the right string.
 *
 * The test also pins the regex regression guard: any future
 * `audit:`, `system:`, `internal:` marker is rewritten too.
 */

import { describe, expect, it } from 'vitest';
import { applyCitizenTrailFilter } from '@/lib/serializers/trail';
import type { TrailEntryLike } from '@/lib/serializers/ticket';

function mkEntry(overrides: Partial<TrailEntryLike> = {}): TrailEntryLike {
  return {
    toStatus: 'in_progress',
    actorId: 'user_crew_rashid',
    note: null,
    timestamp: '2026-10-02T08:30:00Z',
    ...overrides,
  };
}

describe('applyCitizenTrailFilter', () => {
  it('rewrites an `after_photo:<url>` marker note to the localised string (bn)', () => {
    const trail: TrailEntryLike[] = [
      mkEntry({ note: 'after_photo:data:image/jpeg;base64,AAAA' }),
    ];
    const out = applyCitizenTrailFilter(trail, 'bn');
    expect(out).toHaveLength(1);
    expect(out[0].note).toBe('ছবি যোগ করা হয়েছে');
  });

  it('rewrites an `after_photo:` marker note to the localised string (en)', () => {
    const trail: TrailEntryLike[] = [
      mkEntry({ note: 'after_photo:data:image/jpeg;base64,AAAA' }),
    ];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out[0].note).toBe('After photo added');
  });

  it('rewrites any `^[a-z_]+:` marker (regression guard)', () => {
    const trail: TrailEntryLike[] = [
      mkEntry({ note: 'audit:foo' }),
      mkEntry({ note: 'system:bar' }),
      mkEntry({ note: 'internal:baz' }),
    ];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out[0].note).toBe('After photo added');
    expect(out[1].note).toBe('After photo added');
    expect(out[2].note).toBe('After photo added');
  });

  it('passes through null notes unchanged', () => {
    const trail: TrailEntryLike[] = [mkEntry({ note: null })];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out[0].note).toBeNull();
  });

  it('passes through free-text notes unchanged', () => {
    const trail: TrailEntryLike[] = [
      mkEntry({ note: 'routed to electrical dept' }),
      mkEntry({ note: 'Replaced the bulb on pole 14B.' }),
    ];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out[0].note).toBe('routed to electrical dept');
    expect(out[1].note).toBe('Replaced the bulb on pole 14B.');
  });

  it('does not rewrite a free-text note that happens to contain a colon later in the string', () => {
    // The marker regex is anchored to start-of-string; a colon at
    // index >0 is treated as free-text prose.
    const trail: TrailEntryLike[] = [
      mkEntry({ note: 'Note: a colon at index 5 is not a marker.' }),
    ];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out[0].note).toBe('Note: a colon at index 5 is not a marker.');
  });

  it('preserves toStatus, timestamp, and actorId on a rewritten entry', () => {
    const trail: TrailEntryLike[] = [
      mkEntry({
        toStatus: 'in_progress',
        actorId: 'user_crew_rashid',
        note: 'after_photo:data:image/jpeg;base64,AAAA',
        timestamp: '2026-10-02T08:30:00Z',
      }),
    ];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out[0].toStatus).toBe('in_progress');
    expect(out[0].actorId).toBe('user_crew_rashid');
    expect(out[0].timestamp).toBe('2026-10-02T08:30:00Z');
  });

  it('handles a mixed trail: only marker notes are rewritten', () => {
    const trail: TrailEntryLike[] = [
      mkEntry({ toStatus: 'submitted', note: null }),
      mkEntry({ toStatus: 'routed', note: 'routed to electrical dept' }),
      mkEntry({ toStatus: 'in_progress', note: 'after_photo:data:image/jpeg;base64,BBBB' }),
      mkEntry({ toStatus: 'resolved', note: null }),
    ];
    const out = applyCitizenTrailFilter(trail, 'bn');
    expect(out[0].note).toBeNull();
    expect(out[1].note).toBe('routed to electrical dept');
    expect(out[2].note).toBe('ছবি যোগ করা হয়েছে');
    expect(out[3].note).toBeNull();
  });

  it('returns a new array (immutable)', () => {
    const trail: TrailEntryLike[] = [mkEntry({ note: 'after_photo:foo' })];
    const out = applyCitizenTrailFilter(trail, 'en');
    expect(out).not.toBe(trail);
    // The original input is unchanged.
    expect(trail[0].note).toBe('after_photo:foo');
  });

  it('handles an empty trail', () => {
    expect(applyCitizenTrailFilter([], 'en')).toEqual([]);
    expect(applyCitizenTrailFilter([], 'bn')).toEqual([]);
  });
});
