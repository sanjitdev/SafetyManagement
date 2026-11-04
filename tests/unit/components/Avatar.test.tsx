// @vitest-environment jsdom
/**
 * Unit tests for the Avatar primitive (components/ui/Avatar.tsx).
 *
 * The initials fallback is the interesting case: a name that is
 * empty must not collapse the control to nothing, and the fallback
 * must not be announced twice (the wrapper carries the name; the
 * initials are decorative).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Avatar, initialsOf } from '@/components/ui/Avatar';

afterEach(() => {
  cleanup();
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Rashid Ahmed')).toBe('RA');
    expect(initialsOf('Dhaka North City Corporation')).toBe('DN');
  });

  it('falls back to "?" for an empty or whitespace-only name', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
  });

  it('takes two letters from a single-word name', () => {
    expect(initialsOf('Rashid')).toBe('RA');
  });
});

describe('Avatar', () => {
  it('renders the initials when no image is supplied', () => {
    render(<Avatar name="Rashid Ahmed" />);
    expect(screen.getByText('RA')).toBeDefined();
  });

  it('renders an image with the name as its alt text when src is given', () => {
    render(<Avatar name="Rashid Ahmed" src="/avatars/rashid.png" />);

    const image = screen.getByAltText('Rashid Ahmed');
    expect(image).toBeDefined();
    expect(screen.queryByText('RA')).toBeNull();
  });

  it('handles an empty name without throwing', () => {
    expect(() => render(<Avatar name="" />)).not.toThrow();
    expect(screen.getByText('?')).toBeDefined();
  });

  it('exposes the name as the accessible label exactly once', () => {
    render(<Avatar name="Rashid Ahmed" />);

    const labelled = screen.getByLabelText('Rashid Ahmed');
    expect(labelled).toBeDefined();
    // The initials span is aria-hidden, so it is not part of the name.
    expect(labelled.textContent).toBe('RA');
  });
});
