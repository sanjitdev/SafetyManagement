// @vitest-environment jsdom
/**
 * Unit tests for the CategoryIcon primitive
 * (components/ui/CategoryIcon.tsx).
 *
 * The primitive replaced three hand-rolled emoji helpers
 * (`💡`, `🕳️`, `🌊`, `🗑️`) that each page defined for itself. The
 * contract worth pinning is the FALLBACK: a category slug the app
 * has never seen must still render an icon with a colour token, not
 * an empty box and not a raw "❓" emoji.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { CATEGORY_ICONS, categoryIcon } from '@/lib/ui/icon-map';

afterEach(() => {
  cleanup();
});

describe('CategoryIcon', () => {
  it('renders an icon for a known category slug', () => {
    const { container } = render(<CategoryIcon slug="streetlight" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('is decorative — the category name is always rendered as text', () => {
    const { container } = render(<CategoryIcon slug="pothole" />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute('aria-hidden')).toBe('true');
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the `other` glyph for an unknown slug', () => {
    // The unknown slug must resolve to the SAME icon as `other`, not
    // to nothing — a category added to the seed without a registry
    // entry still has to render a glyph.
    expect(categoryIcon('a-brand-new-category')).toBe(CATEGORY_ICONS.other);
    const { container } = render(<CategoryIcon slug="a-brand-new-category" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders an icon for a missing slug', () => {
    const { container } = render(<CategoryIcon slug={null} />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
