// @vitest-environment jsdom
/**
 * Unit tests for the Field primitive (components/ui/Field.tsx).
 *
 * Field exists to make the ARIA wiring automatic. These tests pin
 * that wiring: the label points at the control, the hint and the
 * error reach the control's `aria-describedby`, and an error marks
 * the control invalid.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

afterEach(() => {
  cleanup();
});

describe('Field', () => {
  it('points the label at the control through htmlFor', () => {
    render(
      <Field id="phone" label="ফোন নম্বর" lang="bn">
        <Input id="ignored" />
      </Field>,
    );

    const input = screen.getByLabelText('ফোন নম্বর');
    expect(input.getAttribute('id')).toBe('phone');
  });

  it('wires the hint and the error into aria-describedby', () => {
    render(
      <Field id="phone" label="ফোন নম্বর" hint="১১ সংখ্যা" error="সংখ্যা সঠিক নয়" lang="bn">
        <Input id="ignored" />
      </Field>,
    );

    const input = screen.getByLabelText('ফোন নম্বর');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain('phone-hint');
    expect(describedBy).toContain('phone-error');
  });

  it('omits aria-describedby entirely when there is neither a hint nor an error', () => {
    render(
      <Field id="phone" label="ফোন নম্বর" lang="bn">
        <Input id="ignored" />
      </Field>,
    );

    const input = screen.getByLabelText('ফোন নম্বর');
    expect(input.hasAttribute('aria-describedby')).toBe(false);
  });

  it('marks the control invalid when there is an error', () => {
    render(
      <Field id="phone" label="ফোন নম্বর" error="সংখ্যা সঠিক নয়" lang="bn">
        <Input id="ignored" />
      </Field>,
    );

    expect(screen.getByLabelText('ফোন নম্বর').getAttribute('aria-invalid')).toBe('true');
  });

  it('sets the native required attribute and shows a visible required marker', () => {
    render(
      <Field id="phone" label="ফোন নম্বর" required lang="bn">
        <Input id="ignored" />
      </Field>,
    );

    const input = screen.getByLabelText(/ফোন নম্বর/);
    expect(input.hasAttribute('required')).toBe(true);
    // The marker is a visible asterisk, not a colour-only cue.
    expect(screen.getByText('*')).toBeDefined();
  });

  it('announces the error with role="alert"', () => {
    render(
      <Field id="phone" label="ফোন নম্বর" error="সংখ্যা সঠিক নয়" lang="bn">
        <Input id="ignored" />
      </Field>,
    );

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('সংখ্যা সঠিক নয়');
  });
});
