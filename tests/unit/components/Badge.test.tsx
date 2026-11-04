// @vitest-environment jsdom
/**
 * Unit tests for the Badge primitive (components/ui/Badge.tsx).
 *
 * A Badge is a count or a label, NOT a status. The tests pin the
 * tone→token mapping and check that the optional icon does not
 * disturb the content.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Badge } from '@/components/ui/Badge';

afterEach(() => {
  cleanup();
});

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>12</Badge>);
    expect(screen.getByText('12')).toBeDefined();
  });

  it('exposes the tone as a data attribute so the stylesheet can theme it', () => {
    render(<Badge tone="success">সমাধান</Badge>);
    expect(screen.getByText('সমাধান').getAttribute('data-tone')).toBe('success');
  });

  it('renders an optional icon alongside the content', () => {
    render(
      <Badge icon={<span data-testid="badge-icon">●</span>} tone="danger">
        ৩
      </Badge>,
    );
    expect(screen.getByTestId('badge-icon')).toBeDefined();
    expect(screen.getByText('৩')).toBeDefined();
  });

  it('defaults to the neutral tone', () => {
    render(<Badge>নতুন</Badge>);
    expect(screen.getByText('নতুন').getAttribute('data-tone')).toBe('neutral');
  });
});
