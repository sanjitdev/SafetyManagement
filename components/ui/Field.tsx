/**
 * Field — the label + hint + error wrapper for a form control.
 *
 * A Field owns the ACCESSIBILITY WIRING of a control and nothing
 * else. It renders:
 *
 *   - a `<label htmlFor>` pointing at the control's id,
 *   - an optional hint, and
 *   - an optional error, which is announced (`role="alert"`).
 *
 * The control itself receives the ids through `React.cloneElement`, so
 * a caller never wires `aria-describedby` by hand:
 *
 *     <Field id="phone" label="ফোন" hint="..." error="..." required lang={lang}>
 *       <Input id="phone" />
 *     </Field>
 *
 * WHY CLONE THE CHILD
 * -------------------
 * `aria-describedby` is the single most commonly broken attribute in
 * hand-rolled forms: the label points at the input but the hint and
 * error never reach the accessibility tree. Cloning makes the correct
 * wiring the DEFAULT rather than something a page author has to
 * remember in eleven different places.
 *
 * The child must be a single React element. `Field` throws a clear
 * error otherwise — a silently-wired form is worse than a loud one.
 */

import { cloneElement, isValidElement, type ReactElement } from 'react';
import { type Language } from '@/lib/i18n/keys';

export interface FieldProps {
  /** The control's id. The `<label for>` points at it. */
  id: string;
  /** Visible label text. */
  label: string;
  /** Document language. */
  lang: Language;
  /** Optional helper text below the label. */
  hint?: string;
  /** Optional validation error. Its presence marks the control invalid. */
  error?: string;
  /** Marks the control required (native `required` plus a visible marker). */
  required?: boolean;
  /** Exactly one child element — the control. It receives the ARIA wiring. */
  children: ReactElement;
  /** Optional class passthrough on the wrapper. */
  className?: string;
}

export function Field({
  id,
  label,
  lang,
  hint,
  error,
  required = false,
  children,
  className,
}: FieldProps) {
  if (!isValidElement(children)) {
    throw new Error('Field requires exactly one React element child (the form control).');
  }

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control = cloneElement(children as ReactElement<Record<string, unknown>>, {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    required: required || undefined,
  });

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}
    >
      <label
        htmlFor={id}
        lang={lang}
        style={{
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink)',
          lineHeight: 'var(--leading-snug)',
        }}
      >
        {label}
        {required ? (
          <span aria-hidden style={{ color: 'var(--color-danger)', marginLeft: 'var(--space-1)' }}>
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
      </label>

      {hint ? (
        <span
          id={hintId}
          style={{
            fontSize: 'var(--text-caption)',
            color: 'var(--color-ink-secondary)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {hint}
        </span>
      ) : null}

      {control}

      {error ? (
        <span
          id={errorId}
          role="alert"
          lang={lang}
          style={{
            fontSize: 'var(--text-caption)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--color-danger)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
