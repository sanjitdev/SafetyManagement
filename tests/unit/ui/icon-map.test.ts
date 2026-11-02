import { describe, it, expect } from 'vitest';
import {
  ICONS,
  CATEGORY_ICONS,
  CATEGORY_ICON_COLORS,
  categoryIcon,
  categoryIconColor,
  ICON_WEIGHT,
  type IconName,
} from '@/lib/ui/icon-map';

/**
 * The icon registry is the app's single source of truth for icon
 * identity. Before it, the product drew emoji (`💡`, `🕳️`, `🌊`, `🗑️`)
 * in the dispatcher queue, the crew list and the crew ticket detail, and
 * a 12px coloured dot as the header brand mark.
 *
 * These tests pin the registry's CONTRACT rather than its pixels:
 * every category has an icon, every icon has a colour, and an unknown
 * slug degrades gracefully instead of rendering nothing.
 */

/**
 * Is this value usable as a React component?
 *
 * Phosphor v2 exports each icon as a `React.forwardRef` object, NOT a
 * plain function — so `typeof icon === 'function'` is FALSE for every
 * icon. The real contract is "has a `render` function", which is what
 * React uses to render a forwardRef.
 */
function isRenderableIcon(icon: unknown): boolean {
  if (typeof icon === 'function') return true;
  if (typeof icon !== 'object' || icon === null) return false;
  // A React.forwardRef object carries a `render` function. Checking
  // for `render` (rather than `$typeof`) keeps this helper free of
  // the React internals symbol, which is an implementation detail.
  const candidate = icon as { render?: unknown };
  return typeof candidate.render === 'function';
}

describe('the icon registry', () => {
  it('exposes the navigation icons the app chrome needs', () => {
    for (const name of [
      'home',
      'feed',
      'reports',
      'queue',
      'audit',
      'monitor',
      'performance',
    ] as IconName[]) {
      expect(ICONS[name], `${name} must exist`).toBeDefined();
      expect(isRenderableIcon(ICONS[name].icon), `${name} must be renderable`).toBe(true);
    }
  });

  it('exposes the action icons', () => {
    for (const name of ['newReport', 'addUser', 'users', 'dedup', 'taxonomy', 'wards', 'city'] as IconName[]) {
      expect(ICONS[name], `${name} must exist`).toBeDefined();
    }
  });

  it('exposes the status icons — a status is never colour-only', () => {
    // Every status needs a SHAPE, not just a hue. This is the whole
    // point of the registry: the status trail and the status pills
    // encode the state twice, once by icon shape and once by colour.
    for (const name of [
      'statusSubmitted',
      'statusRouted',
      'statusInProgress',
      'statusResolved',
      'statusPaused',
      'statusError',
      'statusWarning',
    ] as IconName[]) {
      expect(ICONS[name], `${name} must exist`).toBeDefined();
    }
  });

  it('exposes the auth icons', () => {
    for (const name of ['signIn', 'signOut', 'lock', 'back'] as IconName[]) {
      expect(ICONS[name], `${name} must exist`).toBeDefined();
    }
  });

  it('exposes the media and location icons', () => {
    for (const name of ['camera', 'image', 'mapPin', 'crosshair'] as IconName[]) {
      expect(ICONS[name], `${name} must exist`).toBeDefined();
    }
  });

  it('uses one weight across the app so the family reads as a set', () => {
    for (const entry of Object.values(ICONS)) {
      expect(entry.weight).toBe(ICON_WEIGHT);
    }
  });
});

describe('category icons', () => {
  it('has an icon for every category in the Dhaka seed template', () => {
    // These are the slugs the seed writes and the `category.*` i18n
    // keys describe.
    for (const slug of ['streetlight', 'pothole', 'drainage', 'garbage', 'sanitation', 'other']) {
      expect(CATEGORY_ICONS[slug], `${slug} must have an icon`).toBeDefined();
      expect(isRenderableIcon(CATEGORY_ICONS[slug].icon), `${slug} must be renderable`).toBe(true);
    }
  });

  it('has a colour token for every category that has an icon', () => {
    // An icon without a colour token would fall back to inherited
    // colour and lose its category signal.
    for (const slug of Object.keys(CATEGORY_ICONS)) {
      expect(CATEGORY_ICON_COLORS[slug], `${slug} must have a colour`).toBeDefined();
      expect(CATEGORY_ICON_COLORS[slug]).toMatch(/^var\(--color-cat-/);
    }
  });

  it('maps a known slug to its own icon', () => {
    expect(categoryIcon('streetlight')).toBe(CATEGORY_ICONS.streetlight);
    expect(categoryIcon('pothole')).toBe(CATEGORY_ICONS.pothole);
    expect(categoryIcon('garbage')).toBe(CATEGORY_ICONS.garbage);
    expect(categoryIcon('drainage')).toBe(CATEGORY_ICONS.drainage);
  });

  it('falls back to the `other` glyph for an unknown slug', () => {
    // The old helper had a `default:` case for this. A category added
    // to the seed without a registry entry must still render an icon,
    // not nothing.
    expect(categoryIcon('a-brand-new-category')).toBe(CATEGORY_ICONS.other);
    expect(categoryIconColor('a-brand-new-category')).toBe(CATEGORY_ICON_COLORS.other);
  });

  it('falls back to the `other` glyph for a missing slug', () => {
    expect(categoryIcon(null)).toBe(CATEGORY_ICONS.other);
    expect(categoryIcon(undefined)).toBe(CATEGORY_ICONS.other);
    expect(categoryIcon('')).toBe(CATEGORY_ICONS.other);
  });

  it('never returns undefined', () => {
    for (const slug of [null, undefined, '', 'unknown', 'streetlight']) {
      expect(categoryIcon(slug)).toBeDefined();
      expect(categoryIconColor(slug)).toBeDefined();
    }
  });
});
