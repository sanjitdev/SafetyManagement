// @vitest-environment jsdom
/**
 * Unit tests for the IconButton primitive (components/ui/IconButton.tsx).
 *
 * The whole point of this component is the accessible name: an
 * icon-only control with no `label` is invisible to a screen reader
 * and to anyone using voice control. The tests therefore check the
 * name, not the pixels.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { IconButton } from '@/components/ui/IconButton';

afterEach(() => {
  cleanup();
});

describe('IconButton', () => {
  it('exposes the label as the accessible name', () => {
    render(<IconButton label="ফিল্টার করুন" icon={<span data-testid="icon">F</span>} />);

    const button = screen.getByRole('button', { name: 'ফিল্টার করুন' });
    expect(button).toBeDefined();
    expect(button.getAttribute('title')).toBe('ফিল্টার করুন');
  });

  it('renders the icon and fires onClick', () => {
    const onClick = vi.fn();
    render(<IconButton label="মুছুন" icon={<span data-testid="icon">×</span>} onClick={onClick} />);

    expect(screen.getByTestId('icon')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'মুছুন' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not double-announce when a visible caption is present', () => {
    render(<IconButton label="মুছুন" icon={<span>x</span>} caption="মুছুন" />);

    const button = screen.getByRole('button', { name: 'মুছুন' });
    // The caption is decorative: the aria-label is the name.
    expect(button.textContent).not.toContain('মুছুন');
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(<IconButton label="মুছুন" icon={<span>x</span>} disabled onClick={onClick} />);

    const button = screen.getByRole('button', { name: 'মুছুন' });
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});
