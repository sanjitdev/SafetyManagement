/**
 * Unit tests for the display-name resolver
 * (lib/identity/display-name.ts).
 *
 * Intent 008 / Bolt 008-002 — Story 002 (Render Display Names on
 * Ticket Surfaces). The slow-motion demo surfaced the bug that
 * `entry.actorId` was being rendered directly on the dispatcher /
 * crew ticket-detail page (so the trail said
 * `user_citizen_rahim` instead of `Rahim`). This test pins the
 * helper that translates the (role, userId) pair to a display
 * name, so the regression is caught before the bolt ships.
 *
 * Pure logic — no DB, no Next runtime, no i18n registry needed
 * (the helper is intentionally language-agnostic; localisation of
 * the role label is the caller's job).
 */

import { describe, expect, it } from 'vitest';
import {
  displayNameFor,
  categoryLabel,
} from '@/lib/identity/display-name';

describe('displayNameFor', () => {
  it('returns "Rahim" for the demo citizen (user_citizen_rahim)', () => {
    expect(displayNameFor('citizen', 'user_citizen_rahim')).toBe('Rahim');
  });

  it('returns "Habib" for the demo dispatcher (user_dispatcher_habib)', () => {
    expect(displayNameFor('dispatcher', 'user_dispatcher_habib')).toBe(
      'Habib',
    );
  });

  it('returns "Rashid" for the demo crew member (user_crew_rashid)', () => {
    expect(displayNameFor('crew', 'user_crew_rashid')).toBe('Rashid');
  });

  it('returns the role label for the admin role', () => {
    expect(displayNameFor('admin', 'u_admin')).toBe('admin');
    expect(displayNameFor('admin', 'user_admin_someone')).toBe('admin');
  });

  it('falls back to the id for an unknown user (graceful fallback)', () => {
    expect(displayNameFor('citizen', 'u_unknown_42')).toBe('u_unknown_42');
    expect(displayNameFor('dispatcher', 'u_phantom')).toBe('u_phantom');
  });

  it('returns an em-dash for an empty id', () => {
    expect(displayNameFor('citizen', '')).toBe('—');
  });

  it('does not throw on unexpected roles or ids', () => {
    expect(() => displayNameFor('crew', '')).not.toThrow();
    expect(() =>
      displayNameFor('admin', 'not.in.the.map'),
    ).not.toThrow();
  });
});

describe('categoryLabel', () => {
  it('returns the localized category name for the four v1 categories', () => {
    expect(categoryLabel('cat_streetlight', 'bn')).toBe('রাস্তার আলো নেই');
    expect(categoryLabel('cat_streetlight', 'en')).toBe('Broken streetlight');
    expect(categoryLabel('cat_pothole', 'en')).toBe('Pothole');
    expect(categoryLabel('cat_drainage', 'en')).toBe('Drainage');
    expect(categoryLabel('cat_garbage', 'en')).toBe('Garbage');
    expect(categoryLabel('cat_other', 'en')).toBe('Other');
  });

  it('falls back to the id for an unknown category (graceful fallback)', () => {
    expect(categoryLabel('cat_unknown', 'bn')).toBe('cat_unknown');
  });

  it('returns an em-dash for an empty id', () => {
    expect(categoryLabel('', 'bn')).toBe('—');
  });
});
