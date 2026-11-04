// @vitest-environment jsdom
/**
 * Unit tests for the Button primitive (components/ui/Button.tsx).
 *
 * The Button is the most-used control in the product, so its tests
 * pin the three things that actually broke in the old inline-styled
 * buttons: the default `type` (an accidental submit), the loading
 * state (a double-submit), and the variant→token mapping (the drift
 * that made two "primary" buttons different colours).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Button } from '@/components/ui/Button';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renders its label and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>রিপোর্ট করুন</Button>);

    const button = screen.getByRole('button', { name: 'রিপোর্ট করুন' });
    expect(button).toBeDefined();

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>সংরক্ষণ</Button>);
    const button = screen.getByRole('button', { name: 'সংরক্ষণ' });
    expect(button.getAttribute('type')).toBe('button');
  });

  it('renders as disabled and does not fire onClick when loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        পাঠানো হচ্ছে
      </Button>,
    );

    const button = screen.getByRole('button', { name: /পাঠানো হচ্ছে/ });
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('maps each variant to its token pair', () => {
    const { unmount } = render(<Button variant="primary">প্রাইমারি</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('primary');
    unmount();

    const secondary = render(<Button variant="secondary">সেকেন্ডারি</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('secondary');
    secondary.unmount();

    const ghost = render(<Button variant="ghost">ঘোস্ট</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('ghost');
    ghost.unmount();

    const danger = render(<Button variant="danger">বিপজ্জনক</Button>);
    expect(screen.getByRole('button').getAttribute('data-variant')).toBe('danger');
  });

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        নিষ্ক্রিয়
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'নিষ্ক্রিয়' });
    expect(button.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders a leading icon without changing the accessible name', () => {
    render(
      <Button icon={<span data-testid="icon">+</span>}>নতুন রিপোর্ট</Button>,
    );

    expect(screen.getByTestId('icon')).toBeDefined();
    expect(screen.getByRole('button', { name: 'নতুন রিপোর্ট' })).toBeDefined();
  });
});
