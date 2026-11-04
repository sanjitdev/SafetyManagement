// @vitest-environment jsdom
/**
 * Unit tests for the Select primitive (components/ui/Select.tsx).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Select } from '@/components/ui/Select';

afterEach(() => {
  cleanup();
});

describe('Select', () => {
  it('renders one option per entry', () => {
    render(
      <Select
        aria-label="বিভাগ"
        options={[
          { value: 'streetlight', label: 'রাস্তার আলো' },
          { value: 'pothole', label: 'রাস্তায় গর্ত' },
        ]}
      />,
    );

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: 'রাস্তার আলো' })).toBeDefined();
  });

  it('renders a placeholder option when asked, carrying the registry copy', () => {
    render(
      <Select
        aria-label="বিভাগ"
        lang="en"
        placeholder
        options={[{ value: 'streetlight', label: 'Streetlight' }]}
      />,
    );

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].getAttribute('value')).toBe('');
    expect(options[0].textContent).toBe('Select…');
  });

  it('keeps a disabled option disabled', () => {
    render(
      <Select
        aria-label="বিভাগ"
        options={[{ value: 'streetlight', label: 'রাস্তার আলো', disabled: true }]}
      />,
    );

    expect(screen.getByRole('option', { name: 'রাস্তার আলো' }).hasAttribute('disabled')).toBe(true);
  });

  it('fires onChange when an option is chosen', () => {
    const onChange = vi.fn();
    render(
      <Select
        aria-label="বিভাগ"
        onChange={onChange}
        options={[
          { value: 'streetlight', label: 'রাস্তার আলো' },
          { value: 'pothole', label: 'রাস্তায় গর্ত' },
        ]}
      />,
    );

    fireEvent.change(screen.getByLabelText('বিভাগ'), { target: { value: 'pothole' } });
    expect(onChange).toHaveBeenCalled();
  });
});
