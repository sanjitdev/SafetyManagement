// @vitest-environment jsdom
/**
 * Unit tests for the state primitives — EmptyState, ErrorState and
 * LoadingState. They live in one file because they are three
 * variations of the same idea: "this region has no content yet, it
 * failed, or it is still loading", and each has to say so
 * accessibly and differently.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';

afterEach(() => {
  cleanup();
});

describe('EmptyState', () => {
  it('renders the supplied title and description', () => {
    render(<EmptyState title="কোনো রিপোর্ট নেই" description="প্রথম রিপোর্টটি যোগ করুন।" lang="bn" />);

    expect(screen.getByText('কোনো রিপোর্ট নেই')).toBeDefined();
    expect(screen.getByText('প্রথম রিপোর্টটি যোগ করুন।')).toBeDefined();
  });

  it('falls back to the registry copy when no title is given', () => {
    render(<EmptyState lang="en" />);
    expect(screen.getByText('Nothing here yet')).toBeDefined();
  });

  it('renders an action when one is supplied', () => {
    render(<EmptyState lang="bn" action={<button type="button">রিপোর্ট করুন</button>} />);
    expect(screen.getByRole('button', { name: 'রিপোর্ট করুন' })).toBeDefined();
  });
});

describe('ErrorState', () => {
  it('announces itself with role="alert"', () => {
    render(<ErrorState lang="bn" />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('renders the supplied title', () => {
    render(<ErrorState title="লোড করা যায়নি" lang="bn" />);
    expect(screen.getByText('লোড করা যায়নি')).toBeDefined();
  });

  it('renders a retry action', () => {
    render(<ErrorState lang="bn" action={<button type="button">আবার চেষ্টা করুন</button>} />);
    expect(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeDefined();
  });
});

describe('LoadingState', () => {
  it('exposes a polite live status', () => {
    render(<LoadingState lang="bn" />);

    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('shows the registry loading label', () => {
    render(<LoadingState lang="en" />);
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('accepts a custom label', () => {
    render(<LoadingState lang="bn" label="টিকিট লোড হচ্ছে" />);
    expect(screen.getByText('টিকিট লোড হচ্ছে')).toBeDefined();
  });
});
