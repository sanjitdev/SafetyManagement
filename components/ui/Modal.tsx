/**
 * Modal — a focus-trapping dialog.
 *
 * A native `<dialog>` is used rather than a div + overlay. The native
 * element gives the correct behaviour for free: Escape closes it, the
 * rest of the page is inert while it is open, the backdrop is the
 * top layer, and the browser handles the focus containment. A
 * hand-rolled modal that misses `inert` leaves the page behind it
 * tabbable — a real accessibility bug in every app that has one.
 *
 * The component is a client component because it opens the dialog
 * imperatively (`showModal`) and traps focus on close.
 */

'use client';

import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export interface ModalProps {
  /** Whether the dialog is open. */
  open: boolean;
  /** Called when the dialog requests to close (Escape, backdrop, close button). */
  onClose: () => void;
  /** Dialog heading. */
  title: string;
  /** Dialog body. */
  children: ReactNode;
  /** Footer actions. */
  footer?: ReactNode;
  /** Document language. */
  lang: Language;
  /** Accessible name for the close button. */
  closeLabel?: string;
  /** Test hook. */
  'data-testid'?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  lang,
  closeLabel,
  'data-testid': testId,
}: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();

  // `showModal()` throws when the dialog is already open, so the
  // state is checked first — React can render `open` twice in
  // Strict Mode.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // `showModal()` is the modern API: it puts the dialog in the top
      // layer, makes the rest of the page inert and traps focus. jsdom
      // does not implement it, so the `open` attribute is the
      // fallback — the browser always takes the first branch.
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    } else if (!open && dialog.open) {
      if (typeof dialog.close === 'function') {
        dialog.close();
      } else {
        dialog.removeAttribute('open');
      }
    }
  }, [open]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleClose}
      onCancel={(event) => {
        // Escape triggers `cancel` then `close`; letting the default
        // proceed means the parent never learns the dialog closed.
        event.preventDefault();
        handleClose();
      }}
      data-testid={testId}
      style={{
        width: 'min(560px, calc(100vw - var(--space-6)))',
        padding: 0,
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--color-surface-card)',
        color: 'var(--color-ink)',
        boxShadow: 'var(--shadow-modal)',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <h2
          id={titleId}
          lang={lang}
          style={{
            margin: 0,
            fontSize: 'var(--text-body-lg)',
            fontWeight: 'var(--weight-semibold)',
            lineHeight: 'var(--leading-snug)',
          }}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label={closeLabel ?? t('ui.modal.close', null, lang)}
          style={{
            width: 'var(--touch-min)',
            height: 'var(--touch-min)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--radius-input)',
            color: 'var(--color-ink-secondary)',
            cursor: 'pointer',
            fontSize: 'var(--text-body-lg)',
            lineHeight: 1,
          }}
        >
          <span aria-hidden>×</span>
        </button>
      </header>

      <div style={{ padding: 'var(--space-4)' }}>{children}</div>

      {footer ? (
        <footer
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface-raised)',
          }}
        >
          {footer}
        </footer>
      ) : null}
    </dialog>
  );
}
