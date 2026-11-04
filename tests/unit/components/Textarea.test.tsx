// @vitest-environment jsdom
/**
 * Unit tests for the Textarea primitive (components/ui/Textarea.tsx).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Textarea } from '@/components/ui/Textarea';

afterEach(() => {
  cleanup();
});

describe('Textarea', () => {
  it('renders the rows attribute', () => {
    render(<Textarea aria-label="নোট" rows={6} />);
    expect(screen.getByLabelText('নোট').getAttribute('rows')).toBe('6');
  });

  it('shows the character counter when showCount is set', () => {
    render(<Textarea aria-label="নোট" showCount maxLength={100} value="হ্যালো" />);
    expect(screen.getByTestId('textarea-count').textContent).toBe('6 / 100');
  });

  it('hides the counter from assistive technology', () => {
    render(<Textarea aria-label="নোট" showCount maxLength={100} value="হ্যালো" />);
    expect(screen.getByTestId('textarea-count').getAttribute('aria-hidden')).toBe('true');
  });

  it('omits the counter when showCount is not set', () => {
    render(<Textarea aria-label="নোট" maxLength={100} value="হ্যালো" />);
    expect(screen.queryByTestId('textarea-count')).toBeNull();
  });
});
