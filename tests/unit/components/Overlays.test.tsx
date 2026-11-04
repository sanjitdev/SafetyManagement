// @vitest-environment jsdom
/**
 * Unit tests for the overlay primitives — Modal, Toast, KpiRow and
 * Timeline — plus the layout primitives Card and Panel.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Modal } from '@/components/ui/Modal';
import { Toast } from '@/components/ui/Toast';
import { KpiRow } from '@/components/ui/KpiRow';
import { Timeline } from '@/components/ui/Timeline';
import { Card } from '@/components/ui/Card';
import { Panel } from '@/components/ui/Panel';

afterEach(() => {
  cleanup();
});

describe('Modal', () => {
  it('opens the native dialog when open is true', () => {
    render(
      <Modal open onClose={() => {}} title="নিশ্চিত করুন" lang="bn">
        <p>বাতিল করবেন?</p>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('does not open the dialog when open is false', () => {
    render(
      <Modal open={false} onClose={() => {}} title="নিশ্চিত করুন" lang="bn" data-testid="modal">
        <p>বাতিল করবেন?</p>
      </Modal>,
    );

    // A closed native <dialog> is hidden from the accessibility tree,
    // so the element is queried by its test id rather than by role.
    const dialog = screen.getByTestId('modal');
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('calls onClose when the close button is pressed', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="নিশ্চিত করুন" lang="bn">
        <p>বাতিল করবেন?</p>
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'ডায়ালগ বন্ধ করুন' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('names the dialog through its heading', () => {
    render(
      <Modal open onClose={() => {}} title="নিশ্চিত করুন" lang="bn">
        <p>বাতিল করবেন?</p>
      </Modal>,
    );

    expect(screen.getByRole('dialog', { name: 'নিশ্চিত করুন' })).toBeDefined();
  });
});

describe('Toast', () => {
  it('is a polite status by default', () => {
    render(<Toast title="সংরক্ষিত হয়েছে" lang="bn" />);
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('becomes an alert for a danger tone', () => {
    render(<Toast title="ব্যর্থ" tone="danger" lang="bn" />);
    expect(screen.getByRole('alert')).toBeDefined();
  });

  it('calls onDismiss when the dismiss button is pressed', () => {
    const onDismiss = vi.fn();
    render(<Toast title="সংরক্ষিত হয়েছে" lang="bn" onDismiss={onDismiss} />);

    fireEvent.click(screen.getByRole('button', { name: 'বার্তা বাদ দিন' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('KpiRow', () => {
  it('renders each figure with its label', () => {
    render(
      <KpiRow
        lang="bn"
        items={[
          { key: 'open', label: 'চলমান', value: '৪২' },
          { key: 'resolved', label: 'সমাধান', value: '১৮০' },
        ]}
      />,
    );

    expect(screen.getByText('চলমান')).toBeDefined();
    expect(screen.getByText('৪২')).toBeDefined();
    expect(screen.getByText('১৮০')).toBeDefined();
  });

  it('shows the trend direction as an arrow and a value, not a colour alone', () => {
    render(
      <KpiRow
        lang="bn"
        items={[{ key: 'open', label: 'চলমান', value: '৪২', trend: 'up', trendValue: '১২%', trendTone: 'danger' }]}
      />,
    );

    expect(screen.getByText('১২%')).toBeDefined();
    expect(screen.getByText('▲')).toBeDefined();
  });

  it('exposes the region with a name', () => {
    render(<KpiRow lang="bn" items={[{ key: 'open', label: 'চলমান', value: '৪২' }]} />);
    expect(screen.getByRole('group', { name: 'মূল পরিসংখ্যান' })).toBeDefined();
  });
});

describe('Timeline', () => {
  const ITEMS = [
    { key: 'submitted', title: 'জমা হয়েছে', detail: '১২ মে', state: 'done' as const, icon: <span>✓</span> },
    { key: 'active', title: 'চলমান', detail: '১৩ মে', state: 'current' as const, icon: <span>◐</span> },
    { key: 'done', title: 'সমাধান', detail: '—', state: 'upcoming' as const, icon: <span>○</span> },
  ];

  it('renders every step as a list item', () => {
    render(<Timeline lang="bn" items={ITEMS} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('records the state of each step', () => {
    render(<Timeline lang="bn" items={ITEMS} />);

    const steps = screen.getAllByRole('listitem');
    expect(steps[0].getAttribute('data-state')).toBe('done');
    expect(steps[1].getAttribute('data-state')).toBe('current');
    expect(steps[2].getAttribute('data-state')).toBe('upcoming');
  });

  it('renders the step titles and details', () => {
    render(<Timeline lang="bn" items={ITEMS} />);

    expect(screen.getByText('জমা হয়েছে')).toBeDefined();
    expect(screen.getByText('১২ মে')).toBeDefined();
  });
});

describe('Card and Panel', () => {
  it('Card renders its title and content', () => {
    render(<Card title="সারি">কনটেন্ট</Card>);

    expect(screen.getByText('সারি')).toBeDefined();
    expect(screen.getByText('কনটেন্ট')).toBeDefined();
  });

  it('Panel renders a heading, a body and a footer', () => {
    render(
      <Panel title="বিস্তারিত" description="নির্বাচিত রিপোর্ট" footer={<button type="button">বন্ধ</button>}>
        কনটেন্ট
      </Panel>,
    );

    expect(screen.getByText('বিস্তারিত')).toBeDefined();
    expect(screen.getByText('নির্বাচিত রিপোর্ট')).toBeDefined();
    expect(screen.getByText('কনটেন্ট')).toBeDefined();
    expect(screen.getByRole('button', { name: 'বন্ধ' })).toBeDefined();
  });
});
