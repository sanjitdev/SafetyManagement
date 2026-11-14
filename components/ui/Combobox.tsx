'use client';

/**
 * Combobox — a searchable, keyboard-navigable picker.
 *
 * Wave 4 / bolt 009-005. Replaces the raw `<select>` the dispatcher
 * used for the crew picker.
 *
 * ── Why a combobox and not a `<select>` ─────────────────────────
 *
 * A native `<select>` cannot be searched, and the dispatcher's crew
 * list is long enough that scrolling a native picker is the wrong
 * interaction. (See `components/ui/Select.tsx` for why the native
 * select is right everywhere ELSE — it usually is, and this
 * component is the exception rather than the new default.)
 *
 * ── The ARIA pattern ────────────────────────────────────────────
 *
 * This implements the WAI-ARIA 1.2 combobox pattern with a
 * **listbox** popup:
 *
 *   - the text input carries `role="combobox"`,
 *     `aria-expanded`, `aria-controls` (pointing at the listbox) and
 *     `aria-autocomplete="list"`,
 *   - the listbox carries `role="listbox"` and an id,
 *   - each option carries `role="option"` and an id,
 *   - `aria-activedescendant` on the input points at the OPTION
 *     that is currently active.
 *
 * The DOM focus stays on the input throughout. That is the point of
 * the `activedescendant` pattern: the user can keep typing while
 * the highlight moves. Moving real focus into the listbox would
 * mean the keystrokes went somewhere else, which is why a
 * hand-rolled listbox is so often wrong.
 *
 * ── Keyboard model ──────────────────────────────────────────────
 *
 *   ArrowDown / ArrowUp  — move the active option (opens the list
 *                          if it is closed)
 *   Home / End           — jump to the first / last option
 *   Enter                — commit the active option
 *   Escape               — close the list; a second Escape clears
 *                          the query
 *   Tab                  — close the list and move on (the value
 *                          already chosen is kept)
 *   printable characters — filter the list
 *
 * ── Filtering ───────────────────────────────────────────────────
 *
 * The filter is a case-insensitive substring match against the
 * option's label. Bangla has no case, so the match is on the raw
 * string; a Latin-script query still matches a Bangla label that
 * contains it, and vice versa.
 *
 * ── The value is not cleared by typing ──────────────────────────
 *
 * The input's displayed text IS the query. The chosen option's
 * label is put into the input when a choice is committed, and the
 * input is then read-only until the user edits it again — the
 * standard editable-combobox behaviour. Without that, a dispatcher
 * who opens the picker and then types would silently lose the
 * selection they had already made.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ICONS } from '@/lib/ui/icon-map';
import { t, type Language } from '@/lib/i18n/keys';

export interface ComboboxOption {
  /** The submitted value. */
  value: string;
  /** The visible label. */
  label: string;
  /** Secondary line under the label (e.g. the crew's specialty). */
  description?: string;
  /** Disabled options stay in the list but cannot be chosen. */
  disabled?: boolean;
}

export type ComboboxSize = 'sm' | 'md' | 'lg';

export interface ComboboxProps {
  /** The option list. */
  options: readonly ComboboxOption[];
  /** The chosen value, or `null` for nothing chosen. */
  value: string | null;
  /** Called with the chosen value, or `null` when the choice is cleared. */
  onChange: (value: string | null) => void;
  /** The input's accessible name. */
  label: string;
  /** Placeholder shown while the query is empty. */
  placeholder?: string;
  /** Copy shown when the filter matches nothing. */
  emptyMessage?: string;
  /** Control height. Defaults to `md`. */
  size?: ComboboxSize;
  /** Document language. */
  lang?: Language;
  /** Whether the control is disabled. */
  disabled?: boolean;
  /** Optional node rendered under the list (e.g. a create link). */
  footer?: ReactNode;
  /** Test hook. */
  'data-testid'?: string;
}

const SIZE_HEIGHT: Record<ComboboxSize, number> = { sm: 32, md: 40, lg: 48 };

