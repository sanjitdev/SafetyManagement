// @vitest-environment jsdom
/**
 * Unit tests for the navigation primitives — Breadcrumb, SideNav and
 * Tabs. The shared concern is the ACTIVE STATE: it must be marked
 * with `aria-current` / `aria-selected`, and never with colour alone.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { SideNav } from '@/components/ui/SideNav';
import { Tabs } from '@/components/ui/Tabs';

afterEach(() => {
  cleanup();
});

describe('Breadcrumb', () => {
  it('marks the last crumb as the current page', () => {
    render(
      <Breadcrumb
        lang="bn"
        items={[
          { label: 'হোম', href: '/home' },
          { label: 'রিপোর্ট', href: '/reports' },
          { label: 'CF-1042' },
        ]}
      />,
    );

    const current = screen.getByText('CF-1042');
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('renders the earlier crumbs as links', () => {
    render(
      <Breadcrumb
        lang="bn"
        items={[
          { label: 'হোম', href: '/home' },
          { label: 'CF-1042' },
        ]}
      />,
    );

    expect(screen.getByRole('link', { name: 'হোম' }).getAttribute('href')).toBe('/home');
  });

  it('exposes a navigation landmark with a name', () => {
    render(<Breadcrumb lang="bn" items={[{ label: 'হোম' }]} />);
    expect(screen.getByRole('navigation', { name: 'ব্রেডক্রাম্ব' })).toBeDefined();
  });
});

describe('SideNav', () => {
  const ITEMS = [
    { key: 'queue', label: 'সারি', href: '/dispatcher' },
    { key: 'map', label: 'মানচিত্র', href: '/dispatcher/map' },
  ];

  it('marks the active item with aria-current', () => {
    render(<SideNav lang="bn" items={ITEMS} activeHref="/dispatcher" />);

    const active = screen.getByRole('link', { name: /সারি/ });
    expect(active.getAttribute('aria-current')).toBe('page');
  });

  it('does not mark an inactive item', () => {
    render(<SideNav lang="bn" items={ITEMS} activeHref="/dispatcher" />);

    const inactive = screen.getByRole('link', { name: /মানচিত্র/ });
    expect(inactive.hasAttribute('aria-current')).toBe(false);
  });

  it('renders a count badge when one is supplied', () => {
    render(
      <SideNav lang="bn" items={[{ key: 'queue', label: 'সারি', href: '/dispatcher', count: 12 }]} />,
    );
    expect(screen.getByText('12')).toBeDefined();
  });
});

describe('Tabs', () => {
  const ITEMS = [
    { key: 'all', label: 'সব' },
    { key: 'open', label: 'চলমান' },
  ];

  it('marks the selected tab with aria-selected', () => {
    render(<Tabs lang="bn" items={ITEMS} defaultActiveKey="open" />);

    const selected = screen.getByRole('tab', { name: 'চলমান' });
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'সব' }).getAttribute('aria-selected')).toBe('false');
  });

  it('calls onChange when a tab is clicked', () => {
    let changed: string | null = null;
    render(
      <Tabs
        lang="bn"
        items={ITEMS}
        defaultActiveKey="all"
        onChange={(key) => {
          changed = key;
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'চলমান' }));
    expect(changed).toBe('open');
  });

  it('moves to the next tab with the arrow key', () => {
    render(<Tabs lang="bn" items={ITEMS} defaultActiveKey="all" />);

    const first = screen.getByRole('tab', { name: 'সব' });
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });

    expect(screen.getByRole('tab', { name: 'চলমান' }).getAttribute('aria-selected')).toBe('true');
  });
});
