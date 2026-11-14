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
  categoryLabelBySlug,
  categorySlug,
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

/*
 * ------------------------------------------------------------------
 * Slug resolution — the Postgres fix
 * ------------------------------------------------------------------
 *
 * The dev store keys its categories `cat_streetlight`; Postgres
 * mints a CUID and carries the stable machine key in a `slug`
 * column. A client-side map keyed on the dev-store ids therefore
 * printed raw CUIDs (`cmvtghhi700082f9o2jww09ry`) as the category
 * name on the dispatcher surfaces. The slug is the key both
 * backends agree on, so these tests pin that resolution.
 */

describe('categorySlug', () => {
  it('strips the dev-store "cat_" prefix', () => {
    expect(categorySlug('cat_streetlight')).toBe('streetlight');
    expect(categorySlug('cat_pothole')).toBe('pothole');
    expect(categorySlug('cat_drainage')).toBe('drainage');
    expect(categorySlug('cat_garbage')).toBe('garbage');
    expect(categorySlug('cat_other')).toBe('other');
  });

  it('passes a slug through unchanged', () => {
    expect(categorySlug('streetlight')).toBe('streetlight');
  });

  it('returns null for an opaque database id', () => {
    // The caller must resolve this against the database — the
    // helper cannot guess it.
    expect(categorySlug('cmvtghhi700082f9o2jww09ry')).toBeNull();
  });

  it('returns null for an empty id', () => {
    expect(categorySlug('')).toBeNull();
  });
});

describe('categoryLabelBySlug', () => {
  it('localizes a slug the same way categoryLabel does', () => {
    expect(categoryLabelBySlug('streetlight', 'en', 'x')).toBe(
      'Broken streetlight',
    );
    expect(categoryLabelBySlug('streetlight', 'bn', 'x')).toBe(
      'রাস্তার আলো নেই',
    );
    expect(categoryLabelBySlug('pothole', 'en', 'x')).toBe('Pothole');
  });

  it('falls back to the caller-supplied label for an unknown slug', () => {
    expect(categoryLabelBySlug('unknown', 'en', 'cat_x')).toBe('cat_x');
  });

  it('falls back to the caller-supplied label for a null slug', () => {
    expect(categoryLabelBySlug(null, 'en', 'cmvtghhi7')).toBe('cmvtghhi7');
    expect(categoryLabelBySlug(undefined, 'en', 'cmvtghhi7')).toBe(
      'cmvtghhi7',
    );
  });

  it('falls back to an em-dash when there is no fallback at all', () => {
    expect(categoryLabelBySlug(null, 'en', '')).toBe('—');
  });
});