/**
 * The option list, filtered by the query.
 *
 * Exported for the unit test — the filter is the piece worth
 * asserting on its own, because a filter that matches the wrong
 * substring produces a picker that looks broken without ever
 * throwing.
 */
export function filterComboboxOptions(
  options: readonly ComboboxOption[],
  query: string,
): ComboboxOption[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [...options];
  return options.filter((option) =>
    option.label.toLocaleLowerCase().includes(needle),
  );
}

export function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder,
  emptyMessage,
  size = 'md',
  lang = 'bn',
  disabled = false,
  footer,
  'data-testid': testId,
}: ComboboxProps) {
  const listboxId = useId();
  const inputId = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  /**
   * The label of the chosen option.
   *
   * Held separately from the option list so the input can show the
   * selection even when the list is filtered down to nothing — and
   * so the chosen label survives the list changing underneath it.
   */
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  /**
   * Whether the input is showing the QUERY or the SELECTION.
   *
   * The two are not interchangeable: the query is what the user is
   * typing right now, and the selection is what they have already
   * committed. Deriving which one to show from `open` alone is
   * wrong — closing the list does NOT throw away a query the user
   * typed but has not committed, and committing does put the
   * chosen label back on screen.
   *
   * This flag is what separates those two moments.
   */
  const [editing, setEditing] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /**
   * Suppresses the next focus handler's "open the list" behaviour.
   *
   * A commit calls `focus()` on the input to keep the caret there.
   * Without this guard the focus handler would immediately re-open
   * the list, so the choice the user just made would be undone by
   * the act of committing it.
   */
  const suppressFocusOpen = useRef(false);

  const filtered = useMemo(
    () => filterComboboxOptions(options, query),
    [options, query],
  );

  // Keep the selected label in step with the option list — the
  // caller may reload the options (a poll) and the label must not
  // go stale.
  useEffect(() => {
    if (value === null) {
      setSelectedLabel(null);
      return;
    }
    const match = options.find((option) => option.value === value);
    if (match) setSelectedLabel(match.label);
  }, [value, options]);

  // The caller may replace the selection from outside (a poll
  // refresh, a reset button). When that happens the input must go
  // back to showing the SELECTION, not the stale query.
  useEffect(() => {
    setEditing(false);
  }, [value]);

  // Close the list when the pointer goes somewhere else.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [open]);

  const commit = useCallback(
    (option: ComboboxOption | undefined) => {
      if (!option || option.disabled) return;
      onChange(option.value);
      setSelectedLabel(option.label);
      setQuery('');
      setEditing(false);
      setOpen(false);
      // The focus is put back on the input so the next keystroke
      // continues from the field the user is in. The focus must
      // NOT re-open the list — that would undo the commit the
      // moment it happened — hence the `suppressFocusOpen` ref.
      suppressFocusOpen.current = true;
      inputRef.current?.focus();
    },
    [onChange],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          if (!filtered.length) return;
          setActiveIndex((index) => (index + 1) % filtered.length);
          return;
        }
        case 'ArrowUp': {
          event.preventDefault();
          if (!open) {
            setOpen(true);
            return;
          }
          if (!filtered.length) return;
          setActiveIndex(
            (index) => (index - 1 + filtered.length) % filtered.length,
          );
          return;
        }
        case 'Home': {
          if (!open || !filtered.length) return;
          event.preventDefault();
          setActiveIndex(0);
          return;
        }
        case 'End': {
          if (!open || !filtered.length) return;
          event.preventDefault();
          setActiveIndex(filtered.length - 1);
          return;
        }
        case 'Enter': {
          if (!open) return;
          event.preventDefault();
          commit(filtered[activeIndex]);
          return;
        }
        case 'Escape': {
          if (open) {
            event.preventDefault();
            setOpen(false);
            return;
          }
          // A closed list with a query means the user wants to clear
          // the search, not to leave the field.
          if (query) {
            event.preventDefault();
            setQuery('');
            setEditing(false);
          }
          return;
        }
        case 'Tab': {
          // Tab leaves the field. The list closes; whatever was
          // already committed stays committed.
          setOpen(false);
          return;
        }
        default:
          return;
      }
    },
    [activeIndex, commit, filtered, open, query],
  );

  const activeOptionId =
    open && filtered.length > 0
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  const CaretIcon = ICONS.forward.icon;

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
      <label
        htmlFor={inputId}
        id={`${inputId}-label`}
        style={{
          display: 'block',
          marginBottom: 'var(--space-1)',
          fontSize: 'var(--text-caption)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-ink-secondary)',
        }}
      >
        {label}
      </label>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          minHeight: SIZE_HEIGHT[size],
          padding: '0 var(--space-3)',
          background: 'var(--color-surface-card)',
          color: 'var(--color-ink)',
          border: '1px solid var(--color-border-input)',
          borderRadius: 'var(--radius-input)',
          fontFamily: 'inherit',
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          aria-labelledby={`${inputId}-label`}
          aria-haspopup="listbox"
          autoComplete="off"
          disabled={disabled}
          value={editing ? query : (selectedLabel ?? '')}
          placeholder={placeholder ?? t('dispatcher.combobox.placeholder', null, lang)}
          onChange={(event) => {
            setQuery(event.target.value);
            setEditing(true);
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (suppressFocusOpen.current) {
              // This focus came from a commit, not from the user
              // arriving at the field. Re-opening the list here
              // would undo the choice that was just made.
              suppressFocusOpen.current = false;
              return;
            }
            // Focusing a committed combobox opens the list with the
            // full option list, not a filtered one — the user is
            // about to change the choice, not search within it.
            setQuery('');
            setEditing(false);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          style={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'inherit',
            fontFamily: 'inherit',
            fontSize: 'var(--text-body)',
            lineHeight: 'var(--leading-snug)',
          }}
        />
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            color: 'var(--color-ink-tertiary)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms ease',
          }}
        >
          <CaretIcon size={14} aria-hidden focusable="false" />
        </span>
      </div>

      {open ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + var(--space-1))',
            left: 0,
            right: 0,
            background: 'var(--color-surface-card)',
            border: '1px solid var(--color-border-strong)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-popover)',
            overflow: 'hidden',
          }}
        >
          <ul
            id={listboxId}
            role="listbox"
            aria-label={label}
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 'var(--space-1)',
              maxHeight: 260,
              overflowY: 'auto',
            }}
          >
            {filtered.length === 0 ? (
              <li
                role="presentation"
                style={{
                  padding: 'var(--space-3)',
                  fontSize: 'var(--text-body-sm)',
                  color: 'var(--color-ink-tertiary)',
                }}
              >
                {emptyMessage ?? t('dispatcher.combobox.no_results', null, lang)}
              </li>
            ) : (
              filtered.map((option, index) => {
                const isActive = index === activeIndex;
                const isSelected = option.value === value;
                return (
                  <li
                    key={option.value}
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled || undefined}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => commit(option)}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: option.disabled ? 'not-allowed' : 'pointer',
                      background: isActive
                        ? 'var(--color-primary-soft)'
                        : 'transparent',
                      color: option.disabled
                        ? 'var(--color-ink-tertiary)'
                        : 'var(--color-ink)',
                      fontSize: 'var(--text-body-sm)',
                    }}
                  >
                    <span style={{ fontWeight: 'var(--weight-semibold)' }}>
                      {option.label}
                    </span>
                    {option.description ? (
                      <span
                        style={{
                          display: 'block',
                          marginTop: '2px',
                          fontSize: 'var(--text-micro)',
                          color: 'var(--color-ink-tertiary)',
                        }}
                      >
                        {option.description}
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
          {footer ? (
            <div
              style={{
                padding: 'var(--space-2) var(--space-3)',
                borderTop: '1px solid var(--color-border)',
                fontSize: 'var(--text-caption)',
              }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
