/**
 * Timeline — the vertical status trail.
 *
 * The trail is an ordered list: the order IS the information, so the
 * markup has to be a list rather than a stack of divs.
 *
 * Each step carries an ICON as well as a colour and a label. That is
 * the whole reason the icon registry exists: a status trail that
 * distinguishes its steps by hue alone is unreadable to a
 * colour-blind user and unreadable in a greyscale printout.
 *
 * `state` distinguishes a step that happened from one that has not
 * yet happened. A future step is dimmed AND marked with a hollow
 * marker, so "not yet" is not a colour cue.
 */

import type { ReactNode } from 'react';
import { t, type Language } from '@/lib/i18n/keys';

export type TimelineState = 'done' | 'current' | 'upcoming';

export interface TimelineItem {
  /** Stable id. */
  key: string;
  /** The step title. */
  title: string;
  /** Optional supporting line (a timestamp, an actor). */
  detail?: string;
  /** Whether the step has happened. */
  state?: TimelineState;
  /** The step's icon — REQUIRED for a status to be readable without colour. */
  icon: ReactNode;
  /** Optional content rendered beside the step (a photo, a chip). */
  aside?: ReactNode;
}

export interface TimelineProps {
  /** The steps, oldest first. */
  items: readonly TimelineItem[];
  /** Accessible name for the region. */
  ariaLabel?: string;
  /** Document language. */
  lang: Language;
  /** Test hook. */
  'data-testid'?: string;
}

export function Timeline({ items, ariaLabel, lang, 'data-testid': testId }: TimelineProps) {
  return (
    <section
      role="group"
      aria-label={ariaLabel ?? t('ui.timeline.label', null, lang)}
      data-testid={testId}
    >
      <ol style={{ display: 'flex', flexDirection: 'column', margin: 0, padding: 0, listStyle: 'none' }}>
        {items.map((item, index) => {
          const state = item.state ?? 'done';
          const isLast = index === items.length - 1;

          const markerColor =
            state === 'done'
              ? 'var(--color-status-resolved)'
              : state === 'current'
                ? 'var(--color-primary)'
                : 'var(--color-ink-disabled)';

          const titleColor =
            state === 'upcoming' ? 'var(--color-ink-tertiary)' : 'var(--color-ink)';

          return (
            <li
              key={item.key}
              data-state={state}
              style={{
                position: 'relative',
                display: 'flex',
                gap: 'var(--space-3)',
                paddingBottom: isLast ? 0 : 'var(--space-4)',
              }}
            >
              {/* The rail: a vertical rule between the markers. */}
              {isLast ? null : (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute',
                    left: 'calc(var(--icon-size-md) / 2)',
                    top: 'var(--icon-size-md)',
                    bottom: 0,
                    width: '1px',
                    background: 'var(--color-border)',
                  }}
                />
              )}

              <span
                aria-hidden
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 'var(--icon-size-md)',
                  height: 'var(--icon-size-md)',
                  flexShrink: 0,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--color-surface-card)',
                  border: `1px solid ${markerColor}`,
                  color: markerColor,
                  opacity: state === 'upcoming' ? 0.7 : 1,
                }}
              >
                {item.icon}
              </span>

              <div style={{ flex: '1 1 auto', minWidth: 0, paddingTop: 'var(--space-1)' }}>
                <p
                  lang={lang}
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-body-sm)',
                    fontWeight: state === 'current' ? 'var(--weight-semibold)' : 'var(--weight-medium)',
                    color: titleColor,
                    lineHeight: 'var(--leading-snug)',
                  }}
                >
                  {item.title}
                </p>
                {item.detail ? (
                  <p
                    lang={lang}
                    style={{
                      margin: 'var(--space-1) 0 0',
                      fontSize: 'var(--text-caption)',
                      color: 'var(--color-ink-tertiary)',
                      lineHeight: 'var(--leading-snug)',
                    }}
                  >
                    {item.detail}
                  </p>
                ) : null}
              </div>

              {item.aside}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
