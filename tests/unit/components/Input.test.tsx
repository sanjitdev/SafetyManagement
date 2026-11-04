// @vitest-environment jsdom
/**
 * Unit tests for the Input primitive (components/ui/Input.tsx).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Input } from '@/components/ui/Input';

afterEach(() => {
  cleanup();
});

describe('Input', () => {
  it('renders and forwards the value and onChange', () => {
    const onChange = vi.fn();
    render(<Input aria-label="ফোন" value="017" onChange={onChange} />);

    const input = screen.getByLabelText('ফোন');
    expect((input as HTMLInputElement).value).toBe('017');

    fireEvent.change(input, { target: { value: '018' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('renders an icon without making it the accessible name', () => {
    render(<Input aria-label="ফোন" icon={<span data-testid="input-icon">T</span>} />);

    expect(screen.getByTestId('input-icon')).toBeDefined();
    expect(screen.getByLabelText('ফোন')).toBeDefined();
  });

  it('forwards aria-invalid', () => {
    render(<Input aria-label="ফোন" aria-invalid />);
    expect(screen.getByLabelText('ফোন').getAttribute('aria-invalid')).toBe('true');
  });

  it('records its size on the control', () => {
    render(<Input aria-label="ফোন" size="lg" />);
    expect(screen.getByLabelText('ফোন').getAttribute('data-size')).toBe('lg');
  });
});
